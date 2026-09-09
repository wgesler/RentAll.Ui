import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../material.module';
import { MaintenanceApplianceListComponent } from '../../../maintenance/maintenance-appliance-list/maintenance-appliance-list.component';
import { runMobileLineListSave, prepareMobileLineListSaveValidation, shouldShowMobileLineFieldError } from '../mobile-maintenance-line-list-validation';

@Component({
  standalone: true,
  selector: 'app-mobile-maintenance-appliance-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './mobile-maintenance-appliance-list.component.html',
  styleUrl: './mobile-maintenance-appliance-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileMaintenanceApplianceListComponent extends MaintenanceApplianceListComponent implements OnChanges {
  @Output() saveRequested = new EventEmitter<void>();
  private mobileCdr = inject(ChangeDetectorRef);
  saveValidationAttempted = false;

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['appliances']) {
      this.saveValidationAttempted = false;
    }
  }

  override onSaveChanges(): void {
    const payload = this.buildSavePayload();
    runMobileLineListSave(
      payload,
      () => this.saveChanges.emit({ upserts: payload.upserts, deleteIds: payload.deleteIds }),
      attempted => {
        this.saveValidationAttempted = attempted;
      },
      () => this.mobileCdr.markForCheck()
    );
  }

  showFieldError(isMissing: boolean): boolean {
    return shouldShowMobileLineFieldError(this.saveValidationAttempted, isMissing);
  }

  isApplianceNameMissing(row: Parameters<MaintenanceApplianceListComponent['isRowInvalid']>[0]): boolean {
    const isNew = !row.applianceId;
    const isChanged = this.isExistingRowChanged(row);
    if (!isNew && !isChanged) {
      return false;
    }
    return this.normalizeText(row.applianceName) === '';
  }

  isManufacturerMissing(row: Parameters<MaintenanceApplianceListComponent['isRowInvalid']>[0]): boolean {
    const isNew = !row.applianceId;
    const isChanged = this.isExistingRowChanged(row);
    if (!isNew && !isChanged) {
      return false;
    }
    return this.normalizeText(row.manufacturer) === '';
  }

  prepareSaveValidation(): boolean {
    return prepareMobileLineListSaveValidation(
      this.buildSavePayload(),
      attempted => {
        this.saveValidationAttempted = attempted;
      },
      () => this.mobileCdr.markForCheck()
    );
  }
}
