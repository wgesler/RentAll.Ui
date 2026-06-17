import { CommonModule } from '@angular/common';
import { Component, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { PropertyResponse } from '../../properties/models/property.model';

export interface TicketReceiptDialogData {
  property: PropertyResponse;
  ticketId: string | null;
  receiptId?: string | null;
}

export interface TicketReceiptDialogResult {
  saved: boolean;
  receipt?: ReceiptResponse;
}

@Component({
  standalone: true,
  selector: 'app-ticket-receipt-dialog',
  imports: [CommonModule, MaterialModule, ReceiptComponent],
  templateUrl: './ticket-receipt-dialog.component.html',
  styleUrl: './ticket-receipt-dialog.component.scss'
})
export class TicketReceiptDialogComponent {
  @ViewChild('receiptDetail') receiptDetail?: ReceiptComponent;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: TicketReceiptDialogData,
    private dialogRef: MatDialogRef<TicketReceiptDialogComponent, TicketReceiptDialogResult>
  ) {
    this.data = data;
  }

  data: TicketReceiptDialogData;

  get isSaveDisabled(): boolean {
    if (!this.receiptDetail?.form) {
      return true;
    }
    return this.receiptDetail.isSubmitting || !this.receiptDetail.form.valid;
  }

  get isSubmitting(): boolean {
    return this.receiptDetail?.isSubmitting ?? false;
  }

  get dialogTitle(): string {
    return this.data.receiptId ? 'Edit Receipt' : 'Add Receipt';
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  saveReceipt(): void {
    this.receiptDetail?.saveReceipt();
  }

  onReceiptSaved(receipt: ReceiptResponse): void {
    this.dialogRef.close({ saved: true, receipt });
  }
}
