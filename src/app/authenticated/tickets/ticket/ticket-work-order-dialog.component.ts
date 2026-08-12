import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { WorkOrderResponse } from '../../maintenance/models/work-order.model';
import { WorkOrderComponent } from '../../maintenance/work-order/work-order.component';
import { PropertyResponse } from '../../properties/models/property.model';

export interface TicketWorkOrderDialogData {
  property: PropertyResponse;
  maintenanceId: string | null;
  workOrderId?: string | null;
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialReservationId?: string | null;
  onCreated?: (workOrder: WorkOrderResponse) => void;
}

export interface TicketWorkOrderDialogResult {
  saved: boolean;
  workOrder?: WorkOrderResponse;
}

@Component({
  standalone: true,
  selector: 'app-ticket-work-order-dialog',
  imports: [CommonModule, MaterialModule, WorkOrderComponent],
  templateUrl: './ticket-work-order-dialog.component.html',
  styleUrl: './ticket-work-order-dialog.component.scss'
})
export class TicketWorkOrderDialogComponent {
  private dialogRef = inject<MatDialogRef<TicketWorkOrderDialogComponent, TicketWorkOrderDialogResult>>(MatDialogRef);

  @ViewChild('workOrderDetail') workOrderDetail?: WorkOrderComponent;

  constructor() {
    const data = inject<TicketWorkOrderDialogData>(MAT_DIALOG_DATA);

    this.data = data;
  }

  data: TicketWorkOrderDialogData;

  get isSubmitting(): boolean {
    return this.workOrderDetail?.isSubmitting ?? false;
  }

  get dialogTitle(): string {
    return this.data.workOrderId && this.data.workOrderId !== 'new' ? 'Edit Work Order' : 'Add Work Order';
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  saveWorkOrder(): void {
    this.workOrderDetail?.saveWorkOrder();
  }

  saveWorkOrderAndNew(): void {
    this.workOrderDetail?.saveWorkOrderAndNew();
  }

  onWorkOrderSaved(workOrder: WorkOrderResponse): void {
    this.data.onCreated?.(workOrder);
    this.dialogRef.close({ saved: true, workOrder });
  }

  onWorkOrderSavedAndNew(workOrder: WorkOrderResponse): void {
    this.data.onCreated?.(workOrder);
  }
}
