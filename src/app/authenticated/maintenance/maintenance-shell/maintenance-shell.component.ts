import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, skip, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { InspectionComponent } from '../inspection/inspection.component';
import { WorkOrderListComponent, WorkOrderSelection } from '../work-order-list/work-order-list.component';
import { ReceiptsListComponent } from '../receipts-list/receipts-list.component';
import { ReceiptSelection } from '../models/receipt.model';
import { ReceiptComponent } from '../receipt/receipt.component';
import { WorkOrderComponent } from '../work-order/work-order.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentGetRequest } from '../../documents/models/document.model';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { isInspectorOnlyUser } from '../../shared/access/role-access';
import { MaintenanceComponent } from '../maintenance/maintenance.component';
import { UnsavedChangesDialogService } from '../../shared/modals/unsaved-changes/unsaved-changes-dialog.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
  standalone: true,
  selector: 'app-maintenance-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TitleBarSelectComponent,
    InspectionComponent,
    WorkOrderListComponent,
    ReceiptsListComponent,
    ReceiptComponent,
    WorkOrderComponent,
    DocumentListComponent,
    MaintenanceComponent
  ],
  templateUrl: './maintenance-shell.component.html',
  styleUrl: './maintenance-shell.component.scss'
})
export class MaintenanceShellComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  readonly DocumentType = DocumentType;

  property: PropertyResponse | null = null;
  isServiceError = false;
  selectedTabIndex = 0;
  isHandlingTabGuard = false;

  userId = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  initialOfficeScopeApplied = false;

  titleBarReservationId: string | null = null;
  shellReservations: ReservationListResponse[] = [];

  inspectionHasUnsavedChanges = false;
  maintenanceHasUnsavedChanges = false;
  inspectionTitleBarReservationRequired = false;
  inspectionShowTitleBarReservationError = false;
  inspectionSaveRequestToken = 0;
  inspectionDiscardRequestToken = 0;
  maintenanceSaveRequestToken = 0;
  maintenanceDiscardRequestToken = 0;
  inspectionSaveResolver: ((success: boolean) => void) | null = null;
  maintenanceSaveResolver: ((success: boolean) => void) | null = null;

  showReceiptDetail = false;
  selectedReceiptId: string | null = null;
  refreshReceiptsTrigger = 0;
  receiptSaveValidationAttempted = false;
  receiptPropertySelectionRequired = true;

  showWorkOrderDetail = false;
  selectedWorkOrderId: string | null = null;
   workOrderDetailInstance = 0;
  showWorkOrdersTab = true;
  workOrderSaveValidationAttempted = false;
  workOrderPropertySelectionRequired = true;

  isInspectorView = false;
  selectedPropertyId: string | null = null;
  availableProperties: { propertyId: string; propertyCode: string }[] = [];
  allProperties: PropertyCodeResponse[] = [];
  inspectorPropertyIds = new Set<string>();
  skipNextPropertyCodeChange = false;
  skipNextOfficeChange = false;
  openWithAllSelections = false;
  clearPropertyOnOpen = false;
  propertyLoadVersion = 0;

  startDate: Date | null = null;
  endDate: Date | null = null;
  documentRequest: DocumentGetRequest = { officeIds: [] };
  receiptSearchRequest: MaintenanceListSearchRequest = { officeIds: [] };
  workOrderSearchRequest: MaintenanceListSearchRequest = { officeIds: [] };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private unsavedChangesDialogService: UnsavedChangesDialogService
  ) {
    this.setDefaultDateRange();
    this.syncMaintenanceSearchRequests();
  }

  //#region Maintenance-Shell
  ngOnInit(): void {
    this.openWithAllSelections = ((this.route.snapshot.queryParamMap.get('scope') || '').trim().toLowerCase() === 'all');
    this.clearPropertyOnOpen = ((this.route.snapshot.queryParamMap.get('clearProperty') || '').trim() === '1');
    this.userId = this.authService.getUser()?.userId?.trim() ?? '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.openWithAllSelections
      ? null
      : this.globalSelectionService.getSelectedOfficeIdValue();
    this.loadOffices();
    this.globalSelectionService
      .getSelectedOfficeId$()
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(officeId => {
        if (!this.openWithAllSelections) {
          this.applyOfficeFromGlobal(officeId);
        }
      });

    this.isInspectorView = isInspectorOnlyUser(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    this.showWorkOrdersTab = !this.isInspectorView;
    this.inspectorPropertyIds = new Set(
      (this.authService.getUser()?.properties || [])
        .map(propertyId => propertyId.trim().toLowerCase())
        .filter(propertyId => propertyId !== '')
    );

    this.route.queryParamMap.pipe(take(1)).subscribe(params => {
      const tabParam = Number(params.get('tab'));
      const normalizedTab = this.normalizeRequestedTab(tabParam);
      if (normalizedTab !== null) {
        this.selectedTabIndex = normalizedTab;
      }

      const receiptIdParam = (params.get('receiptId') || '').trim();
      if (receiptIdParam !== '') {
        this.selectedTabIndex = this.receiptsTabIndex;
        this.selectedReceiptId = receiptIdParam.toLowerCase() === 'new' ? null : receiptIdParam;
        this.showReceiptDetail = true;
      }

      const workOrderIdParam = (params.get('workOrderId') || '').trim();
      if (this.showWorkOrdersTab && workOrderIdParam !== '') {
        this.selectedTabIndex = this.workOrdersTabIndex;
        this.selectedWorkOrderId = workOrderIdParam;
        this.workOrderDetailInstance++;
        this.showWorkOrderDetail = true;
      }
    });

    this.route.paramMap.pipe(filter(params => params.has('id')), take(1)).subscribe(params => {
      if (this.openWithAllSelections || this.clearPropertyOnOpen) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.property = null;
        this.shellReservations = [];
        this.titleBarReservationId = null;
        this.selectedPropertyId = null;
        return;
      }
      const id = params.get('id')!;
      this.loadProperty(id);
    });
  }
  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string, onLoaded?: () => void, preferredReservationId?: string | null): void {
    const loadVersion = ++this.propertyLoadVersion;
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),
      switchMap(property =>
        this.reservationService.getReservationsByPropertyId(property.propertyId).pipe(take(1),
          map(reservations => ({ property, reservations: reservations || [] }))
        )
      ),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))
    ).subscribe({
      next: ({ property, reservations }) => {
        if (loadVersion !== this.propertyLoadVersion) {
          return;
        }
        this.property = property;
        this.shellReservations = reservations;
        this.syncTitleBarSelections();
        this.setTitleBarReservationForCurrentProperty(preferredReservationId ?? null);
        this.syncMaintenanceSearchRequests();
        onLoaded?.();
      },
      error: () => {
        if (loadVersion !== this.propertyLoadVersion) {
          return;
        }
        this.property = null;
        this.shellReservations = [];
        this.titleBarReservationId = null;
        this.isServiceError = true;
        onLoaded?.();
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.loadTitleBarProperties();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(
            o => o.organizationId === this.organizationId && o.isActive
          );

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.openWithAllSelections) {
              this.applyPageOfficeScope(null);
            } else if (this.offices.length === 1) {
              this.applyPageOfficeScope(this.offices[0].officeId);
            } else {
              this.applyOfficeFromGlobal(
                this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue()
              );
            }
          } else if (this.selectedOfficeId != null) {
            this.applyPageOfficeScope(this.selectedOfficeId);
          }
          this.syncMaintenanceSearchRequests();
          this.loadTitleBarProperties();
        });
      },
      error: () => {
        this.offices = [];
        this.loadTitleBarProperties();
      }
    });
  }

  loadTitleBarProperties(): void {
    this.propertyService.getPropertyCodes().pipe(take(1)).subscribe({
      next: properties => {
        const propertyRows = properties || [];
        this.allProperties = this.isInspectorView && this.inspectorPropertyIds.size > 0
          ? propertyRows.filter(property => this.inspectorPropertyIds.has(String(property.propertyId || '').trim().toLowerCase()))
          : propertyRows;
        this.syncTitleBarSelections();
        this.syncMaintenanceSearchRequests();
      },
      error: () => {
        this.allProperties = [];
        this.availableProperties = [];
      }
    });
  }
  //#endregion

  //#region Getter Methods
  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get showOfficeDropdown(): boolean {
    return this.offices.length > 0;
  }

  get reservationOptions(): SearchableSelectOption[] {
    const officeId = this.property?.officeId ?? null;
    const rows = (this.shellReservations || []).filter(r => officeId == null || r.officeId === officeId);
    return rows.map(r => ({
      value: r.reservationId,
      label: this.utilityService.getReservationDropdownLabel(r, null)
    }));
  }

  get selectedReservationId(): string | null {
    return this.titleBarReservationId;
  }

  get workOrdersTabIndex(): number {
    return 3;
  }

  get documentsTabIndex(): number {
    return this.showWorkOrdersTab ? 4 : 3;
  }

  get receiptsTabIndex(): number {
    return 2;
  }

  get showTitleBarReservationDropdown(): boolean {
    if (!this.property) {
      return false;
    }
    if (this.selectedTabIndex === 0) {
      return true;
    }
    if (this.showWorkOrdersTab && this.selectedTabIndex === this.workOrdersTabIndex && !this.showWorkOrderDetail) {
      return true;
    }
    return this.selectedTabIndex === this.documentsTabIndex;
  }

  get titleBarReservationNullLabel(): string {
    return 'All Reservations';
  }

  get titleBarReservationDisplayLabel(): string {
    const id = this.titleBarReservationId?.trim();
    if (!id) {
      return '';
    }
    const row = (this.shellReservations || []).find(r => String(r.reservationId ?? '').trim() === id);
    return row ? this.utilityService.getReservationDropdownLabel(row, null).trim() : '';
  }

  get isWorkOrderDetailActive(): boolean {
    return this.showWorkOrdersTab && this.selectedTabIndex === this.workOrdersTabIndex && this.showWorkOrderDetail;
  }

  get isReceiptDetailActive(): boolean {
    return this.selectedTabIndex === this.receiptsTabIndex && this.showReceiptDetail;
  }

  get isReceiptAddMode(): boolean {
    return this.isReceiptDetailActive && this.selectedReceiptId == null;
  }

  get isWorkOrderAddMode(): boolean {
    return this.isWorkOrderDetailActive && this.selectedWorkOrderId == null;
  }

  get shouldShowWorkOrderLocationRequiredState(): boolean {
    return this.isWorkOrderAddMode && this.workOrderSaveValidationAttempted;
  }

  get showOfficeRequiredErrorForWorkOrder(): boolean {
    return this.shouldShowWorkOrderLocationRequiredState && this.showOfficeDropdown && this.selectedOfficeId == null;
  }

  get showPropertyRequiredErrorForWorkOrder(): boolean {
    return this.shouldShowWorkOrderLocationRequiredState && this.workOrderPropertySelectionRequired && !this.selectedPropertyId;
  }

  get shouldShowReceiptLocationRequiredState(): boolean {
    return this.isReceiptAddMode && this.receiptSaveValidationAttempted;
  }

  get showOfficeRequiredErrorForReceipt(): boolean {
    return this.shouldShowReceiptLocationRequiredState && this.showOfficeDropdown && this.selectedOfficeId == null;
  }

  get showPropertyRequiredErrorForReceipt(): boolean {
    return this.shouldShowReceiptLocationRequiredState && this.receiptPropertySelectionRequired && !this.selectedPropertyId;
  }
  //#endregion

  //#region Top Bar Event Methods
  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.applyPageOfficeScope(officeId);
    this.applyPageOfficeChangeEffects();
  }

  async onPropertyCodeChange(): Promise<void> {
    this.workOrderSaveValidationAttempted = false;
    this.receiptSaveValidationAttempted = false;
    const keepWorkOrderAddDetailOpen = this.isWorkOrderAddMode;
    const keepReceiptAddDetailOpen = this.isReceiptAddMode;
    if (this.skipNextPropertyCodeChange) {
      this.skipNextPropertyCodeChange = false;
      return;
    }
    if (this.selectedPropertyId === this.property?.propertyId) {
      return;
    }

    const canLeave = await this.confirmChecklistNavigation();
    if (!canLeave) {
      this.selectedPropertyId = this.property?.propertyId ?? null;
      return;
    }

    if (keepWorkOrderAddDetailOpen) {
      this.showWorkOrderDetail = true;
      this.selectedWorkOrderId = null;
      this.isServiceError = false;
      if (!this.selectedPropertyId) {
        return;
      }
      this.loadProperty(this.selectedPropertyId);
      return;
    }
    if (keepReceiptAddDetailOpen) {
      this.showReceiptDetail = true;
      this.selectedReceiptId = null;
      this.isServiceError = false;
      if (!this.selectedPropertyId) {
        return;
      }
      this.loadProperty(this.selectedPropertyId);
      return;
    }

    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.titleBarReservationId = null;
    this.shellReservations = [];
    this.property = null;
    this.isServiceError = false;
    if (!this.selectedPropertyId) {
      this.syncMaintenanceSearchRequests();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.loadProperty(this.selectedPropertyId);
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId])}?tab=${this.selectedTabIndex}`);
    this.syncMaintenanceSearchRequests();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.titleBarReservationId = value == null || value === '' ? null : String(value);
  }

  onDateRangeChange(): void {
    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
    } else if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }

    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }

    this.syncMaintenanceSearchRequests();
  }

  onInspectionUnsavedChangesChange(hasChanges: boolean): void {
    this.inspectionHasUnsavedChanges = hasChanges;
  }

  onMaintenanceUnsavedChangesChange(hasChanges: boolean): void {
    this.maintenanceHasUnsavedChanges = hasChanges;
  }

  onInspectionTitleBarReservationUiChange(state: { required: boolean; showError: boolean }): void {
    this.inspectionTitleBarReservationRequired = state.required;
    this.inspectionShowTitleBarReservationError = state.showError;
  }

  onInspectionSaveRequestCompleted(event: { token: number; success: boolean }): void {
    if (event.token !== this.inspectionSaveRequestToken) {
      return;
    }
    this.inspectionSaveResolver?.(event.success);
    this.inspectionSaveResolver = null;
  }

  onMaintenanceSaveRequestCompleted(event: { token: number; success: boolean }): void {
    if (event.token !== this.maintenanceSaveRequestToken) {
      return;
    }
    this.maintenanceSaveResolver?.(event.success);
    this.maintenanceSaveResolver = null;
  }

  onReceiptPropertySelectionRequiredChange(required: boolean): void {
    this.receiptPropertySelectionRequired = required;
  }

  onWorkOrderPropertySelectionRequiredChange(required: boolean): void {
    this.workOrderPropertySelectionRequired = required;
  }

  //#endregion

  //#region Title Bar Sync
  syncTitleBarSelections(): void {
    if (!this.property && !this.selectedOfficeId) {
      this.updateAvailableProperties();
      this.syncMaintenanceSearchRequests();
      return;
    }
    if (this.property) {
      this.selectedOfficeId = this.property.officeId ?? this.selectedOfficeId;
      this.selectedPropertyId = this.property.propertyId ?? null;
    }
    this.updateAvailableProperties();
    this.syncMaintenanceSearchRequests();
  }

  updateAvailableProperties(): void {
    const scopedProperties = this.selectedOfficeId
      ? this.allProperties.filter(property => property.officeId === this.selectedOfficeId)
      : this.allProperties;

    this.availableProperties = scopedProperties
      .map(property => ({ propertyId: property.propertyId, propertyCode: property.propertyCode || '' }))
      .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));

    if (this.selectedPropertyId && !this.availableProperties.some(property => property.propertyId === this.selectedPropertyId)) {
      this.selectedPropertyId = null;
    }
  }

  normalizeOfficeId(value: number | null | undefined): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }
    return numericValue;
  }

  private applyOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 1) {
      this.applyPageOfficeScope(this.offices[0].officeId);
    } else if (this.offices.length > 1) {
      const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
      this.applyPageOfficeScope(resolved);
    } else {
      this.applyPageOfficeScope(officeId);
    }
    this.applyPageOfficeChangeEffects();
  }

  /** Title-bar office change on this page only (never updates global selection). */
  private applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = this.normalizeOfficeId(officeId);
  }

  private applyPageOfficeChangeEffects(): void {
    this.workOrderSaveValidationAttempted = false;
    this.receiptSaveValidationAttempted = false;
    if (this.skipNextOfficeChange) {
      this.skipNextOfficeChange = false;
      this.updateAvailableProperties();
      this.syncMaintenanceSearchRequests();
      return;
    }
    const keepWorkOrderAddDetailOpen = this.isWorkOrderAddMode;
    const keepReceiptAddDetailOpen = this.isReceiptAddMode;
    this.updateAvailableProperties();
    if (this.property && this.selectedOfficeId !== this.property.officeId) {
      this.selectedPropertyId = null;
      this.property = null;
      this.titleBarReservationId = null;
      this.shellReservations = [];
      if (!keepReceiptAddDetailOpen) {
        this.showReceiptDetail = false;
        this.selectedReceiptId = null;
      } else {
        this.showReceiptDetail = true;
        this.selectedReceiptId = null;
      }
      if (!keepWorkOrderAddDetailOpen) {
        this.showWorkOrderDetail = false;
        this.selectedWorkOrderId = null;
      } else {
        this.showWorkOrderDetail = true;
        this.selectedWorkOrderId = null;
      }
    }
    this.syncMaintenanceSearchRequests();
  }

  setTitleBarReservationForCurrentProperty(reservationId: string | null): void {
    const normalizedReservationId = (reservationId || '').trim();
    if (!normalizedReservationId) {
      this.titleBarReservationId = null;
      return;
    }
    this.titleBarReservationId = (this.shellReservations || []).some(
      reservation => String(reservation.reservationId ?? '').trim() === normalizedReservationId
    )
      ? normalizedReservationId
      : null;
  }
  //#endregion

  //#region Tab Methods
  async onTabIndexChange(nextTabIndex: number): Promise<void> {
    if (this.isHandlingTabGuard || nextTabIndex === this.selectedTabIndex) {
      return;
    }

    this.isHandlingTabGuard = true;
    const previousTabIndex = this.selectedTabIndex;
    this.selectedTabIndex = nextTabIndex;
    try {
      const canLeave = await this.confirmChecklistNavigation({
        previousIndex: previousTabIndex,
        nextIndex: nextTabIndex
      });
      if (!canLeave) {
        this.selectedTabIndex = previousTabIndex;
        return;
      }
      if (nextTabIndex === this.receiptsTabIndex || nextTabIndex === this.documentsTabIndex) {
        this.titleBarReservationId = null;
      }
      if (nextTabIndex === this.receiptsTabIndex || nextTabIndex === this.workOrdersTabIndex || nextTabIndex === this.documentsTabIndex) {
        this.syncMaintenanceSearchRequests();
      }
    } finally {
      this.isHandlingTabGuard = false;
    }
  }

  onInspectionTitleBarReservationSync(id: string | null): void {
    this.titleBarReservationId = id;
  }

  onInspectionSubmitted(): void {
    this.navigateToMaintenanceTabs(0);
  }

  onReceiptSelect(selection: ReceiptSelection): void {
    const receiptId = selection?.receiptId ?? null;
    const selectedOfficeId = this.normalizeOfficeId(selection?.officeId ?? null);
    const selectedPropertyId = (selection?.propertyId || '').trim() || null;
    this.receiptSaveValidationAttempted = false;
    if (selectedOfficeId !== this.selectedOfficeId) {
      this.skipNextOfficeChange = true;
      this.applyPageOfficeScope(selectedOfficeId);
      this.updateAvailableProperties();
    }

    const openReceiptDetail = () => {
      this.selectedTabIndex = this.receiptsTabIndex;
      this.showWorkOrderDetail = false;
      this.selectedWorkOrderId = null;
      this.showReceiptDetail = true;
      this.selectedReceiptId = receiptId;
    };

    if (selectedPropertyId && selectedPropertyId !== this.selectedPropertyId) {
      this.skipNextPropertyCodeChange = true;
      this.selectedPropertyId = selectedPropertyId;
      this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
      this.loadProperty(selectedPropertyId, () => openReceiptDetail(), null);
      return;
    }

    if (!selectedPropertyId && !this.selectedPropertyId) {
      this.property = null;
      this.shellReservations = [];
      this.titleBarReservationId = null;
    }

    this.selectedPropertyId = selectedPropertyId ?? this.selectedPropertyId;
    this.updateAvailableProperties();
    openReceiptDetail();
  }

  onReceiptBack(): void {
    this.receiptSaveValidationAttempted = false;
    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
    this.selectedPropertyId = null;
    this.property = null;
    this.titleBarReservationId = null;
    this.shellReservations = [];
    this.updateAvailableProperties();
    this.syncMaintenanceSearchRequests();
    this.refreshReceiptsTrigger++;
  }

  onReceiptSaved(): void {
    this.receiptSaveValidationAttempted = false;
    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
    this.selectedPropertyId = null;
    this.property = null;
    this.titleBarReservationId = null;
    this.shellReservations = [];
    this.updateAvailableProperties();
    this.syncMaintenanceSearchRequests();
    this.refreshReceiptsTrigger++;
  }

  onReceiptSaveValidationAttempted(): void {
    this.receiptSaveValidationAttempted = true;
  }

  onWorkOrderSelect(selection: WorkOrderSelection): void {
    const workOrderId = selection?.workOrderId ?? null;
    const targetPropertyId = (selection?.propertyId || '').trim() || null;
    const openWorkOrderDetail = () => {
      this.selectedTabIndex = this.workOrdersTabIndex;
      this.showReceiptDetail = false;
      this.selectedReceiptId = null;
      this.workOrderDetailInstance++;
      this.selectedWorkOrderId = workOrderId;
      this.showWorkOrderDetail = true;
    };

    if (targetPropertyId && targetPropertyId !== this.selectedPropertyId) {
      this.skipNextPropertyCodeChange = true;
      this.selectedPropertyId = targetPropertyId;
      openWorkOrderDetail();
      this.loadProperty(targetPropertyId, null, null);
      return;
    }
    openWorkOrderDetail();
  }

  onWorkOrderBack(): void {
    this.propertyLoadVersion++;
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.workOrderSaveValidationAttempted = false;
    this.titleBarReservationId = null;
    this.selectedPropertyId = null;
    this.property = null;
    this.shellReservations = [];
    this.updateAvailableProperties();
    this.isServiceError = false;
  }

  onWorkOrderSaved(): void {
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.workOrderSaveValidationAttempted = false;
    this.selectedPropertyId = null;
    this.property = null;
    this.titleBarReservationId = null;
    this.shellReservations = [];
    this.updateAvailableProperties();
    this.refreshReceiptsTrigger++;
  }

  onWorkOrderSaveValidationAttempted(): void {
    this.workOrderSaveValidationAttempted = true;
  }

  onTopBarBackClick(): void {
    if (this.isReceiptDetailActive) {
      this.onReceiptBack();
      return;
    }
    if (this.isWorkOrderDetailActive) {
      this.onWorkOrderBack();
      return;
    }
    void this.back();
  }

  navigateToMaintenanceTabs(tabIndex?: number): void {
    const propertyId = this.property?.propertyId;
    let url = propertyId
      ? RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId])
      : RouterUrl.MaintenanceList;
    if (tabIndex !== undefined && tabIndex >= 0) {
      url += (url.includes('?') ? '&' : '?') + `tab=${tabIndex}`;
    }
    this.router.navigateByUrl(url).then(() => window.location.reload());
  }

  normalizeRequestedTab(tabParam: number): number | null {
    if (Number.isNaN(tabParam) || tabParam < 0) {
      return null;
    }

    const maxTab = this.documentsTabIndex;
    if (tabParam > maxTab) {
      return maxTab;
    }

    return tabParam;
  }

  //#endregion

  //#region Navigation Methods
  async back(): Promise<void> {
    const canLeave = await this.confirmChecklistNavigation();
    if (!canLeave) {
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }

  async canDeactivate(): Promise<boolean> {
    return this.confirmChecklistNavigation();
  }

  /**
   * @param tabChange When set (mat-tab switch): prompt only when leaving Inspection (index 0) if that
   * checklist has unsaved changes, or when leaving Maintenance (index 1) if the maintenance form has
   * unsaved changes (maintenance-only edits do not require leaving Inspection). Other tabs stay mounted, so
   * inspection `dirty` must not block moves between read-only tabs. Omit for property change, Back,
   * and route deactivate — then both sections are checked.
   */
  async confirmChecklistNavigation(tabChange?: { previousIndex: number; nextIndex: number }): Promise<boolean> {
    const hasInspectionChanges = this.inspectionHasUnsavedChanges;
    const hasMaintenanceChanges = this.maintenanceHasUnsavedChanges;

    if (tabChange) {
      const { previousIndex, nextIndex } = tabChange;
      const leavingInspectionTab = previousIndex === 0 && nextIndex !== 0;
      const leavingMaintenanceTab = previousIndex === 1 && nextIndex !== 1;
      if (leavingInspectionTab && hasInspectionChanges) {
        return this.resolveUnsavedChangesForSection('inspection');
      }
      if (leavingMaintenanceTab && hasMaintenanceChanges) {
        return this.resolveUnsavedChangesForSection('maintenance');
      }
      return true;
    }

    if (!hasInspectionChanges && !hasMaintenanceChanges) {
      return true;
    }

    let targetSection: 'inspection' | 'maintenance';
    if (this.selectedTabIndex === 0 && hasInspectionChanges) {
      targetSection = 'inspection';
    } else if (this.selectedTabIndex === 1 && hasMaintenanceChanges) {
      targetSection = 'maintenance';
    } else {
      targetSection = hasInspectionChanges ? 'inspection' : 'maintenance';
    }
    return this.resolveUnsavedChangesForSection(targetSection);
  }

  async resolveUnsavedChangesForSection(targetSection: 'inspection' | 'maintenance'): Promise<boolean> {
    const action = await this.unsavedChangesDialogService.confirmLeaveOrSave();
    if (action === 'save') {
      if (targetSection === 'inspection') {
        return new Promise<boolean>(resolve => {
          this.inspectionSaveResolver = resolve;
          this.inspectionSaveRequestToken++;
        });
      }
      return new Promise<boolean>(resolve => {
        this.maintenanceSaveResolver = resolve;
        this.maintenanceSaveRequestToken++;
      });
    }

    if (targetSection === 'inspection') {
      this.inspectionDiscardRequestToken++;
    } else {
      this.maintenanceDiscardRequestToken++;
    }
    return true;
  }
  //#endregion

  //#region Search scope
  setDefaultDateRange(): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);

    // End of current month.
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(0, 0, 0, 0);

    this.endDate = end;
    this.startDate = start;
  }

  syncMaintenanceSearchRequests(): void {
    const officeIds = this.resolveOfficeIdsForRequest();
    const propertyId = this.selectedPropertyId;
    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);

    this.documentRequest = {
      officeIds,
      propertyId,
      startDate,
      endDate
    };

    this.receiptSearchRequest = {
      officeIds,
      propertyId,
      startDate,
      endDate
    };

    this.workOrderSearchRequest = {
      officeIds,
      propertyId,
      startDate,
      endDate
    };
  }

  /** When title bar is All Offices (null), send every loaded office id — same as documents-shell. */
  private resolveOfficeIdsForRequest(): number[] {
    if (this.selectedOfficeId != null) {
      return [this.selectedOfficeId];
    }

    return this.offices.map(office => office.officeId).filter(id => id > 0);
  }
  //#endregion

  //#region Lifecycle
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
