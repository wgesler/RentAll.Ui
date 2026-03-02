import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, finalize, map, Observable, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { InventoryComponent } from '../inventory/inventory.component';
import { InventoryListComponent } from '../inventory-list/inventory-list.component';
import { InspectionComponent } from '../inspection/inspection.component';
import { InspectionChecklistComponent } from '../inspection-checklist/inspection-checklist.component';
import { InspectionListComponent } from '../inspection-list/inspection-list.component';
import { ChecklistSection, INSPECTION_SECTIONS, INVENTORY_SECTIONS } from '../models/checklist-sections';
import { InventoryDisplayList, InventoryRequest, InventoryResponse } from '../models/inventory.model';
import { InspectionDisplayList, InspectionRequest, InspectionResponse } from '../models/inspection.model';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { WorkOrderDisplayList, WorkOrderResponse } from '../models/work-order.model';
import { InspectionService } from '../services/inspection.service';
import { InventoryService } from '../services/inventory.service';
import { MaintenanceService } from '../services/maintenance.service';
import { WorkOrderService } from '../services/work-order.service';
import { WorkOrderListComponent } from '../work-order-list/work-order-list.component';
import { WorkOrderComponent } from '../work-order/work-order.component';

@Component({
  selector: 'app-maintenance',
  imports: [
    CommonModule,
    MaterialModule,
    InventoryComponent,
    InventoryListComponent,
    InspectionChecklistComponent,
    InspectionComponent,
    InspectionListComponent,
    WorkOrderListComponent,
    WorkOrderComponent
  ],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss'
})
export class MaintenanceComponent implements OnInit {
  propertyId: string | null = null;
  property: PropertyResponse | null = null;
  inspectionChecklistJson: string | null = null;
  inventoryChecklistJson: string | null = null;
  inspectionAnswers: string | null = null;
  inventoryAnswers: string | null = null;
  inspectionRecords: InspectionResponse[] = [];
  inventoryRecords: InventoryResponse[] = [];
  workOrderRecords: WorkOrderResponse[] = [];
  activeInspection: InspectionResponse | null = null;
  activeInventory: InventoryResponse | null = null;
  maintenanceRecord: MaintenanceResponse | null = null;
  selectedInspectionHistoryId: number | null = null;
  selectedInspectionHistoryMaintenanceId: string | null = null;
  selectedInventoryHistoryId: number | null = null;
  selectedInventoryHistoryMaintenanceId: string | null = null;
  selectedWorkOrderId: number | null = null;
  isCreatingWorkOrder: boolean = false;
  selectedTabIndex: number = 0;
  isNewMaintenanceRecord: boolean = false;
  isSaving: boolean = false;
  isServiceError: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'maintenance', 'inspection', 'inventory', 'workOrder']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    router: Router,
    route: ActivatedRoute,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    inspectionService: InspectionService,
    inventoryService: InventoryService,
    workOrderService: WorkOrderService,
    documentService: DocumentService,
    authService: AuthService,
    mappingService: MappingService,
    utilityService: UtilityService
  ) {
    this.router = router;
    this.route = route;
    this.propertyService = propertyService;
    this.maintenanceService = maintenanceService;
    this.inspectionService = inspectionService;
    this.inventoryService = inventoryService;
    this.workOrderService = workOrderService;
    this.documentService = documentService;
    this.authService = authService;
    this.mappingService = mappingService;
    this.utilityService = utilityService;
    this.propertyId = this.route.snapshot.paramMap.get('id');
  }

  router: Router;
  route: ActivatedRoute;
  propertyService: PropertyService;
  maintenanceService: MaintenanceService;
  inspectionService: InspectionService;
  inventoryService: InventoryService;
  workOrderService: WorkOrderService;
  documentService: DocumentService;
  authService: AuthService;
  mappingService: MappingService;
  utilityService: UtilityService;

  //#region Maintenance
  ngOnInit(): void {
    if (!this.propertyId || this.propertyId === 'new') {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
      return;
    }

    this.loadProperty();
    this.loadMaintenance();
    this.loadInspectionAnswers();
    this.loadInventoryAnswers();
    this.loadWorkOrders();
  }

  saveInspectionTemplate(inspectionChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const user = this.authService.getUser();
    const payload: MaintenanceRequest = {
      maintenanceId: this.maintenanceRecord?.maintenanceId,
      organizationId: this.maintenanceRecord?.organizationId || user?.organizationId || this.property.organizationId,
      officeId: this.maintenanceRecord?.officeId || this.property.officeId,
      officeName: this.maintenanceRecord?.officeName || this.property.officeName || '',
      propertyId: this.property.propertyId,
      inspectionCheckList: inspectionChecklistJson,
      inventoryCheckList: this.maintenanceRecord?.inventoryCheckList || this.inventoryChecklistJson || '',
      notes: this.maintenanceRecord?.notes || null,
      isActive: this.maintenanceRecord?.isActive ?? true
    };

    if (this.maintenanceRecord?.maintenanceId) {
      this.isSaving = true;
      this.maintenanceService.updateMaintenance(payload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
        next: (saved: MaintenanceResponse) => {
          this.maintenanceRecord = saved;
          this.inspectionChecklistJson = inspectionChecklistJson;
          window.location.reload();
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
        }
      });
      return;
    }

    const createPayload: MaintenanceRequest = {
      ...payload,
      maintenanceId: undefined
    };

    this.isSaving = true;
    this.maintenanceService.createMaintenance(createPayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
      next: (saved: MaintenanceResponse) => {
        this.maintenanceRecord = saved;
        this.inspectionChecklistJson = inspectionChecklistJson;
        window.location.reload();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  saveInventoryTemplate(inventoryChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const user = this.authService.getUser();
    const payload: MaintenanceRequest = {
      maintenanceId: this.maintenanceRecord?.maintenanceId,
      organizationId: this.maintenanceRecord?.organizationId || user?.organizationId || this.property.organizationId,
      officeId: this.maintenanceRecord?.officeId || this.property.officeId,
      officeName: this.maintenanceRecord?.officeName || this.property.officeName || '',
      propertyId: this.property.propertyId,
      inspectionCheckList: this.maintenanceRecord?.inspectionCheckList || this.inspectionChecklistJson || '',
      inventoryCheckList: inventoryChecklistJson,
      notes: this.maintenanceRecord?.notes || null,
      isActive: this.maintenanceRecord?.isActive ?? true
    };

    if (this.maintenanceRecord?.maintenanceId) {
      this.isSaving = true;
      this.maintenanceService.updateMaintenance(payload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
        next: (saved: MaintenanceResponse) => {
          this.maintenanceRecord = saved;
          this.inventoryChecklistJson = inventoryChecklistJson;
          window.location.reload();
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
        }
      });
      return;
    }

    const createPayload: MaintenanceRequest = {
      ...payload,
      maintenanceId: undefined
    };

    this.isSaving = true;
    this.maintenanceService.createMaintenance(createPayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
      next: (saved: MaintenanceResponse) => {
        this.maintenanceRecord = saved;
        this.inventoryChecklistJson = inventoryChecklistJson;
        window.location.reload();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  saveInventoryAnswers(inventoryChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const currentUser = this.authService.getUser();
    const shouldSubmitInventory = this.isChecklistFullyComplete(inventoryChecklistJson);
    this.isSaving = true;
    const persistInventory = (documentPath: string | null): void => {
      if (this.activeInventory) {
        const updatePayload: InventoryRequest = {
          inventoryId: this.activeInventory.inventoryId,
          organizationId: this.activeInventory.organizationId,
          officeId: this.activeInventory.officeId,
          propertyId: this.activeInventory.propertyId,
          maintenanceId: this.activeInventory.maintenanceId,
          inventoryCheckList: inventoryChecklistJson,
          documentPath: documentPath ?? this.activeInventory.documentPath ?? null,
          isActive: shouldSubmitInventory ? false : this.activeInventory.isActive
        };
        this.inventoryService.updateInventory(updatePayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
          next: (savedInventory: InventoryResponse) => {
            this.activeInventory = savedInventory;
            this.inventoryChecklistJson = savedInventory.inventoryCheckList ?? inventoryChecklistJson;
            this.utilityService.addLoadItem(this.itemsToLoad$, 'inventory');
            this.loadInventoryAnswers();
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
          }
        });
        return;
      }

      const createPayload: InventoryRequest = {
        organizationId: currentUser?.organizationId || this.property?.organizationId || '',
        officeId: this.property.officeId,
        propertyId: this.property.propertyId,
        maintenanceId: this.maintenanceRecord?.maintenanceId || '',
        inventoryCheckList: inventoryChecklistJson,
        documentPath,
        isActive: shouldSubmitInventory ? false : true
      };
      this.inventoryService.createInventory(createPayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
        next: (savedInventory: InventoryResponse) => {
          this.activeInventory = savedInventory;
          this.inventoryChecklistJson = savedInventory.inventoryCheckList ?? inventoryChecklistJson;
          this.utilityService.addLoadItem(this.itemsToLoad$, 'inventory');
          this.loadInventoryAnswers();
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
        }
      });
    };

    if (!shouldSubmitInventory) {
      persistInventory(null);
      return;
    }

    const inventoryDto = this.buildChecklistGenerateDto(
      inventoryChecklistJson,
      currentUser?.organizationId || this.property.organizationId || '',
      this.property.officeId,
      this.property.propertyId,
      `inventory-checklist-${this.property.propertyCode || this.property.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`,
      'Inventory Checklist',
      DocumentType.InventoryPhoto
    );
    if (!inventoryDto) {
      this.isSaving = false;
      this.isServiceError = true;
      return;
    }

    this.documentService.generate(inventoryDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        persistInventory(documentResponse.documentPath || null);
      },
      error: (_err: HttpErrorResponse) => {
        this.isSaving = false;
        this.isServiceError = true;
      }
    });
  }

  saveInspectionAnswers(inspectionChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const currentUser = this.authService.getUser();
    const shouldSubmitInspection = this.isChecklistFullyComplete(inspectionChecklistJson);
    this.isSaving = true;
    const persistInspection = (documentPath: string | null): void => {
      if (this.activeInspection) {
        const updatePayload: InspectionRequest = {
          inspectionId: this.activeInspection.inspectionId,
          organizationId: this.activeInspection.organizationId,
          officeId: this.activeInspection.officeId,
          propertyId: this.activeInspection.propertyId,
          maintenanceId: this.activeInspection.maintenanceId,
          inspectionCheckList: inspectionChecklistJson,
          documentPath: documentPath ?? this.activeInspection.documentPath ?? null,
          isActive: shouldSubmitInspection ? false : this.activeInspection.isActive
        };
        this.inspectionService.updateInspection(updatePayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
          next: (savedInspectionResponse: InspectionResponse) => {
            const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
            this.activeInspection = savedInspection;
            this.inspectionAnswers = savedInspection.inspectionCheckList ?? inspectionChecklistJson;
            if (shouldSubmitInspection) {
              this.back();
              return;
            }
            this.utilityService.addLoadItem(this.itemsToLoad$, 'inspection');
            this.loadInspectionAnswers();
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
          }
        });
        return;
      }

      const createPayload: InspectionRequest = {
        organizationId: currentUser?.organizationId || this.property?.organizationId || '',
        officeId: this.property.officeId,
        propertyId: this.property.propertyId,
        maintenanceId: this.maintenanceRecord?.maintenanceId || '',
        inspectionCheckList: inspectionChecklistJson,
        documentPath,
        isActive: shouldSubmitInspection ? false : true
      };
      this.inspectionService.createInspection(createPayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
        next: (savedInspectionResponse: InspectionResponse) => {
          const savedInspection = this.mappingService.mapInspection(savedInspectionResponse);
          this.activeInspection = savedInspection;
          this.inspectionAnswers = savedInspection.inspectionCheckList ?? inspectionChecklistJson;
          if (shouldSubmitInspection) {
            this.back();
            return;
          }
          this.utilityService.addLoadItem(this.itemsToLoad$, 'inspection');
          this.loadInspectionAnswers();
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
        }
      });
    };

    if (!shouldSubmitInspection) {
      persistInspection(null);
      return;
    }

    const inspectionDto = this.buildChecklistGenerateDto(
      inspectionChecklistJson,
      currentUser?.organizationId || this.property.organizationId || '',
      this.property.officeId,
      this.property.propertyId,
      `inspection-checklist-${this.property.propertyCode || this.property.propertyId}-${new Date().toISOString().slice(0, 10)}.pdf`,
      'Inspection Checklist',
      DocumentType.InspectionPhoto
    );
    if (!inspectionDto) {
      this.isSaving = false;
      this.isServiceError = true;
      return;
    }

    this.documentService.generate(inspectionDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        persistInspection(documentResponse.documentPath || null);
      },
      error: (_err: HttpErrorResponse) => {
        this.isSaving = false;
        this.isServiceError = true;
      }
    });
  }
  //#endregion

  // #region Data Load Functions
  loadProperty(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (property: PropertyResponse) => {
        this.property = property;
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  loadMaintenance(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      return;
    }

    this.maintenanceService.getByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance'); })).subscribe({
      next: (maintenance: MaintenanceResponse | null) => {
        this.maintenanceRecord = maintenance;
        this.isNewMaintenanceRecord = maintenance === null;
        this.inspectionChecklistJson = maintenance?.inspectionCheckList ?? this.buildDefaultChecklistJson(INSPECTION_SECTIONS, false);
        this.inventoryChecklistJson = maintenance?.inventoryCheckList ?? this.buildDefaultChecklistJson(INVENTORY_SECTIONS, true);
      },
      error: (_err: HttpErrorResponse) => {
        this.maintenanceRecord = null;
        this.isNewMaintenanceRecord = false;
        this.inspectionChecklistJson = this.buildDefaultChecklistJson(INSPECTION_SECTIONS, false);
        this.inventoryChecklistJson = this.buildDefaultChecklistJson(INVENTORY_SECTIONS, true);
      }
    });
  }

  loadInspectionAnswers(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
      return;
    }

    this.inspectionService.getInspectionByPropertyId(this.propertyId).pipe(take(1)).subscribe({
      next: (inspections: InspectionResponse[]) => {
        this.inspectionRecords = this.mappingService.mapInspections(inspections || []);
        const latestInspection = this.getLatestInspectionRecord(this.inspectionRecords);
        if (!latestInspection) {
          this.activeInspection = null;
          this.inspectionAnswers = null;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
          return;
        }

        this.inspectionService.getInspectionById(latestInspection.inspectionId).pipe(
          take(1),
          finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection'); })
        ).subscribe({
          next: (inspectionResponse: InspectionResponse) => {
            const inspection = this.mappingService.mapInspection(inspectionResponse);
            this.activeInspection = inspection;
            this.inspectionAnswers = inspection.inspectionCheckList ?? null;
          },
          error: (_err: HttpErrorResponse) => {
            this.activeInspection = null;
            this.inspectionAnswers = null;
            this.isServiceError = true;
          }
        });
      },
      error: (_err: HttpErrorResponse) => {
        this.inspectionRecords = [];
        this.activeInspection = null;
        this.inspectionAnswers = null;
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
      }
    });
  }

  loadInventoryAnswers(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      return;
    }

    this.inventoryService.getInventoryByProperty(this.propertyId).pipe(take(1)).subscribe({
      next: (inventories: InventoryResponse[]) => {
        this.inventoryRecords = inventories || [];
        const latestInventory = this.getLatestInventoryRecord(this.inventoryRecords);
        if (!latestInventory) {
          this.activeInventory = null;
          this.inventoryAnswers = null;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
          return;
        }

        this.inventoryService.getInventoryById(latestInventory.inventoryId).pipe(
          take(1),
          finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory'); })
        ).subscribe({
          next: (inventory: InventoryResponse) => {
            this.activeInventory = inventory;
            this.inventoryAnswers = inventory.inventoryCheckList ?? null;
          },
          error: (_err: HttpErrorResponse) => {
            this.activeInventory = null;
            this.inventoryAnswers = null;
            this.isServiceError = true;
          }
        });
      },
      error: (_err: HttpErrorResponse) => {
        this.inventoryRecords = [];
        this.activeInventory = null;
        this.inventoryAnswers = null;
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      }
    });
  }

  loadWorkOrders(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
      return;
    }

    this.workOrderService.getWorkOrdersByPropertyId(this.propertyId).pipe(
      take(1),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder'); })
    ).subscribe({
      next: (workOrders: WorkOrderResponse[]) => {
        this.workOrderRecords = workOrders || [];
      },
      error: (_err: HttpErrorResponse) => {
        this.workOrderRecords = [];
        this.isServiceError = true;
      }
    });
  }
  // #endregion

  getLatestInspectionRecord(inspections: InspectionResponse[]): InspectionResponse | null {
    const activeInspections = inspections.filter(inspection => inspection.isActive === true);
    if (activeInspections.length === 0) {
      return null;
    }

    return activeInspections.reduce((latest, current) => {
      const latestTimestamp = Date.parse(latest.modifiedOn || '');
      const currentTimestamp = Date.parse(current.modifiedOn || '');

      if (Number.isNaN(currentTimestamp)) {
        return latest;
      }
      if (Number.isNaN(latestTimestamp)) {
        return current;
      }

      return currentTimestamp > latestTimestamp ? current : latest;
    });
  }

  getLatestInventoryRecord(inventories: InventoryResponse[]): InventoryResponse | null {
    const activeInventories = inventories.filter(inventory => inventory.isActive === true);
    if (activeInventories.length === 0) {
      return null;
    }

    return activeInventories.reduce((latest, current) => {
      const latestTimestamp = Date.parse(latest.modifiedOn || '');
      const currentTimestamp = Date.parse(current.modifiedOn || '');

      if (Number.isNaN(currentTimestamp)) {
        return latest;
      }
      if (Number.isNaN(latestTimestamp)) {
        return current;
      }

      return currentTimestamp > latestTimestamp ? current : latest;
    });
  }

  isChecklistFullyComplete(checklistJson: string): boolean {
    try {
      const root = JSON.parse(checklistJson) as { sections?: Array<{ sets?: Array<Array<{ checked?: boolean } | boolean>> }> };
      const sections = Array.isArray(root.sections) ? root.sections : [];
      if (sections.length === 0) {
        return false;
      }

      return sections.every(section =>
        Array.isArray(section.sets)
        && section.sets.every(set =>
          Array.isArray(set)
          && set.every(item => {
            if (typeof item === 'boolean') {
              return item === true;
            }

            return item?.checked === true;
          })
        )
      );
    } catch {
      return false;
    }
  }

  buildChecklistGenerateDto(
    checklistJson: string,
    organizationId: string,
    officeId: number,
    propertyId: string,
    fileName: string,
    checklistTitle: string,
    documentType: DocumentType
  ): GenerateDocumentFromHtmlDto | null {
    if (!this.property) {
      return null;
    }

    const htmlContent = this.buildChecklistPdfHtml(checklistJson, checklistTitle);
    if (!htmlContent) {
      return null;
    }

    return {
      htmlContent,
      organizationId,
      officeId,
      officeName: this.property.officeName || this.maintenanceRecord?.officeName || '',
      propertyId,
      reservationId: null,
      documentTypeId: documentType,
      fileName
    };
  }

  buildChecklistPdfHtml(checklistJson: string, checklistTitle: string): string | null {
    try {
      const root = JSON.parse(checklistJson) as { sections?: Array<{ title?: string; key?: string; notes?: string; sets?: Array<Array<{ text?: string; checked?: boolean; url?: string | null }>> }> };
      const sections = Array.isArray(root.sections) ? root.sections : [];
      if (sections.length === 0) {
        return null;
      }

      const sectionHtml = sections.map(section => {
        const sectionTitle = this.escapeHtml(section.title || section.key || 'Section');
        const sets = Array.isArray(section.sets) ? section.sets : [];
        const setHtml = sets.map((set, setIndex) => {
          const rows = Array.isArray(set) ? set : [];
          const rowHtml = rows.map(item => {
            const label = this.escapeHtml(item?.text || '');
            const checked = item?.checked === true ? '☑' : '☐';
            const imageHtml = item?.url
              ? `<div class="photo-wrap"><img src="${item.url}" alt="Line item photo" /></div>`
              : '';
            return `<li><span class="check">${checked}</span> <span>${label}</span>${imageHtml}</li>`;
          }).join('');

          return `<div class="set-wrap"><h4>Set ${setIndex + 1}</h4><ul>${rowHtml}</ul></div>`;
        }).join('');

        const notesHtml = section.notes ? `<p><strong>Comments:</strong> ${this.escapeHtml(section.notes)}</p>` : '';
        return `<section><h3>${sectionTitle}</h3>${setHtml}${notesHtml}</section>`;
      }).join('');

      const propertyName = this.escapeHtml(this.property?.propertyCode || this.property?.propertyId || 'Property');
      const documentTitle = this.escapeHtml(checklistTitle);
      return `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
              h1 { font-size: 20px; margin-bottom: 8px; }
              h3 { font-size: 15px; margin: 16px 0 8px 0; }
              h4 { font-size: 13px; margin: 10px 0 6px 0; }
              ul { padding-left: 16px; margin: 0; }
              li { margin-bottom: 8px; }
              .check { font-weight: 700; margin-right: 6px; }
              .photo-wrap { margin-top: 6px; }
              img { max-width: 320px; max-height: 240px; object-fit: contain; border: 1px solid #ddd; }
              .set-wrap { margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <h1>${documentTitle} - ${propertyName}</h1>
            ${sectionHtml}
          </body>
        </html>
      `;
    } catch {
      return null;
    }
  }

  escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  buildDefaultChecklistJson(sections: ChecklistSection[], defaultIsEditable: boolean): string {
    return JSON.stringify({
      sections: sections.map(section => ({
        key: section.key,
        title: section.title,
        notes: '',
        sets: [
          section.items.map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            isEditable: defaultIsEditable,
            url: null
          }))
        ]
      }))
    });
  }

  //#region Utility Methods
  onTabChange(event: { index: number }): void {
    this.selectedTabIndex = event.index;
  }

  openInspectionHistoryDetail(event: InspectionDisplayList): void {
    this.selectedInspectionHistoryId = event.inspectionId;
    this.selectedInspectionHistoryMaintenanceId = event.maintenanceId || null;
  }

  openInventoryHistoryDetail(event: InventoryDisplayList): void {
    this.selectedInventoryHistoryId = event.inventoryId;
    this.selectedInventoryHistoryMaintenanceId = event.maintenanceId || null;
  }

  closeInspectionHistoryDetail(): void {
    this.selectedInspectionHistoryId = null;
    this.selectedInspectionHistoryMaintenanceId = null;
  }

  closeInventoryHistoryDetail(): void {
    this.selectedInventoryHistoryId = null;
    this.selectedInventoryHistoryMaintenanceId = null;
  }

  addWorkOrder(): void {
    this.isCreatingWorkOrder = true;
    this.selectedWorkOrderId = null;
  }

  openWorkOrderDetail(event: WorkOrderDisplayList): void {
    this.isCreatingWorkOrder = false;
    this.selectedWorkOrderId = event.workOrderId;
  }

  closeWorkOrderDetail(): void {
    this.isCreatingWorkOrder = false;
    this.selectedWorkOrderId = null;
  }

  deleteWorkOrder(event: WorkOrderDisplayList): void {
    this.workOrderService.deleteWorkOrder(event.workOrderId).pipe(take(1)).subscribe({
      next: () => {
        if (this.selectedWorkOrderId === event.workOrderId) {
          this.selectedWorkOrderId = null;
          this.isCreatingWorkOrder = false;
        }
        this.utilityService.addLoadItem(this.itemsToLoad$, 'workOrder');
        this.loadWorkOrders();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  onWorkOrderSaved(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'workOrder');
    this.loadWorkOrders();
    this.isCreatingWorkOrder = false;
    this.selectedWorkOrderId = null;
  }

  deleteInspectionHistory(event: InspectionDisplayList): void {
    this.inspectionService.deleteInspection(event.inspectionId).pipe(take(1)).subscribe({
      next: () => {
        if (this.selectedInspectionHistoryId === event.inspectionId) {
          this.selectedInspectionHistoryId = null;
        }
        this.utilityService.addLoadItem(this.itemsToLoad$, 'inspection');
        this.loadInspectionAnswers();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  deleteInventoryHistory(event: InventoryDisplayList): void {
    this.inventoryService.deleteInventory(event.inventoryId).pipe(take(1)).subscribe({
      next: () => {
        if (this.selectedInventoryHistoryId === event.inventoryId) {
          this.selectedInventoryHistoryId = null;
        }
        this.utilityService.addLoadItem(this.itemsToLoad$, 'inventory');
        this.loadInventoryAnswers();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }
  
  back(): void {
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }
  //#endregion
}
