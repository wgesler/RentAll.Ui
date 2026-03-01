import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, finalize, map, Observable, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { InspectionChecklistComponent } from '../inspection-checklist/inspection-checklist.component';
import { InventoryResponse } from '../models/inventory.model';
import { InventoryService } from '../services/inventory.service';

@Component({
  selector: 'app-inventory',
  imports: [CommonModule, MaterialModule, InspectionChecklistComponent],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss'
})
export class InventoryComponent implements OnInit, OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Input() checklistJson: string | null = null;

  organizationId: string = '';
  inventoryId: number | null = null;
  inventory: InventoryResponse | null = null;
  inventoryChecklistJson: string | null = null;
  propertyId: string | null = null;
  hasRequestedInventoryLoad: boolean = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['inventory', 'property']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  isServiceError: boolean = false;

  constructor(
    route: ActivatedRoute,
    router: Router,
    inventoryService: InventoryService,
    authService: AuthService,
    propertyService: PropertyService,
    utilityService: UtilityService
  ) {
    this.route = route;
    this.router = router;
    this.inventoryService = inventoryService;
    this.authService = authService;
    this.propertyService = propertyService;
    this.utilityService = utilityService;
  }

  route: ActivatedRoute;
  router: Router;
  inventoryService: InventoryService;
  authService: AuthService;
  propertyService: PropertyService;
  utilityService: UtilityService;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      const nextPropertyId = this.property?.propertyId || null;
      if (nextPropertyId) {
        this.propertyId = nextPropertyId;
        this.itemsToLoad$.next(new Set(['inventory']));
        this.hasRequestedInventoryLoad = false;
        this.loadInventoryByPropertyId(nextPropertyId);
      }
    }

    if (changes['checklistJson'] && !this.inventory?.inventoryCheckList) {
      this.inventoryChecklistJson = this.checklistJson;
    }
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    if (!this.organizationId) {
      this.isServiceError = true;
      this.itemsToLoad$.next(new Set());
      return;
    }

    if (this.property?.propertyId) {
      this.propertyId = this.property.propertyId;
      if (!this.hasRequestedInventoryLoad) {
        this.itemsToLoad$.next(new Set(['inventory']));
        this.loadInventoryByPropertyId(this.property.propertyId);
      }
      return;
    }

    const routeId = this.route.snapshot.paramMap.get('id');
    const parsedId = routeId ? Number(routeId) : NaN;
    if (Number.isNaN(parsedId) || parsedId <= 0) {
      this.isServiceError = true;
      this.itemsToLoad$.next(new Set());
      return;
    }

    this.inventoryId = parsedId;
    this.loadInventoryById();
  }

  // #region Data Load Functions
  loadInventoryById(): void {
    this.hasRequestedInventoryLoad = true;
    if (!this.inventoryId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.inventoryService.getInventory(this.organizationId, this.inventoryId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory'); })).subscribe({
      next: (inventory: InventoryResponse) => {
        this.inventory = inventory;
        this.inventoryChecklistJson = inventory.inventoryCheckList || this.checklistJson;
        this.propertyId = inventory.propertyId;
        this.loadPropertyById();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.inventory = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }

  loadInventoryByPropertyId(propertyId: string): void {
    this.hasRequestedInventoryLoad = true;
    this.inventoryService.getInventoriesByPropertyId(propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inventory'); })).subscribe({
      next: (inventories: InventoryResponse[]) => {
        const records = inventories || [];
        this.inventory = records.find(record => record.isActive) || records[0] || null;
        this.inventoryId = this.inventory?.inventoryId || null;
        this.inventoryChecklistJson = this.inventory?.inventoryCheckList || this.checklistJson;
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.inventory = null;
      }
    });

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
  }

  loadPropertyById(): void {
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
  //#endregion

  get hasParentPropertyInput(): boolean {
    return !!this.property?.propertyId;
  }

  back(): void {
    if (this.hasParentPropertyInput) {
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }
}
