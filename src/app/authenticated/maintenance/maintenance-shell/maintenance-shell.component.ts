import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, filter, finalize, map, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { InspectionComponent } from '../inspection/inspection.component';
import { WorkOrderListComponent, WorkOrderSelection } from '../work-order-list/work-order-list.component';
import { ReceiptsListComponent } from '../receipts-list/receipts-list.component';
import { ReceiptComponent } from '../receipt/receipt.component';
import { WorkOrderComponent } from '../work-order/work-order.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { EmailListComponent } from '../../email/email-list/email-list.component';
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
    EmailListComponent,
    MaintenanceComponent
  ],
  templateUrl: './maintenance-shell.component.html',
  styleUrl: './maintenance-shell.component.scss'
})
export class MaintenanceShellComponent implements OnInit, CanComponentDeactivate {
  @ViewChild('inspectionChecklist') inspectionChecklist?: InspectionComponent;
  @ViewChild('maintenanceSection') maintenanceSection?: MaintenanceComponent;
  @ViewChild('maintenanceDocumentList') maintenanceDocumentList?: DocumentListComponent;
  @ViewChild('maintenanceWorkOrderList') maintenanceWorkOrderList?: WorkOrderListComponent;
  @ViewChild('maintenanceWorkOrderDetail') maintenanceWorkOrderDetail?: WorkOrderComponent;
  @ViewChild('maintenanceReceiptsList') maintenanceReceiptsList?: ReceiptsListComponent;
  @ViewChild('maintenanceReceiptDetail') maintenanceReceiptDetail?: ReceiptComponent;
  @ViewChild('maintenanceEmailList') maintenanceEmailList?: EmailListComponent;

  property: PropertyResponse | null = null;
  isServiceError = false;
  selectedTabIndex = 0;
  isHandlingTabGuard = false;

  userId = '';
  organizationId = '';
  showOfficeDropdown = false;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;

  titleBarReservationId: string | null = null;
  shellReservations: ReservationListResponse[] = [];

  showReceiptDetail = false;
  selectedReceiptId: number | null = null;
  refreshReceiptsTrigger = 0;

  showWorkOrderDetail = false;
  selectedWorkOrderId: string | null = null;
  showWorkOrdersTab = true;

