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
    amount: [this.data.suggestedAmount > 0 ? this.data.suggestedAmount : null as number | null, [Validators.required, Validators.min(0.01)]]
  });

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onConfirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const amount = Math.round(Number(this.form.get('amount')?.value) * 100) / 100;
    this.dialogRef.close({ amount });
  }
}
