import { CommonModule } from '@angular/common';
import { Component, Inject, ViewChild } from '@angular/core';
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
  @ViewChild('workOrderDetail') workOrderDetail?: WorkOrderComponent;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: TicketWorkOrderDialogData,
    private dialogRef: MatDialogRef<TicketWorkOrderDialogComponent, TicketWorkOrderDialogResult>
  ) {
    this.data = data;
  }

  data: TicketWorkOrderDialogData;

  get isSaveDisabled(): boolean {
    if (!this.workOrderDetail?.form) {
      return true;
    }
    return this.workOrderDetail.isSubmitting || (!this.workOrderDetail.isViewModeBeforeChanges() && !this.workOrderDetail.form.valid);
  }

  get isSubmitting(): boolean {
    return this.workOrderDetail?.isSubmitting ?? false;
  }

  get dialogTitle(): string {
    return this.data.workOrderId ? 'Edit Work Order' : 'Add Work Order';
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  saveWorkOrder(): void {
    this.workOrderDetail?.saveWorkOrder();
  }

  onWorkOrderSaved(workOrder: WorkOrderResponse): void {
    this.dialogRef.close({ saved: true, workOrder });
  }
}
