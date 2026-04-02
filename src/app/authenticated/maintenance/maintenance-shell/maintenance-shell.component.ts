import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ChecklistComponent } from '../checklist/checklist.component';
import { WorkOrderListComponent } from '../work-order-list/work-order-list.component';
import { ReceiptsListComponent } from '../receipts-list/receipts-list.component';
import { ReceiptComponent } from '../receipt/receipt.component';
import { WorkOrderComponent } from '../work-order/work-order.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { hasInspectorRole } from '../../shared/access/role-access';
import { MaintenanceComponent } from '../maintenance/maintenance.component';

@Component({
  standalone: true,
  selector: 'app-maintenance-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    ChecklistComponent,
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
export class MaintenanceShellComponent implements OnInit, CanComponentDeactivate {
  @ViewChild('inspectionChecklist') inspectionChecklist?: ChecklistComponent;
  @ViewChild('maintenanceSection') maintenanceSection?: MaintenanceComponent;
  @ViewChild('maintenanceDocumentList') maintenanceDocumentList?: DocumentListComponent;
  @ViewChild('maintenanceWorkOrderList') maintenanceWorkOrderList?: WorkOrderListComponent;
  @ViewChild('maintenanceReceiptsList') maintenanceReceiptsList?: ReceiptsListComponent;
  property: PropertyResponse | null = null;
  isServiceError = false;
  selectedTabIndex = 0;

  userId = '';
  organizationId = '';
  showOfficeDropdown = true;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;

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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService
  ) {}

  //#region Maintenance
  ngOnInit(): void {
    this.userId = this.authService.getUser()?.userId?.trim() ?? '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    this.loadTitlebarOfficeScope();

    // If the user is an inspector, the admin can limit their view of properties to a sub-set
    this.isInspectorView = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
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
    });

    this.route.paramMap.pipe(filter(params => params.has('id')), take(1)).subscribe(params => {
      const id = params.get('id')!;
      this.loadProperty(id);
    });
  }

  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string): void {
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: (property) => {
        this.property = property;
        this.syncTitlebarSelections();
      },
      error: () => {
        this.property = null;
        this.isServiceError = true;
      }
    });
  }

  loadTitlebarOfficeScope(): void {
    if (!this.organizationId) {
      this.showOfficeDropdown = false;
      this.selectedOfficeId = null;
      this.loadTitlebarProperties();
      return;
    }

    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.globalOfficeSelectionService.getOfficeUiState$(this.offices, { requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.selectedOfficeId = uiState.selectedOfficeId;
            this.loadTitlebarProperties();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.selectedOfficeId = null;
        this.loadTitlebarProperties();
      }
    });
  }

  loadTitlebarProperties(): void {
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
        this.syncTitlebarSelections();
      },
      error: () => {
        this.allProperties = [];
        this.availableProperties = [];
        this.showOfficeDropdown = false;
      }
    });
  }
  //#endregion

  //#region Route/Reload Methods
  async onTabChange(event: { index: number }): Promise<void> {
    const nextTabIndex = event.index;
    if (nextTabIndex === this.selectedTabIndex) {
      return;
    }

    const canLeaveCurrentTab = await this.confirmChecklistNavigation();
    if (!canLeaveCurrentTab) {
      return;
    }
    this.selectedTabIndex = nextTabIndex;
  }

  onInspectionSubmitted(): void {
    this.navigateToMaintenanceTabs(0);
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOfficeId);
    this.updateAvailableProperties();
    if (this.property && this.selectedOfficeId !== this.property.officeId) {
      this.selectedPropertyId = null;
    }
  }

  async onPropertyCodeChange(): Promise<void> {
    if (!this.selectedPropertyId || this.selectedPropertyId === this.property?.propertyId) {
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
    this.property = null;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.loadProperty(this.selectedPropertyId);
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId])}?tab=${this.selectedTabIndex}`);
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

  onWorkOrderSelect(workOrderId: string | null): void {
    this.showWorkOrderDetail = true;
    this.selectedWorkOrderId = workOrderId;
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

  syncTitlebarSelections(): void {
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

  normalizeRequestedTab(tabParam: number): number | null {
    if (Number.isNaN(tabParam) || tabParam < 0) {
      return null;
    }

    const maxTab = this.showWorkOrdersTab ? 4 : 3;
    if (tabParam > maxTab) {
      return maxTab;
    }

    return tabParam;
  }

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

  async confirmChecklistNavigation(): Promise<boolean> {
    const canLeaveChecklist = await (this.inspectionChecklist?.confirmNavigationWithUnsavedChanges() ?? Promise.resolve(true));
    if (!canLeaveChecklist) {
      return false;
    }
    return this.maintenanceSection?.confirmNavigationWithUnsavedChanges() ?? true;
  }
  //#endregion
}
