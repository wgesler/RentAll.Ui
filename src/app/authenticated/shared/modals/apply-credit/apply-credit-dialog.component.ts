import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { FormsModule } from '@angular/forms';
import { ReservationListResponse, ReservationResponse, ReservationRequest } from '../../../reservation/models/reservation-model';
import { ReservationService } from '../../../reservation/services/reservation.service';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { take, finalize } from 'rxjs';
import { FormatterService } from '../../../../services/formatter-service';
import { AccountingService } from '../../../accounting/services/accounting.service';
import { InvoicePaymentRequest } from '../../../accounting/models/invoice.model';

export interface ApplyCreditDialogData {
  creditAmount: number;
  reservations: { value: ReservationListResponse, label: string }[];
  invoiceId: string; // Invoice GUID to apply credit to
  costCodeId: number; // Cost code from original payment
  description: string; // Description from original payment
}

@Component({
  selector: 'app-apply-credit-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
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
    private accountingService: AccountingService
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
  
  onReservationChange(reservation: ReservationListResponse | null): void {
    this.selectedReservation = reservation;
  }
  
  cancel(): void {
    this.dialogRef.close();
  }
  
  apply(): void {
    if (!this.selectedReservation?.reservationId) {
      return;
    }
    
    // If invoiceId is empty, just return success (invoice will be created first, then credit applied)
    if (!this.data.invoiceId || this.data.invoiceId === '') {
      this.dialogRef.close({ success: true });
      return;
    }
    
    this.isSubmitting = true;
    
    // Call applyPayment with the invoice GUID (same as Apply Payment button)
    const paymentRequest: InvoicePaymentRequest = {
      costCodeId: this.data.costCodeId,
      description: this.data.description || '',
      amount: Math.abs(this.creditAmount), // Credit amount should be positive
      invoices: [this.data.invoiceId] // List containing one GUID
    };
    
    this.accountingService.applyPayment(paymentRequest)
      .pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      )
      .subscribe({
        next: (response) => {
          this.toastr.success(`Credit of $${this.formatter.currency(this.creditAmount)} applied`, CommonMessage.Success);
          this.dialogRef.close({ success: true });
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Failed to apply credit', CommonMessage.Error);
          }
        }
      });
  }
  
  get isFormValid(): boolean {
    return !!this.selectedReservation?.reservationId && !this.isSubmitting;
  }
}
