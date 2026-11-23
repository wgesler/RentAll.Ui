import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { ChargeCardOnFileResponse } from '../models/reservation-model';

export interface ChargeCardResultDialogData {
  reservationCode: string;
  /** EasyPay's answer, when the charge reached EasyPay. */
  response?: ChargeCardOnFileResponse | null;
  /** RentAll's reason, when the charge never reached EasyPay (no card on file, no unpaid invoices, network...). */
  errorMessage?: string | null;
}

type ResultKind = 'approved' | 'partial' | 'declined' | 'error';

/**
 * Shows the result of a Charge Card on File, exactly as EasyPay returned it: approved, partially approved,
 * declined or failed, with EasyPay's code and message and what they mean. Used instead of toasts so staff can
 * read and act on the result.
 */
@Component({
  standalone: true,
  selector: 'app-charge-card-result-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './charge-card-result-dialog.component.html',
  styleUrl: './charge-card-result-dialog.component.scss'
})
export class ChargeCardResultDialogComponent {
  protected data = inject<ChargeCardResultDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<ChargeCardResultDialogComponent>>(MatDialogRef);

  readonly response = this.data.response ?? null;

  readonly kind: ResultKind = !this.response ? 'error'
    : this.response.status === 'Approved' ? 'approved'
    : this.response.status === 'PartiallyApproved' ? 'partial'
    : this.response.status === 'Declined' ? 'declined'
    : 'error';

  readonly title = {
    approved: 'Charge approved',
    partial: 'Partially approved',
    declined: 'Charge declined',
    error: 'Charge not completed'
  }[this.kind];

  readonly icon = {
    approved: 'check_circle',
    partial: 'warning',
    declined: 'cancel',
    error: 'error'
  }[this.kind];

  get remaining(): number {
    return this.response ? Math.max(0, this.response.requestedAmount - this.response.approvedAmount) : 0;
  }

  /** Builds the dialog data for a failed request (any HTTP error), so every outcome opens the dialog. */
  static fromHttpError(reservationCode: string, err: HttpErrorResponse): ChargeCardResultDialogData {
    const body = err?.error as (Partial<ChargeCardOnFileResponse> & { message?: string; Message?: string }) | string | null;
    if (body && typeof body === 'object' && typeof body.status === 'string') {
      return { reservationCode, response: body as ChargeCardOnFileResponse };
    }
    const text = typeof body === 'string' && body.trim()
      ? body
      : (body && typeof body === 'object' ? String(body.message || body.Message || '') : '');
    return {
      reservationCode,
      errorMessage: text || (err?.status === 0 ? 'RentAll could not be reached. Check the connection and try again.' : 'The card could not be charged.')
    };
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
