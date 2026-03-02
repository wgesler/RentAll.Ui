import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { finalize, take } from 'rxjs';
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
  @Input() inventoriesInput: InventoryResponse[] | null = null;
  @Output() addInventoryEvent = new EventEmitter<void>();
  @Output() openChecklistEvent = new EventEmitter<InventoryDisplayList>();
  @Output() deleteChecklistEvent = new EventEmitter<InventoryDisplayList>();

  inventories: InventoryResponse[] = [];
  isLoading: boolean = false;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInventoriesDisplay: InventoryDisplayList[] = [];
  inventoriesDisplay: InventoryDisplayList[] = [];
  lastPropertyId: string | null = null;
  inventoryDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '20ch' },
    modifiedOn: { displayAs: 'Modified On', wrap: false, maxWidth: '20ch' },
    modifiedBy: { displayAs: 'Modified By', wrap: false, maxWidth: '25ch' },
  };

  constructor(inventoryService: InventoryService, mappingService: MappingService) {
    this.inventoryService = inventoryService;
    this.mappingService = mappingService;
  }

  inventoryService: InventoryService;
  mappingService: MappingService;

  //#region Inventory-List
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['inventoriesInput']) {
      this.inventories = this.inventoriesInput || [];
      this.allInventoriesDisplay = this.mappingService.mapInventories(this.inventories);
      this.applyFilters();
      return;
    }

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
    if (this.inventoriesInput !== null) {
      this.inventories = this.inventoriesInput || [];
      this.allInventoriesDisplay = this.mappingService.mapInventories(this.inventories);
      this.applyFilters();
      return;
    }

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

  goToInventory(event: InventoryDisplayList): void {
    this.openChecklistEvent.emit(event);
  }

  viewDocument(event: InventoryDisplayList): void {
    this.goToInventory(event);
  }

  deleteInventory(event: InventoryDisplayList): void {
    this.deleteChecklistEvent.emit(event);
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.inventoriesDisplay = [...this.allInventoriesDisplay];
  }
  //#endregion
}
