import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';

export interface ConfirmCheckNumberDialogData {
  startingCheckNumber: number;
  checkCount: number;
}

export interface ConfirmCheckNumberDialogResult {
  startingCheckNumber: number;
}

@Component({
  standalone: true,
  selector: 'app-confirm-check-number-dialog',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './confirm-check-number-dialog.component.html',
  styleUrl: './confirm-check-number-dialog.component.scss'
})
export class ConfirmCheckNumberDialogComponent {
  readonly form = this.fb.group({
    startingCheckNumber: [this.data.startingCheckNumber, [Validators.required, Validators.min(1)]]
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ConfirmCheckNumberDialogData,
    private dialogRef: MatDialogRef<ConfirmCheckNumberDialogComponent, ConfirmCheckNumberDialogResult | undefined>,
    private fb: FormBuilder
  ) {}

  get endingCheckNumber(): number {
    const starting = Number(this.form.get('startingCheckNumber')?.value || 0);
    if (!Number.isFinite(starting) || starting < 1 || this.data.checkCount < 1) {
      return starting;
    }
    return starting + this.data.checkCount - 1;
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onConfirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close({
      startingCheckNumber: Number(this.form.get('startingCheckNumber')?.value)
    });
  }
}
