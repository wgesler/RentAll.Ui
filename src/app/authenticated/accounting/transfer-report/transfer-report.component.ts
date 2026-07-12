import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, forkJoin, merge, Subject, switchMap, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { SourceType, isJournalEntrySourceNavigable } from '../models/accounting-enum';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse, TransferReportRowDisplay } from '../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection } from '../models/owner-statement.model';
import { TransferResponse } from '../models/transfer.model';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { JournalEntrySourceService } from '../services/journal-entry-source.service';
import { TransferService } from '../services/transfer.service';

@Component({
  selector: 'app-transfer-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './transfer-report.component.html',
  styleUrls: ['./transfer-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransferReportComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() sourceLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();

  isPageReady = false;
  isServiceError = false;
  rowsDisplay: TransferReportRowDisplay[] = [];
  noActivityMessage = 'No transfer report activity for the selected office and date range.';
  accountingOffices: AccountingOfficeResponse[] = [];

  readonly displayedColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false, alignment: 'center' },
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '12ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '14ch' },
    source: { displayAs: 'Source', maxWidth: '15ch' },
    journalEntryCode: { displayAs: 'JEntry', maxWidth: '14ch', sortType: 'natural' },
    accountingPeriod: { displayAs: 'Period', maxWidth: '10ch', alignment: 'center' },
    expectedIncome: { displayAs: 'Invoiced', maxWidth: '12ch', alignment: 'right', sort: false },
    rentPlus4000: { displayAs: 'Owner Escrow', maxWidth: '14ch', alignment: 'right', sort: false },
    securityDeposit: { displayAs: 'SecDep Escrow', maxWidth: '14ch', alignment: 'right', sort: false },
    sdw: { displayAs: 'SDW Escrow', maxWidth: '14ch', alignment: 'right', sort: false },
    business: { displayAs: 'Business', maxWidth: '12ch', alignment: 'right', sort: false },
    balance: { displayAs: 'Balance', maxWidth: '12ch', alignment: 'right', sort: false }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['accountingOffices', 'transferReport']));
  destroy$ = new Subject<void>();
  private transferReportLoadId = 0;
  private cancelTransferReportLoad$ = new Subject<void>();

  constructor(
    private transferService: TransferService,
    private generalLedgerService: GeneralLedgerService,
    private accountingOfficeService: AccountingOfficeService,
    private journalEntrySourceService: JournalEntrySourceService,
    private utilityService: UtilityService,
    private formatter: FormatterService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadAccountingOffices();
    this.loadTransferReport();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadTransferReport();
    }

    if (changes['searchDateRange'] && !changes['searchDateRange'].firstChange) {
      this.loadTransferReport();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadTransferReport();
    }
  }

  onRowSelect(row: TransferReportRowDisplay): void {
    if (!row?.journalEntryId) {
      return;
    }

    this.lineSelectEvent.emit({
      journalEntryId: row.journalEntryId,
      journalEntryLineId: row.journalEntryLineId || ''
    });
  }

  onJournalEntryCodeClick(row: TransferReportRowDisplay): void {
    this.onRowSelect(row);
  }

  onSourceClick(row: TransferReportRowDisplay): void {
    if (!row?.sourceLinkable || row.officeId == null) {
      return;
    }

    const navigate = (activityId: string | null) => {
      this.sourceLinkSelect.emit({
        activityId,
        activityCode: row.source,
        activityType: row.activityType,
        officeId: row.officeId!,
        propertyId: row.propertyId || ''
      });
    };

    if (
      row.sourceTypeId === SourceType.InvoicePayment
      && isJournalEntrySourceNavigable(row.sourceTypeId)
      && (row.sourceId || '').trim()
    ) {
      this.journalEntrySourceService.resolveSource(this.toJournalEntryLineListDisplay(row)).pipe(take(1)).subscribe({
        next: target => {
          if (target?.kind === 'invoice' && target.invoice?.invoiceId) {
            navigate(target.invoice.invoiceId);
            return;
          }

          navigate(row.sourceId || null);
        },
        error: () => navigate(row.sourceId || null)
      });
      return;
    }

    navigate(row.sourceId || null);
  }

  get totalsRow(): { [key: string]: string } | undefined {
    if (this.rowsDisplay.length === 0) {
      return undefined;
    }

    const totalBalance = this.sumColumn('balanceValue');

    return {
      propertyCode: 'Totals:',
      expectedIncome: this.formatter.currencyUsd(this.sumColumn('expectedIncomeValue')),
      rentPlus4000: this.formatter.currencyUsd(this.sumColumn('rentPlus4000Value')),
      securityDeposit: this.formatter.currencyUsd(this.sumColumn('securityDepositValue')),
      sdw: this.formatter.currencyUsd(this.sumColumn('sdwValue')),
      business: this.formatter.currencyUsd(this.sumColumn('businessValue')),
      balance: this.formatter.currencyUsd(totalBalance)
    };
  }

  get totalsRowAlerts(): Record<string, boolean> {
    const totalBalance = this.sumColumn('balanceValue');
    return { balance: totalBalance !== 0 };
  }

  private loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.accountingOffices = offices || [];
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
          this.markViewForCheck();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
        this.markViewForCheck();
      }
    });
  }

  private loadTransferReport(): void {
    const officeIds = this.officeId != null && this.officeId > 0 ? [this.officeId] : [];
    if (officeIds.length === 0) {
      this.rowsDisplay = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.cancelTransferReportLoad$.next();
    const loadId = ++this.transferReportLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'transferReport');
    const startDate = this.searchDateRange?.startDate ?? null;
    const endDate = this.searchDateRange?.endDate ?? null;

    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
      take(1),
      switchMap(() => this.accountingOfficeService.getAllAccountingOffices().pipe(take(1))),
      switchMap(offices => {
        this.accountingOffices = offices || [];
        return forkJoin({
          lines: this.generalLedgerService.searchJournalEntryLines({
            officeIds,
            includeVoided: false,
            includeUnposted: true,
            startDate,
            endDate
          }),
          transfers: this.transferService.searchTransfers({
            officeIds,
            isActive: true,
            includeInactive: false,
            startDate,
            endDate
          })
        });
      }),
      takeUntil(merge(this.cancelTransferReportLoad$, this.destroy$)),
      finalize(() => {
        if (this.transferReportLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: ({ lines, transfers }) => {
        if (this.transferReportLoadId !== loadId) {
          return;
        }

        const transferByJournalEntryId = this.buildTransferLookupByJournalEntryId(transfers || []);
        const accountIds = this.resolveTransferAllocationAccountIds(this.officeId!);
        const finalNetDebitLines = this.filterFinalAccountNetDebitLines(lines || [], accountIds);
        const groupedLines = this.groupJournalEntryLinesByJournalEntryId(finalNetDebitLines);

        this.rowsDisplay = Array.from(groupedLines.entries())
          .map(([journalEntryId, journalEntryLines]) =>
            this.buildTransferReportRowFromJournalEntryLines(
              journalEntryId,
              journalEntryLines,
              transferByJournalEntryId.get(journalEntryId) ?? null,
              accountIds
            ))
          .filter((row): row is TransferReportRowDisplay => row != null && this.hasMeaningfulAmount(row))
          .sort((left, right) => {
            const dateCompare = (left.transactionDate || '').localeCompare(right.transactionDate || '');
            if (dateCompare !== 0) {
              return dateCompare;
            }

            return (left.source || '').localeCompare(right.source || '', undefined, { sensitivity: 'base' });
          });
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (this.transferReportLoadId !== loadId) {
          return;
        }

        console.error('Transfer Report - error loading transfer journal entry lines:', error);
        this.isServiceError = true;
        this.rowsDisplay = [];
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load transfer report: ${apiMessage}`
          : 'Unable to load transfer report.';
        this.markViewForCheck();
      }
    });
  }

  private buildTransferLookupByJournalEntryId(transfers: TransferResponse[]): Map<string, TransferResponse> {
    const lookup = new Map<string, TransferResponse>();
    for (const transfer of transfers) {
      const journalEntryId = (transfer.journalEntryId || '').trim();
      if (journalEntryId) {
        lookup.set(journalEntryId, transfer);
      }
    }

    return lookup;
  }

  private filterFinalAccountNetDebitLines(
    lines: JournalEntryLineSearchResponse[],
    accountIds: {
      owners: number | null;
      secDep: number | null;
      sdw: number | null;
      bank: number | null;
      escrowDeposit: number | null;
    }
  ): JournalEntryLineSearchResponse[] {
    const finalAccountIds = new Set(
      [accountIds.owners, accountIds.secDep, accountIds.sdw, accountIds.bank]
        .filter((accountId): accountId is number => accountId != null && accountId > 0)
    );

    return (lines || []).filter(line =>
      finalAccountIds.has(Number(line.chartOfAccountId))
      && Number(line.chartOfAccountId) !== Number(accountIds.escrowDeposit || 0)
      && this.getLineNetAmount(line) > 0
    );
  }

  private groupJournalEntryLinesByJournalEntryId(
    lines: JournalEntryLineSearchResponse[]
  ): Map<string, JournalEntryLineSearchResponse[]> {
    const groups = new Map<string, JournalEntryLineSearchResponse[]>();

    for (const line of lines) {
      const journalEntryId = (line.journalEntryId || '').trim();
      if (!journalEntryId) {
        continue;
      }

      const group = groups.get(journalEntryId) ?? [];
      group.push(line);
      groups.set(journalEntryId, group);
    }

    return groups;
  }

  private buildTransferReportRowFromJournalEntryLines(
    journalEntryId: string,
    lines: JournalEntryLineSearchResponse[],
    transfer: TransferResponse | null,
    accountIds: {
      owners: number | null;
      secDep: number | null;
      sdw: number | null;
      bank: number | null;
      escrowDeposit: number | null;
    }
  ): TransferReportRowDisplay | null {
    const netDebitLines = this.filterFinalAccountNetDebitLines(lines, accountIds);
    if (netDebitLines.length === 0) {
      return null;
    }

    const ownerRentActualValue = this.sumNetDebitAmountsForAccount(netDebitLines, accountIds.owners);
    const rentPlus4000Value = ownerRentActualValue;
    const securityDepositValue = this.sumNetDebitAmountsForAccount(netDebitLines, accountIds.secDep);
    const sdwValue = this.sumNetDebitAmountsForAccount(netDebitLines, accountIds.sdw);
    const businessValue = this.sumNetDebitAmountsForAccount(netDebitLines, accountIds.bank);
    const expectedIncomeValue = this.roundCurrency(
      ownerRentActualValue + securityDepositValue + sdwValue + businessValue
    );
    const balanceValue = this.roundCurrency(
      expectedIncomeValue - ownerRentActualValue - securityDepositValue - sdwValue - businessValue
    );
    const source = transfer ? this.resolveTransferSource(transfer) : this.resolveTransferSourceFromLines(netDebitLines);
    const contextLine = netDebitLines.find(line =>
      (line.propertyCode || '').trim()
      || (line.reservationCode || '').trim()
      || (line.contactName || '').trim()) || netDebitLines[0];
    const contextSplit = transfer?.splits?.find(split =>
      (split.journalEntryLineId || '').trim() === (contextLine.journalEntryLineId || '').trim()) || transfer?.splits?.[0];
    const rawTransactionDate = contextLine.transactionDate || transfer?.transferDate || '';
    const sortDateValue = rawTransactionDate ? Date.parse(`${rawTransactionDate}T00:00:00`) : 0;
    const sourceTypeId = contextLine.sourceTypeId ?? this.inferSourceTypeId(source);
    const sourceId = (contextLine.sourceId || '').trim() || null;

    return {
      propertyCode: (contextLine.propertyCode || contextSplit?.propertyCode || '').trim(),
      reservationCode: (contextLine.reservationCode || contextSplit?.reservationCode || '').trim(),
      accountingPeriod: this.formatter.formatListAccountingPeriodDot(
        transfer?.accountingPeriod || contextLine.postingDate || ''
      ),
      source,
      journalEntryCode: contextLine.journalEntryCode || transfer?.transferCode || '',
      sourceTypeId,
      sourceId,
      sourceLinkable: isJournalEntrySourceNavigable(sourceTypeId) && !!sourceId,
      activityType: '',
      officeId: contextLine.officeId || transfer?.officeId || this.officeId || 0,
      propertyId: (contextLine.propertyId || contextSplit?.propertyId || transfer?.propertyId || '').trim() || null,
      reservationId: (contextLine.reservationId || contextSplit?.reservationId || '').trim() || null,
      transactionDate: this.formatter.formatDateString(rawTransactionDate),
      expectedIncome: this.formatter.currencyUsd(expectedIncomeValue),
      rentPlus4000: this.formatter.currencyUsd(rentPlus4000Value),
      ownerRent: this.formatter.currencyUsd(ownerRentActualValue),
      ownerRentActual: this.formatter.currencyUsd(ownerRentActualValue),
      business: this.formatter.currencyUsd(businessValue),
      securityDeposit: this.formatter.currencyUsd(securityDepositValue),
      sdw: this.formatter.currencyUsd(sdwValue),
      fee: this.formatter.currencyUsd(businessValue),
      balance: this.formatter.currencyUsd(balanceValue),
      balanceIsAlert: balanceValue !== 0,
      expectedIncomeValue,
      rentPlus4000Value,
      ownerRentValue: ownerRentActualValue,
      ownerRentActualValue,
      businessValue,
      securityDepositValue,
      sdwValue,
      feeValue: businessValue,
      balanceValue,
      sortDateValue,
      journalEntryId,
      journalEntryLineId: (contextLine.journalEntryLineId || '').trim() || undefined
    };
  }

  private resolveTransferSourceFromLines(lines: JournalEntryLineSearchResponse[]): string {
    for (const line of lines) {
      const memo = (line.memo || line.journalEntryMemo || '').trim();
      const transferPrefixMatch = memo.match(/^Transfer:?\s+(.+)$/i);
      if (transferPrefixMatch?.[1]?.trim()) {
        return transferPrefixMatch[1].trim();
      }
    }

    const journalEntryCode = (lines[0]?.journalEntryCode || '').trim();
    return journalEntryCode;
  }

  private getLineNetAmount(line: Pick<JournalEntryLineSearchResponse, 'debit' | 'credit'>): number {
    return this.roundCurrency(Number(line.debit || 0) - Number(line.credit || 0));
  }

  private sumNetDebitAmountsForAccount(
    lines: JournalEntryLineSearchResponse[],
    accountId: number | null
  ): number {
    if (!accountId) {
      return 0;
    }

    return this.roundCurrency(
      (lines || [])
        .filter(line => Number(line.chartOfAccountId) === accountId)
        .reduce((sum, line) => sum + this.getLineNetAmount(line), 0)
    );
  }

  private resolveTransferSource(transfer: TransferResponse): string {
    for (const split of transfer.splits || []) {
      const description = (split.description || '').trim();
      const transferPrefixMatch = description.match(/^Transfer\s+(.+)$/i);
      if (transferPrefixMatch?.[1]?.trim()) {
        return transferPrefixMatch[1].trim();
      }
    }

    const transferDescription = (transfer.description || '').trim();
    if (transferDescription && transferDescription.toLowerCase() !== 'transfer') {
      return transferDescription;
    }

    return transfer.transferCode || '';
  }

  private resolveTransferAllocationAccountIds(officeId: number): {
    owners: number | null;
    secDep: number | null;
    sdw: number | null;
    bank: number | null;
    escrowDeposit: number | null;
  } {
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    const toAccountId = (value: number | null | undefined): number | null => {
      const accountId = Number(value ?? 0);
      return accountId > 0 ? accountId : null;
    };

    return {
      owners: toAccountId(accountingOffice?.defaultEscrowOwnersAccountId),
      secDep: toAccountId(accountingOffice?.defaultEscrowSecDepAccountId),
      sdw: toAccountId(accountingOffice?.defaultEscrowSdwAccountId),
      bank: toAccountId(accountingOffice?.defaultBankAccountId),
      escrowDeposit: toAccountId(accountingOffice?.defaultEscrowDepositAccountId)
    };
  }

  private hasMeaningfulAmount(row: TransferReportRowDisplay): boolean {
    return row.expectedIncomeValue !== 0
      || row.rentPlus4000Value !== 0
      || row.securityDepositValue !== 0
      || row.sdwValue !== 0
      || row.businessValue !== 0;
  }

  private inferSourceTypeId(source: string): number | null {
    if (/^INV/i.test(source)) {
      return SourceType.InvoicePayment;
    }

    if (/^DEP/i.test(source)) {
      return SourceType.Deposit;
    }

    return null;
  }

  private roundCurrency(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private sumColumn(columnName: keyof TransferReportRowDisplay): number {
    return this.rowsDisplay.reduce((sum, row) => sum + Number(row[columnName] || 0), 0);
  }

  private toJournalEntryLineListDisplay(row: TransferReportRowDisplay): JournalEntryLineListDisplay {
    return {
      journalEntryLineId: row.journalEntryLineId || '',
      journalEntryId: row.journalEntryId || '',
      officeId: row.officeId || 0,
      transactionDate: row.transactionDate,
      journalEntryCode: row.journalEntryCode,
      source: row.source,
      sourceTypeId: row.sourceTypeId ?? null,
      sourceId: row.sourceId ?? null,
      sourceLinkable: row.sourceLinkable,
      propertyId: row.propertyId ?? null,
      propertyCode: row.propertyCode,
      reservationId: row.reservationId ?? null,
      reservationCode: row.reservationCode,
      contactId: null,
      contactName: '',
      account: '',
      description: '',
      debit: '',
      credit: '',
      balance: '',
      debitValue: 0,
      creditValue: 0,
      balanceValue: 0,
      isPosted: true,
      isVoided: false,
      sortDateValue: row.sortDateValue
    };
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelTransferReportLoad$.next();
    this.cancelTransferReportLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
}
