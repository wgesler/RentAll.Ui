
import { Component, Inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom, take } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { InvoicePaymentRequest } from '../../../accounting/models/invoice.model';
import { InvoiceService } from '../../../accounting/services/invoice.service';
import { ReservationListResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';

export interface ApplyCreditDialogData {
  creditAmount: number;
  reservations: { value: ReservationListResponse, label: string }[];
  invoiceId: string; // Invoice GUID to apply credit to
  costCodeId: number; // Cost code from original payment
  description: string; // Description from original payment
}

@Component({
    standalone: true,
    selector: 'app-apply-credit-dialog',
    imports: [MaterialModule, FormsModule],
    templateUrl: './apply-credit-dialog.component.html',
    styleUrl: './apply-credit-dialog.component.scss'
})
export class ApplyCreditDialogComponent implements OnInit {
  creditAmount: number = 0;
  selectedReservation: ReservationListResponse | null = null;
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  isSubmitting: boolean = false;
  message: string = '';
  
  constructor(
    public dialogRef: MatDialogRef<ApplyCreditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplyCreditDialogData,
    private reservationService: ReservationService,
    private toastr: ToastrService,
    private formatter: FormatterService,
    private accountingService: InvoiceService
  ) {}
  
  ngOnInit(): void {
    this.creditAmount = this.data.creditAmount || 0;
    this.availableReservations = this.data.reservations || [];
    
    // If only one reservation, pre-select it
    if (this.availableReservations.length === 1) {
      this.selectedReservation = this.availableReservations[0].value;
    }
    
    // Set message based on whether invoiceId exists
    if (!this.data.invoiceId || this.data.invoiceId === '') {
      this.message = `There is a credit on this reservation of $${this.formatter.currency(this.creditAmount)}. Should we apply it?`;
    } else {
      this.message = 'There is a credit remaining from the payment, to which reservation should it be applied?';
    }
  }
  
  /** Used by mat-select [compareWith]; arrow so template gets a stable reference. */
  compareReservationById = (a: ReservationListResponse | null, b: ReservationListResponse | null): boolean => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return a.reservationId === b.reservationId;
  };

  onReservationChange(reservation: ReservationListResponse | null): void {
    this.selectedReservation = reservation;
  }
  
  cancel(): void {
    this.dialogRef.close();
  }
  
  async apply(): Promise<void> {
    if (!this.selectedReservation?.reservationId) {
      return;
    }
    
    // If invoiceId is empty, just return success (invoice will be created first, then credit applied)
    if (!this.data.invoiceId || this.data.invoiceId === '') {
      this.dialogRef.close({ success: true });
      return;
    }
    
    this.isSubmitting = true;

    const paymentRequest: InvoicePaymentRequest = {
      costCodeId: this.data.costCodeId,
      description: this.data.description || '',
      amount: Math.abs(this.creditAmount),
      invoices: [this.data.invoiceId]
    };

    try {
      await this.reservationService.updateModifiedReservation(this.selectedReservation.reservationId, res => ({
        creditDue: (res.creditDue || 0) + this.creditAmount,
        notes: res.notes ?? null
      }));
      await firstValueFrom(this.accountingService.applyPayment(paymentRequest).pipe(take(1)));
      this.toastr.success(`Credit of $${this.formatter.currency(this.creditAmount)} applied`, CommonMessage.Success);
      this.dialogRef.close({ success: true });
    } catch {
    } finally {
      this.isSubmitting = false;
    }
  }
  
  get isFormValid(): boolean {
    return !!this.selectedReservation?.reservationId && !this.isSubmitting;
  }
}
