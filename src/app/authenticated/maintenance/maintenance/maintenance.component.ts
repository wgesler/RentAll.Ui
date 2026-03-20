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
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ChecklistSection, INSPECTION_SECTIONS, INVENTORY_SECTIONS } from '../models/checklist-sections';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { MaintenanceService } from '../services/maintenance.service';
import { ChecklistComponent } from '../checklist/checklist.component';
import { WorkOrderListComponent } from '../work-order-list/work-order-list.component';
import { ReceiptsListComponent } from '../receipts-list/receipts-list.component';
import { ReceiptComponent } from '../receipt/receipt.component';
import { WorkOrderComponent } from '../work-order/work-order.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';

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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'maintenance']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private propertyService: PropertyService,
    private maintenanceService: MaintenanceService,
    private authService: AuthService,
    private utilityService: UtilityService
  ) {}

  //#region Maintenance
  ngOnInit(): void {
    this.route.queryParamMap.pipe(take(1)).subscribe(params => {
      const tabParam = Number(params.get('tab'));
      if (!Number.isNaN(tabParam) && tabParam >= 0 && tabParam <= 4) {
        this.selectedTabIndex = tabParam;
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
  //#endregion

  //#region Data Load Methods
  loadProperty(propertyId: string): void {
    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: (p) => {
        this.property = p;
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
  //#endregion

  //#region Utility Methods
  get inspectionTemplateJson(): string {
    return this.maintenanceRecord?.inspectionCheckList ?? '';
  }

  get inventoryTemplateJson(): string {
    return this.maintenanceRecord?.inventoryCheckList ?? '';
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
  //#endregion
}
