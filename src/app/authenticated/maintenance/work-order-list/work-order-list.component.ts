import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, catchError, concatMap, finalize, forkJoin, from, map, Observable, of, switchMap, take, takeUntil, toArray } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ContactService } from '../../contacts/services/contact.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserGroups } from '../../users/models/user-enums';
import { ReceiptRequest, ReceiptResponse } from '../models/receipt.model';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { WorkOrderType } from '../models/maintenance-enums';
import { WorkOrderDisplayList, WorkOrderPreviewSelection, WorkOrderResponse } from '../models/work-order.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

export interface WorkOrderSelection {
  workOrderId: string | null;
  propertyId: string | null;
  officeId?: number | null;
  workOrder?: WorkOrderResponse | null;
}

@Component({
  standalone: true,
  selector: 'app-work-order-list',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './work-order-list.component.html',
  styleUrl: './work-order-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkOrderListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() reservationId: string | null = null;
  /** When true, selection is emitted via workOrderSelect and no navigation occurs (e.g. embedded in maintenance). */
  @Input() embeddedInMaintenance = false;
  /** When true with embeddedInMaintenance, document preview opens in the host shell instead of routing away. */
  @Input() embedDocumentPreviewInShell = false;
  @Input() refreshTrigger = 0;
  /** When set, only work orders with this type are shown. */
  @Input() workOrderTypeId: number | null = null;
  @Input() showOwnersOnlyToggle = false;
  @Output() workOrderSelect = new EventEmitter<WorkOrderSelection>();
  @Output() previewEvent = new EventEmitter<WorkOrderPreviewSelection>();
  private authService = inject(AuthService);
  private workOrderService = inject(WorkOrderService);
  private receiptService = inject(ReceiptService);
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private contactService = inject(ContactService);
  private utilityService = inject(UtilityService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['workOrders']));
  destroy$ = new Subject<void>();
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  showInactive: boolean = false;
  canViewEnteredInQb: boolean = false;
  workOrders: WorkOrderResponse[] = [];
  workOrdersDisplay: WorkOrderDisplayList[] = [];
  allWorkOrders: WorkOrderDisplayList[] = [];
  ownersOnly = false;
  readonly ownerWorkOrderTypeId = WorkOrderType.Owner;

  selectedProperty: PropertyResponse | null = null;
  selectedPropertyId: string | null = null;
  workOrdersLoadId = 0;
  lastWorkOrderSearchKey: string | null = null;
  workOrderSearchInFlightKey: string | null = null;

  workOrderDisplayedColumns: ColumnSet = {
    workOrderCode: { displayAs: 'Code', wrap: false, maxWidth: '15ch' },
    title: { displayAs: 'Title', wrap: false, maxWidth: '25ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderType: { displayAs: 'Type', wrap: false, maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', wrap: false, maxWidth: '20ch' },
    description: { displayAs: 'Description', wrap: false, maxWidth: '25ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '12ch', alignment: 'center' },
    workOrderDate: { displayAs: 'Work Order Date', wrap: false, maxWidth: '25ch', alignment: 'center' },
    createdBy: { displayAs: 'Created By', wrap: false, maxWidth: '20ch' },
    enteredInQb: { displayAs: 'QB', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '15ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };


  //#region Work-Order List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.setRoleBasedColumns();
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadVendors();
    this.loadWorkOrdersForCurrentSearchCriteria();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (propertyId !== this.selectedPropertyId) {
        this.selectedPropertyId = propertyId;
        if (!changes['property'].firstChange) {
          this.loadWorkOrdersForCurrentSearchCriteria();
        }
      }
    }

    if (changes['officeId'] && !changes['officeId'].firstChange && !this.property?.propertyId) {
      this.loadWorkOrdersForCurrentSearchCriteria();
    }

    if (changes['reservationId'] && !changes['reservationId'].firstChange) {
      if (this.usesMaintenanceSearch()) {
        this.applyFilters();
      } else {
        this.loadWorkOrdersForCurrentSearchCriteria();
      }
    }

    if (changes['searchRequest'] && !changes['searchRequest'].firstChange && this.embeddedInMaintenance) {
      this.loadWorkOrdersForCurrentSearchCriteria();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadWorkOrdersForCurrentSearchCriteria(true);
    }

    if (changes['workOrderTypeId'] && !changes['workOrderTypeId'].firstChange) {
      this.applyFilters();
    }
  }

  getWorkOrders(force = false): void {
    if (this.embeddedInMaintenance && !this.canRunMaintenanceSearch(this.searchRequest)) {
      this.lastWorkOrderSearchKey = null;
      this.workOrderSearchInFlightKey = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrders');
      this.markViewForCheck();
      return;
    }

    let searchKey: string | null = null;
    if (this.embeddedInMaintenance) {
      searchKey = this.buildWorkOrderSearchKey();
      if (!force && (searchKey === this.lastWorkOrderSearchKey || searchKey === this.workOrderSearchInFlightKey)) {
        return;
      }
      this.workOrderSearchInFlightKey = searchKey;
    }

    const loadId = ++this.workOrdersLoadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'workOrders');
    const load$ = this.embeddedInMaintenance
      ? this.workOrderService.searchWorkOrders(this.buildMaintenanceSearchRequest())
      : this.workOrderService.getWorkOrders(this.property?.propertyId ?? null, this.officeId ?? null);

    load$.pipe(take(1), finalize(() => {
      if (this.workOrdersLoadId === loadId) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrders');
        if (this.embeddedInMaintenance && searchKey != null && this.workOrderSearchInFlightKey === searchKey) {
          this.workOrderSearchInFlightKey = null;
        }
      }
      this.markViewForCheck();
    })).subscribe({
      next: (workOrders: WorkOrderResponse[]) => {
        if (this.workOrdersLoadId !== loadId) {
          return;
        }
        if (this.embeddedInMaintenance && searchKey != null) {
          this.lastWorkOrderSearchKey = searchKey;
        }
        this.workOrders = workOrders || [];
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        if (this.workOrdersLoadId !== loadId) {
          return;
        }
        this.isServiceError = true;
        this.workOrders = [];
        this.allWorkOrders = [];
        this.workOrdersDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  addWorkOrder(): void {
    if (this.embeddedInMaintenance) {
      this.workOrderSelect.emit({
        workOrderId: 'new',
        propertyId: (this.property?.propertyId || '').trim() || null,
        officeId: this.officeId ?? this.property?.officeId ?? null
      });
      return;
    }
    if (!this.property) return;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, ['new']);
    this.router.navigate([url], {
      queryParams: { propertyId: this.property.propertyId },
      state: { property: this.property }
    });
  }

  deleteWorkOrder(event: WorkOrderDisplayList): void {
    const id = String(event.workOrderId);
    if (!id) return;
    const targetWorkOrder = this.workOrders.find(workOrder => String(workOrder.workOrderId) === id);
    const workOrderCode = (targetWorkOrder?.workOrderCode || event.workOrderCode || '').trim();
    const associatedReceiptIds = Array.from(
      new Set(
        (targetWorkOrder?.workOrderItems || [])
          .map(item => String(item.receiptId ?? '').trim())
          .filter(receiptId => receiptId.length > 0)
      )
    );

    this.collectReceiptIdsWithWorkOrderCode(workOrderCode, associatedReceiptIds)
      .pipe(
        switchMap((receiptIdsToUpdate: string[]) => this.removeWorkOrderAssociationsFromReceipts(workOrderCode, receiptIdsToUpdate)),
        switchMap(() => this.workOrderService.deleteWorkOrder(id)),
        take(1)
      )
      .subscribe({
      next: () => {
        this.workOrders = this.workOrders.filter(workOrder => String(workOrder.workOrderId) !== String(event.workOrderId));
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.toastr.error('Unable to delete work order and clear receipt associations.', 'Error');
        this.markViewForCheck();
      }
    });
  }
  
  goToWorkOrder(event: WorkOrderDisplayList): void {
    const workOrderId = (event?.workOrderId || '').toString().trim();
    if (!workOrderId) return;
    const resolvedPropertyId = this.resolvePropertyIdForWorkOrder(event);
    const workOrder = this.workOrders.find(item => item.workOrderId === workOrderId) ?? null;

    if (this.embeddedInMaintenance) {
      this.workOrderSelect.emit({
        workOrderId,
        propertyId: resolvedPropertyId,
        officeId: event.officeId ?? this.officeId ?? this.property?.officeId ?? null,
        workOrder
      });
      return;
    }
    if (!resolvedPropertyId && Number(event.workOrderTypeId) !== WorkOrderType.Company) {
      this.toastr.error('Unable to open work order: property was not provided.', 'Missing Property');
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, [workOrderId]);
    this.router.navigate([url], {
      queryParams: resolvedPropertyId ? { propertyId: resolvedPropertyId } : {},
      state: { property: this.property, prefetchedWorkOrder: workOrder }
    });
  }

  viewWorkOrder(event: WorkOrderDisplayList): void {
    const workOrderId = (event?.workOrderId || '').toString().trim();
    if (!workOrderId) return;
    const propertyId = this.resolvePropertyIdForWorkOrder(event);
    if (!propertyId && Number(event.workOrderTypeId) !== WorkOrderType.Company) {
      this.toastr.error('Unable to view work order: property was not provided.', 'Missing Property');
      return;
    }
    const reservationId = (event.reservationId || '').toString().trim();
    if (this.embeddedInMaintenance && this.embedDocumentPreviewInShell) {
      this.previewEvent.emit({
        workOrderId,
        propertyId,
        reservationId: reservationId || null,
        officeId: event.officeId ?? this.officeId ?? this.property?.officeId ?? null,
        propertyCode: (event.propertyCode || this.property?.propertyCode || '').trim()
      });
      return;
    }
    this.router.navigateByUrl(this.buildWorkOrderPreviewUrl(workOrderId, propertyId, reservationId, 'work-order-list'));
  }
  //#endregion

  //#region Receipt Update Methods
  removeWorkOrderAssociationsFromReceipts(workOrderCode: string, receiptIds: string[]): Observable<void> {
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
              const existingWorkOrderCode = split.workOrderCode || split.workOrder || '';
              const nextWorkOrder = this.removeWorkOrderCodeFromList(existingWorkOrderCode, workOrderCode);
              if (nextWorkOrder === existingWorkOrderCode) {
                return split;
              }
              return {
                ...split,
                workOrderId: null,
                workOrderCode: nextWorkOrder,
                workOrder: nextWorkOrder
              };
            });

            if (JSON.stringify(nextSplits) === JSON.stringify(currentSplits)) {
              return null;
            }

            const payload: ReceiptRequest = {
              receiptId: receipt.receiptId,
              organizationId: receipt.organizationId,
              officeId: receipt.officeId,
              propertyIds: receipt.propertyIds || [],
              receiptDate: receipt.receiptDate || '',
              dueDate: receipt.dueDate,
              accountingPeriod: receipt.accountingPeriod,
              billNumber: receipt.billNumber ?? null,
              ticketId: receipt.ticketId,
              amount: receipt.amount,
              paidAmount: receipt.paidAmount ?? 0,
              paidDate: receipt.paidDate ?? null,
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
    const normalizedTarget = (workOrderCode || '').trim().toLowerCase();
    const tokens = (currentValue || '')
      .split(',')
      .map(token => token.trim())
      .filter(token => token.length > 0);
    const remainingTokens = tokens.filter(token => token.toLowerCase() !== normalizedTarget);
    return remainingTokens.join(', ');
  }

  collectReceiptIdsWithWorkOrderCode(workOrderCode: string, seedReceiptIds: string[]): Observable<string[]> {
    const normalizedCode = (workOrderCode || '').trim();
    if (!normalizedCode) {
      return of(seedReceiptIds);
    }

    const seedSet = new Set<string>((seedReceiptIds || []).filter(id => !!id && id.trim().length > 0));
    const propertyId = this.property?.propertyId ?? null;
    const officeId = this.officeId ?? null;

    return this.receiptService.getReceipts(propertyId, officeId).pipe(
      take(1),
      map((receipts: ReceiptResponse[]) => {
        (receipts || []).forEach(receipt => {
          const hasCode = (receipt.splits || []).some(split => {
            const tokens = (split.workOrderCode || split.workOrder || '')
              .split(',')
              .map(token => token.trim().toLowerCase())
              .filter(token => token.length > 0);
            return tokens.includes(normalizedCode.toLowerCase());
          });
          if (hasCode && String(receipt.receiptId || '').trim().length > 0) {
            seedSet.add(String(receipt.receiptId).trim());
          }
        });
        return Array.from(seedSet);
      }),
      catchError(() => of(Array.from(seedSet)))
    );
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    if (this.usesMaintenanceSearch()) {
      this.loadWorkOrdersForCurrentSearchCriteria(true);
      return;
    }
    this.applyFilters();
  }

  applyFilters(): void {
    const activeScoped = this.showInactive
      ? this.allWorkOrders.filter(workOrder => workOrder.isActive === false)
      : this.allWorkOrders.filter(workOrder => workOrder.isActive !== false);

    const effectiveWorkOrderTypeId = this.ownersOnly ? this.ownerWorkOrderTypeId : this.workOrderTypeId;
    const shouldApplyWorkOrderTypeFilter = effectiveWorkOrderTypeId !== null && effectiveWorkOrderTypeId !== undefined;
    const typeFiltered = shouldApplyWorkOrderTypeFilter
      ? activeScoped.filter(workOrder => Number(workOrder.workOrderTypeId) === Number(effectiveWorkOrderTypeId))
      : activeScoped;

    // Reservation filtering is only valid when the shell is scoped to a specific property.
    // When "All Properties" is selected, a stale reservation value can otherwise hide rows.
    const selectedReservationId = this.property
      ? (this.reservationId || '').trim()
      : '';
    this.workOrdersDisplay = !selectedReservationId
      ? typeFiltered
      : typeFiltered.filter(workOrder => (workOrder.reservationId || '').trim() === selectedReservationId);
  }

  onOwnersOnlyToggleChange(): void {
    this.ownersOnly = !this.ownersOnly;
    this.applyFilters();
  }
  //#endregion

  //#region Search Methods
  usesMaintenanceSearch(): boolean {
    return this.embeddedInMaintenance && this.canRunMaintenanceSearch(this.searchRequest);
  }

  canRunMaintenanceSearch(request?: MaintenanceListSearchRequest | null): boolean {
    if (!this.embeddedInMaintenance || request == null) {
      return false;
    }

    return !!(request.startDate && request.endDate && this.resolveMaintenanceSearchOfficeIds(request).length > 0);
  }

  resolveMaintenanceSearchOfficeIds(request?: MaintenanceListSearchRequest | null): number[] {
    const fromShell = (request?.officeIds ?? this.searchRequest?.officeIds ?? []).filter(id => id > 0);
    if (fromShell.length > 0) {
      return fromShell;
    }

    const scopedOfficeId = this.officeId;
    if (scopedOfficeId != null && Number.isFinite(Number(scopedOfficeId)) && Number(scopedOfficeId) > 0) {
      return [Number(scopedOfficeId)];
    }

    return [];
  }

  buildMaintenanceSearchRequest(): MaintenanceListSearchRequest {
    const request = this.searchRequest ?? { officeIds: [] };
    return {
      ...request,
      officeIds: this.resolveMaintenanceSearchOfficeIds(request),
      isActive: this.showInactive ? false : true,
      propertyId: request.propertyId ?? this.property?.propertyId ?? null
    };
  }

  buildWorkOrderSearchKey(): string {
    const request = this.buildMaintenanceSearchRequest();
    return JSON.stringify({
      officeIds: [...(request.officeIds || [])].sort((a, b) => a - b),
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null,
      isActive: request.isActive ?? null
    });
  }
    
  loadWorkOrdersForCurrentSearchCriteria(force = false): void {
    if (!this.embeddedInMaintenance) {
      this.getWorkOrders(force);
      return;
    }

    queueMicrotask(() => {
      if (!this.canRunMaintenanceSearch(this.searchRequest)) {
        this.lastWorkOrderSearchKey = null;
        this.workOrderSearchInFlightKey = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrders');
        this.markViewForCheck();
        return;
      }
      this.getWorkOrders(force);
    });
  }

  resolvePropertyIdForWorkOrder(event: WorkOrderDisplayList): string | null {
    const fromRow = (event?.propertyId || '').toString().trim();
    if (fromRow) {
      return fromRow;
    }

    const workOrderId = (event?.workOrderId || '').toString().trim();
    if (workOrderId) {
      const fromLoadedWorkOrder = this.workOrders
        .find(wo => (wo.workOrderId || '').toString().trim() === workOrderId)
        ?.propertyId;
      const normalizedLoadedPropertyId = (fromLoadedWorkOrder || '').toString().trim();
      if (normalizedLoadedPropertyId) {
        return normalizedLoadedPropertyId;
      }
    }

    const fromSelectedProperty = (this.property?.propertyId || '').trim();
    if (fromSelectedProperty) {
      return fromSelectedProperty;
    }

    const fromSelectedPropertyId = (this.selectedPropertyId || '').trim();
    return fromSelectedPropertyId || null;
  }

  buildWorkOrderPreviewUrl(
    workOrderId: string,
    propertyId?: string | null,
    reservationId?: string | null,
    returnTo?: string | null
  ): string {
    const params = new URLSearchParams();
    params.set('workOrderId', workOrderId);
    const trimmedPropertyId = (propertyId || '').trim();
    if (trimmedPropertyId) {
      params.set('propertyId', trimmedPropertyId);
    }
    const trimmedReservationId = (reservationId || '').trim();
    if (trimmedReservationId) {
      params.set('reservationId', trimmedReservationId);
    }
    if (returnTo) {
      params.set('returnTo', returnTo);
    }
    return `${RouterUrl.WorkOrderCreate}?${params.toString()}`;
  }

  //#endregion

  //#region Form Response Methods
  onWorkOrderCheckboxChange(event: WorkOrderDisplayList): void {
    const changedCheckboxColumn = (event as unknown as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive' && changedCheckboxColumn !== 'enteredInQb') {
      return;
    }
    if (changedCheckboxColumn === 'enteredInQb' && !this.canViewEnteredInQb) {
      return;
    }

    const previousValue = (event as unknown as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as unknown as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    const workOrderId = String(event.workOrderId || '').trim();
    if (!workOrderId) {
      return;
    }

    this.applyWorkOrderCheckboxValue(workOrderId, changedCheckboxColumn, nextValue);

    const cachedWorkOrder = this.workOrders.find(wo => String(wo.workOrderId || '').trim() === workOrderId) ?? null;

    this.workOrderService.getWorkOrderById(workOrderId).pipe(take(1),
      map((sourceWorkOrder: WorkOrderResponse) => {
        const mergedWorkOrder = this.mappingService.mergeWorkOrderForQuickSave(sourceWorkOrder, cachedWorkOrder, event);
        return this.mappingService.mapWorkOrderUpdateRequest(mergedWorkOrder, changedCheckboxColumn, nextValue);
      }),
      switchMap(updateRequest => this.workOrderService.updateWorkOrder(updateRequest))
    ).subscribe({
      next: (updatedWorkOrder: WorkOrderResponse) => {
        this.workOrders = this.workOrders.map(workOrder =>
          workOrder.workOrderId === updatedWorkOrder.workOrderId ? updatedWorkOrder : workOrder
        );
        this.allWorkOrders = this.mappingService.mapWorkOrderDisplays(this.workOrders);
        this.applyFilters();
        this.toastr.success('Work order updated.', 'Success');
        this.markViewForCheck();
      },
      error: () => {
        this.applyWorkOrderCheckboxValue(workOrderId, changedCheckboxColumn, previousValue);
        this.toastr.error('Unable to update work order.', 'Error');
        this.markViewForCheck();
      }
    });
  }
  setRoleBasedColumns(): void {
    this.canViewEnteredInQb =
      this.authService.hasRole(UserGroups.Admin) ||
      this.authService.hasRole(UserGroups.AccountingAdmin) ||
      this.authService.hasRole(UserGroups.Accounting);

    if (!this.canViewEnteredInQb) {
      const columns = { ...this.workOrderDisplayedColumns };
      delete columns['enteredInQb'];
      this.workOrderDisplayedColumns = columns;
    }
  }

  applyWorkOrderCheckboxValue(workOrderId: string, changedCheckboxColumn: 'isActive' | 'enteredInQb', nextValue: boolean): void {
    this.allWorkOrders = this.allWorkOrders.map(workOrder =>
      workOrder.workOrderId === workOrderId
        ? { ...workOrder, [changedCheckboxColumn]: nextValue }
        : workOrder
    );
    this.workOrdersDisplay = this.workOrdersDisplay.map(workOrder =>
      workOrder.workOrderId === workOrderId
        ? { ...workOrder, [changedCheckboxColumn]: nextValue }
        : workOrder
    );
  }

  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() || '';
    if (!organizationId) {
      this.offices = [];
      return;
    }

    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.markViewForCheck();
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: offices => {
        this.accountingOffices = offices || [];
        this.markViewForCheck();
      },
      error: () => {
        this.accountingOffices = [];
        this.markViewForCheck();
      }
    });
  }

  loadVendors(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      error: () => this.markViewForCheck()
    });
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  } 

  ngOnDestroy(): void {
    this.workOrdersLoadId++;
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
