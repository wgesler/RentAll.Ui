import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

export interface ChargeCardDialogData {
  reservationCode: string;
  /** Unpaid invoice balance, offered as the starting amount. */
  suggestedAmount: number;
}

export interface ChargeCardDialogResult {
  amount: number;
}

@Component({
  standalone: true,
  selector: 'app-charge-card-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './charge-card-dialog.component.html',
  styleUrl: './charge-card-dialog.component.scss'
})
export class ChargeCardDialogComponent {
  protected data = inject<ChargeCardDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<ChargeCardDialogComponent, ChargeCardDialogResult | undefined>>(MatDialogRef);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    // Text, not a number input (no up/down arrows). Starts at the reservation's outstanding invoice amount.
    amount: [this.data.suggestedAmount > 0 ? this.data.suggestedAmount.toFixed(2) : '', [Validators.required, Validators.pattern(/^\s*\$?\s*[0-9,]*\.?[0-9]{0,2}\s*$/)]]
  });

  /** Shows the amount with two decimals (1250 -> 1250.00) when the field loses focus. */
  formatAmount(): void {
    const control = this.form.get('amount');
    const value = Number(String(control?.value ?? '').replace(/[$,\s]/g, ''));
    if (control && String(control.value ?? '').trim() !== '' && Number.isFinite(value)) {
      control.setValue(value.toFixed(2));
    }
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onConfirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const amount = Math.round(Number(String(this.form.get('amount')?.value ?? '').replace(/[$,\s]/g, '')) * 100) / 100;
    if (!(amount > 0)) {
      this.form.get('amount')?.setErrors({ min: true });
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close({ amount });
  }
}
