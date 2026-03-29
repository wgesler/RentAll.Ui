import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { ApplianceListComponent } from '../appliance-list/appliance-list.component';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';

@Component({
  standalone: true,
  selector: 'app-inventory',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, ApplianceListComponent],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss'
})
export class InventoryComponent {
  @Input() appliances: ApplianceResponse[] = [];
  @Input() isLoadingAppliances = false;
  @Input() maintenanceRecord: MaintenanceResponse | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() isSaving = false;
  @Input() isSavingAppliances = false;
  @Output() saveInventory = new EventEmitter<MaintenanceRequest>();
  @Output() saveAppliances = new EventEmitter<{ upserts: ApplianceRequest[]; deleteIds: number[] }>();
  readonly today = new Date();
  housekeepingUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];
  form: FormGroup;

  constructor(private fb: FormBuilder, private userService: UserService) {
    this.form = this.buildForm();
  }

  //#region Inventory
  ngOnInit(): void {
    this.loadHousekeepingUsers();
    this.loadInspectorUsers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['maintenanceRecord'] || changes['property']) {
      this.populateForm();
    }
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: MaintenanceRequest = {
      maintenanceId: this.maintenanceRecord?.maintenanceId || undefined,
      organizationId: raw.organizationId || this.maintenanceRecord?.organizationId || this.property?.organizationId || '',
      officeId: raw.officeId ?? this.maintenanceRecord?.officeId ?? this.property?.officeId ?? 0,
      officeName: raw.officeName || this.maintenanceRecord?.officeName || this.property?.officeName || '',
      propertyId: raw.propertyId || this.maintenanceRecord?.propertyId || this.property?.propertyId || '',
      inspectionCheckList: this.maintenanceRecord?.inspectionCheckList || '',
      cleanerUserId: this.nullIfBlank(raw.cleanerUserId),
      cleaningDate: this.mapDate(raw.cleaningDate),
      inspectorUserId: this.nullIfBlank(raw.inspectorUserId),
      inspectingDate: this.mapDate(raw.inspectingDate),
      filterDescription: this.nullIfBlank(raw.filterDescription),
      lastFilterChangeDate: this.mapDate(raw.lastFilterChangeDate),
      smokeDetectors: this.nullIfBlank(raw.smokeDetectors),
      lastSmokeChangeDate: this.mapDate(raw.lastSmokeChangeDate),
      smokeDetectorBatteries: this.nullIfBlank(raw.smokeDetectorBatteries),
      lastBatteryChangeDate: this.mapDate(raw.lastBatteryChangeDate),
      licenseNo: this.nullIfBlank(raw.licenseNo),
      licenseDate: this.mapDate(raw.licenseDate),
      hvacNotes: this.nullIfBlank(raw.hvacNotes),
      hvacServiced: this.mapDate(raw.hvacServiced),
      fireplaceNotes: this.nullIfBlank(raw.fireplaceNotes),
      fireplaceServiced: this.mapDate(raw.fireplaceServiced),
      notes: this.nullIfBlank(raw.notes),
      isActive: raw.isActive ?? this.maintenanceRecord?.isActive ?? true
    };
    this.saveInventory.emit(payload);
  }

  onApplianceSaveChanges(payload: { upserts: ApplianceRequest[]; deleteIds: number[] }): void {
    this.saveAppliances.emit(payload);
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    const dateOnOrBeforeToday = this.dateOnOrBeforeTodayValidator();
    return this.fb.group({
      maintenanceId: new FormControl<string>(''),
      organizationId: new FormControl<string>(''),
      officeId: new FormControl<number | null>(null),
      officeName: new FormControl<string>(''),
      propertyId: new FormControl<string>(''),
      inspectionCheckList: new FormControl<string>(''),
      cleanerUserId: new FormControl<string | null>(null),
      cleaningDate: new FormControl<Date | null>(null),
      inspectorUserId: new FormControl<string | null>(null),
      inspectingDate: new FormControl<Date | null>(null),
      filterDescription: new FormControl<string>(''),
      lastFilterChangeDate: new FormControl<Date | null>(null, [dateOnOrBeforeToday]),
      smokeDetectors: new FormControl<string>(''),
      lastSmokeChangeDate: new FormControl<Date | null>(null, [dateOnOrBeforeToday]),
      smokeDetectorBatteries: new FormControl<string>(''),
      lastBatteryChangeDate: new FormControl<Date | null>(null, [dateOnOrBeforeToday]),
      licenseNo: new FormControl<string>(''),
      licenseDate: new FormControl<Date | null>(null, [dateOnOrBeforeToday]),
      hvacNotes: new FormControl<string>(''),
      hvacServiced: new FormControl<Date | null>(null, [dateOnOrBeforeToday]),
      fireplaceNotes: new FormControl<string>(''),
      fireplaceServiced: new FormControl<Date | null>(null, [dateOnOrBeforeToday]),
      notes: new FormControl<string>(''),
      isActive: new FormControl<boolean>(true)
    });
  }

  populateForm(): void {
    const source = this.maintenanceRecord;
    this.form.patchValue({
      maintenanceId: source?.maintenanceId ?? '',
      organizationId: source?.organizationId ?? this.property?.organizationId ?? '',
      officeId: source?.officeId ?? this.property?.officeId ?? null,
      officeName: source?.officeName ?? this.property?.officeName ?? '',
      propertyId: source?.propertyId ?? this.property?.propertyId ?? '',
      inspectionCheckList: source?.inspectionCheckList ?? '',
      cleanerUserId: source?.cleanerUserId ?? null,
      cleaningDate: this.toDateOrNull(source?.cleaningDate),
      inspectorUserId: source?.inspectorUserId ?? null,
      inspectingDate: this.toDateOrNull(source?.inspectingDate),
      filterDescription: source?.filterDescription ?? '',
      lastFilterChangeDate: this.toDateOrNull(source?.lastFilterChangeDate),
      smokeDetectors: source?.smokeDetectors ?? '',
      lastSmokeChangeDate: this.toDateOrNull(source?.lastSmokeChangeDate),
      smokeDetectorBatteries: source?.smokeDetectorBatteries ?? '',
      lastBatteryChangeDate: this.toDateOrNull(source?.lastBatteryChangeDate),
      licenseNo: source?.licenseNo ?? '',
      licenseDate: this.toDateOrNull(source?.licenseDate),
      hvacNotes: source?.hvacNotes ?? '',
      hvacServiced: this.toDateOrNull(source?.hvacServiced ?? undefined),
      fireplaceNotes: source?.fireplaceNotes ?? '',
      fireplaceServiced: this.toDateOrNull(source?.fireplaceServiced ?? undefined),
      notes: source?.notes ?? '',
      isActive: source?.isActive ?? true
    }, { emitEvent: false });
  }

  loadHousekeepingUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Housekeeping]).pipe(take(1)).subscribe({
      next: (users: UserResponse[]) => {
        this.housekeepingUsers = users || [];
      },
      error: () => {
        this.housekeepingUsers = [];
      }
    });
  }

  loadInspectorUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Inspector]).pipe(take(1)).subscribe({
      next: (users: UserResponse[]) => {
        this.inspectorUsers = users || [];
      },
      error: () => {
        this.inspectorUsers = [];
      }
    });
  }

  getCleanerOptionsForOffice(): UserResponse[] {
    const officeId = this.getCurrentOfficeId();
    if (!officeId) {
      return this.housekeepingUsers;
    }
    return this.housekeepingUsers.filter(user => (user.officeAccess || []).includes(officeId));
  }

  getInspectorOptionsForOffice(): UserResponse[] {
    const officeId = this.getCurrentOfficeId();
    if (!officeId) {
      return this.inspectorUsers;
    }
    return this.inspectorUsers.filter(user => (user.officeAccess || []).includes(officeId));
  }

  getUserFullName(user: UserResponse): string {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  }

  getCurrentOfficeId(): number | null {
    return this.form.get('officeId')?.value ?? this.maintenanceRecord?.officeId ?? this.property?.officeId ?? null;
  }

  toDateOrNull(dateValue?: string | null): Date | null {
    if (!dateValue) {
      return null;
    }
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  mapDate(dateValue: unknown): string | null {
    if (!dateValue) {
      return null;
    }

    if (dateValue instanceof Date) {
      return Number.isNaN(dateValue.getTime()) ? null : dateValue.toISOString();
    }

    if (typeof dateValue === 'string') {
      const trimmed = dateValue.trim();
      if (trimmed === '') {
        return null;
      }
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    return null;
  }

  nullIfBlank(value: unknown): string | null {
    if (typeof value !== 'string') {
      return value === null || value === undefined ? null : String(value);
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  hasFutureDateError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return Boolean(control?.hasError('futureDate') && (control.touched || control.dirty));
  }

  dateOnOrBeforeTodayValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!value) {
        return null;
      }

      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        return null;
      }

      const selectedDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const today = new Date();
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return selectedDay > todayDay ? { futureDate: true } : null;
    };
  }
  //#endregion
}
