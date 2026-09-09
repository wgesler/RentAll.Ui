import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MobileMaintenanceItemListComponent } from './mobile-maintenance-item-list/mobile-maintenance-item-list.component';
import { MobileMaintenanceApplianceListComponent } from './mobile-maintenance-appliance-list/mobile-maintenance-appliance-list.component';
import { MobileMaintenanceUtilityListComponent } from './mobile-maintenance-utility-list/mobile-maintenance-utility-list.component';
import { MaintenanceComponent } from '../../maintenance/maintenance/maintenance.component';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';

@Component({
  standalone: true,
  selector: 'app-mobile-maintenance-detail',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MaterialModule,
    MobileMaintenanceItemListComponent,
    MobileMaintenanceApplianceListComponent,
    MobileMaintenanceUtilityListComponent
  ],
  templateUrl: './mobile-maintenance-detail.component.html',
  styleUrl: './mobile-maintenance-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileMaintenanceDetailComponent extends MaintenanceComponent implements OnChanges, OnDestroy {
  @Input() propertyId = '';
  @Output() propertyCodeChange = new EventEmitter<string>();
  @ViewChild('itemList') itemList?: MobileMaintenanceItemListComponent;
  @ViewChild('applianceList') applianceList?: MobileMaintenanceApplianceListComponent;
  @ViewChild('utilityList') utilityList?: MobileMaintenanceUtilityListComponent;
  private propertyService = inject(PropertyService);
  private mobileDestroy$ = new Subject<void>();
  isMobilePageReady = false;

  //#region Mobile-Maintenance-Detail
  override ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId']) {
      this.loadMobileProperty();
      return;
    }
    super.ngOnChanges(changes);
  }

  saveAllMaintenance(): void {
    if (!this.property) {
      return;
    }

    const itemsValid = this.itemList?.prepareSaveValidation() ?? true;
    const appliancesValid = this.applianceList?.prepareSaveValidation() ?? true;
    const utilitiesValid = this.utilityList?.prepareSaveValidation() ?? true;
    const listsValid = itemsValid && appliancesValid && utilitiesValid;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
    }

    if (!listsValid || this.form.invalid) {
      this.markViewForCheck();
      return;
    }

    this.onSave(() => {
      this.itemList?.onSaveChanges();
      this.applianceList?.onSaveChanges();
      this.utilityList?.onSaveChanges();
    });
  }

  override ngOnDestroy(): void {
    this.mobileDestroy$.next();
    this.mobileDestroy$.complete();
    super.ngOnDestroy();
  }
  //#endregion

  //#region Data Loading Methods
  private loadMobileProperty(): void {
    const propertyId = this.propertyId.trim();
    this.isMobilePageReady = false;
    this.property = null;
    this.markViewForCheck();
    if (!propertyId) {
      this.isMobilePageReady = true;
      this.markViewForCheck();
      return;
    }
    this.propertyService.getPropertyByGuid(propertyId).pipe(
      take(1),
      takeUntil(this.mobileDestroy$),
      finalize(() => {
        this.isMobilePageReady = true;
        this.markViewForCheck();
      })
    ).subscribe({
      next: property => {
        this.property = property;
        this.propertyCodeChange.emit(property?.propertyCode || '');
        this.loadMaintenance();
        this.loadAppliances();
        this.loadUtilities();
        this.loadMaintenanceItems();
        this.markViewForCheck();
      },
      error: () => {
        this.property = null;
        this.propertyCodeChange.emit('');
        this.markViewForCheck();
      }
    });
  }
  //#endregion
}
