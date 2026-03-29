import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, filter, finalize, map, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ChecklistSection, INSPECTION_SECTIONS } from '../models/checklist-sections';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { MaintenanceService } from '../services/maintenance.service';
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
export class MaintenanceShellComponent implements OnInit {
  @ViewChild('maintenanceDocumentList') maintenanceDocumentList?: DocumentListComponent;
  @ViewChild('maintenanceWorkOrderList') maintenanceWorkOrderList?: WorkOrderListComponent;
  @ViewChild('maintenanceReceiptsList') maintenanceReceiptsList?: ReceiptsListComponent;
  property: PropertyResponse | null = null;
  maintenanceRecord: MaintenanceResponse | null = null;
  templateMode = false;
  isServiceError = false;
  isSavingTemplate = false;
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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'maintenance']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private maintenanceService: MaintenanceService,
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
      this.loadProperty(id, () => this.loadMaintenanceSections(id));
    });
  }

  createMaintenanceWithDefaultTemplates(propertyId: string): void {
    if (!this.property) return;

    const user = this.authService.getUser();
    const inspectionTemplate = this.buildDefaultTemplateJson(INSPECTION_SECTIONS, false);

    const payload: MaintenanceRequest = {
      organizationId: this.property.organizationId ?? user?.organizationId ?? '',
      officeId: this.property.officeId ?? 0,
      officeName: this.property.officeName ?? '',
      propertyId,
      inspectionCheckList: inspectionTemplate,
      cleanerUserId: user?.userId ?? '',
      cleaningDate: undefined,
      inspectorUserId: user?.userId ?? '',
      inspectingDate: undefined,
      notes: null,
      isActive: true
    };

    this.maintenanceService.createMaintenance(payload).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance'))).subscribe({
      next: (saved) => {this.maintenanceRecord = saved;},
      error: () => (this.maintenanceRecord = null)
    });
  }

  onSaveTemplate(checklistJson: string, _checklistType: 'inspection'): void {
    if (!this.property) return;

    const user = this.authService.getUser();
    this.isSavingTemplate = true;

    this.maintenanceService.getByPropertyId(this.property.propertyId).pipe( take(1),
      switchMap((latest) => {
        const existing = latest ?? null;
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId ?? this.maintenanceRecord?.maintenanceId,
          organizationId: existing?.organizationId ?? this.maintenanceRecord?.organizationId ?? user?.organizationId ?? this.property!.organizationId,
          officeId: existing?.officeId ?? this.maintenanceRecord?.officeId ?? this.property!.officeId,
          officeName: existing?.officeName ?? this.maintenanceRecord?.officeName ?? this.property!.officeName ?? '',
          propertyId: this.property!.propertyId,
          inspectionCheckList: checklistJson,
          cleanerUserId: existing?.cleanerUserId ?? this.maintenanceRecord?.cleanerUserId ?? user?.userId ?? '',
          cleaningDate: existing?.cleaningDate ?? this.maintenanceRecord?.cleaningDate ?? undefined,
          inspectorUserId: existing?.inspectorUserId ?? this.maintenanceRecord?.inspectorUserId ?? user?.userId ?? '',
          inspectingDate: existing?.inspectingDate ?? this.maintenanceRecord?.inspectingDate ?? undefined,
          notes: existing?.notes ?? this.maintenanceRecord?.notes ?? null,
          isActive: existing?.isActive ?? this.maintenanceRecord?.isActive ?? true
        };
        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload)
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined });
      }),
      take(1)
    ).subscribe({
      next: (saved: MaintenanceResponse) => {
        const propertyId = this.property!.propertyId;
        this.maintenanceRecord = null;
        this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenance');
        this.loadMaintenanceByProperty(propertyId);
        this.isSavingTemplate = false;
      },
      error: (_err: HttpErrorResponse) => {
        this.isSavingTemplate = false;
      }
    });
  }

  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string, onLoaded?: () => void): void {
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: (property) => {
        this.property = property;
        this.syncTitlebarSelections();
        onLoaded?.();
      },
      error: () => {
        this.property = null;
        this.maintenanceRecord = null;
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      }
    });
  }

  loadMaintenanceSections(propertyId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenance');
    this.loadMaintenanceByProperty(propertyId);
  }

  loadMaintenanceByProperty(propertyId: string): void {
    this.maintenanceService.getByPropertyId(propertyId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance'))).subscribe({
      next: (response: MaintenanceResponse | null) => {
        if (response) {
          this.maintenanceRecord = response;
          this.templateMode = false;
        } else {
          this.createMaintenanceWithDefaultTemplates(propertyId);
          this.templateMode = true;
        }
      },
      error: () => (this.maintenanceRecord = null)
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

  //#region Utility Methods
  get inspectionTemplateJson(): string {
    return this.maintenanceRecord?.inspectionCheckList ?? '';
  }

  buildDefaultTemplateJson(sections: ChecklistSection[], defaultIsEditable: boolean): string {
    const payload = {
      sections: sections.map(section => ({
        key: section.key,
        title: section.title,
        notes: '',
        sets: [
          section.items.map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: false,
            count: null,
            isEditable: defaultIsEditable,
            photoPath: null as string | null
          }))
        ]
      }))
    };
    return JSON.stringify(payload);
  }

  onTabChange(event: { index: number }): void {
    this.selectedTabIndex = event.index;
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOfficeId);
    this.updateAvailableProperties();
    if (this.property && this.selectedOfficeId !== this.property.officeId) {
      this.selectedPropertyId = null;
    }
  }

  onPropertyCodeChange(): void {
    if (!this.selectedPropertyId || this.selectedPropertyId === this.property?.propertyId) {
      return;
    }

    this.showReceiptDetail = false;
    this.selectedReceiptId = null;
    this.showWorkOrderDetail = false;
    this.selectedWorkOrderId = null;
    this.property = null;
    this.maintenanceRecord = null;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.loadProperty(this.selectedPropertyId, () => this.loadMaintenanceSections(this.selectedPropertyId!));
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

  back(): void {
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }

  private syncTitlebarSelections(): void {
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

  private updateAvailableProperties(): void {
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

  private normalizeRequestedTab(tabParam: number): number | null {
    if (Number.isNaN(tabParam) || tabParam < 0) {
      return null;
    }

    const maxTab = this.showWorkOrdersTab ? 4 : 3;
    if (tabParam > maxTab) {
      return maxTab;
    }

    return tabParam;
  }
  //#endregion
}
