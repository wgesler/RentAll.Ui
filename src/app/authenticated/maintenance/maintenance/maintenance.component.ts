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
import { ChecklistSection, INSPECTION_SECTIONS, INVENTORY_SECTIONS } from '../models/checklist-sections';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { MaintenanceService } from '../services/maintenance.service';
import { ChecklistComponent } from '../checklist/checklist.component';
import { WorkOrderListComponent } from '../work-order-list/work-order-list.component';
import { ReceiptsListComponent } from '../receipts-list/receipts-list.component';
import { ReceiptComponent } from '../receipt/receipt.component';
import { WorkOrderComponent } from '../work-order/work-order.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { hasInspectorRole } from '../../shared/access/role-access';

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
    DocumentListComponent
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
  mergedInventoryCounts: Record<string, number> = {};
  mergedSectionSources: Record<string, { inventoryKey: string | null; inspectionKey: string | null }> = {};

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
      this.loadProperty(id);
    });
  }

  createMaintenanceWithDefaultTemplates(propertyId: string): void {
    if (!this.property) return;

    const user = this.authService.getUser();
    const inspectionTemplate = this.buildDefaultTemplateJson(INSPECTION_SECTIONS, false);
    const inventoryTemplate = this.buildDefaultTemplateJson(INVENTORY_SECTIONS, true);

    const payload: MaintenanceRequest = {
      organizationId: this.property.organizationId ?? user?.organizationId ?? '',
      officeId: this.property.officeId ?? 0,
      officeName: this.property.officeName ?? '',
      propertyId,
      inspectionCheckList: inspectionTemplate,
      inventoryCheckList: inventoryTemplate,
      notes: null,
      isActive: true
    };

    this.maintenanceService.createMaintenance(payload).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance'))).subscribe({
      next: (saved) => {this.maintenanceRecord = saved;},
      error: () => (this.maintenanceRecord = null)
    });
  }

  onSaveTemplate(checklistJson: string, checklistType: 'inspection' | 'inventory'): void {
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
          inspectionCheckList: checklistType === 'inspection'
            ? checklistJson
            : (existing?.inspectionCheckList ?? this.maintenanceRecord?.inspectionCheckList ?? ''),
          inventoryCheckList: checklistType === 'inventory'
            ? checklistJson
            : (existing?.inventoryCheckList ?? this.maintenanceRecord?.inventoryCheckList ?? ''),
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

  onSaveMergedTemplate(mergedChecklistJson: string): void {
    const splitTemplates = this.splitMergedChecklistTemplate(mergedChecklistJson);
    const user = this.authService.getUser();
    this.isSavingTemplate = true;

    this.maintenanceService.getByPropertyId(this.property?.propertyId ?? '').pipe(
      take(1),
      switchMap((latest) => {
        const existing = latest ?? null;
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId ?? this.maintenanceRecord?.maintenanceId,
          organizationId: existing?.organizationId ?? this.maintenanceRecord?.organizationId ?? user?.organizationId ?? this.property!.organizationId,
          officeId: existing?.officeId ?? this.maintenanceRecord?.officeId ?? this.property!.officeId,
          officeName: existing?.officeName ?? this.maintenanceRecord?.officeName ?? this.property!.officeName ?? '',
          propertyId: this.property!.propertyId,
          inspectionCheckList: splitTemplates.inspectionTemplateJson,
          inventoryCheckList: splitTemplates.inventoryTemplateJson,
          notes: existing?.notes ?? this.maintenanceRecord?.notes ?? null,
          isActive: existing?.isActive ?? this.maintenanceRecord?.isActive ?? true
        };
        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload)
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined });
      }),
      take(1)
    ).subscribe({
      next: () => {
        const propertyId = this.property!.propertyId;
        this.maintenanceRecord = null;
        this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenance');
        this.loadMaintenanceByProperty(propertyId);
        this.isSavingTemplate = false;
      },
      error: () => {
        this.isSavingTemplate = false;
      }
    });
  }
  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string): void {
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: (p) => {
        this.property = p;
        this.syncTitlebarSelections();
        this.loadMaintenanceByProperty(p.propertyId);
      },
      error: () => {
        this.property = null;
        this.maintenanceRecord = null;
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      }
    });
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

  get inventoryTemplateJson(): string {
    return this.maintenanceRecord?.inventoryCheckList ?? '';
  }

  get mergedTemplateJson(): string {
    const mergedTemplate = this.buildMergedTemplateJson(this.inventoryTemplateJson, this.inspectionTemplateJson);
    this.mergedInventoryCounts = mergedTemplate.inventoryCounts;
    this.mergedSectionSources = mergedTemplate.sectionSources;
    return mergedTemplate.templateJson;
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
    this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenance');
    this.loadProperty(this.selectedPropertyId);
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.selectedPropertyId])}?tab=${this.selectedTabIndex}`);
  }

  get workOrdersTabIndex(): number {
    return 2;
  }

  get documentsTabIndex(): number {
    return this.showWorkOrdersTab ? 3 : 2;
  }

  get receiptsTabIndex(): number {
    return 1;
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

    const maxTab = this.showWorkOrdersTab ? 3 : 2;
    if (tabParam > maxTab) {
      return maxTab;
    }

    return tabParam;
  }

  private buildMergedTemplateJson(inventoryTemplateJson: string, inspectionTemplateJson: string): {
    templateJson: string;
    inventoryCounts: Record<string, number>;
    sectionSources: Record<string, { inventoryKey: string | null; inspectionKey: string | null }>;
  } {
    const inventorySections = this.parseChecklistSections(inventoryTemplateJson, INVENTORY_SECTIONS);
    const inspectionSections = this.parseChecklistSections(inspectionTemplateJson, INSPECTION_SECTIONS);
    const inventoryByTitle = new Map<string, (typeof inventorySections)[number]>();
    const inspectionByTitle = new Map<string, (typeof inspectionSections)[number]>();
    inventorySections.forEach(section => inventoryByTitle.set(this.normalizeSectionName(section.title || section.key), section));
    inspectionSections.forEach(section => inspectionByTitle.set(this.normalizeSectionName(section.title || section.key), section));

    const orderedTitles = [
      ...inventorySections.map(section => this.normalizeSectionName(section.title || section.key)),
      ...inspectionSections
        .map(section => this.normalizeSectionName(section.title || section.key))
        .filter(title => !inventoryByTitle.has(title))
    ];

    const mergedSections = orderedTitles.map((titleKey, index) => {
      const inventorySection = inventoryByTitle.get(titleKey);
      const inspectionSection = inspectionByTitle.get(titleKey);
      const sectionKey = inventorySection?.key ?? inspectionSection?.key ?? `mergedSection${index}`;
      const sectionTitle = inventorySection?.title ?? inspectionSection?.title ?? sectionKey;
      const maxSets = Math.max(inventorySection?.sets.length ?? 0, inspectionSection?.sets.length ?? 0, 1);
      const inventoryDefaultSet = inventorySection?.sets[0] ?? [];
      const inspectionDefaultSet = inspectionSection?.sets[0] ?? [];
      const sets = Array.from({ length: maxSets }).map((_, setIndex) => {
        const inventoryItems = inventorySection?.sets[setIndex] ?? inventoryDefaultSet;
        const inspectionItems = inspectionSection?.sets[setIndex] ?? inspectionDefaultSet;
        return [...inventoryItems, ...inspectionItems];
      });

      return {
        key: sectionKey,
        title: sectionTitle,
        notes: inventorySection?.notes || inspectionSection?.notes || '',
        sets
      };
    });

    const inventoryCounts = Object.fromEntries(mergedSections.map(section => {
      const titleKey = this.normalizeSectionName(section.title || section.key);
      const inventorySection = inventoryByTitle.get(titleKey);
      const inventoryCount = inventorySection?.sets[0]?.length ?? 0;
      return [section.key, inventoryCount];
    }));

    const sectionSources = Object.fromEntries(mergedSections.map(section => {
      const titleKey = this.normalizeSectionName(section.title || section.key);
      const inventorySection = inventoryByTitle.get(titleKey);
      const inspectionSection = inspectionByTitle.get(titleKey);
      return [section.key, {
        inventoryKey: inventorySection?.key ?? null,
        inspectionKey: inspectionSection?.key ?? null
      }];
    }));

    return {
      templateJson: JSON.stringify({ sections: mergedSections }),
      inventoryCounts,
      sectionSources
    };
  }

  private splitMergedChecklistTemplate(mergedChecklistJson: string): { inventoryTemplateJson: string; inspectionTemplateJson: string } {
    const mergedSections = this.parseChecklistSections(mergedChecklistJson, []);
    const inventorySections: Array<{ key: string; title: string; notes: string; sets: Array<Array<{ text: string; requiresPhoto: boolean; isEditable: boolean; photoPath: string | null }>> }> = [];
    const inspectionSections: Array<{ key: string; title: string; notes: string; sets: Array<Array<{ text: string; requiresPhoto: boolean; isEditable: boolean; photoPath: string | null }>> }> = [];

    mergedSections.forEach(section => {
      const source = this.mergedSectionSources[section.key] ?? { inventoryKey: null, inspectionKey: null };
      const inventoryCount = this.mergedInventoryCounts[section.key] ?? 0;
      const inventorySets = section.sets.map(set => set.slice(0, inventoryCount));
      const inspectionSets = section.sets.map(set => set.slice(inventoryCount));

      if (source.inventoryKey) {
        inventorySections.push({
          key: source.inventoryKey,
          title: section.title || source.inventoryKey,
          notes: section.notes || '',
          sets: inventorySets
        });
      }

      if (source.inspectionKey) {
        inspectionSections.push({
          key: source.inspectionKey,
          title: section.title || source.inspectionKey,
          notes: section.notes || '',
          sets: inspectionSets
        });
      }
    });

    return {
      inventoryTemplateJson: JSON.stringify({ sections: inventorySections }),
      inspectionTemplateJson: JSON.stringify({ sections: inspectionSections })
    };
  }

  private parseChecklistSections(
    checklistJson: string,
    fallbackSections: ChecklistSection[]
  ): Array<{
    key: string;
    title: string;
    notes: string;
    sets: Array<Array<{ text: string; requiresPhoto: boolean; isEditable: boolean; photoPath: string | null }>>;
  }> {
    try {
      const parsed = JSON.parse(checklistJson || '{}') as { sections?: Array<{ key?: string; title?: string; notes?: string; sets?: Array<Array<{ text?: string; requiresPhoto?: boolean; isEditable?: boolean; photoPath?: string | null }>> }> };
      const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
      if (sections.length === 0 && fallbackSections.length > 0) {
        return fallbackSections.map(section => ({
          key: section.key,
          title: section.title,
          notes: '',
          sets: [section.items.map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            isEditable: false,
            photoPath: null
          }))]
        }));
      }

      return sections.map((section, sectionIndex) => ({
        key: section.key || `section${sectionIndex}`,
        title: section.title || section.key || `Section ${sectionIndex + 1}`,
        notes: section.notes || '',
        sets: (section.sets && section.sets.length > 0 ? section.sets : [[]]).map(setItems =>
          (setItems || []).map(item => ({
            text: item?.text || '',
            requiresPhoto: item?.requiresPhoto === true,
            isEditable: item?.isEditable === true,
            photoPath: item?.photoPath ?? null
          }))
        )
      }));
    } catch {
      return fallbackSections.map(section => ({
        key: section.key,
        title: section.title,
        notes: '',
        sets: [section.items.map(item => ({
          text: item.text,
          requiresPhoto: item.requiresPhoto,
          isEditable: false,
          photoPath: null
        }))]
      }));
    }
  }

  private normalizeSectionName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  //#endregion
}
