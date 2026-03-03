import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';
import { MappingService } from '../../../services/mapping.service';
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
export class WorkOrderListComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;

  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  workOrders: WorkOrderResponse[] = [];
  workOrdersDisplay: WorkOrderDisplayList[] = [];
  allWorkOrders: WorkOrderDisplayList[] = [];

  selectedProperty: PropertyResponse | null = null;
  selectedPropertyId: string | null = null;

  workOrderDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    receipt: { displayAs: 'Receipt', wrap: false, sort: false, maxWidth: '15ch' },
    description: { displayAs: 'Description', wrap: true, maxWidth: '30ch' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '25ch' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '25ch' },
    isActive: { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  constructor(
    private workOrderService: WorkOrderService,
    private mappingService: MappingService,
    private router: Router,
    private dialog: MatDialog,
    private toastr: ToastrService
  ) {}

  //#region Work-Order List
  ngOnInit(): void {
    const propertyId = this.property?.propertyId || null;
    if (propertyId) {
      this.selectedPropertyId = propertyId;
      this.getWorkOrders(propertyId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (!propertyId) {
        this.selectedPropertyId = null;
        this.workOrders = [];
        this.allWorkOrders = [];
        this.workOrdersDisplay = [];
        return;
      }

      if (this.selectedPropertyId !== propertyId) {
        this.selectedPropertyId = propertyId;
        this.getWorkOrders(propertyId);
      }
    }
  }

  getWorkOrders(propertyId: string): void {
    this.isServiceError = false;
    this.isLoading = true;
    this.workOrderService.getWorkOrdersByPropertyId(propertyId).pipe(take(1), finalize(() => (this.isLoading = false))).subscribe({
      next: (workOrders: WorkOrderResponse[]) => {
        this.workOrders = workOrders || [];
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.workOrders = [];
        this.allWorkOrders = [];
        this.workOrdersDisplay = [];
      }
    });
  }

  addWorkOrder(): void {
    if (!this.property) return;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, ['new']);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  deleteWorkOrder(event: WorkOrderDisplayList): void {
    this.workOrderService.deleteWorkOrder(event.workOrderId).pipe(take(1)).subscribe({
      next: () => {
        this.workOrders = this.workOrders.filter(workOrder => workOrder.workOrderId !== event.workOrderId);
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }
  
  goToWorkOrder(event: WorkOrderDisplayList): void {
    if (!this.property) return;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, [String(event.workOrderId)]);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  openReceiptDialog(item: WorkOrderDisplayList): void {
    this.workOrderService.getWorkOrderById(item.workOrderId).pipe(take(1)).subscribe({
      next: (workOrder: WorkOrderResponse) => {
        const fd = workOrder?.fileDetails;
        const imageSrc =
          fd?.dataUrl ||
          (fd?.file && fd?.contentType ? `data:${fd.contentType};base64,${fd.file}` : null);
        if (!imageSrc) {
          this.toastr.warning('Receipt image is not available.', 'Receipt');
          return;
        }
        const data: ImageViewDialogData = { imageSrc, title: 'Receipt' };
        this.dialog.open(ImageViewDialogComponent, { data, width: '90vw', maxWidth: '600px' });
      },
      error: () => this.toastr.error('Unable to load receipt.', 'Receipt')
    });
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.workOrdersDisplay = this.showInactive
      ? [...this.allWorkOrders]
      : this.allWorkOrders.filter(workOrder => workOrder.isActive !== false);
  }
  //#endregion
}
