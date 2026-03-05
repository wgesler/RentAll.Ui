import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { finalize, switchMap, take, tap } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ChecklistReadonlyDialogComponent } from '../checklist-readonly-dialog/checklist-readonly-dialog.component';
import { ChecklistReadonlyDialogData } from '../checklist-readonly-dialog/checklist-readonly-dialog-data';
import { InspectionDisplayList, InspectionResponse } from '../models/inspection.model';
import { InventoryDisplayList, InventoryResponse } from '../models/inventory.model';
import { MaintenanceService } from '../services/maintenance.service';
import { InspectionService } from '../services/inspection.service';
import { InventoryService } from '../services/inventory.service';

@Component({
  standalone: true,
  selector: 'app-history',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss'
})
export class HistoryComponent implements OnChanges {
  @Input() property: PropertyResponse | null = null;

  inspections: InspectionResponse[] = [];
  inspectionsDisplay: InspectionDisplayList[] = [];
  isLoadingInspections = false;
  isServiceErrorInspections = false;

  inventories: InventoryResponse[] = [];
  inventoriesDisplay: InventoryDisplayList[] = [];
  isLoadingInventories = false;
  isServiceErrorInventories = false;

  inspectionDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Code', wrap: false, maxWidth: '20ch' },
    modifiedOn: { displayAs: 'Inspected On', wrap: false, maxWidth: '30ch' },
    modifiedBy: { displayAs: 'Inspected By', wrap: false, maxWidth: '25ch' },
  };

  inventoryDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '20ch' },
    modifiedOn: { displayAs: 'Inventoried On', wrap: false, maxWidth: '30ch' },
    modifiedBy: { displayAs: 'Inventoried By', wrap: false, maxWidth: '25ch' },
  };

  constructor(
    private inspectionService: InspectionService,
    private inventoryService: InventoryService,
    private maintenanceService: MaintenanceService,
    private mappingService: MappingService,
    private authService: AuthService,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      const propertyId = this.property?.propertyId ?? null;
      if (propertyId) {
        this.loadInspections(propertyId);
        this.loadInventories(propertyId);
      } else {
        this.inspections = [];
        this.inspectionsDisplay = [];
        this.inventories = [];
        this.inventoriesDisplay = [];
      }
    }
  }

  loadInspections(propertyId: string): void {
    this.isServiceErrorInspections = false;
    this.isLoadingInspections = true;
    this.inspectionService.getInspectionsByPropertyId(propertyId).pipe(
      take(1),
      finalize(() => this.isLoadingInspections = false)
    ).subscribe({
      next: (list) => {
        this.inspections = list ?? [];
        this.inspectionsDisplay = this.mappingService.mapInspectionDisplays(this.inspections);
      },
      error: () => {
        this.isServiceErrorInspections = true;
        this.inspections = [];
        this.inspectionsDisplay = [];
      }
    });
  }

  loadInventories(propertyId: string): void {
    this.isServiceErrorInventories = false;
    this.isLoadingInventories = true;
    this.inventoryService.getInventoriesByPropertyId(propertyId).pipe(
      take(1),
      finalize(() => this.isLoadingInventories = false)
    ).subscribe({
      next: (list) => {
        this.inventories = list ?? [];
        this.inventoriesDisplay = this.mappingService.mapInventories(this.inventories);
      },
      error: () => {
        this.isServiceErrorInventories = true;
        this.inventories = [];
        this.inventoriesDisplay = [];
      }
    });
  }

  onInspectionRowClick(event: InspectionDisplayList): void {
    this.inspectionService.getInspectionById(event.inspectionId).pipe(
      take(1),
      switchMap((inspection) =>
        this.maintenanceService.getMaintenanceByGuid(inspection.maintenanceId).pipe(
          take(1),
          tap((maintenance) => {
            const data: ChecklistReadonlyDialogData = {
              title: 'Inspection Checklist',
              property: this.property,
              templateJson: maintenance?.inspectionCheckList ?? null,
              answersJson: inspection.inspectionCheckList ?? null,
              checklistType: 'inspection'
            };
            this.dialog.open(ChecklistReadonlyDialogComponent, {
              data,
              width: '90vw',
              maxWidth: '900px',
              maxHeight: '90vh'
            });
          })
        )
      )
    ).subscribe({ error: () => {} });
  }

  onInventoryRowClick(event: InventoryDisplayList): void {
    const orgId = this.authService.getUser()?.organizationId ?? '';
    if (!orgId) return;
    this.inventoryService.getInventory(orgId, event.inventoryId).pipe(
      take(1),
      switchMap((inventory) =>
        this.maintenanceService.getMaintenanceByGuid(inventory.maintenanceId).pipe(
          take(1),
          tap((maintenance) => {
            const data: ChecklistReadonlyDialogData = {
              title: 'Inventory Checklist',
              property: this.property,
              templateJson: maintenance?.inventoryCheckList ?? null,
              answersJson: inventory.inventoryCheckList ?? null,
              checklistType: 'inventory'
            };
            this.dialog.open(ChecklistReadonlyDialogComponent, {
              data,
              width: '90vw',
              maxWidth: '900px',
              maxHeight: '90vh'
            });
          })
        )
      )
    ).subscribe({ error: () => {} });
  }
}
