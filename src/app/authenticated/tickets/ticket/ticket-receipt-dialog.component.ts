import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { PropertyResponse } from '../../properties/models/property.model';

export interface TicketReceiptDialogData {
  property: PropertyResponse;
  ticketId: string | null;
  receiptId?: string | null;
  onCreated?: (receipt: ReceiptResponse) => void;
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
  private dialogRef = inject<MatDialogRef<TicketReceiptDialogComponent, TicketReceiptDialogResult>>(MatDialogRef);

  @ViewChild('receiptDetail') receiptDetail?: ReceiptComponent;

  constructor() {
    const data = inject<TicketReceiptDialogData>(MAT_DIALOG_DATA);

    this.data = data;
  }

  data: TicketReceiptDialogData;

  get isSubmitting(): boolean {
    return this.receiptDetail?.isSubmitting ?? false;
  }

  get dialogTitle(): string {
    return this.data.receiptId && this.data.receiptId !== 'new' ? 'Edit Receipt' : 'Add Receipt';
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  saveReceipt(): void {
    this.receiptDetail?.saveReceipt();
  }

  saveReceiptAndNew(): void {
    this.receiptDetail?.saveReceiptAndNew();
  }

  onReceiptSaved(receipt: ReceiptResponse): void {
    this.data.onCreated?.(receipt);
    this.dialogRef.close({ saved: true, receipt });
  }

  onReceiptSavedAndNew(receipt: ReceiptResponse): void {
    this.data.onCreated?.(receipt);
  }
}
