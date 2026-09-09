import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../material.module';
import { MaintenanceItemListComponent } from '../../../maintenance/maintenance-item-list/maintenance-item-list.component';
import { runMobileLineListSave, prepareMobileLineListSaveValidation, shouldShowMobileLineFieldError } from '../mobile-maintenance-line-list-validation';

@Component({
  standalone: true,
  selector: 'app-mobile-maintenance-item-list',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './mobile-maintenance-item-list.component.html',
  styleUrl: './mobile-maintenance-item-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileMaintenanceItemListComponent extends MaintenanceItemListComponent implements OnChanges {
  @Output() saveRequested = new EventEmitter<void>();
  private mobileCdr = inject(ChangeDetectorRef);
  saveValidationAttempted = false;

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['maintenanceItems']) {
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
