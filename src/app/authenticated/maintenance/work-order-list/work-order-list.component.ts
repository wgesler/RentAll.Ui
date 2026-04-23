import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { WorkOrderDisplayList, WorkOrderResponse } from '../models/work-order.model';
import { WorkOrderService } from '../services/work-order.service';

@Component({
  standalone: true,
  selector: 'app-work-order-list',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './work-order-list.component.html',
  styleUrl: './work-order-list.component.scss'
})
export class WorkOrderListComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  /** When true, selection is emitted via workOrderSelect and no navigation occurs (e.g. embedded in maintenance). */
  @Input() embeddedInMaintenance = false;
  @Output() workOrderSelect = new EventEmitter<string | null>();

  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  workOrders: WorkOrderResponse[] = [];
  workOrdersDisplay: WorkOrderDisplayList[] = [];
  allWorkOrders: WorkOrderDisplayList[] = [];

  selectedProperty: PropertyResponse | null = null;
  selectedPropertyId: string | null = null;

  workOrderDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderType: { displayAs: 'Type', wrap: false, maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', wrap: false, maxWidth: '20ch' },
    description: { displayAs: 'Description', wrap: false, maxWidth: '40ch' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '25ch', alignment: 'center' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  constructor(
    private workOrderService: WorkOrderService,
    private mappingService: MappingService,
    private router: Router,
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
    if (this.embeddedInMaintenance) {
      this.workOrderSelect.emit(null);
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, ['new']);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  deleteWorkOrder(event: WorkOrderDisplayList): void {
    const id = String(event.workOrderId);
    if (!id) return;
    this.workOrderService.deleteWorkOrder(id).pipe(take(1)).subscribe({
      next: () => {
        this.workOrders = this.workOrders.filter(workOrder => String(workOrder.workOrderId) !== String(event.workOrderId));
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
    if (this.embeddedInMaintenance) {
      this.workOrderSelect.emit(String(event.workOrderId));
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, [String(event.workOrderId)]);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  viewWorkOrder(event: WorkOrderDisplayList): void {
    const workOrderId = String(event.workOrderId);
    if (!workOrderId) return;
    const propertyId = this.property?.propertyId ?? this.selectedPropertyId ?? '';
    this.router.navigateByUrl(
      `${RouterUrl.WorkOrderCreate}?workOrderId=${encodeURIComponent(workOrderId)}&propertyId=${encodeURIComponent(propertyId)}&returnTo=work-order-list`
    );
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
