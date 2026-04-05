import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse } from '../../properties/models/property.model';
import { MaintenanceItemRequest, MaintenanceItemResponse } from '../models/maintenance-item.model';

interface MaintenanceItemEditRow {
  rowId: number;
  maintenanceItemId?: number;
  name: string;
  notes: string;
  monthsBetweenService: number | null;
  lastServicedOn: string | null;
}

@Component({
  standalone: true,
  selector: 'app-maintenance-item-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './maintenance-item-list.component.html',
  styleUrl: './maintenance-item-list.component.scss'
})
export class MaintenanceItemListComponent implements OnChanges {
  @Input() maintenanceItems: MaintenanceItemResponse[] = [];
  @Input() isLoading = false;
  @Input() isSaving = false;
  @Input() property: PropertyResponse | null = null;
  @Output() saveChanges = new EventEmitter<{ upserts: MaintenanceItemRequest[]; deleteIds: number[] }>();
  @Output() deleteExisting = new EventEmitter<number>();

  rows: MaintenanceItemEditRow[] = [];
  originalRowsById = new Map<number, { name: string; notes: string; monthsBetweenService: number; lastServicedOn: string | null }>();
  rowCounter = 0;

  //#region Maintenance-Item-List
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['maintenanceItems']) {
      this.resetRowsFromInput();
    }
  }

  addRow(): void {
    this.rows = [
      ...this.rows,
      {
        rowId: ++this.rowCounter,
        name: '',
        notes: '',
        monthsBetweenService: null,
        lastServicedOn: null
      }
    ];
  }

  removeRow(row: MaintenanceItemEditRow): void {
    if (row.maintenanceItemId != null) {
      this.deleteExisting.emit(row.maintenanceItemId);
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

  trackByRowId(_index: number, row: MaintenanceItemEditRow): number {
    return row.rowId;
  }

  onMonthsBetweenServiceInput(row: MaintenanceItemEditRow, value: string): void {
    const digitsOnly = (value || '').replace(/[^0-9]/g, '');
    row.monthsBetweenService = digitsOnly === '' ? null : Number(digitsOnly);
  }
  //#endregion

  //#region Utility Methods
  resetRowsFromInput(): void {
    this.originalRowsById.clear();
    this.rowCounter = 0;
    this.rows = (this.maintenanceItems || []).map(item => {
      const row: MaintenanceItemEditRow = {
        rowId: ++this.rowCounter,
        maintenanceItemId: item.maintenanceItemId,
        name: item.name ?? '',
        notes: item.notes ?? '',
        monthsBetweenService: item.monthsBetweenService ?? 0,
        lastServicedOn: this.toDateInputValue(item.lastServicedOn)
      };
      this.originalRowsById.set(item.maintenanceItemId, this.normalizeComparable(row));
      return row;
    });
  }

  normalizeText(value: string | null | undefined): string {
    return (value ?? '').trim();
  }

  normalizeMonths(value: number | null | undefined): number {
    return value == null || Number.isNaN(Number(value)) ? 0 : Math.max(0, Number(value));
  }

  toDateInputValue(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }

  normalizeComparable(row: MaintenanceItemEditRow): { name: string; notes: string; monthsBetweenService: number; lastServicedOn: string | null } {
    return {
      name: this.normalizeText(row.name),
      notes: this.normalizeText(row.notes),
      monthsBetweenService: this.normalizeMonths(row.monthsBetweenService),
      lastServicedOn: this.toDateInputValue(row.lastServicedOn)
    };
  }

  isExistingRowChanged(row: MaintenanceItemEditRow): boolean {
    if (!row.maintenanceItemId) {
      return false;
    }
    const original = this.originalRowsById.get(row.maintenanceItemId);
    if (!original) {
      return true;
    }
    const current = this.normalizeComparable(row);
    return original.name !== current.name
      || original.notes !== current.notes
      || original.monthsBetweenService !== current.monthsBetweenService
      || original.lastServicedOn !== current.lastServicedOn;
  }

  toRequest(row: MaintenanceItemEditRow): MaintenanceItemRequest | null {
    const property = this.property;
    if (!property) {
      return null;
    }

    const name = this.normalizeText(row.name);
    const notes = this.normalizeText(row.notes);
    const monthsBetweenService = this.normalizeMonths(row.monthsBetweenService);
    const lastServicedOn = this.toDateInputValue(row.lastServicedOn);

    return {
      maintenanceItemId: row.maintenanceItemId,
      propertyId: property.propertyId,
      name,
      notes: notes === '' ? null : notes,
      monthsBetweenService,
      lastServicedOn
    };
  }

  buildSavePayload(): { upserts: MaintenanceItemRequest[]; deleteIds: number[]; hasChanges: boolean } {
    const upserts: MaintenanceItemRequest[] = [];
    for (const row of this.rows) {
      const isNew = !row.maintenanceItemId;
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
