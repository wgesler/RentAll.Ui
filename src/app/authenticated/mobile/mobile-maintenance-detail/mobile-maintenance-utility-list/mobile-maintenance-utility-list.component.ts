import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../material.module';
import { MaintenanceUtilityListComponent } from '../../../maintenance/maintenance-utility-list/maintenance-utility-list.component';
import { runMobileLineListSave, prepareMobileLineListSaveValidation, shouldShowMobileLineFieldError } from '../mobile-maintenance-line-list-validation';

@Component({
  standalone: true,
  selector: 'app-mobile-maintenance-utility-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './mobile-maintenance-utility-list.component.html',
  styleUrl: './mobile-maintenance-utility-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileMaintenanceUtilityListComponent extends MaintenanceUtilityListComponent implements OnChanges {
  @Output() saveRequested = new EventEmitter<void>();
  private mobileCdr = inject(ChangeDetectorRef);
  saveValidationAttempted = false;

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['utilities']) {
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

  isUtilityNameMissing(row: Parameters<MaintenanceUtilityListComponent['isRowInvalid']>[0]): boolean {
    const isNew = !row.utilityId;
    const isChanged = this.isExistingRowChanged(row);
    if (!isNew && !isChanged) {
      return false;
    }
    return this.normalizeText(row.utilityName) === '';
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
