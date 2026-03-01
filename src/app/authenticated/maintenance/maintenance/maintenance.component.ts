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
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
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
  activeInventory: InventoryResponse | null = null;
  maintenanceRecord: MaintenanceResponse | null = null;
  selectedTabIndex: number = 0;
  isSaving: boolean = false;
  isServiceError: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'maintenance', 'inventory']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    router: Router,
    route: ActivatedRoute,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    inventoryService: InventoryService,
    authService: AuthService,
    utilityService: UtilityService
  ) {
    this.router = router;
    this.route = route;
    this.propertyService = propertyService;
    this.maintenanceService = maintenanceService;
    this.inventoryService = inventoryService;
    this.authService = authService;
    this.utilityService = utilityService;
    this.propertyId = this.route.snapshot.paramMap.get('id');
  }

  router: Router;
  route: ActivatedRoute;
  propertyService: PropertyService;
  maintenanceService: MaintenanceService;
  inventoryService: InventoryService;
  authService: AuthService;
  utilityService: UtilityService;

  //#region Maintenance
  ngOnInit(): void {
    if (!this.propertyId || this.propertyId === 'new') {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      return;
    }

    this.loadProperty();
    this.loadMaintenance();
    this.loadInventory();
  }

  extractInspectionChecklistJson(maintenance: MaintenanceResponse | null): string | null {
    if (!maintenance) {
      return null;
    }

    if (typeof maintenance.inspectionCheckList === 'string' && maintenance.inspectionCheckList.trim().length > 0) {
      return maintenance.inspectionCheckList;
    }

    const maintenanceObject = maintenance as unknown as Record<string, unknown>;
    const directCandidates = [
      maintenanceObject['InspectionCheckList'],
      maintenanceObject['inspectionCheckList'],
      maintenanceObject['inspectionChecklist'],
      maintenanceObject['inspectionChecklistJson'],
      maintenanceObject['InspectionChecklistJson'],
      maintenanceObject['Notes'],
      maintenanceObject['notes']
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }

    if (typeof maintenance.notes === 'string' && maintenance.notes.trim().length > 0) {
      return maintenance.notes;
    }

    return null;
  }

  extractInventoryChecklistJson(maintenance: MaintenanceResponse | null): string | null {
    if (!maintenance) {
      return null;
    }

    if (typeof maintenance.inventoryCheckList === 'string' && maintenance.inventoryCheckList.trim().length > 0) {
      return maintenance.inventoryCheckList;
    }

    const maintenanceObject = maintenance as unknown as Record<string, unknown>;
    const directCandidates = [
      maintenanceObject['InventoryCheckList'],
      maintenanceObject['inventoryCheckList'],
      maintenanceObject['inventoryChecklist'],
      maintenanceObject['inventoryChecklistJson'],
      maintenanceObject['InventoryChecklistJson']
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return null;
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
          this.inventoryChecklistJson = this.extractInventoryChecklistFromInventory(savedInventory) || inventoryChecklistJson;
          this.utilityService.addLoadItem(this.itemsToLoad$, 'inventory');
          this.loadInventory();
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
        this.inventoryChecklistJson = this.extractInventoryChecklistFromInventory(savedInventory) || inventoryChecklistJson;
        this.utilityService.addLoadItem(this.itemsToLoad$, 'inventory');
        this.loadInventory();
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
        this.inspectionChecklistJson = this.extractInspectionChecklistJson(maintenance);
      },
      error: (_err: HttpErrorResponse) => {
        this.maintenanceRecord = null;
        this.inspectionChecklistJson = null;
      }
    });
  }

  loadInventory(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      return;
    }

    this.inventoryService.getInventoriesByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory'); })).subscribe({
      next: (inventories: InventoryResponse[]) => {
        const records = inventories || [];
        this.activeInventory = records.find(inventory => this.isInventoryActive(inventory)) || records[0] || null;
        this.inventoryChecklistJson = this.extractInventoryChecklistFromInventory(this.activeInventory);
      },
      error: (_err: HttpErrorResponse) => {
        this.activeInventory = null;
        this.inventoryChecklistJson = null;
      }
    });
  }
  // #endregion

  extractInventoryChecklistFromInventory(inventory: InventoryResponse | null): string | null {
    if (!inventory) {
      return null;
    }

    if (inventory.inventoryCheckList && typeof inventory.inventoryCheckList === 'object') {
      return JSON.stringify(inventory.inventoryCheckList);
    }

    if (typeof inventory.inventoryCheckList === 'string' && inventory.inventoryCheckList.trim().length > 0) {
      return inventory.inventoryCheckList;
    }

    const inventoryObject = inventory as unknown as Record<string, unknown>;
    const directCandidates = [
      inventoryObject['InventoryCheckList'],
      inventoryObject['inventoryCheckList'],
      inventoryObject['inventoryChecklist'],
      inventoryObject['inventoryChecklistJson'],
      inventoryObject['InventoryChecklistJson']
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
      if (candidate && typeof candidate === 'object') {
        return JSON.stringify(candidate);
      }
    }

    return null;
  }

  isInventoryActive(inventory: InventoryResponse): boolean {
    if (typeof inventory.isActive === 'boolean') {
      return inventory.isActive;
    }

    const inventoryObject = inventory as unknown as Record<string, unknown>;
    const directCandidates = [
      inventoryObject['IsActive'],
      inventoryObject['isActive']
    ];

    return directCandidates.some(candidate => candidate === true);
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
