import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, concat, concatMap, defaultIfEmpty, filter, finalize, from, map, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
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
import { InventoryComponent } from '../inventory/inventory.component';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';
import { ApplianceService } from '../services/appliance.service';

@Component({
  standalone: true,
  selector: 'app-maintenance',
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
    InventoryComponent
  ],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss'
})
export class MaintenanceComponent implements OnInit {
  @ViewChild('maintenanceDocumentList') maintenanceDocumentList?: DocumentListComponent;
  @ViewChild('maintenanceWorkOrderList') maintenanceWorkOrderList?: WorkOrderListComponent;
  @ViewChild('maintenanceReceiptsList') maintenanceReceiptsList?: ReceiptsListComponent;
  property: PropertyResponse | null = null;
  maintenanceRecord: MaintenanceResponse | null = null;
  templateMode = false;
  isServiceError = false;
  isSavingTemplate = false;
  isSavingInventory = false;
  isSavingAppliances = false;
  selectedTabIndex = 0;
  /** When true, Receipts tab shows receipt detail instead of list. selectedReceiptId is null for "new". */
  showReceiptDetail = false;
  selectedReceiptId: number | null = null;
  /** When true, Work Orders tab shows work order detail instead of list. selectedWorkOrderId is null for "new". */
  showWorkOrderDetail = false;
  selectedWorkOrderId: string | null = null;
  /** Increment to tell Receipts list to refetch (e.g. after work order save). */
  refreshReceiptsTrigger = 0;
  showWorkOrdersTab = true;
  userId = '';
  organizationId = '';
  preferredOfficeId: number | null = null;
  isInspectorView = false;
  inspectorPropertyIds = new Set<string>();
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  showOfficeDropdown = true;
  allProperties: PropertyListResponse[] = [];
  offices: OfficeResponse[] = [];
  availableProperties: { propertyId: string; propertyCode: string }[] = [];
  appliances: ApplianceResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'maintenance', 'appliances']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private maintenanceService: MaintenanceService,
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private applianceService: ApplianceService,
    private toastr: ToastrService
  ) {}

  //#region Maintenance
  ngOnInit(): void {
    this.userId = this.authService.getUser()?.userId?.trim() ?? '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    this.isInspectorView = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    this.inspectorPropertyIds = new Set(
      (this.authService.getUser()?.properties || [])
        .map(propertyId => propertyId.trim().toLowerCase())
        .filter(propertyId => propertyId !== '')
    );
    this.showWorkOrdersTab = !this.isInspectorView;
    this.loadTitlebarOfficeScope();

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

    this.maintenanceService.getByPropertyId(this.property.propertyId).pipe(
      take(1),
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

  onInventorySave(inventoryPayload: MaintenanceRequest): void {
    if (!this.property) return;

    const user = this.authService.getUser();
    this.isSavingInventory = true;
    this.maintenanceService.getByPropertyId(this.property.propertyId).pipe(
      take(1),
      switchMap((latest) => {
        const existing = latest ?? this.maintenanceRecord ?? null;
        const pickValue = <T>(incoming: T | undefined, existingValue: T | undefined, fallback: T): T =>
          incoming === undefined ? (existingValue ?? fallback) : incoming;
        // Inventory saves must never mutate checklist content. Preserve existing checklist verbatim.
        const checklistJson = existing?.inspectionCheckList
          ?? this.maintenanceRecord?.inspectionCheckList
          ?? this.buildDefaultTemplateJson(INSPECTION_SECTIONS, false);
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId ?? inventoryPayload.maintenanceId,
          organizationId: inventoryPayload.organizationId || existing?.organizationId || this.property!.organizationId || user?.organizationId || '',
          officeId: inventoryPayload.officeId ?? existing?.officeId ?? this.property!.officeId ?? 0,
          officeName: inventoryPayload.officeName || existing?.officeName || this.property!.officeName || '',
          propertyId: inventoryPayload.propertyId || existing?.propertyId || this.property!.propertyId,
          inspectionCheckList: checklistJson,
          cleanerUserId: pickValue(inventoryPayload.cleanerUserId, existing?.cleanerUserId, null),
          cleaningDate: pickValue(inventoryPayload.cleaningDate, existing?.cleaningDate, null),
          inspectorUserId: pickValue(inventoryPayload.inspectorUserId, existing?.inspectorUserId, null),
          inspectingDate: pickValue(inventoryPayload.inspectingDate, existing?.inspectingDate, null),
          filterDescription: pickValue(inventoryPayload.filterDescription, existing?.filterDescription, null),
          lastFilterChangeDate: pickValue(inventoryPayload.lastFilterChangeDate, existing?.lastFilterChangeDate, null),
          smokeDetectors: pickValue(inventoryPayload.smokeDetectors, existing?.smokeDetectors, null),
          lastSmokeChangeDate: pickValue(inventoryPayload.lastSmokeChangeDate, existing?.lastSmokeChangeDate, null),
          smokeDetectorBatteries: pickValue(inventoryPayload.smokeDetectorBatteries, existing?.smokeDetectorBatteries, null),
          lastBatteryChangeDate: pickValue(inventoryPayload.lastBatteryChangeDate, existing?.lastBatteryChangeDate, null),
          licenseNo: pickValue(inventoryPayload.licenseNo, existing?.licenseNo, null),
          licenseDate: pickValue(inventoryPayload.licenseDate, existing?.licenseDate, null),
          hvacNotes: pickValue(inventoryPayload.hvacNotes, existing?.hvacNotes, null),
          hvacServiced: pickValue(inventoryPayload.hvacServiced, existing?.hvacServiced, null),
          fireplaceNotes: pickValue(inventoryPayload.fireplaceNotes, existing?.fireplaceNotes, null),
          fireplaceServiced: pickValue(inventoryPayload.fireplaceServiced, existing?.fireplaceServiced, null),
          notes: pickValue(inventoryPayload.notes, existing?.notes, null),
          isActive: inventoryPayload.isActive ?? existing?.isActive ?? true
        };
        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload)
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined });
      }),
      take(1)
    ).subscribe({
      next: (saved: MaintenanceResponse) => {
        this.maintenanceRecord = saved;
        this.templateMode = false;
        this.isSavingInventory = false;
        this.toastr.success('Maintenance saved.', CommonMessage.Success);
      },
      error: () => {
        this.isSavingInventory = false;
        this.toastr.error('Unable to save maintenance.', CommonMessage.Error);
      }
    });
  }

  onAppliancesSave(payload: { upserts: ApplianceRequest[]; deleteIds: number[] }): void {
    if (!this.property) return;

    const deleteIds = (payload.deleteIds || []).filter(id => Number.isFinite(id));
    const upserts = payload.upserts || [];
    if (deleteIds.length === 0 && upserts.length === 0) {
      return;
    }

    this.isSavingAppliances = true;

    const deleteOperations$ = from(deleteIds).pipe(concatMap(applianceId => this.applianceService.deleteAppliance(applianceId)));
    const upsertOperations$ = from(upserts).pipe(
      concatMap(request => request.applianceId
        ? this.applianceService.updateAppliance(request)
        : this.applianceService.createAppliance(request))
    );

    concat(deleteOperations$, upsertOperations$).pipe(
      defaultIfEmpty(null),
      finalize(() => {
        this.isSavingAppliances = false;
      })
    ).subscribe({
      complete: () => {
        if (this.property) {
          this.utilityService.addLoadItem(this.itemsToLoad$, 'appliances');
          this.loadAppliancesByProperty(this.property.propertyId);
        }
        this.toastr.success('Appliances saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save appliances.', CommonMessage.Error);
      }
    });
  }

  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string, onLoaded?: () => void): void {
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: (p) => {
        this.property = p;
        this.syncTitlebarSelections();
        onLoaded?.();
      },
      error: () => {
        this.property = null;
        this.maintenanceRecord = null;
        this.appliances = [];
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'appliances');
      }
    });
  }

  loadMaintenanceSections(propertyId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenance');
    this.utilityService.addLoadItem(this.itemsToLoad$, 'appliances');
    this.loadMaintenanceByProperty(propertyId);
    this.loadAppliancesByProperty(propertyId);
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

  loadAppliancesByProperty(propertyId: string): void {
    this.applianceService.getAppliancesByPropertyId(propertyId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'appliances'))).subscribe({
      next: (response: ApplianceResponse[]) => {
        this.appliances = response || [];
      },
      error: () => {
        this.appliances = [];
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
    this.appliances = [];
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.loadProperty(this.selectedPropertyId, () => this.loadMaintenanceSections(this.selectedPropertyId!));
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId])}?tab=${this.selectedTabIndex}`);
  }

  get isLoadingAppliances(): boolean {
    return this.itemsToLoad$.value.has('appliances');
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
