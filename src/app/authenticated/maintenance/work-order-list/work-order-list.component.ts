import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, concatMap, finalize, forkJoin, from, map, Observable, of, switchMap, take, toArray } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReceiptRequest, ReceiptResponse } from '../models/receipt.model';
import { WorkOrderDisplayList, WorkOrderResponse } from '../models/work-order.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

export interface WorkOrderSelection {
  workOrderId: string | null;
  propertyId: string | null;
}

@Component({
  standalone: true,
  selector: 'app-work-order-list',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './work-order-list.component.html',
  styleUrl: './work-order-list.component.scss'
})
export class WorkOrderListComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() reservationId: string | null = null;
  @Input() isActiveTab = false;
  /** When true, selection is emitted via workOrderSelect and no navigation occurs (e.g. embedded in maintenance). */
  @Input() embeddedInMaintenance = false;
  @Output() workOrderSelect = new EventEmitter<WorkOrderSelection>();

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
    description: { displayAs: 'Description', wrap: false, maxWidth: '25ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '12ch', alignment: 'center' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '25ch', alignment: 'center' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '20ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  constructor(
    private workOrderService: WorkOrderService,
    private receiptService: ReceiptService,
    private mappingService: MappingService,
    private router: Router,
    private toastr: ToastrService
  ) {}

  //#region Work-Order List
  ngOnInit(): void {
    if (!this.isActiveTab) {
      return;
    }
    this.getWorkOrders();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isActiveTab']) {
      if (!this.isActiveTab) {
        return;
      }
      this.getWorkOrders();
      return;
    }

    if (!this.isActiveTab) {
      return;
    }

    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (!propertyId) {
        this.selectedPropertyId = null;
        this.getWorkOrders();
        return;
      }

      if (this.selectedPropertyId !== propertyId) {
        this.selectedPropertyId = propertyId;
        this.getWorkOrders();
      }
    }
    if (changes['officeId'] && !this.property?.propertyId) {
      this.getWorkOrders();
    }
    if (changes['reservationId']) {
      this.applyFilters();
    }
  }

  getWorkOrders(): void {
    this.isServiceError = false;
    this.isLoading = true;
    const propertyId = this.property?.propertyId ?? null;
    const officeId = this.officeId ?? null;
    this.workOrderService.getWorkOrders(propertyId, officeId).pipe(take(1)).subscribe({
      next: (workOrders: WorkOrderResponse[]) => {
        this.loadWorkOrderDetailsForDisplay(workOrders || []);
      },
      error: () => {
        this.isServiceError = true;
        this.workOrders = [];
        this.allWorkOrders = [];
        this.workOrdersDisplay = [];
        this.isLoading = false;
      }
    });
  }

  loadWorkOrderDetailsForDisplay(workOrders: WorkOrderResponse[]): void {
    if (!workOrders.length) {
      this.workOrders = [];
      this.allWorkOrders = [];
      this.workOrdersDisplay = [];
      this.isLoading = false;
      return;
    }

    from(workOrders).pipe(
      concatMap(workOrder => this.workOrderService.getWorkOrderById(String(workOrder.workOrderId)).pipe(take(1),catchError(() => of(workOrder)))),
      toArray(),finalize(() => (this.isLoading = false))).subscribe({
      next: (detailedWorkOrders: WorkOrderResponse[]) => {
        this.workOrders = detailedWorkOrders;
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
      },
      error: () => {
        this.workOrders = workOrders;
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
      }
    });
  }

  addWorkOrder(): void {
    if (!this.property) return;
    if (this.embeddedInMaintenance) {
      this.workOrderSelect.emit({
        workOrderId: null,
        propertyId: this.property?.propertyId ?? null
      });
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, ['new']);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  deleteWorkOrder(event: WorkOrderDisplayList): void {
    const id = String(event.workOrderId);
    if (!id) return;
    const targetWorkOrder = this.workOrders.find(workOrder => String(workOrder.workOrderId) === id);
    const workOrderCode = (targetWorkOrder?.workOrderCode || '').trim();
    const associatedReceiptIds = Array.from(
      new Set(
        (targetWorkOrder?.workOrderItems || [])
          .map(item => Number(item.receiptId))
          .filter(receiptId => Number.isFinite(receiptId) && receiptId > 0)
      )
    );

    this.removeWorkOrderAssociationsFromReceipts(workOrderCode, associatedReceiptIds).pipe(switchMap(() => this.workOrderService.deleteWorkOrder(id)), take(1)).subscribe({
      next: () => {
        this.workOrders = this.workOrders.filter(workOrder => String(workOrder.workOrderId) !== String(event.workOrderId));
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.toastr.error('Unable to delete work order and clear receipt associations.', 'Error');
      }
    });
  }
  
  goToWorkOrder(event: WorkOrderDisplayList): void {
    if (this.embeddedInMaintenance) {
      this.workOrderSelect.emit({
        workOrderId: String(event.workOrderId),
        propertyId: event.propertyId ?? this.property?.propertyId ?? null
      });
      return;
    }
    if (!this.property) return;
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

  //#region Receipt Update Methods
  removeWorkOrderAssociationsFromReceipts(workOrderCode: string, receiptIds: number[]): Observable<void> {
    if (!workOrderCode || !receiptIds.length) {
      return of(void 0);
    }

    return from(receiptIds).pipe(
      concatMap(receiptId => this.receiptService.getReceiptById(receiptId).pipe(catchError(() => of(null)))),
      toArray(),
      concatMap((receipts: Array<ReceiptResponse | null>) => {
        const updateRequests = receipts.filter((receipt): receipt is ReceiptResponse => receipt != null).map(receipt => {
            const currentSplits = receipt.splits || [];
            const nextSplits = currentSplits.map(split => {
              const nextWorkOrder = this.removeWorkOrderCodeFromList(split.workOrder, workOrderCode);
              if (nextWorkOrder === (split.workOrder || '')) {
                return split;
              }
              return { ...split, workOrder: nextWorkOrder };
            });

            if (JSON.stringify(nextSplits) === JSON.stringify(currentSplits)) {
              return null;
            }

            const payload: ReceiptRequest = {
              receiptId: receipt.receiptId,
              organizationId: receipt.organizationId,
              officeId: receipt.officeId,
              propertyIds: receipt.propertyIds || [],
              maintenanceId: receipt.maintenanceId,
              amount: receipt.amount,
              description: receipt.description,
              splits: nextSplits,
              receiptPath: receipt.receiptPath ?? null,
              fileDetails: receipt.fileDetails ?? null,
              isActive: receipt.isActive
            };

            return this.receiptService.updateReceipt(payload);
          })
          .filter((request): request is Observable<ReceiptResponse> => request != null);

        if (!updateRequests.length) {
          return of(void 0);
        }

        return forkJoin(updateRequests).pipe(map(() => void 0));
      })
    );
  }

  removeWorkOrderCodeFromList(currentValue: string | undefined, workOrderCode: string): string {
    const tokens = (currentValue || '')
      .split(',')
      .map(token => token.trim())
      .filter(token => token.length > 0);
    const remainingTokens = tokens.filter(token => token !== workOrderCode);
    return remainingTokens.join(', ');
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    const activeScoped = this.showInactive
      ? [...this.allWorkOrders]
      : this.allWorkOrders.filter(workOrder => workOrder.isActive !== false);
    const selectedReservationId = (this.reservationId || '').trim();
    this.workOrdersDisplay = !selectedReservationId
      ? activeScoped
      : activeScoped.filter(workOrder => (workOrder.reservationId || '').trim() === selectedReservationId);
  }
  //#endregion
}
