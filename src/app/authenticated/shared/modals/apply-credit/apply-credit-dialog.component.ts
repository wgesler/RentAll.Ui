import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { FormsModule } from '@angular/forms';
import { ReservationListResponse, ReservationResponse, ReservationRequest, ExtraFeeLineRequest, ExtraFeeLineResponse } from '../../../reservation/models/reservation-model';
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
    
    // First, get the reservation and update its creditDue
    this.reservationService.getReservationByGuid(this.selectedReservation.reservationId).pipe(take(1)).subscribe({
      next: (reservation: ReservationResponse) => {
        // Convert ReservationResponse to ReservationRequest and update creditDue
        const reservationRequest: ReservationRequest = {
          reservationId: reservation.reservationId,
          organizationId: reservation.organizationId,
          officeId: reservation.officeId,
          agentId: reservation.agentId || '', // Required field, use empty string if null
          propertyId: reservation.propertyId,
          contactId: reservation.contactId,
          reservationCode: reservation.reservationCode,
          reservationTypeId: reservation.reservationTypeId,
          reservationStatusId: reservation.reservationStatusId,
          reservationNoticeId: reservation.reservationNoticeId ?? 0, // Required field, default to 0 if undefined
          numberOfPeople: reservation.numberOfPeople,
          tenantName: reservation.tenantName,
          arrivalDate: reservation.arrivalDate,
          departureDate: reservation.departureDate,
          checkInTimeId: reservation.checkInTimeId,
          checkOutTimeId: reservation.checkOutTimeId,
          billingMethodId: reservation.billingMethodId,
          prorateTypeId: reservation.prorateTypeId,
          billingTypeId: reservation.billingTypeId,
          billingRate: reservation.billingRate,
          deposit: reservation.deposit,
          depositTypeId: reservation.depositTypeId ?? 0, // Required field, default to 0 if undefined
          departureFee: reservation.departureFee,
          taxes: reservation.taxes,
          hasPets: reservation.hasPets,
          petFee: reservation.petFee,
          numberOfPets: reservation.numberOfPets,
          petDescription: reservation.petDescription,
          maidService: reservation.maidService,
          maidServiceFee: reservation.maidServiceFee,
          frequencyId: reservation.frequencyId,
          maidStartDate: reservation.maidStartDate,
          extraFeeLines: (reservation.extraFeeLines || []).map((line: ExtraFeeLineResponse): ExtraFeeLineRequest => ({
            extraFeeLineId: line.extraFeeLineId,
            reservationId: line.reservationId,
            feeDescription: line.feeDescription,
            feeAmount: line.feeAmount,
            feeFrequencyId: line.feeFrequencyId,
            costCodeId: line.costCodeId
          })),
          notes: reservation.notes,
          allowExtensions: reservation.allowExtensions,
          currentInvoiceNumber: reservation.currentInvoiceNumber,
          creditDue: (reservation.creditDue || 0) + this.creditAmount, // Add the credit amount to existing creditDue
          isActive: reservation.isActive
        };

        // Update the reservation
        this.reservationService.updateReservation(reservationRequest).pipe(take(1)).subscribe({
          next: () => {
            // Now apply the payment to the invoice
            const paymentRequest: InvoicePaymentRequest = {
              costCodeId: this.data.costCodeId,
              description: this.data.description || '',
              amount: Math.abs(this.creditAmount), // Credit amount should be positive
              invoices: [this.data.invoiceId] // List containing one GUID
            };
            
            this.accountingService.applyPayment(paymentRequest).pipe(
              take(1),
              finalize(() => this.isSubmitting = false)
            ).subscribe({
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
          },
          error: (err: HttpErrorResponse) => {
            this.isSubmitting = false;
            if (err.status !== 400) {
              this.toastr.error('Failed to update reservation credit', CommonMessage.Error);
            }
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.isSubmitting = false;
        if (err.status !== 400) {
          this.toastr.error('Failed to load reservation', CommonMessage.Error);
        }
      }
    });
  }
  
  get isFormValid(): boolean {
    return !!this.selectedReservation?.reservationId && !this.isSubmitting;
  }
}
