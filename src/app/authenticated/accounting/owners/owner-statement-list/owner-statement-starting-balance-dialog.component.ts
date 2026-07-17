import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { UtilityService } from '../../../../services/utility.service';

export interface OwnerStatementStartingBalanceDialogData {
  defaultDate: Date | null;
  defaultAmount?: number | null;
}

export interface OwnerStatementStartingBalanceDialogResult {
  transactionDate: string;
  amount: number;
}

@Component({
  standalone: true,
  selector: 'app-owner-statement-starting-balance-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './owner-statement-starting-balance-dialog.component.html',
  styleUrl: './owner-statement-starting-balance-dialog.component.scss'
})
export class OwnerStatementStartingBalanceDialogComponent {
  data = inject<OwnerStatementStartingBalanceDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<OwnerStatementStartingBalanceDialogComponent, OwnerStatementStartingBalanceDialogResult | undefined>>(MatDialogRef);
  private fb = inject(FormBuilder);
  private utilityService = inject(UtilityService);

  readonly form = this.fb.group({
    transactionDate: [this.data.defaultDate ?? new Date(), Validators.required],
    amount: [this.data.defaultAmount != null ? Number(this.data.defaultAmount).toFixed(2) : '', Validators.required]
  });

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

    this.dialogRef.close({
      transactionDate,
      amount
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

}
