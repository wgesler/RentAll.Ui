import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { InventoryDisplayList, InventoryResponse } from '../models/inventory.model';
import { InventoryService } from '../services/inventory.service';

@Component({
  selector: 'app-inventory-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './inventory-list.component.html',
  styleUrl: './inventory-list.component.scss'
})
export class InventoryListComponent implements OnChanges {
  @Input() property: PropertyResponse | null = null;
  @Output() addInventoryEvent = new EventEmitter<void>();

  inventories: InventoryResponse[] = [];
  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInventoriesDisplay: InventoryDisplayList[] = [];
  inventoriesDisplay: InventoryDisplayList[] = [];
  lastPropertyId: string | null = null;
  inventoryDisplayedColumns: ColumnSet = {
    inventoryId: { displayAs: 'Inventory', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    officeCode: { displayAs: 'Office', wrap: false, maxWidth: '10ch', alignment: 'right', headerAlignment: 'right' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '36ch' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '24ch' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '36ch' },
    isActive: { displayAs: 'Active', wrap: false, maxWidth: '8ch' }
  };

  constructor(inventoryService: InventoryService, mappingService: MappingService, router: Router) {
    this.inventoryService = inventoryService;
    this.mappingService = mappingService;
    this.router = router;
  }

  inventoryService: InventoryService;
  mappingService: MappingService;
  router: Router;

  //#region Inventory-List
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (!propertyId) {
        this.lastPropertyId = null;
        this.inventories = [];
        this.allInventoriesDisplay = [];
        this.inventoriesDisplay = [];
        return;
      }

      if (this.lastPropertyId !== propertyId) {
        this.lastPropertyId = propertyId;
        this.getInventories(propertyId);
      }
    }
  }
  
  getInventories(propertyId: string): void {
    this.isServiceError = false;
    this.isLoading = true;

    this.inventoryService.getInventoriesByPropertyId(propertyId).pipe(take(1),finalize(() => (this.isLoading = false))).subscribe({
        next: (inventories: InventoryResponse[]) => {
          this.inventories = inventories || [];
          this.allInventoriesDisplay = this.mappingService.mapInventories(this.inventories);
          this.applyFilters();
        },
        error: () => {
          this.isServiceError = true;
          this.inventories = [];
          this.allInventoriesDisplay = [];
          this.inventoriesDisplay = [];
        }
      });
  }
  
  addInventory(): void {
    this.addInventoryEvent.emit();
  }

  deleteInventory(): void {
    this.addInventoryEvent.emit();
  }

  goToInventory(event: InventoryDisplayList): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Inventory, [String(event.inventoryId)]));
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    if (this.showInactive) {
      this.inventoriesDisplay = [...this.allInventoriesDisplay];
      return;
    }

    this.inventoriesDisplay = this.allInventoriesDisplay.filter(inventory => inventory.isActive);
  }
  //#endregion
}
