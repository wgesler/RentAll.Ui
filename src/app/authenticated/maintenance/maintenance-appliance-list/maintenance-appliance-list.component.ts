import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse } from '../../properties/models/property.model';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';

interface ApplianceEditRow {
  rowId: number;
  applianceId?: number;
  applianceName: string;
  manufacturer: string;
  modelNo: string;
  serialNo: string;
}

@Component({
  standalone: true,
  selector: 'app-maintenance-appliance-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './maintenance-appliance-list.component.html',
  styleUrl: './maintenance-appliance-list.component.scss'
})
export class MaintenanceApplianceListComponent implements OnChanges {
  @Input() appliances: ApplianceResponse[] = [];
  @Input() isLoading = false;
  @Input() isSaving = false;
  @Input() property: PropertyResponse | null = null;
  @Output() saveChanges = new EventEmitter<{ upserts: ApplianceRequest[]; deleteIds: number[] }>();
  @Output() deleteExisting = new EventEmitter<number>();

  rows: ApplianceEditRow[] = [];
  originalRowsById = new Map<number, { applianceName: string; manufacturer: string; modelNo: string; serialNo: string }>();
  rowCounter = 0;

  //#region Maintenance Appliance List
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['appliances']) {
      this.resetRowsFromInput();
    }
  }

  addRow(): void {
    this.rows = [
      ...this.rows,
      {
        rowId: ++this.rowCounter,
        applianceName: '',
        manufacturer: '',
        modelNo: '',
        serialNo: ''
      }
    ];
  }

  removeRow(row: ApplianceEditRow): void {
    if (row.applianceId != null) {
      this.deleteExisting.emit(row.applianceId);
      return;
    }
    this.rows = this.rows.filter(current => current.rowId !== row.rowId);
  }

  onSaveChanges(): void {
    const payload = this.buildSavePayload();
    if (!payload.hasChanges) {
      return;
    }
    this.saveChanges.emit({ upserts: payload.upserts, deleteIds: payload.deleteIds });
  }

  get canSave(): boolean {
    return this.buildSavePayload().hasChanges;
  }

  trackByRowId(_index: number, row: ApplianceEditRow): number {
    return row.rowId;
  }
  //#endregion

  //#region Utility Methods
  resetRowsFromInput(): void {
    this.originalRowsById.clear();
    this.rowCounter = 0;
    this.rows = (this.appliances || []).map(appliance => {
      const row: ApplianceEditRow = {
        rowId: ++this.rowCounter,
        applianceId: appliance.applianceId,
        applianceName: appliance.applianceName ?? '',
        manufacturer: appliance.manufacturer ?? '',
        modelNo: appliance.modelNo ?? '',
        serialNo: appliance.serialNo ?? ''
      };
      this.originalRowsById.set(appliance.applianceId, this.normalizeComparable(row));
      return row;
    });
  }

  normalizeText(value: string | null | undefined): string {
    return (value ?? '').trim();
  }

  nullIfBlank(value: string): string | null {
    const trimmed = this.normalizeText(value);
    return trimmed === '' ? null : trimmed;
  }

  normalizeComparable(row: ApplianceEditRow): { applianceName: string; manufacturer: string; modelNo: string; serialNo: string } {
    return {
      applianceName: this.normalizeText(row.applianceName),
      manufacturer: this.normalizeText(row.manufacturer),
      modelNo: this.normalizeText(row.modelNo),
      serialNo: this.normalizeText(row.serialNo)
    };
  }

  isExistingRowChanged(row: ApplianceEditRow): boolean {
    if (!row.applianceId) {
      return false;
    }
    const original = this.originalRowsById.get(row.applianceId);
    if (!original) {
      return true;
    }
    const current = this.normalizeComparable(row);
    return original.applianceName !== current.applianceName
      || original.manufacturer !== current.manufacturer
      || original.modelNo !== current.modelNo
      || original.serialNo !== current.serialNo;
  }

  toRequest(row: ApplianceEditRow): ApplianceRequest | null {
    const property = this.property;
    if (!property) {
      return null;
    }

    const applianceName = this.nullIfBlank(row.applianceName);
    const manufacturer = this.nullIfBlank(row.manufacturer);
    const modelNo = this.nullIfBlank(row.modelNo);
    const serialNo = this.nullIfBlank(row.serialNo);

    return {
      applianceId: row.applianceId,
      propertyId: property.propertyId,
      applianceName,
      manufacturer,
      modelNo,
      serialNo
    };
  }

  buildSavePayload(): { upserts: ApplianceRequest[]; deleteIds: number[]; hasChanges: boolean } {
    const upserts: ApplianceRequest[] = [];
    for (const row of this.rows) {
      const isNew = !row.applianceId;
      const isChanged = this.isExistingRowChanged(row);
      if (!isNew && !isChanged) {
        continue;
      }
      const request = this.toRequest(row);
      if (request) {
        upserts.push(request);
      }
    }

    const deleteIds: number[] = [];
    const hasChanges = upserts.length > 0;
    return { upserts, deleteIds, hasChanges };
  }
  //#endregion
}
