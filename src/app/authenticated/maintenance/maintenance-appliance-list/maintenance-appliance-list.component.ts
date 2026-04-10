import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { FileDetails } from '../../../shared/models/fileDetails';
import { PropertyResponse } from '../../properties/models/property.model';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';

interface ApplianceEditRow {
  rowId: number;
  applianceId?: number;
  applianceName: string;
  manufacturer: string;
  modelNo: string;
  serialNo: string;
  decalPath: string | null;
  decalPreviewDataUrl: string | null;
  fileDetails?: FileDetails | null;
  hasNewFileUpload: boolean;
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
  originalRowsById = new Map<number, { applianceName: string; manufacturer: string; modelNo: string; serialNo: string; decalPath: string | null }>();
  rowCounter = 0;

  constructor(
    private dialog: MatDialog
  ) {}

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
        serialNo: '',
        decalPath: null,
        decalPreviewDataUrl: null,
        fileDetails: null,
        hasNewFileUpload: false
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
    if (!payload.hasChanges || payload.hasInvalidRows) {
      return;
    }
    this.saveChanges.emit({ upserts: payload.upserts, deleteIds: payload.deleteIds });
  }

  get canSave(): boolean {
    const payload = this.buildSavePayload();
    return payload.hasChanges && !payload.hasInvalidRows;
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
        serialNo: appliance.serialNo ?? '',
        decalPath: appliance.decalPath ?? null,
        decalPreviewDataUrl: this.resolveFileDetailsDataUrl(appliance.decalFileDetails),
        fileDetails: appliance.decalFileDetails ?? null,
        hasNewFileUpload: false
      };
      if (appliance.applianceId != null) {
        this.originalRowsById.set(appliance.applianceId, this.normalizeComparable(row));
      }
      return row;
    });
  }

  async onDecalSelected(row: ApplianceEditRow, event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const file = target.files && target.files.length > 0 ? target.files[0] : null;
    if (!file) {
      return;
    }
    row.fileDetails = {
      fileName: file.name,
      contentType: file.type || 'image/jpeg',
      file: '',
      dataUrl: ''
    };
    row.hasNewFileUpload = true;
    row.decalPath = null;
    const dataUrl = await this.readFileAsDataUrl(file);
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    if (row.fileDetails) {
      row.fileDetails.dataUrl = dataUrl;
      row.fileDetails.file = base64;
    }
    row.decalPreviewDataUrl = dataUrl;
    target.value = '';
  }

  removeDecal(row: ApplianceEditRow): void {
    row.fileDetails = null;
    row.hasNewFileUpload = false;
    row.decalPath = null;
    row.decalPreviewDataUrl = null;
  }

  openDecalUpload(row: ApplianceEditRow): void {
    const element = document.getElementById(this.decalInputId(row.rowId)) as HTMLInputElement | null;
    element?.click();
  }

  openDecalPreview(row: ApplianceEditRow, event?: Event): void {
    event?.stopPropagation();
    const imageSrc = this.getDecalPreview(row);
    if (!imageSrc) {
      return;
    }
    const data: ImageViewDialogData = { imageSrc, title: 'Appliance Decal' };
    this.dialog.open(ImageViewDialogComponent, { data, width: '70vw', maxWidth: '520px' });
  }

  decalInputId(rowId: number): string {
    return `appliance-decal-input-${rowId}`;
  }

  getDecalPreview(row: ApplianceEditRow): string | null {
    return row.decalPreviewDataUrl;
  }

  normalizeText(value: string | null | undefined): string {
    return (value ?? '').trim();
  }

  nullIfBlank(value: string): string | null {
    const trimmed = this.normalizeText(value);
    return trimmed === '' ? null : trimmed;
  }

  hasRequiredFields(row: ApplianceEditRow): boolean {
    return this.normalizeText(row.applianceName) !== '' && this.normalizeText(row.manufacturer) !== '';
  }

  isRowInvalid(row: ApplianceEditRow): boolean {
    const isNew = !row.applianceId;
    const isChanged = this.isExistingRowChanged(row);
    if (!isNew && !isChanged) {
      return false;
    }
    return !this.hasRequiredFields(row);
  }

  normalizeComparable(row: ApplianceEditRow): { applianceName: string; manufacturer: string; modelNo: string; serialNo: string; decalPath: string | null } {
    return {
      applianceName: this.normalizeText(row.applianceName),
      manufacturer: this.normalizeText(row.manufacturer),
      modelNo: this.normalizeText(row.modelNo),
      serialNo: this.normalizeText(row.serialNo),
      decalPath: row.decalPath ?? null
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
      || original.serialNo !== current.serialNo
      || original.decalPath !== current.decalPath
      || row.hasNewFileUpload;
  }

  toRequest(row: ApplianceEditRow): ApplianceRequest | null {
    const property = this.property;
    if (!property) {
      return null;
    }

    const applianceName = this.normalizeText(row.applianceName);
    const manufacturer = this.normalizeText(row.manufacturer);
    if (applianceName === '' || manufacturer === '') {
      return null;
    }
    const modelNo = this.nullIfBlank(row.modelNo);
    const serialNo = this.nullIfBlank(row.serialNo);
    const shouldSendFileDetails = row.hasNewFileUpload || !!row.fileDetails?.file;

    return {
      applianceId: row.applianceId,
      propertyId: property.propertyId,
      applianceName,
      manufacturer,
      modelNo,
      serialNo,
      decalPath: shouldSendFileDetails ? undefined : row.decalPath,
      decalFileDetails: shouldSendFileDetails ? row.fileDetails ?? undefined : undefined
    };
  }

  buildSavePayload(): { upserts: ApplianceRequest[]; deleteIds: number[]; hasChanges: boolean; hasInvalidRows: boolean } {
    const upserts: ApplianceRequest[] = [];
    let hasInvalidRows = false;
    for (const row of this.rows) {
      const isNew = !row.applianceId;
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

  readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = () => reject(new Error('Unable to read selected image.'));
      reader.readAsDataURL(file);
    });
  }

  resolveFileDetailsDataUrl(fileDetails?: FileDetails): string | null {
    if (!fileDetails) {
      return null;
    }
    if (fileDetails.dataUrl && fileDetails.dataUrl.trim() !== '') {
      return fileDetails.dataUrl;
    }
    if (fileDetails.file && fileDetails.contentType) {
      return fileDetails.file.startsWith('data:')
        ? fileDetails.file
        : `data:${fileDetails.contentType};base64,${fileDetails.file}`;
    }
    return null;
  }
  //#endregion
}
