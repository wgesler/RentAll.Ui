import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { UtilityService } from '../../../../services/utility.service';

export interface OwnerStatementStartingBalanceDialogData {
  defaultDate: Date | null;
  defaultAmount?: number | null;
  existingAmount?: number | null;
  existingTransactionDate?: string | null;
  requiresAdminPassword?: boolean;
}

export interface OwnerStatementStartingBalanceDialogResult {
  transactionDate: string;
  amount: number;
  currentPassword?: string;
}

@Component({
  standalone: true,
  selector: 'app-owner-statement-starting-balance-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './owner-statement-starting-balance-dialog.component.html',
  styleUrl: './owner-statement-starting-balance-dialog.component.scss'
})
export class OwnerStatementStartingBalanceDialogComponent {
  readonly form = this.fb.group({
    transactionDate: [this.data.defaultDate ?? new Date(), Validators.required],
    amount: [this.data.defaultAmount != null ? Number(this.data.defaultAmount).toFixed(2) : '', Validators.required],
    currentPassword: ['']
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: OwnerStatementStartingBalanceDialogData,
    private dialogRef: MatDialogRef<OwnerStatementStartingBalanceDialogComponent, OwnerStatementStartingBalanceDialogResult | undefined>,
    private fb: FormBuilder,
    private utilityService: UtilityService
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onEnter(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const transactionDate = this.utilityService.toDateOnlyJsonString(this.form.get('transactionDate')?.value);
    const amountRaw = String(this.form.get('amount')?.value || '').trim();
    const amount = Number(amountRaw.replace(/[^0-9.-]/g, ''));
    if (!transactionDate || !Number.isFinite(amount) || amount === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const currentPassword = String(this.form.get('currentPassword')?.value || '').trim();
    if (this.requiresPasswordConfirmation(transactionDate, amount) && !currentPassword) {
      this.form.get('currentPassword')?.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close({
      transactionDate,
      amount,
      currentPassword
    });
  }

  onAmountBlur(): void {
    const amountRaw = String(this.form.get('amount')?.value || '').trim();
    const amount = Number(amountRaw.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount)) {
      return;
    }
    this.form.get('amount')?.setValue(amount.toFixed(2), { emitEvent: false });
  }

  requiresPasswordConfirmation(transactionDate: string, amount: number): boolean {
    if (!this.data.requiresAdminPassword) {
      return false;
    }

    const existingTransactionDate = String(this.data.existingTransactionDate || '').trim();
    const existingAmountRaw = Number(this.data.existingAmount);
    const existingAmount = Number.isFinite(existingAmountRaw) ? existingAmountRaw : 0;
    return existingTransactionDate !== transactionDate || Math.abs(existingAmount - amount) > 0.005;
  }
}
