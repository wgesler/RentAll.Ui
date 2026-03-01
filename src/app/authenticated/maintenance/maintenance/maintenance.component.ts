import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, finalize, map, Observable, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { InventoryComponent } from '../inventory/inventory.component';
import { InventoryListComponent } from '../inventory-list/inventory-list.component';
import { InspectionChecklistComponent } from '../inspection-checklist/inspection-checklist.component';
import { InventoryResponse } from '../models/inventory.model';
import { InspectionResponse } from '../models/inspection.model';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { InspectionService } from '../services/inspection.service';
import { InventoryService } from '../services/inventory.service';
import { MaintenanceService } from '../services/maintenance.service';

@Component({
  selector: 'app-maintenance',
  imports: [CommonModule, MaterialModule, InventoryListComponent, InspectionChecklistComponent, InventoryComponent],
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
  activeInspection: InspectionResponse | null = null;
  activeInventory: InventoryResponse | null = null;
  maintenanceRecord: MaintenanceResponse | null = null;
  selectedTabIndex: number = 0;
  isSaving: boolean = false;
  isServiceError: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'maintenance', 'inspection', 'inventory']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    router: Router,
    route: ActivatedRoute,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    inspectionService: InspectionService,
    inventoryService: InventoryService,
    authService: AuthService,
    utilityService: UtilityService
  ) {
    this.router = router;
    this.route = route;
    this.propertyService = propertyService;
    this.maintenanceService = maintenanceService;
    this.inspectionService = inspectionService;
    this.inventoryService = inventoryService;
    this.authService = authService;
    this.utilityService = utilityService;
    this.propertyId = this.route.snapshot.paramMap.get('id');
  }

  router: Router;
  route: ActivatedRoute;
  propertyService: PropertyService;
  maintenanceService: MaintenanceService;
  inspectionService: InspectionService;
  inventoryService: InventoryService;
  authService: AuthService;
  utilityService: UtilityService;

  //#region Maintenance
  ngOnInit(): void {
    if (!this.propertyId || this.propertyId === 'new') {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      return;
    }

    this.loadProperty();
    this.loadMaintenance();
    this.loadInspectionAnswers();
    this.loadInventoryAnswers();
  }

  saveMaintenanceTemplate(inspectionChecklistJson: string): void {
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
      inventoryCheckList: inspectionChecklistJson,
      notes: this.maintenanceRecord?.notes || null,
      isActive: this.maintenanceRecord?.isActive ?? true
    };

    if (this.maintenanceRecord?.maintenanceId) {
      this.isSaving = true;
      this.maintenanceService.updateMaintenance(payload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
        next: (saved: MaintenanceResponse) => {
          this.maintenanceRecord = saved;
          this.inspectionChecklistJson = inspectionChecklistJson;
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
    this.isSaving = true;
    if (this.activeInventory) {
      const updatePayload: InventoryResponse = {
        ...this.activeInventory,
        inventoryCheckList: inventoryChecklistJson
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

    const nowIso = new Date().toISOString();
    const createPayload: InventoryResponse = {
      inventoryId: 0,
      organizationId: currentUser?.organizationId || this.property?.organizationId || '',
      officeId: this.property.officeId,
      propertyId: this.property.propertyId,
      maintenanceId: this.maintenanceRecord?.maintenanceId || '',
      inventoryCheckList: inventoryChecklistJson,
      isActive: true,
      createdOn: nowIso,
      createdBy: currentUser?.userId || '',
      modifiedOn: nowIso,
      modifiedBy: currentUser?.userId || ''
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
  }

  saveInspectionAnswers(inspectionChecklistJson: string): void {
    if (!this.property) {
      return;
    }

    const currentUser = this.authService.getUser();
    this.isSaving = true;
    if (this.activeInspection) {
      const updatePayload: InspectionResponse = {
        ...this.activeInspection,
        inspectionCheckList: inspectionChecklistJson
      };
      this.inspectionService.updateInspection(updatePayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
        next: (savedInspection: InspectionResponse) => {
          this.activeInspection = savedInspection;
          this.inspectionAnswers = savedInspection.inspectionCheckList ?? inspectionChecklistJson;
          this.utilityService.addLoadItem(this.itemsToLoad$, 'inspection');
          this.loadInspectionAnswers();
        },
        error: (_err: HttpErrorResponse) => {
          this.isServiceError = true;
        }
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const createPayload: InspectionResponse = {
      inspectionId: 0,
      organizationId: currentUser?.organizationId || this.property?.organizationId || '',
      officeId: this.property.officeId,
      propertyId: this.property.propertyId,
      maintenanceId: this.maintenanceRecord?.maintenanceId || '',
      inspectionCheckList: inspectionChecklistJson,
      isActive: true,
      createdOn: nowIso,
      createdBy: currentUser?.userId || '',
      modifiedOn: nowIso,
      modifiedBy: currentUser?.userId || ''
    };
    this.inspectionService.createInspection(createPayload).pipe(take(1), finalize(() => (this.isSaving = false))).subscribe({
      next: (savedInspection: InspectionResponse) => {
        this.activeInspection = savedInspection;
        this.inspectionAnswers = savedInspection.inspectionCheckList ?? inspectionChecklistJson;
        this.utilityService.addLoadItem(this.itemsToLoad$, 'inspection');
        this.loadInspectionAnswers();
      },
      error: (_err: HttpErrorResponse) => {
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
        this.inspectionChecklistJson = maintenance.inspectionCheckList;
        this.inventoryChecklistJson = maintenance.inventoryCheckList;
      },
      error: (_err: HttpErrorResponse) => {
        this.maintenanceRecord = null;
        this.inspectionChecklistJson = null;
        this.inventoryChecklistJson = null;
      }
    });
  }

  loadInspectionAnswers(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection');
      return;
    }

    this.inspectionService.getInspectionByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspection'); })).subscribe({
      next: (inspections: InspectionResponse[]) => {
        const records = inspections || [];
        this.activeInspection = records.find(inspection => inspection.isActive === true) || records[0] || null;
        this.inspectionAnswers = this.activeInspection?.inspectionCheckList ?? null;
      },
      error: (_err: HttpErrorResponse) => {
        this.activeInspection = null;
        this.inspectionAnswers = null;
      }
    });
  }

  loadInventoryAnswers(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      return;
    }

    this.inventoryService.getInventoryByProperty(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory'); })).subscribe({
      next: (inventories: InventoryResponse[]) => {
        const records = inventories || [];
        this.activeInventory = records.find(inventory => this.isInventoryActive(inventory)) || records[0] || null;
        this.inventoryAnswers = this.activeInventory?.inventoryCheckList ?? null;
      },
      error: (_err: HttpErrorResponse) => {
        this.activeInventory = null;
        this.inventoryAnswers = null;
      }
    });
  }
  // #endregion

  isInventoryActive(inventory: InventoryResponse): boolean {
    return inventory.isActive === true;
  }

  //#region Utility Methods
  onTabChange(event: { index: number }): void {
    this.selectedTabIndex = event.index;
  }
  
  back(): void {
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }
  //#endregion
}
