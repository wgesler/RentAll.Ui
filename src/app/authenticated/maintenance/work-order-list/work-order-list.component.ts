import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { finalize, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { WorkOrderDisplayList, WorkOrderResponse } from '../models/work-order.model';
import { WorkOrderService } from '../services/work-order.service';

@Component({
  selector: 'app-work-order-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './work-order-list.component.html',
  styleUrl: './work-order-list.component.scss'
})
export class WorkOrderListComponent implements OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() workOrdersInput: WorkOrderResponse[] | null = null;
  @Output() addWorkOrderEvent = new EventEmitter<void>();
  @Output() openWorkOrderEvent = new EventEmitter<WorkOrderDisplayList>();
  @Output() deleteWorkOrderEvent = new EventEmitter<WorkOrderDisplayList>();

  workOrders: WorkOrderResponse[] = [];
  workOrdersDisplay: WorkOrderDisplayList[] = [];
  isLoading: boolean = false;
  isServiceError: boolean = false;
  lastPropertyId: string | null = null;

  workOrderDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '20ch' },
    descriptionId: { displayAs: 'Description', wrap: true, maxWidth: '36ch' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '20ch' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '25ch' }
  };

  constructor(workOrderService: WorkOrderService, formatter: FormatterService) {
    this.workOrderService = workOrderService;
    this.formatter = formatter;
  }

  workOrderService: WorkOrderService;
  formatter: FormatterService;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['workOrdersInput']) {
      this.workOrders = this.workOrdersInput || [];
      this.workOrdersDisplay = this.mapWorkOrderDisplays(this.workOrders);
      return;
    }

    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (!propertyId) {
        this.lastPropertyId = null;
        this.workOrders = [];
        this.workOrdersDisplay = [];
        return;
      }

      if (this.lastPropertyId !== propertyId) {
        this.lastPropertyId = propertyId;
        this.getWorkOrders(propertyId);
      }
    }
  }

  getWorkOrders(propertyId: string): void {
    if (this.workOrdersInput !== null) {
      this.workOrders = this.workOrdersInput || [];
      this.workOrdersDisplay = this.mapWorkOrderDisplays(this.workOrders);
      return;
    }

    this.isServiceError = false;
    this.isLoading = true;
    this.workOrderService.getWorkOrdersByPropertyId(propertyId).pipe(take(1), finalize(() => (this.isLoading = false))).subscribe({
      next: (workOrders: WorkOrderResponse[]) => {
        this.workOrders = workOrders || [];
        this.workOrdersDisplay = this.mapWorkOrderDisplays(this.workOrders);
      },
      error: () => {
        this.isServiceError = true;
        this.workOrders = [];
        this.workOrdersDisplay = [];
      }
    });
  }

  addWorkOrder(): void {
    this.addWorkOrderEvent.emit();
  }

  openWorkOrder(event: WorkOrderDisplayList): void {
    this.openWorkOrderEvent.emit(event);
  }

  deleteWorkOrder(event: WorkOrderDisplayList): void {
    this.deleteWorkOrderEvent.emit(event);
  }

  mapWorkOrderDisplays(workOrders: WorkOrderResponse[]): WorkOrderDisplayList[] {
    return (workOrders || []).map(workOrder => ({
      workOrderId: workOrder.workOrderId,
      officeId: workOrder.officeId,
      officeName: workOrder.officeName,
      propertyId: workOrder.propertyId,
      propertyCode: workOrder.propertyCode,
      maintenanceId: workOrder.maintenanceId,
      descriptionId: workOrder.descriptionId,
      documentPath: workOrder.documentPath,
      isActive: workOrder.isActive,
      modifiedOn: this.formatter.formatDateTimeString(workOrder.modifiedOn),
      modifiedBy: workOrder.modifiedBy
    }));
  }
}
