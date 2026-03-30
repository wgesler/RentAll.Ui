import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, concat, concatMap, defaultIfEmpty, finalize, from, map, Observable, Subject, switchMap, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { ApplianceListComponent } from '../appliance-list/appliance-list.component';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';
import { ChecklistSection, INSPECTION_SECTIONS } from '../models/checklist-sections';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceService } from '../services/maintenance.service';
import { ApplianceService } from '../services/appliance.service';
import { JwtUser } from '../../../public/login/models/jwt';

@Component({
  standalone: true,
  selector: 'app-maintenance',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, ApplianceListComponent],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss'
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  @Input() property: PropertyResponse | null = null;
  readonly today = new Date();
  form: FormGroup;
  isSaving = false;
  isSavingAppliances = false;
  user: JwtUser | null = null;
  
  maintenanceRecord: MaintenanceResponse | null = null;
  appliances: ApplianceResponse[] = [];
  housekeepingUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['maintenance', 'appliances', 'cleaners', 'inspectors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();


  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private maintenanceService: MaintenanceService,
    private applianceService: ApplianceService,
    private authService: AuthService,
    private toastr: ToastrService
  ) {
    this.form = this.buildForm();
  }

  //#region Inventory
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.setupAssigneeDateSync();
    this.loadMaintenance();
    this.loadAppliances();
    this.loadHousekeepingUsers();
    this.loadInspectorUsers();
  }

  onSave(): void {
    if (!this.property) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const raw = this.form.getRawValue();
    const cleanerUserId = this.nullIfBlank(raw.cleanerUserId);
    const inspectorUserId = this.nullIfBlank(raw.inspectorUserId);
    const inventoryPayload: MaintenanceRequest = {
      maintenanceId: this.maintenanceRecord?.maintenanceId || undefined,
      organizationId: raw.organizationId || this.maintenanceRecord?.organizationId || this.property?.organizationId || '',
      officeId: raw.officeId ?? this.maintenanceRecord?.officeId ?? this.property?.officeId ?? 0,
      officeName: raw.officeName || this.maintenanceRecord?.officeName || this.property?.officeName || '',
      propertyId: raw.propertyId || this.maintenanceRecord?.propertyId || this.property?.propertyId || '',
      inspectionCheckList: this.maintenanceRecord?.inspectionCheckList || '',
      cleanerUserId,
      cleaningDate: cleanerUserId ? this.mappingService.toIsoDateOrNull(raw.cleaningDate) : null,
      inspectorUserId,
      inspectingDate: inspectorUserId ? this.mappingService.toIsoDateOrNull(raw.inspectingDate) : null,
      filterDescription: this.nullIfBlank(raw.filterDescription),
      lastFilterChangeDate: this.mappingService.toIsoDateOrNull(raw.lastFilterChangeDate),
      smokeDetectors: this.nullIfBlank(raw.smokeDetectors),
      lastSmokeChangeDate: this.mappingService.toIsoDateOrNull(raw.lastSmokeChangeDate),
      smokeDetectorBatteries: this.nullIfBlank(raw.smokeDetectorBatteries),
      lastBatteryChangeDate: this.mappingService.toIsoDateOrNull(raw.lastBatteryChangeDate),
      licenseNo: this.nullIfBlank(raw.licenseNo),
      licenseDate: this.mappingService.toIsoDateOrNull(raw.licenseDate),
      hvacNotes: this.nullIfBlank(raw.hvacNotes),
      hvacServiced: this.mappingService.toIsoDateOrNull(raw.hvacServiced),
      fireplaceNotes: this.nullIfBlank(raw.fireplaceNotes),
      fireplaceServiced: this.mappingService.toIsoDateOrNull(raw.fireplaceServiced),
      notes: this.nullIfBlank(raw.notes),
      isActive: raw.isActive ?? this.maintenanceRecord?.isActive ?? true
    };

    this.maintenanceService.getByPropertyId(this.property.propertyId).pipe(take(1),
      switchMap((latest) => {
        const existing = latest ?? this.maintenanceRecord ?? null;
        const pickValue = <T>(incoming: T | undefined, existingValue: T | undefined, fallback: T): T =>
          incoming === undefined ? (existingValue ?? fallback) : incoming;
        const checklistJson = existing?.inspectionCheckList
          ?? this.maintenanceRecord?.inspectionCheckList
          ?? this.buildDefaultTemplateJson(INSPECTION_SECTIONS, false);
        const payload: MaintenanceRequest = {
          maintenanceId: existing?.maintenanceId ?? inventoryPayload.maintenanceId,
          organizationId: inventoryPayload.organizationId || existing?.organizationId || this.property.organizationId || this.user?.organizationId || '',
          officeId: inventoryPayload.officeId ?? existing?.officeId ?? this.property.officeId ?? 0,
          officeName: inventoryPayload.officeName || existing?.officeName || this.property.officeName || '',
          propertyId: inventoryPayload.propertyId || existing?.propertyId || this.property.propertyId,
          inspectionCheckList: checklistJson,
          cleanerUserId: pickValue(inventoryPayload.cleanerUserId, existing?.cleanerUserId, null),
          cleaningDate: pickValue(inventoryPayload.cleaningDate, existing?.cleaningDate, null),
          inspectorUserId: pickValue(inventoryPayload.inspectorUserId, existing?.inspectorUserId, null),
          inspectingDate: pickValue(inventoryPayload.inspectingDate, existing?.inspectingDate, null),
          filterDescription: pickValue(inventoryPayload.filterDescription, existing?.filterDescription, null),
          lastFilterChangeDate: pickValue(inventoryPayload.lastFilterChangeDate, existing?.lastFilterChangeDate, null),
          smokeDetectors: pickValue(inventoryPayload.smokeDetectors, existing?.smokeDetectors, null),
          lastSmokeChangeDate: pickValue(inventoryPayload.lastSmokeChangeDate, existing?.lastSmokeChangeDate, null),
          smokeDetectorBatteries: pickValue(inventoryPayload.smokeDetectorBatteries, existing?.smokeDetectorBatteries, null),
          lastBatteryChangeDate: pickValue(inventoryPayload.lastBatteryChangeDate, existing?.lastBatteryChangeDate, null),
          licenseNo: pickValue(inventoryPayload.licenseNo, existing?.licenseNo, null),
          licenseDate: pickValue(inventoryPayload.licenseDate, existing?.licenseDate, null),
          hvacNotes: pickValue(inventoryPayload.hvacNotes, existing?.hvacNotes, null),
          hvacServiced: pickValue(inventoryPayload.hvacServiced, existing?.hvacServiced, null),
          fireplaceNotes: pickValue(inventoryPayload.fireplaceNotes, existing?.fireplaceNotes, null),
          fireplaceServiced: pickValue(inventoryPayload.fireplaceServiced, existing?.fireplaceServiced, null),
          notes: pickValue(inventoryPayload.notes, existing?.notes, null),
          isActive: inventoryPayload.isActive ?? existing?.isActive ?? true
        };
        return payload.maintenanceId
          ? this.maintenanceService.updateMaintenance(payload)
          : this.maintenanceService.createMaintenance({ ...payload, maintenanceId: undefined });
      }), take(1)).subscribe({
      next: (saved: MaintenanceResponse) => {
        this.maintenanceRecord = saved;
        this.populateForm();
        this.isSaving = false;
        this.toastr.success('Maintenance saved.', CommonMessage.Success);
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error('Unable to save maintenance.', CommonMessage.Error);
      }
    });
  }

  onApplianceSaveChanges(payload: { upserts: ApplianceRequest[]; deleteIds: number[] }): void {
    if (!this.property) {
      return;
    }

    const deleteIds = (payload.deleteIds || []).filter(id => Number.isFinite(id));
    const upserts = payload.upserts || [];
    if (deleteIds.length === 0 && upserts.length === 0) {
      return;
    }

    this.isSavingAppliances = true;
    const deleteOperations$ = from(deleteIds).pipe(concatMap(applianceId => this.applianceService.deleteAppliance(applianceId)));
    const upsertOperations$ = from(upserts).pipe(
      concatMap(request => request.applianceId
        ? this.applianceService.updateAppliance(request)
        : this.applianceService.createAppliance(request))
    );

    concat(deleteOperations$, upsertOperations$).pipe(
      defaultIfEmpty(null),
      finalize(() => {
        this.isSavingAppliances = false;
      })
    ).subscribe({
      complete: () => {
        this.loadAppliances();
        this.toastr.success('Appliances saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save appliances.', CommonMessage.Error);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion

  //#region Data Loading Methods
  loadMaintenance(): void {
    const propertyId = this.property?.propertyId;
    if (!propertyId) {
      this.maintenanceRecord = null;
      this.populateForm();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenance');
    this.maintenanceService.getByPropertyId(propertyId).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenance'))).subscribe({
      next: (maintenance: MaintenanceResponse | null) => {
        this.maintenanceRecord = maintenance ?? null;
        this.populateForm();
      },
      error: () => {
        this.maintenanceRecord = null;
        this.populateForm();
      }
    });
  }

  loadAppliances(): void {
    const propertyId = this.property?.propertyId;
    if (!propertyId) {
      this.appliances = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'appliances');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'appliances');
    this.applianceService.getAppliancesByPropertyId(propertyId).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'appliances'))).subscribe({
      next: (appliances: ApplianceResponse[]) => {
        this.appliances = appliances || [];
      },
      error: () => {
        this.appliances = [];
      }
    });
  }

  loadHousekeepingUsers(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'cleaners');
    this.userService.getUsersByType(UserGroups[UserGroups.Housekeeping]).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'cleaners'))).subscribe({
      next: (users: UserResponse[]) => {
        this.housekeepingUsers = users || [];
      },
      error: () => {
        this.housekeepingUsers = [];
      }
    });
  }

  loadInspectorUsers(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'inspectors');
    this.userService.getUsersByType(UserGroups[UserGroups.Inspector]).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'inspectors'))).subscribe({
      next: (users: UserResponse[]) => {
        this.inspectorUsers = users || [];
      },
      error: () => {
        this.inspectorUsers = [];
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildDefaultTemplateJson(sections: ChecklistSection[], defaultIsEditable: boolean): string {
    const payload = {
      sections: sections.map(section => ({
        key: section.key,
        title: section.title,
        notes: '',
        sets: [
          section.items.map(item => ({
            text: item.text,
            requiresPhoto: item.requiresPhoto,
            requiresCount: false,
            count: null,
            isEditable: defaultIsEditable,
            photoPath: null as string | null
          }))
        ]
      }))
    };
    return JSON.stringify(payload);
  }

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
      cleaningDate: this.mappingService.parseDateOrNull(source?.cleaningDate),
      inspectorUserId: source?.inspectorUserId ?? null,
      inspectingDate: this.mappingService.parseDateOrNull(source?.inspectingDate),
      filterDescription: source?.filterDescription ?? '',
      lastFilterChangeDate: this.mappingService.parseDateOrNull(source?.lastFilterChangeDate),
      smokeDetectors: source?.smokeDetectors ?? '',
      lastSmokeChangeDate: this.mappingService.parseDateOrNull(source?.lastSmokeChangeDate),
      smokeDetectorBatteries: source?.smokeDetectorBatteries ?? '',
      lastBatteryChangeDate: this.mappingService.parseDateOrNull(source?.lastBatteryChangeDate),
      licenseNo: source?.licenseNo ?? '',
      licenseDate: this.mappingService.parseDateOrNull(source?.licenseDate),
      hvacNotes: source?.hvacNotes ?? '',
      hvacServiced: this.mappingService.parseDateOrNull(source?.hvacServiced ?? undefined),
      fireplaceNotes: source?.fireplaceNotes ?? '',
      fireplaceServiced: this.mappingService.parseDateOrNull(source?.fireplaceServiced ?? undefined),
      notes: source?.notes ?? '',
      isActive: source?.isActive ?? true
    }, { emitEvent: false });
  }

  setupAssigneeDateSync(): void {
    this.form.get('cleanerUserId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.nullIfBlank(value) !== null) {
        return;
      }
      const cleaningDateControl = this.form.get('cleaningDate');
      if (cleaningDateControl?.value !== null) {
        cleaningDateControl.setValue(null, { emitEvent: false });
      }
    });

    this.form.get('inspectorUserId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.nullIfBlank(value) !== null) {
        return;
      }
      const inspectingDateControl = this.form.get('inspectingDate');
      if (inspectingDateControl?.value !== null) {
        inspectingDateControl.setValue(null, { emitEvent: false });
      }
    });
  }

  get isLoadingAppliances(): boolean {
    return this.itemsToLoad$.value.has('appliances');
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
