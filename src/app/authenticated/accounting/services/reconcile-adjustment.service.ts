import { Injectable, inject } from '@angular/core';
import { Observable, of, switchMap, throwError } from 'rxjs';
import { PostingStatus, SourceType, isJournalEntryPosted } from '../models/accounting-enum';
import { JournalEntryLineRequest, JournalEntryRequest, JournalEntryResponse } from '../models/journal-entry.model';
import { BeginReconciliationDialogResult } from '../models/reconcile.model';
import { GeneralLedgerService } from './general-ledger.service';

type BankPositiveSide = 'debit' | 'credit';
type ReconcileAdjustmentJournalEntryIdKey = 'serviceChargeJournalEntryId' | 'interestEarnedJournalEntryId';

interface SyncAdjustmentParams {
  result: BeginReconciliationDialogResult;
  previousSetup: BeginReconciliationDialogResult | null | undefined;
  organizationId: string;
  officeId: number;
  amount: number;
  transactionDate: string | null;
  offsetAccountId: number | null;
  journalEntryIdKey: ReconcileAdjustmentJournalEntryIdKey;
  bankPositiveSide: BankPositiveSide;
  memo: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReconcileAdjustmentService {
  private generalLedgerService = inject(GeneralLedgerService);


  syncReconcileAdjustments(
    organizationId: string,
    officeId: number,
    setup: BeginReconciliationDialogResult,
    previousSetup: BeginReconciliationDialogResult | null | undefined
  ): Observable<BeginReconciliationDialogResult> {
    return this.syncAdjustment({
      result: setup,
      previousSetup,
      organizationId,
      officeId,
      amount: setup.serviceCharge,
      transactionDate: setup.serviceChargeDate,
      offsetAccountId: setup.serviceChargeAccountId,
      journalEntryIdKey: 'serviceChargeJournalEntryId',
      bankPositiveSide: 'credit',
      memo: 'Service charge'
    }).pipe(
      switchMap(result => this.syncAdjustment({
        result,
        previousSetup,
        organizationId,
        officeId,
        amount: setup.interestEarned,
        transactionDate: setup.interestEarnedDate,
        offsetAccountId: setup.interestEarnedAccountId,
        journalEntryIdKey: 'interestEarnedJournalEntryId',
        bankPositiveSide: 'debit',
        memo: 'Interest earned'
      }))
    );
  }

  private syncAdjustment(params: SyncAdjustmentParams): Observable<BeginReconciliationDialogResult> {
    const previous = params.previousSetup;
    const previousJournalEntryId = previous?.[params.journalEntryIdKey] ?? null;
    const previousAmount = this.resolvePreviousAmount(params.journalEntryIdKey, previous);
    const previousDate = this.resolvePreviousDate(params.journalEntryIdKey, previous);
    const previousAccountId = this.resolvePreviousAccountId(params.journalEntryIdKey, previous);
    const result = { ...params.result };
    const isZeroAmount = this.isZeroAmount(params.amount);
    const bankAccountChanged = previous?.chartOfAccountId !== params.result.chartOfAccountId;
    const hasChanged = bankAccountChanged || this.hasAdjustmentChanged(
      params.amount,
      previousAmount,
      params.transactionDate,
      previousDate,
      params.offsetAccountId,
      previousAccountId
    );

    if (!isZeroAmount && !hasChanged && previousJournalEntryId) {
      result[params.journalEntryIdKey] = previousJournalEntryId;
      return of(result);
    }

    const voidExisting$ = previousJournalEntryId && (isZeroAmount || hasChanged)
      ? this.generalLedgerService.voidJournalEntry(previousJournalEntryId)
      : of(null);

    return voidExisting$.pipe(
      switchMap(() => {
        if (isZeroAmount) {
          result[params.journalEntryIdKey] = null;
          return of(result);
        }

        if (!params.offsetAccountId || !params.transactionDate) {
          return throwError(() => new Error(`${params.memo} requires an account and date.`));
        }

        return this.createPostedAdjustmentJournalEntry({
          organizationId: params.organizationId,
          officeId: params.officeId,
          bankAccountId: params.result.chartOfAccountId,
          offsetAccountId: params.offsetAccountId,
          signedAmount: params.amount,
          transactionDate: params.transactionDate,
          bankPositiveSide: params.bankPositiveSide,
          memo: params.memo
        }).pipe(
          switchMap(created => {
            result[params.journalEntryIdKey] = created.journalEntryId;
            return of(result);
          })
        );
      })
    );
  }

  private createPostedAdjustmentJournalEntry(params: {
    organizationId: string;
    officeId: number;
    bankAccountId: number;
    offsetAccountId: number;
    signedAmount: number;
    transactionDate: string;
    bankPositiveSide: BankPositiveSide;
    memo: string;
  }): Observable<JournalEntryResponse> {
    const journalEntryLines = this.buildAdjustmentJournalEntryLines(
      params.bankAccountId,
      params.offsetAccountId,
      params.signedAmount,
      params.bankPositiveSide,
      params.memo
    );

    if (journalEntryLines.length === 0) {
      return throwError(() => new Error('Adjustment journal entry lines are required.'));
    }

    const request: JournalEntryRequest = {
      organizationId: params.organizationId,
      officeId: params.officeId,
      transactionDate: params.transactionDate,
      accountingPeriod: params.transactionDate,
      sourceTypeId: SourceType.Journal,
      sourceId: null,
      memo: params.memo,
      postingStatusId: PostingStatus.Open,
      isCashOnly: false,
      journalEntryLines
    };

    return this.generalLedgerService.createJournalEntry(request).pipe(
      switchMap(created => {
        if (isJournalEntryPosted(created.postingStatusId)) {
          return of(created);
        }

        return this.generalLedgerService.postJournalEntry(created.journalEntryId, params.transactionDate);
      })
    );
  }

  buildAdjustmentJournalEntryLines(
    bankAccountId: number,
    offsetAccountId: number,
    signedAmount: number,
    bankPositiveSide: BankPositiveSide,
    memo: string
  ): JournalEntryLineRequest[] {
    const absAmount = this.roundCurrencyValue(Math.abs(signedAmount));
    if (absAmount < 0.005) {
      return [];
    }

    const bankOnPositiveCredit = bankPositiveSide === 'credit';
    let bankDebit = 0;
    let bankCredit = 0;

    if (signedAmount > 0) {
      if (bankOnPositiveCredit) {
        bankCredit = absAmount;
      } else {
        bankDebit = absAmount;
      }
    } else {
      if (bankOnPositiveCredit) {
        bankDebit = absAmount;
      } else {
        bankCredit = absAmount;
      }
    }

    const offsetDebit = bankCredit > 0 ? absAmount : 0;
    const offsetCredit = bankDebit > 0 ? absAmount : 0;

    return [
      {
        chartOfAccountId: bankAccountId,
        debit: bankDebit,
        credit: bankCredit,
        memo,
        costCodeId: null,
        propertyId: null,
        reservationId: null,
        contactId: null
      },
      {
        chartOfAccountId: offsetAccountId,
        debit: offsetDebit,
        credit: offsetCredit,
        memo,
        costCodeId: null,
        propertyId: null,
        reservationId: null,
        contactId: null
      }
    ];
  }

  private resolvePreviousAmount(
    journalEntryIdKey: ReconcileAdjustmentJournalEntryIdKey,
    previousSetup: BeginReconciliationDialogResult | null | undefined
  ): number {
    if (!previousSetup) {
      return 0;
    }

    return journalEntryIdKey === 'serviceChargeJournalEntryId'
      ? previousSetup.serviceCharge
      : previousSetup.interestEarned;
  }

  private resolvePreviousDate(
    journalEntryIdKey: ReconcileAdjustmentJournalEntryIdKey,
    previousSetup: BeginReconciliationDialogResult | null | undefined
  ): string | null {
    if (!previousSetup) {
      return null;
    }

    return journalEntryIdKey === 'serviceChargeJournalEntryId'
      ? previousSetup.serviceChargeDate
      : previousSetup.interestEarnedDate;
  }

  private resolvePreviousAccountId(
    journalEntryIdKey: ReconcileAdjustmentJournalEntryIdKey,
    previousSetup: BeginReconciliationDialogResult | null | undefined
  ): number | null {
    if (!previousSetup) {
      return null;
    }

    return journalEntryIdKey === 'serviceChargeJournalEntryId'
      ? previousSetup.serviceChargeAccountId
      : previousSetup.interestEarnedAccountId;
  }

  private hasAdjustmentChanged(
    amount: number,
    previousAmount: number,
    transactionDate: string | null,
    previousDate: string | null,
    offsetAccountId: number | null,
    previousAccountId: number | null
  ): boolean {
    return Math.abs(this.roundCurrencyValue(amount) - this.roundCurrencyValue(previousAmount)) >= 0.005
      || (transactionDate || '') !== (previousDate || '')
      || offsetAccountId !== previousAccountId;
  }

  private isZeroAmount(amount: number): boolean {
    return Math.abs(this.roundCurrencyValue(amount)) < 0.005;
  }

  private roundCurrencyValue(amount: number): number {
    if (!Number.isFinite(amount)) {
      return 0;
    }

    return Math.round(amount * 100) / 100;
  }
}
