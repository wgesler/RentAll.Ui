import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MaterialModule } from '../../../material.module';
import { CommonMessage } from '../../../enums/common-message.enum';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { BeginReconciliationDialogData, BeginReconciliationDialogResult } from '../models/reconcile.model';
import { ReconcileAdjustmentService } from '../services/reconcile-adjustment.service';

@Component({
  standalone: true,
  selector: 'app-begin-reconciliation-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './begin-reconciliation-dialog.component.html',
  styleUrl: './begin-reconciliation-dialog.component.scss'
})
export class BeginReconciliationDialogComponent implements OnInit, OnDestroy {
  beginningBalance = 0;
  lastReconciledDate: string | null = null;
  isSaving = false;
  destroy$ = new Subject<void>();

  readonly form = this.fb.group({
    chartOfAccountId: [this.data.defaultChartOfAccountId as number | null, Validators.required],
    statementDate: [this.data.defaultStatementDate ?? new Date(), Validators.required],
    endingBalance: ['', Validators.required],
    serviceCharge: ['$0.00'],
    serviceChargeDate: [this.data.defaultStatementDate ?? new Date()],
    serviceChargeAccountId: [null as number | null],
    interestEarned: ['$0.00'],
    interestEarnedDate: [this.data.defaultStatementDate ?? new Date()],
    interestEarnedAccountId: [null as number | null]
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: BeginReconciliationDialogData,
    private dialogRef: MatDialogRef<BeginReconciliationDialogComponent, BeginReconciliationDialogResult | undefined>,
    private fb: FormBuilder,
    private mappingService: MappingService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private reconcileAdjustmentService: ReconcileAdjustmentService
  ) {}

  //#region Begin Reconciliation Dialog
  ngOnInit(): void {
    if (this.data.existingSetup) {
      this.applyExistingSetup();
    }

    this.form.get('chartOfAccountId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applySelectedAccountDefaults();
    });
    this.applySelectedAccountDefaults();
  }

  get beginningBalanceDisplay(): string {
    return this.formatCurrency(this.beginningBalance);
  }

  get lastReconciledDateDisplay(): string {
    const lastReconciledDate = String(this.lastReconciledDate || '').trim();
    if (!lastReconciledDate) {
      return '';
    }

    return this.formatterService.formatDateString(lastReconciledDate);
  }

  get canUndoLastReconciliation(): boolean {
    return String(this.lastReconciledDate || '').trim().length > 0;
  }