  isInspectorView = false;
  selectedPropertyId: string | null = null;
  preferredOfficeId: number | null = null;
  availableProperties: { propertyId: string; propertyCode: string }[] = [];
  allProperties: PropertyListResponse[] = [];
  inspectorPropertyIds = new Set<string>();
  skipNextPropertyCodeChange = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

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
  ) {}

  //#region Maintenance-Shell
  ngOnInit(): void {
    this.userId = this.authService.getUser()?.userId?.trim() ?? '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.normalizeOfficeId(this.authService.getUser()?.defaultOfficeId ?? null);
    this.loadTitleBarOfficeScope();

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

      const workOrderIdParam = (params.get('workOrderId') || '').trim();
      if (this.showWorkOrdersTab && workOrderIdParam !== '') {
        this.selectedTabIndex = this.workOrdersTabIndex;
        this.selectedWorkOrderId = workOrderIdParam;
        this.showWorkOrderDetail = true;
      }
    });

    this.route.paramMap.pipe(filter(params => params.has('id')), take(1)).subscribe(params => {
      const id = params.get('id')!;
      this.loadProperty(id);
    });
  }
  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string, onLoaded?: () => void, preferredReservationId?: string | null): void {
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),
      switchMap(property =>
        this.reservationService.getReservationsByPropertyId(property.propertyId).pipe(take(1),
          map(reservations => ({ property, reservations: reservations || [] }))
        )
      ),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))
    ).subscribe({
      next: ({ property, reservations }) => {
        this.property = property;
        this.shellReservations = reservations;
        this.syncTitleBarSelections();
        this.setTitleBarReservationForCurrentProperty(preferredReservationId ?? null);
        onLoaded?.();
      },
      error: () => {
        this.property = null;
        this.shellReservations = [];
        this.titleBarReservationId = null;
        this.isServiceError = true;
        onLoaded?.();
      }
    });
  }

  loadTitleBarOfficeScope(): void {
    if (!this.organizationId) {
      this.showOfficeDropdown = false;
      this.selectedOfficeId = null;
      this.loadTitleBarProperties();
      return;
    }

    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.globalSelectionService.getOfficeUiState$(this.offices, { requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            setTimeout(() => {
              this.showOfficeDropdown = uiState.showOfficeDropdown;
              this.selectedOfficeId = this.normalizeOfficeId(uiState.selectedOfficeId);
              this.loadTitleBarProperties();
            }, 0);
          }
        });
      },
      error: () => {
        setTimeout(() => {
          this.offices = [];
          this.showOfficeDropdown = false;
          this.selectedOfficeId = null;
          this.loadTitleBarProperties();
        }, 0);
      }
    });
  }

  loadTitleBarProperties(): void {
    if (!this.userId) {
      this.allProperties = [];
      this.availableProperties = [];
      this.showOfficeDropdown = false;
      return;
    }

    this.propertyService.getActivePropertiesBySelectionCriteria(this.userId).pipe(take(1)).subscribe({
      next: (properties) => {
        const propertyRows = properties || [];
        this.allProperties = this.isInspectorView && this.inspectorPropertyIds.size > 0
          ? propertyRows.filter(property => this.inspectorPropertyIds.has(String(property.propertyId || '').trim().toLowerCase()))
          : propertyRows;
        this.syncTitleBarSelections();
      },
      error: () => {
        this.allProperties = [];
        this.availableProperties = [];
        this.showOfficeDropdown = false;
      }
    });
  }
  //#endregion

  //#region Getter Methods
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

  get emailTabIndex(): number {
    return this.showWorkOrdersTab ? 4 : 3;
  }

  get documentsTabIndex(): number {
    return this.showWorkOrdersTab ? 5 : 4;
  }

  get receiptsTabIndex(): number {
    return 2;
  }

  get emailTypeOptions(): SearchableSelectOption[] {
    return (this.maintenanceEmailList?.emailTypeOptions || []).map(option => ({
      value: option.value,
      label: option.label
    }));
  }

  get selectedEmailTypeId(): number | null {
    return this.maintenanceEmailList?.selectedEmailTypeId ?? null;
  }

  get documentTypeOptions(): SearchableSelectOption[] {
    return (this.maintenanceDocumentList?.documentTypeOptions || []).map(option => ({
      value: option.value,
      label: option.label
    }));
  }

  get selectedDocumentTypeId(): number | null {
    return this.maintenanceDocumentList?.selectedDocumentTypeId ?? null;
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
    return this.selectedTabIndex === this.emailTabIndex || this.selectedTabIndex === this.documentsTabIndex;
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

  get workOrderPrimaryActionLabel(): string {
    if (!this.isWorkOrderDetailActive || !this.maintenanceWorkOrderDetail) {
      return 'Save';
    }
    return this.maintenanceWorkOrderDetail.isViewModeBeforeChanges() ? 'View' : 'Save';
  }

  get workOrderPrimaryActionIcon(): string {
    if (!this.isWorkOrderDetailActive || !this.maintenanceWorkOrderDetail) {
      return 'save';
    }
    return this.maintenanceWorkOrderDetail.isViewModeBeforeChanges() ? 'visibility' : 'save';
  }

  get workOrderPrimaryActionDisabled(): boolean {
    if (!this.isWorkOrderDetailActive || !this.maintenanceWorkOrderDetail) {
      return true;
    }
    if (this.maintenanceWorkOrderDetail.isSubmitting) {
      return true;
    }
    return !this.maintenanceWorkOrderDetail.isViewModeBeforeChanges() && !this.maintenanceWorkOrderDetail.form?.valid;
  }

  get receiptPrimaryActionLabel(): string {
    return 'Save';
  }

  get receiptPrimaryActionIcon(): string {
    return 'save';
  }

  get receiptPrimaryActionDisabled(): boolean {
    if (!this.isReceiptDetailActive || !this.maintenanceReceiptDetail) {
      return true;
    }
    return this.maintenanceReceiptDetail.isSubmitting || !this.maintenanceReceiptDetail.form?.valid;
  }
  //#endregion

  //#region Top Bar Event Methods
  onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
    this.updateAvailableProperties();
    if (this.property && this.selectedOfficeId !== this.property.officeId) {
      this.selectedPropertyId = null;
      this.property = null;
      this.titleBarReservationId = null;
      this.shellReservations = [];
      this.showReceiptDetail = false;
      this.selectedReceiptId = null;
      this.showWorkOrderDetail = false;
      this.selectedWorkOrderId = null;
      if (this.selectedTabIndex === this.receiptsTabIndex) {
        this.refreshReceiptsTrigger++;
      }
    }
  }

  async onPropertyCodeChange(): Promise<void> {
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

    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.titleBarReservationId = null;
    this.shellReservations = [];
    this.property = null;
    this.isServiceError = false;
    if (!this.selectedPropertyId) {
      if (this.selectedTabIndex === this.receiptsTabIndex) {
        this.refreshReceiptsTrigger++;
      }
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.loadProperty(this.selectedPropertyId);
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId])}?tab=${this.selectedTabIndex}`);
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.titleBarReservationId = value == null || value === '' ? null : String(value);
  }

  onHeaderEmailTypeDropdownChange(value: string | number | null): void {
    if (!this.maintenanceEmailList) {
      return;
    }
    this.maintenanceEmailList.onEmailTypeDropdownChange(value);
  }

  onHeaderDocumentTypeDropdownChange(value: string | number | null): void {
    if (!this.maintenanceDocumentList) {
      return;
    }
    this.maintenanceDocumentList.onDocumentTypeDropdownChange(value);
  }
  //#endregion

  //#region Title Bar Sync
  syncTitleBarSelections(): void {
    if (!this.property && !this.selectedOfficeId) {
      this.updateAvailableProperties();
      return;
    }
    if (this.property) {
      this.selectedOfficeId = this.property.officeId ?? this.selectedOfficeId;
      this.selectedPropertyId = this.property.propertyId ?? null;
    }
    this.updateAvailableProperties();
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
      if (nextTabIndex === this.receiptsTabIndex || nextTabIndex === this.documentsTabIndex || nextTabIndex === this.emailTabIndex) {
        this.titleBarReservationId = null;
      }
      if (nextTabIndex === this.documentsTabIndex) {
        this.maintenanceDocumentList?.reload();
      }
      if (nextTabIndex === this.emailTabIndex) {
        this.maintenanceEmailList?.reload();
      }
      if (nextTabIndex === 0) {
        setTimeout(() => this.inspectionChecklist?.pushTitleBarReservationToShell(), 0);
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

  onReceiptSelect(receiptId: number | null): void {
    this.showReceiptDetail = true;
    this.selectedReceiptId = receiptId;
  }

  onReceiptBack(): void {
    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
  }

  onReceiptSaved(): void {
    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
  }

  onMaintenanceReceiptsInactiveChange(showInactive: boolean): void {
    if (!this.maintenanceReceiptsList) return;
    this.maintenanceReceiptsList.showInactive = showInactive;
    this.maintenanceReceiptsList.applyFilters();
  }

  onWorkOrderSelect(selection: WorkOrderSelection): void {
    const workOrderId = selection?.workOrderId ?? null;
    const targetPropertyId = (selection?.propertyId || '').trim() || null;
    const openWorkOrderDetail = () => {
      this.showWorkOrderDetail = true;
      this.selectedWorkOrderId = workOrderId;
    };

    if (targetPropertyId && targetPropertyId !== this.selectedPropertyId) {
      this.skipNextPropertyCodeChange = true;
      this.selectedPropertyId = targetPropertyId;
      this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
      this.loadProperty(targetPropertyId, () => openWorkOrderDetail(), null);
      return;
    }
    openWorkOrderDetail();
  }

  onWorkOrderBack(): void {
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
  }

  onWorkOrderSaved(): void {
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.refreshReceiptsTrigger++;
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

  onTopBarWorkOrderPrimaryActionClick(): void {
    if (!this.isWorkOrderDetailActive) {
      return;
    }
    this.maintenanceWorkOrderDetail?.onPrimaryAction();
  }

  onTopBarReceiptPrimaryActionClick(): void {
    if (!this.isReceiptDetailActive) {
      return;
    }
    this.maintenanceReceiptDetail?.saveReceipt();
  }

  onMaintenanceWorkOrderInactiveChange(showInactive: boolean): void {
    if (!this.maintenanceWorkOrderList) return;
    this.maintenanceWorkOrderList.showInactive = showInactive;
    this.maintenanceWorkOrderList.applyFilters();
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

    const maxTab = this.showWorkOrdersTab ? 5 : 4;
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
   * inspection `dirty` must not block moves like Emails ↔ Work Orders. Omit for property change, Back,
   * and route deactivate — then both sections are checked.
   */
  async confirmChecklistNavigation(tabChange?: { previousIndex: number; nextIndex: number }): Promise<boolean> {
    const hasInspectionChanges = this.inspectionChecklist?.hasUnsavedChanges() ?? false;
    const hasMaintenanceChanges = this.maintenanceSection?.hasUnsavedChanges() ?? false;

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
        return this.inspectionChecklist?.saveChecklistDataAndWait() ?? true;
      }
      return this.maintenanceSection?.saveMaintenanceAndWait() ?? true;
    }

    if (targetSection === 'inspection') {
      this.inspectionChecklist?.discardUnsavedChanges();
    } else {
      this.maintenanceSection?.discardUnsavedChanges();
    }
    return true;
  }
  //#endregion
}
