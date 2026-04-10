import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse } from '../../properties/models/property.model';
import { UtilityRequest, UtilityResponse } from '../models/utility.model';

interface UtilityEditRow {
  rowId: number;
  utilityId?: number;
  utilityName: string;
  phone: string;
  accountName: string;
  accountNumber: string;
  notes: string;
}

@Component({
  standalone: true,
  selector: 'app-maintenance-utility-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './maintenance-utility-list.component.html',
  styleUrl: './maintenance-utility-list.component.scss'
})
export class MaintenanceUtilityListComponent implements OnChanges {
  @Input() utilities: UtilityResponse[] = [];
  @Input() isLoading = false;
  @Input() isSaving = false;
  @Input() property: PropertyResponse | null = null;
  @Output() saveChanges = new EventEmitter<{ upserts: UtilityRequest[]; deleteIds: number[] }>();
  @Output() deleteExisting = new EventEmitter<number>();

  rows: UtilityEditRow[] = [];
  originalRowsById = new Map<number, { utilityName: string; phone: string; accountName: string; accountNumber: string; notes: string }>();
  rowCounter = 0;

  //#region Maintenance Utility List
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['utilities']) {
      this.resetRowsFromInput();
    }
  }

  addRow(): void {
    this.rows = [
      ...this.rows,
      {
        rowId: ++this.rowCounter,
        utilityName: '',
        phone: '',
        accountName: '',
        accountNumber: '',
        notes: ''
      }
    ];
  }

  removeRow(row: UtilityEditRow): void {
    if (row.utilityId != null) {
      this.deleteExisting.emit(row.utilityId);
      return;
    }
    this.rows = this.rows.filter(current => current.rowId !== row.rowId);
  }

  onSaveChanges(): void {
    const payload = this.buildSavePayload();
    if (!payload.hasChanges || payload.hasInvalidRows) {
      return;
    }
    this.saveChanges.emit({ upserts: payload.upserts, deleteIds: payload.deleteIds });
  }

  get canSave(): boolean {
    const payload = this.buildSavePayload();
    return payload.hasChanges && !payload.hasInvalidRows;
  }

  trackByRowId(_index: number, row: UtilityEditRow): number {
    return row.rowId;
  }
  //#endregion

  //#region Utility Methods
  resetRowsFromInput(): void {
    this.originalRowsById.clear();
    this.rowCounter = 0;
    this.rows = (this.utilities || []).map(utility => {
      const row: UtilityEditRow = {
        rowId: ++this.rowCounter,
        utilityId: utility.utilityId,
        utilityName: utility.utilityName ?? '',
        phone: utility.phone ?? '',
        accountName: utility.accountName ?? '',
        accountNumber: utility.accountNumber ?? '',
        notes: utility.notes ?? ''
      };
      if (utility.utilityId != null) {
        this.originalRowsById.set(utility.utilityId, this.normalizeComparable(row));
      }
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

  hasRequiredFields(row: UtilityEditRow): boolean {
    return this.normalizeText(row.utilityName) !== '';
  }

  isRowInvalid(row: UtilityEditRow): boolean {
    const isNew = !row.utilityId;
    const isChanged = this.isExistingRowChanged(row);
    if (!isNew && !isChanged) {
      return false;
    }
    return !this.hasRequiredFields(row);
  }

  normalizeComparable(row: UtilityEditRow): { utilityName: string; phone: string; accountName: string; accountNumber: string; notes: string } {
    return {
      utilityName: this.normalizeText(row.utilityName),
      phone: this.normalizeText(row.phone),
      accountName: this.normalizeText(row.accountName),
      accountNumber: this.normalizeText(row.accountNumber),
      notes: this.normalizeText(row.notes)
    };
  }

  isExistingRowChanged(row: UtilityEditRow): boolean {
    if (!row.utilityId) {
      return false;
    }
    const original = this.originalRowsById.get(row.utilityId);
    if (!original) {
      return true;
    }
    const current = this.normalizeComparable(row);
    return original.utilityName !== current.utilityName
      || original.phone !== current.phone
      || original.accountName !== current.accountName
      || original.accountNumber !== current.accountNumber
      || original.notes !== current.notes;
  }

  toRequest(row: UtilityEditRow): UtilityRequest | null {
    const property = this.property;
    if (!property) {
      return null;
    }

    const utilityName = this.normalizeText(row.utilityName);
    if (utilityName === '') {
      return null;
    }

    return {
      utilityId: row.utilityId,
      propertyId: property.propertyId,
      utilityName,
      phone: this.nullIfBlank(row.phone),
      accountName: this.nullIfBlank(row.accountName),
      accountNumber: this.nullIfBlank(row.accountNumber),
      notes: this.nullIfBlank(row.notes)
    };
  }

  buildSavePayload(): { upserts: UtilityRequest[]; deleteIds: number[]; hasChanges: boolean; hasInvalidRows: boolean } {
    const upserts: UtilityRequest[] = [];
    let hasInvalidRows = false;
    for (const row of this.rows) {
      const isNew = !row.utilityId;
      const isChanged = this.isExistingRowChanged(row);
      if (!isNew && !isChanged) {
        continue;
      }
      if (!this.hasRequiredFields(row)) {
        hasInvalidRows = true;
        continue;
      }
      const request = this.toRequest(row);
      if (request) {
        upserts.push(request);
      }
    }

    const deleteIds: number[] = [];
    const hasChanges = upserts.length > 0 || hasInvalidRows;
    return { upserts, deleteIds, hasChanges, hasInvalidRows };
  }
  //#endregion
}