  formatCurrency(value: number): string {
    return this.formatterService.currencyUsd(value);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onUndoLastReconciliation(): void {
    // Undo last reconciliation when backend support is added.
  }

  onContinue(): void {
    if (this.isSaving) {
      return;
    }

    const chartOfAccountId = Number(this.form.get('chartOfAccountId')?.value);
    const statementDate = this.utilityService.toDateOnlyJsonString(this.form.get('statementDate')?.value);
    const endingBalanceInput = String(this.form.get('endingBalance')?.value || '').trim();
    const endingBalance = this.parseCurrencyField('endingBalance');
    const serviceCharge = this.parseCurrencyField('serviceCharge');
    const serviceChargeDate = this.utilityService.toDateOnlyJsonString(this.form.get('serviceChargeDate')?.value);
    const serviceChargeAccountId = this.toNullableNumber(this.form.get('serviceChargeAccountId')?.value);
    const interestEarned = this.parseCurrencyField('interestEarned');
    const interestEarnedDate = this.utilityService.toDateOnlyJsonString(this.form.get('interestEarnedDate')?.value);
    const interestEarnedAccountId = this.toNullableNumber(this.form.get('interestEarnedAccountId')?.value);
    let isValid = true;

    if (!chartOfAccountId) {
      this.form.get('chartOfAccountId')?.markAsTouched();
      isValid = false;
    }

    if (!statementDate) {
      this.form.get('statementDate')?.markAsTouched();
      isValid = false;
    }

    if (!endingBalanceInput || !Number.isFinite(endingBalance)) {
      this.form.get('endingBalance')?.markAsTouched();
      isValid = false;
    }

    if (this.isNonZeroAmount(serviceCharge)) {
      if (!serviceChargeDate) {
        this.form.get('serviceChargeDate')?.markAsTouched();
        isValid = false;
      }

      if (!serviceChargeAccountId) {
        this.form.get('serviceChargeAccountId')?.markAsTouched();
        isValid = false;
      }
    }

    if (this.isNonZeroAmount(interestEarned)) {
      if (!interestEarnedDate) {
        this.form.get('interestEarnedDate')?.markAsTouched();
        isValid = false;
      }

      if (!interestEarnedAccountId) {
        this.form.get('interestEarnedAccountId')?.markAsTouched();
        isValid = false;
      }
    }

    if (!isValid) {
      this.toastr.error('Please correct the highlighted fields before attempting to reconcile.', CommonMessage.Error);
      return;
    }

    const officeId = this.data.officeId;
    const organizationId = this.data.organizationId?.trim();
    if (!officeId || officeId <= 0 || !organizationId) {
      this.toastr.error('Office and organization are required to reconcile.', CommonMessage.Error);
      return;
    }

    const setup: BeginReconciliationDialogResult = {
      chartOfAccountId,
      statementDate,
      beginningBalance: this.beginningBalance,
      endingBalance,
      serviceCharge,
      serviceChargeDate,
      serviceChargeAccountId,
      serviceChargeClassId: null,
      interestEarned,
      interestEarnedDate,
      interestEarnedAccountId,
      interestEarnedClassId: null,
      serviceChargeJournalEntryId: this.data.existingSetup?.serviceChargeJournalEntryId ?? null,
      interestEarnedJournalEntryId: this.data.existingSetup?.interestEarnedJournalEntryId ?? null
    };

    this.isSaving = true;
    this.reconcileAdjustmentService.syncReconcileAdjustments(
      organizationId,
      officeId,
      setup,
      this.data.existingSetup
    ).pipe(
      finalize(() => {
        this.isSaving = false;
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: result => {
        this.dialogRef.close(result);
      },
      error: (error: HttpErrorResponse | Error) => {
        const message = error instanceof HttpErrorResponse
          ? (error.error?.message || error.message || 'Unable to save reconcile adjustments.')
          : (error.message || 'Unable to save reconcile adjustments.');
        this.toastr.error(message, CommonMessage.Error);
      }
    });
  }

  onCurrencyFocus(event: FocusEvent, controlName: 'endingBalance' | 'serviceCharge' | 'interestEarned'): void {
    this.formatterService.clearCurrencyOnFocus(event, this.form.get(controlName));
  }

  onCurrencyBlur(controlName: 'endingBalance' | 'serviceCharge' | 'interestEarned'): void {
    const defaultWhenEmpty = controlName === 'endingBalance' ? null : '$0.00';
    this.formatterService.formatCurrencyControl(this.form.get(controlName), defaultWhenEmpty);
  }
  //#endregion

  //#region Utility Methods
  private applySelectedAccountDefaults(): void {
    const accountDefault = this.resolveSelectedAccountDefault();
    this.lastReconciledDate = accountDefault?.statementDate ?? null;
    this.beginningBalance = accountDefault?.endingBalance ?? 0;
  }

  private resolveSelectedAccountDefault() {
    const chartOfAccountId = Number(this.form.get('chartOfAccountId')?.value);
    if (!chartOfAccountId) {
      return null;
    }

    return this.data.accountReconcileDefaults.find(account => account.chartOfAccountId === chartOfAccountId) ?? null;
  }

  private applyExistingSetup(): void {
    const setup = this.data.existingSetup;
    if (!setup) {
      return;
    }

    const statementDate = this.utilityService.parseCalendarDateInput(setup.statementDate);
    const defaultStatementDate = statementDate ?? this.data.defaultStatementDate ?? new Date();
    this.form.patchValue({
      chartOfAccountId: setup.chartOfAccountId,
      statementDate: defaultStatementDate,
      endingBalance: this.formatCurrencyFieldValue(setup.endingBalance, ''),
      serviceCharge: this.formatCurrencyFieldValue(setup.serviceCharge, '$0.00'),
      serviceChargeDate: this.parseOptionalDate(setup.serviceChargeDate) ?? defaultStatementDate,
      serviceChargeAccountId: setup.serviceChargeAccountId,
      interestEarned: this.formatCurrencyFieldValue(setup.interestEarned, '$0.00'),
      interestEarnedDate: this.parseOptionalDate(setup.interestEarnedDate) ?? defaultStatementDate,
      interestEarnedAccountId: setup.interestEarnedAccountId
    });
  }

  private formatCurrencyFieldValue(value: number, defaultWhenZero: string): string {
    if (value === 0) {
      return defaultWhenZero;
    }

    return this.formatterService.currencyUsd(value);
  }

  private parseOptionalDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    return this.utilityService.parseCalendarDateInput(value);
  }

  private parseCurrencyField(controlName: 'endingBalance' | 'serviceCharge' | 'interestEarned'): number {
    return this.mappingService.parseCurrencyValue(String(this.form.get(controlName)?.value || ''));
  }

  private toNullableNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private isNonZeroAmount(amount: number): boolean {
    return Math.abs(amount) >= 0.005;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
