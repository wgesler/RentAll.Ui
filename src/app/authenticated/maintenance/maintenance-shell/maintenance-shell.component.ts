import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, filter, map, skip, switchMap, take, takeUntil } from 'rxjs';
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
import { ReceiptSelection, isReceiptCompanyPropertyId, resolveFirstRealReceiptPropertyId } from '../models/receipt.model';
import { ReceiptComponent } from '../receipt/receipt.component';
import { WorkOrderComponent } from '../work-order/work-order.component';
import { WorkOrderCreateComponent } from '../work-order-create/work-order-create.component';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { WorkOrderPreviewSelection, WorkOrderResponse } from '../models/work-order.model';
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
    WorkOrderCreateComponent,
    MaintenanceComponent
  ],
  templateUrl: './maintenance-shell.component.html',
  styleUrl: './maintenance-shell.component.scss'
})
export class MaintenanceShellComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private unsavedChangesDialogService = inject(UnsavedChangesDialogService);
  private cdr = inject(ChangeDetectorRef);

  property: PropertyResponse | null = null;
  routePropertyId: string | null = null;
  isPropertyLoading = false;
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
  receiptDetailInstance = 0;
  selectedReceiptId: string | null = null;
  refreshReceiptsTrigger = 0;
  refreshWorkOrdersTrigger = 0;
  receiptSaveValidationAttempted = false;
  receiptPropertySelectionRequired = true;

  showWorkOrderDetail = false;
  selectedWorkOrderId: string | null = null;
  selectedWorkOrder: WorkOrderResponse | null = null;
  workOrderInitialReceiptId: string | null = null;
  workOrderInitialReceiptSplitKey: string | null = null;
  workOrderReturnToReceiptList = false;
  workOrderReturnToReceiptDetail = false;
  workOrderReturnReceiptId: string | null = null;
  workOrderDetailInstance = 0;
  showWorkOrderCreate = false;
  workOrderCreateContext: WorkOrderPreviewSelection | null = null;
  workOrderCreateInstance = 0;
  workOrderCreateReturnToDetail = false;
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
  dateRangePinned = false;
  receiptSearchRequest: MaintenanceListSearchRequest = { officeIds: [] };
  workOrderSearchRequest: MaintenanceListSearchRequest = { officeIds: [] };

  private readonly clearPinsEventName = 'rentall-clear-pins';
  private readonly pinnedDateRangeStorageKeyPrefix = 'rentall-maintenance-shell-pinned-dates';

  destroy$ = new Subject<void>();

  constructor() {
    this.applyPinnedDateRangeFromStorage();
    this.syncMaintenanceSearchRequests();
  }

  //#region Maintenance-Shell
  ngOnInit(): void {
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.openWithAllSelections = ((this.route.snapshot.queryParamMap.get('scope') || '').trim().toLowerCase() === 'all');
    this.clearPropertyOnOpen = ((this.route.snapshot.queryParamMap.get('clearProperty') || '').trim() === '1');
    this.userId = this.authService.getUser()?.userId?.trim() ?? '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.openWithAllSelections
      ? null
      : this.globalSelectionService.resolvePageOfficeId({
        topBarPinned: false,
        pageOfficeId: this.selectedOfficeId,
        offices: this.offices
      });
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

    this.applyInitialQueryParams(this.route.snapshot.queryParamMap);

    this.route.paramMap.pipe(filter(params => params.has('id')), takeUntil(this.destroy$)).subscribe(params => {
      if (this.isReceiptsOrWorkOrdersListTab()) {
        return;
      }
      const id = params.get('id')!;
      if (id === 'all') {
        if (this.openWithAllSelections || this.clearPropertyOnOpen) {
          this.property = null;
          this.shellReservations = [];
          this.titleBarReservationId = null;
          this.selectedPropertyId = null;
          this.routePropertyId = null;
          this.isPropertyLoading = false;
        }
        return;
      }

      if (this.clearPropertyOnOpen) {
        this.property = null;
        this.shellReservations = [];
        this.titleBarReservationId = null;
        this.selectedPropertyId = null;
        return;
      }

      if (this.property?.propertyId === id) {
        this.routePropertyId = id;
        return;
      }

      this.openWithAllSelections = false;
      this.routePropertyId = id;
      this.isPropertyLoading = true;
      this.loadProperty(id);
    });
  }
  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string, onLoaded?: () => void, preferredReservationId?: string | null): void {
    const normalizedPropertyId = (propertyId || '').trim();
    if (!normalizedPropertyId) {
      return;
    }

    const loadVersion = ++this.propertyLoadVersion;
    this.routePropertyId = normalizedPropertyId;
    this.isPropertyLoading = true;
    this.propertyService.getPropertyByGuid(normalizedPropertyId).pipe(take(1),
      switchMap(property =>
        this.reservationService.getReservationsByPropertyId(property.propertyId).pipe(take(1),
          map(reservations => ({ property, reservations: reservations || [] }))
        )
      )
    ).subscribe({
      next: ({ property, reservations }) => {
        if (loadVersion !== this.propertyLoadVersion) {
          return;
        }
        this.skipNextOfficeChange = true;
        this.property = property;
        this.selectedOfficeId = property.officeId ?? this.selectedOfficeId;
        this.selectedPropertyId = property.propertyId ?? null;
        this.shellReservations = reservations;
        this.setTitleBarReservationForCurrentProperty(preferredReservationId ?? null);
        this.syncTitleBarSelections();
        this.syncMaintenanceSearchRequests();
        this.isPropertyLoading = false;
        this.cdr.markForCheck();
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
        this.isPropertyLoading = false;
        this.cdr.markForCheck();
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
            if (this.property?.propertyId) {
              this.skipNextOfficeChange = true;
              this.applyPageOfficeScope(this.property.officeId ?? null);
            } else if (this.openWithAllSelections) {
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
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
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
    return this.showWorkOrdersTab && this.selectedTabIndex === this.workOrdersTabIndex && !this.showWorkOrderDetail;
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

  get isWorkOrderCreateActive(): boolean {
    return this.showWorkOrdersTab
      && this.selectedTabIndex === this.workOrdersTabIndex
      && this.showWorkOrderCreate
      && !!this.workOrderCreateContext;
  }

  get workOrderCreateOfficeTitleBarOptions(): { value: number; label: string }[] {
    const officeId = this.workOrderCreateContext?.officeId;
    if (officeId == null) {
      return [];
    }

    const office = this.offices.find(item => item.officeId === officeId);
    return [{ value: officeId, label: office?.name || office?.officeCode || '' }];
  }

  get workOrderCreatePropertyTitleBarOptions(): SearchableSelectOption[] {
    const propertyId = (this.workOrderCreateContext?.propertyId || '').trim();
    if (!propertyId) {
      return [];
    }

    return [{
      value: propertyId,
      label: (this.workOrderCreateContext?.propertyCode || this.property?.propertyCode || '').trim()
    }];
  }

  get workOrderCreateReservationTitleBarOptions(): SearchableSelectOption[] {
    const reservationId = (this.workOrderCreateContext?.reservationId || '').trim();
    if (!reservationId) {
      return [];
    }

    const reservation = (this.shellReservations || []).find(item => String(item.reservationId ?? '').trim() === reservationId);
    const label = reservation
      ? this.utilityService.getReservationDropdownLabel(reservation, null).trim()
      : reservationId;
    return [{ value: reservationId, label }];
  }

  get isReceiptDetailActive(): boolean {
    return this.selectedTabIndex === this.receiptsTabIndex && this.showReceiptDetail;
  }

  get showTopBarBackButton(): boolean {
    return this.isReceiptDetailActive || this.isWorkOrderDetailActive || this.isWorkOrderCreateActive;
  }

  get isReceiptAddMode(): boolean {
    return this.isReceiptDetailActive && this.selectedReceiptId === 'new';
  }

  get isWorkOrderAddMode(): boolean {
    return this.isWorkOrderDetailActive && this.selectedWorkOrderId === 'new';
  }

  get shouldShowWorkOrderLocationRequiredState(): boolean {
    return this.isWorkOrderDetailActive && this.workOrderSaveValidationAttempted;
  }

  get showOfficeRequiredErrorForWorkOrder(): boolean {
    return this.shouldShowWorkOrderLocationRequiredState && this.showOfficeDropdown && this.selectedOfficeId == null;
  }

  get showPropertyRequiredErrorForWorkOrder(): boolean {
    return this.shouldShowWorkOrderLocationRequiredState && this.workOrderPropertySelectionRequired && !this.selectedPropertyId;
  }

  get shouldShowReceiptLocationRequiredState(): boolean {
    return this.isReceiptDetailActive && this.isReceiptAddMode && this.receiptSaveValidationAttempted;
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
      this.syncMaintenanceSearchRequests();
      this.refreshVisibleMaintenanceLists();
      return;
    }
    if (this.selectedPropertyId === this.property?.propertyId) {
      this.syncMaintenanceSearchRequests();
      this.refreshVisibleMaintenanceLists();
      return;
    }

    const canLeave = await this.confirmChecklistNavigation();
    if (!canLeave) {
      this.selectedPropertyId = this.property?.propertyId ?? null;
      return;
    }

    if (keepWorkOrderAddDetailOpen) {
      this.showWorkOrderDetail = true;
      this.selectedWorkOrderId = 'new';
      this.workOrderDetailInstance++;
      this.isServiceError = false;
      if (!this.selectedPropertyId) {
        this.property = null;
        this.syncMaintenanceSearchRequests();
        this.refreshReceiptsTrigger++;
        this.refreshWorkOrdersTrigger++;
        return;
      }
      this.loadProperty(this.selectedPropertyId);
      this.syncMaintenanceSearchRequests();
      this.refreshReceiptsTrigger++;
      this.refreshWorkOrdersTrigger++;
      return;
    }
    if (keepReceiptAddDetailOpen) {
      this.showReceiptDetail = true;
      this.selectedReceiptId = 'new';
      this.isServiceError = false;
      if (!this.selectedPropertyId) {
        this.property = null;
        this.syncMaintenanceSearchRequests();
        this.refreshReceiptsTrigger++;
        this.refreshWorkOrdersTrigger++;
        return;
      }
      this.loadProperty(this.selectedPropertyId);
      this.syncMaintenanceSearchRequests();
      this.refreshReceiptsTrigger++;
      this.refreshWorkOrdersTrigger++;
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
      this.property = null;
      this.syncMaintenanceSearchRequests();
      this.refreshReceiptsTrigger++;
      this.refreshWorkOrdersTrigger++;
      return;
    }

    this.openWithAllSelections = false;
    this.routePropertyId = this.selectedPropertyId;
    this.loadProperty(this.selectedPropertyId);
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId])}?tab=${this.selectedTabIndex}`);
    this.syncMaintenanceSearchRequests();
    this.refreshReceiptsTrigger++;
    this.refreshWorkOrdersTrigger++;
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

    this.persistPinnedDateRangeIfActive();
    this.syncMaintenanceSearchRequests();
  }

  toggleDateRangePin(): void {
    this.dateRangePinned = !this.dateRangePinned;
    if (this.dateRangePinned) {
      this.onDateRangeChange();
      return;
    }
    this.clearPinnedDateRangeStorage();
    this.setDefaultDateRange();
    this.syncMaintenanceSearchRequests();
    this.refreshVisibleMaintenanceLists();
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
      const keepRouteProperty = this.property?.propertyId === this.selectedPropertyId
        || this.routePropertyId === this.selectedPropertyId
        || (this.isPropertyLoading && this.routePropertyId === this.selectedPropertyId);
      if (!keepRouteProperty && this.availableProperties.length > 0) {
        this.selectedPropertyId = null;
      }
    }

    this.autoSelectPropertyForInspectionTab();
  }

  autoSelectPropertyForInspectionTab(): void {
    if (this.selectedTabIndex !== 0) {
      return;
    }
    if (this.selectedPropertyId || this.property?.propertyId) {
      return;
    }
    if (this.isPropertyLoading || this.availableProperties.length === 0) {
      return;
    }

    const firstPropertyId = (this.availableProperties[0]?.propertyId || '').trim();
    if (!firstPropertyId) {
      return;
    }

    this.skipNextPropertyCodeChange = true;
    this.selectedPropertyId = firstPropertyId;
    this.routePropertyId = firstPropertyId;
    this.loadProperty(firstPropertyId);
  }

  clearPropertyForListTab(): void {
    this.propertyLoadVersion++;
    this.skipNextPropertyCodeChange = true;
    this.selectedPropertyId = null;
    this.property = null;
    this.routePropertyId = null;
    this.shellReservations = [];
    this.titleBarReservationId = null;
    this.isPropertyLoading = false;
    this.syncMaintenanceSearchRequests();
    this.refreshVisibleMaintenanceLists();
  }

  isReceiptsOrWorkOrdersListTab(): boolean {
    if (this.selectedTabIndex === this.receiptsTabIndex && !this.showReceiptDetail) {
      return true;
    }
    return this.showWorkOrdersTab
      && this.selectedTabIndex === this.workOrdersTabIndex
      && !this.showWorkOrderDetail
      && !this.showWorkOrderCreate;
  }

  normalizeOfficeId(value: number | null | undefined): number | null {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }
    return numericValue;
  }

applyOfficeFromGlobal(officeId: number | null): void {
    this.applyPageOfficeScope(this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: false,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    }));
    this.applyPageOfficeChangeEffects();
  }

  /** Title-bar office change on this page only (never updates global selection). */
applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = this.normalizeOfficeId(officeId);
  }

applyPageOfficeChangeEffects(): void {
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
      const keepLoadedProperty = this.selectedPropertyId === this.property.propertyId
        || this.routePropertyId === this.property.propertyId;
      if (keepLoadedProperty) {
        this.skipNextOfficeChange = true;
        this.applyPageOfficeScope(this.property.officeId ?? null);
        this.syncMaintenanceSearchRequests();
        return;
      }
      this.selectedPropertyId = null;
      this.property = null;
      this.titleBarReservationId = null;
      this.shellReservations = [];
      if (!keepReceiptAddDetailOpen) {
        this.showReceiptDetail = false;
        this.selectedReceiptId = null;
      } else {
        this.showReceiptDetail = true;
        this.selectedReceiptId = 'new';
        this.receiptDetailInstance++;
      }
      if (!keepWorkOrderAddDetailOpen) {
        this.showWorkOrderDetail = false;
        this.selectedWorkOrderId = null;
      } else {
        this.showWorkOrderDetail = true;
        this.selectedWorkOrderId = 'new';
        this.workOrderDetailInstance++;
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
  applyInitialQueryParams(params: { get(name: string): string | null }): void {
    const tabParam = Number(params.get('tab'));
    const normalizedTab = this.normalizeRequestedTab(tabParam);
    if (normalizedTab !== null) {
      this.selectedTabIndex = normalizedTab;
    }

    const receiptIdParam = (params.get('receiptId') || '').trim();
    const workOrderIdParam = (params.get('workOrderId') || '').trim();
    if (receiptIdParam !== '' && !workOrderIdParam) {
      this.selectedTabIndex = this.receiptsTabIndex;
      this.selectedReceiptId = receiptIdParam === 'new' ? 'new' : receiptIdParam;
      this.showReceiptDetail = true;
    }

    if (this.showWorkOrdersTab && workOrderIdParam !== '') {
      this.selectedTabIndex = this.workOrdersTabIndex;
      this.selectedWorkOrderId = workOrderIdParam === 'new' ? 'new' : workOrderIdParam;
      const receiptSplitKeyParam = (params.get('receiptSplitKey') || '').trim();
      this.workOrderInitialReceiptId = receiptIdParam || null;
      this.workOrderInitialReceiptSplitKey = receiptSplitKeyParam || null;
      this.workOrderDetailInstance++;
      this.showWorkOrderDetail = true;
    }

    if (this.isReceiptsOrWorkOrdersListTab()) {
      this.clearPropertyForListTab();
      this.skipNextOfficeChange = true;
      this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
    }
  }

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

      if (nextTabIndex === this.receiptsTabIndex || nextTabIndex === this.workOrdersTabIndex) {
        this.clearPropertyForListTab();
        this.skipNextOfficeChange = true;
        this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
      } else if (nextTabIndex === 0) {
        this.autoSelectPropertyForInspectionTab();
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
    const selectedPropertyId = resolveFirstRealReceiptPropertyId(selection?.propertyId ? [selection.propertyId] : selection?.receipt?.propertyIds);
    this.receiptSaveValidationAttempted = false;
    if (selectedOfficeId !== this.selectedOfficeId) {
      this.skipNextOfficeChange = true;
      this.applyPageOfficeScope(selectedOfficeId);
      this.updateAvailableProperties();
    }

    const reopeningReceiptAdd = receiptId === 'new'
      && this.showReceiptDetail
      && this.selectedReceiptId === 'new';
    this.selectedReceiptId = receiptId;
    if (reopeningReceiptAdd) {
      this.receiptDetailInstance++;
    }

    const openReceiptDetail = () => {
      this.selectedTabIndex = this.receiptsTabIndex;
      this.showWorkOrderDetail = false;
      this.selectedWorkOrderId = null;
      this.workOrderReturnToReceiptList = false;
      this.workOrderReturnToReceiptDetail = false;
      this.workOrderReturnReceiptId = null;
      this.showReceiptDetail = true;
    };

    if (selectedPropertyId && selectedPropertyId !== this.selectedPropertyId) {
      this.skipNextPropertyCodeChange = true;
      this.openWithAllSelections = false;
      this.routePropertyId = selectedPropertyId;
      this.selectedPropertyId = selectedPropertyId;
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
    this.selectedTabIndex = this.receiptsTabIndex;
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.workOrderReturnToReceiptList = false;
    this.workOrderReturnToReceiptDetail = false;
    this.workOrderReturnReceiptId = null;
    this.clearPropertyForListTab();
  }

  onReceiptSaved(): void {
    this.receiptSaveValidationAttempted = false;
    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
    this.clearPropertyForListTab();
  }

  onReceiptSavedAndNew(): void {
    this.receiptSaveValidationAttempted = false;
    this.selectedReceiptId = 'new';
    this.receiptDetailInstance++;
    this.refreshReceiptsTrigger++;
  }

  onReceiptSaveValidationAttempted(): void {
    this.receiptSaveValidationAttempted = true;
  }

  onWorkOrderSelect(selection: WorkOrderSelection): void {
    const workOrderId = selection?.workOrderId ?? null;
    const targetPropertyId = resolveFirstRealReceiptPropertyId(selection?.propertyId ? [selection.propertyId] : null);
    const selectedOfficeId = this.normalizeOfficeId(selection?.officeId ?? null);
    this.workOrderSaveValidationAttempted = false;

    if (selectedOfficeId !== this.selectedOfficeId) {
      this.skipNextOfficeChange = true;
      this.applyPageOfficeScope(selectedOfficeId);
      this.updateAvailableProperties();
    }

    this.selectedWorkOrder = selection?.workOrder ?? null;
    this.workOrderInitialReceiptId = workOrderId === 'new' ? (selection?.prefilledReceiptId ?? null) : null;
    this.workOrderInitialReceiptSplitKey = workOrderId === 'new' ? (selection?.prefilledReceiptSplitKey ?? null) : null;
    this.workOrderReturnToReceiptList = !!selection?.returnToReceiptList;
    this.workOrderReturnToReceiptDetail = !!selection?.returnToReceiptDetail;
    this.workOrderReturnReceiptId = selection?.returnToReceiptDetail
      ? (String(selection.returnReceiptId ?? selection.prefilledReceiptId ?? this.selectedReceiptId ?? '').trim() || null)
      : null;
    const reopeningWorkOrderAdd = workOrderId === 'new'
      && this.showWorkOrderDetail
      && this.selectedWorkOrderId === 'new';
    this.selectedWorkOrderId = workOrderId;
    if (reopeningWorkOrderAdd) {
      this.workOrderDetailInstance++;
    }

    const openWorkOrderDetail = () => {
      this.selectedTabIndex = this.workOrdersTabIndex;
      this.showReceiptDetail = false;
      this.selectedReceiptId = null;
      this.showWorkOrderDetail = true;
    };

    if (targetPropertyId && targetPropertyId !== this.selectedPropertyId) {
      this.skipNextPropertyCodeChange = true;
      this.openWithAllSelections = false;
      this.routePropertyId = targetPropertyId;
      this.selectedPropertyId = targetPropertyId;
      openWorkOrderDetail();
      this.loadProperty(targetPropertyId, null, null);
      return;
    }

    if (!targetPropertyId && !this.selectedPropertyId) {
      this.property = null;
      this.shellReservations = [];
      this.titleBarReservationId = null;
    }

    this.selectedPropertyId = targetPropertyId ?? this.selectedPropertyId;
    this.updateAvailableProperties();
    openWorkOrderDetail();
  }

  onWorkOrderShellLocationSync(event: { officeId: number | null; propertyId: string | null }): void {
    const selectedOfficeId = this.normalizeOfficeId(event?.officeId ?? null);
    if (selectedOfficeId && selectedOfficeId !== this.selectedOfficeId) {
      this.skipNextOfficeChange = true;
      this.applyPageOfficeScope(selectedOfficeId);
      this.updateAvailableProperties();
    }

    const targetPropertyId = (event?.propertyId || '').trim() || null;
    if (!targetPropertyId || targetPropertyId === this.selectedPropertyId) {
      return;
    }

    this.skipNextPropertyCodeChange = true;
    this.openWithAllSelections = false;
    this.routePropertyId = targetPropertyId;
    this.selectedPropertyId = targetPropertyId;
    this.loadProperty(targetPropertyId, null, null);
  }

  onWorkOrderBack(): void {
    const returnToReceiptList = this.workOrderReturnToReceiptList;
    const returnToReceiptDetail = this.workOrderReturnToReceiptDetail;
    const returnReceiptId = this.workOrderReturnReceiptId;
    this.propertyLoadVersion++;
    this.workOrderSaveValidationAttempted = false;
    this.titleBarReservationId = null;
    this.selectedWorkOrderId = null;
    this.selectedWorkOrder = null;
    this.workOrderInitialReceiptId = null;
    this.workOrderInitialReceiptSplitKey = null;
    this.workOrderReturnToReceiptList = false;
    this.workOrderReturnToReceiptDetail = false;
    this.workOrderReturnReceiptId = null;
    this.isServiceError = false;
    this.showWorkOrderDetail = false;

    if (returnToReceiptDetail && returnReceiptId) {
      this.selectedTabIndex = this.receiptsTabIndex;
      this.selectedReceiptId = returnReceiptId;
      this.showReceiptDetail = true;
      this.receiptDetailInstance++;
      return;
    }

    if (returnToReceiptList) {
      this.selectedTabIndex = this.receiptsTabIndex;
      this.showReceiptDetail = false;
      this.selectedReceiptId = null;
      this.clearPropertyForListTab();
      this.refreshReceiptsTrigger++;
      return;
    }

    this.selectedPropertyId = null;
    this.property = null;
    this.shellReservations = [];
    this.updateAvailableProperties();
    this.syncMaintenanceSearchRequests();
    this.refreshWorkOrdersTrigger++;
  }

  onWorkOrderPreviewOpen(selection: WorkOrderPreviewSelection): void {
    const workOrderId = (selection?.workOrderId || '').trim();
    if (!workOrderId) {
      return;
    }

    this.workOrderCreateReturnToDetail = !!selection.returnToDetail;
    this.workOrderCreateContext = {
      workOrderId,
      propertyId: selection.propertyId ?? null,
      reservationId: selection.reservationId ?? null,
      officeId: selection.officeId ?? this.selectedOfficeId ?? this.property?.officeId ?? null,
      propertyCode: (selection.propertyCode || this.property?.propertyCode || '').trim()
    };
    this.showWorkOrderCreate = true;
    this.workOrderCreateInstance++;
    this.showWorkOrderDetail = false;
    this.selectedTabIndex = this.workOrdersTabIndex;

    const propertyId = (this.workOrderCreateContext.propertyId || '').trim();
    if (propertyId && propertyId !== this.property?.propertyId) {
      this.selectedPropertyId = propertyId;
      this.loadProperty(propertyId, null, this.workOrderCreateContext.reservationId);
    } else if (this.workOrderCreateContext.reservationId) {
      this.titleBarReservationId = this.workOrderCreateContext.reservationId;
    }
  }

  onWorkOrderCreateBack(): void {
    const returnToDetail = this.workOrderCreateReturnToDetail;
    const workOrderId = this.workOrderCreateContext?.workOrderId ?? null;
    const propertyId = this.workOrderCreateContext?.propertyId ?? null;
    const reservationId = this.workOrderCreateContext?.reservationId ?? null;

    this.showWorkOrderCreate = false;
    this.workOrderCreateContext = null;
    this.workOrderCreateReturnToDetail = false;

    if (returnToDetail && workOrderId) {
      this.showWorkOrderDetail = true;
      this.selectedWorkOrderId = workOrderId;
      this.workOrderDetailInstance++;
      if (propertyId) {
        this.selectedPropertyId = propertyId;
        if (propertyId !== this.property?.propertyId) {
          this.loadProperty(propertyId, null, reservationId);
        } else if (reservationId) {
          this.titleBarReservationId = reservationId;
        }
      }
    }
  }

  onWorkOrderSaved(): void {
    this.selectedWorkOrderId = null;
    this.workOrderSaveValidationAttempted = false;
    this.selectedPropertyId = null;
    this.property = null;
    this.titleBarReservationId = null;
    this.shellReservations = [];
    this.updateAvailableProperties();
    this.syncMaintenanceSearchRequests();
    this.refreshReceiptsTrigger++;
    this.refreshWorkOrdersTrigger++;
    this.showWorkOrderDetail = false;
  }

  onWorkOrderSavedAndNew(): void {
    this.workOrderSaveValidationAttempted = false;
    this.selectedWorkOrderId = 'new';
    this.selectedWorkOrder = null;
    this.workOrderInitialReceiptId = null;
    this.workOrderInitialReceiptSplitKey = null;
    this.workOrderDetailInstance++;
    this.refreshReceiptsTrigger++;
    this.refreshWorkOrdersTrigger++;
  }

  onWorkOrderSaveValidationAttempted(): void {
    this.workOrderSaveValidationAttempted = true;
  }

  onTopBarBackClick(): void {
    if (this.isWorkOrderCreateActive) {
      this.onWorkOrderCreateBack();
      return;
    }
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

    const maxTab = this.showWorkOrdersTab ? this.workOrdersTabIndex : this.receiptsTabIndex;
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
   * unsaved changes. Inactive tabs are unmounted via shell tab guards.
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

  refreshVisibleMaintenanceLists(): void {
    if (this.showReceiptDetail || this.showWorkOrderDetail) {
      return;
    }
    if (this.selectedTabIndex === this.receiptsTabIndex) {
      this.refreshReceiptsTrigger++;
    }
    if (this.showWorkOrdersTab && this.selectedTabIndex === this.workOrdersTabIndex) {
      this.refreshWorkOrdersTrigger++;
    }
  }

  syncMaintenanceSearchRequests(): void {
    const officeIds = this.resolveOfficeIdsForRequest();
    const propertyId = this.selectedPropertyId;
    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);

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
resolveOfficeIdsForRequest(): number[] {
    if (this.selectedOfficeId != null) {
      return [this.selectedOfficeId];
    }

    return this.offices.map(office => office.officeId).filter(id => id > 0);
  }

  //#region Pinned Date Range
  applyPinnedDateRangeFromStorage(): void {
    const stored = this.readPinnedDateRangeFromStorage();
    if (stored?.enabled && stored.startDate && stored.endDate) {
      const start = this.utilityService.parseCalendarDateInput(stored.startDate);
      const end = this.utilityService.parseCalendarDateInput(stored.endDate);
      if (start && end) {
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        this.dateRangePinned = true;
        this.startDate = start;
        this.endDate = end;
        return;
      }
      this.clearPinnedDateRangeStorage();
    }

    this.dateRangePinned = false;
    this.setDefaultDateRange();
  }

  persistPinnedDateRangeIfActive(): void {
    if (!this.dateRangePinned) {
      return;
    }

    this.persistPinnedDateRange();
  }

  persistPinnedDateRange(): void {
    if (!this.dateRangePinned || !this.startDate || !this.endDate) {
      return;
    }

    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    if (!startDate || !endDate) {
      return;
    }

    localStorage.setItem(this.getPinnedDateRangeStorageKey(), JSON.stringify({
      enabled: true,
      startDate,
      endDate
    }));
  }

  readPinnedDateRangeFromStorage(): { enabled: boolean; startDate: string; endDate: string } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(this.getPinnedDateRangeStorageKey());
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean; startDate?: string; endDate?: string };
      if (parsed?.enabled !== true || !parsed.startDate || !parsed.endDate) {
        return null;
      }
      return {
        enabled: true,
        startDate: String(parsed.startDate),
        endDate: String(parsed.endDate)
      };
    } catch {
      return null;
    }
  }

  clearPinnedDateRangeStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getPinnedDateRangeStorageKey());
  }

  getPinnedDateRangeStorageKey(): string {
    const userKey = this.authService.getUser()?.userId?.trim() || 'anonymous';
    return `${this.pinnedDateRangeStorageKeyPrefix}-${userKey}`;
  }

  onClearPins = (): void => {
    if (!this.dateRangePinned) {
      return;
    }
    this.dateRangePinned = false;
    this.clearPinnedDateRangeStorage();
    this.setDefaultDateRange();
    this.syncMaintenanceSearchRequests();
    this.refreshVisibleMaintenanceLists();
  };
  //#endregion
  //#endregion

  //#region Lifecycle
  ngOnDestroy(): void {
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
