import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, catchError, concatMap, defaultIfEmpty, finalize, from, map, Observable, of, Subject, switchMap, take, takeUntil, toArray } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceApplianceListComponent } from '../maintenance-appliance-list/maintenance-appliance-list.component';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';
import { MaintenanceItemListComponent } from '../maintenance-item-list/maintenance-item-list.component';
import { MaintenanceItemRequest, MaintenanceItemResponse } from '../models/maintenance-item.model';
import { MaintenanceUtilityListComponent } from '../maintenance-utility-list/maintenance-utility-list.component';
import { ChecklistSection, INSPECTION_SECTIONS } from '../models/checklist-sections';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { UtilityRequest, UtilityResponse } from '../models/utility.model';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceService } from '../services/maintenance.service';
import { ApplianceService } from '../services/appliance.service';
import { MaintenanceItemsService } from '../services/maintenance-items.service';
import { MaintenanceUtilityService } from '../services/maintenance-utility.service';
import { JwtUser } from '../../../public/login/models/jwt';
import { UnsavedChangesDialogService } from '../../shared/modals/unsaved-changes/unsaved-changes-dialog.service';

@Component({
  standalone: true,
  selector: 'app-maintenance',
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, MaintenanceApplianceListComponent, MaintenanceItemListComponent, MaintenanceUtilityListComponent],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss'
})
export class MaintenanceComponent implements OnInit, OnDestroy, OnChanges {
  @Input() property: PropertyResponse | null = null;
  readonly today = new Date();
  form: FormGroup;
  isSaving = false;
  isSavingAppliances = false;
  isSavingUtilities = false;
  isSavingMaintenanceItems = false;
  user: JwtUser | null = null;
  savedFormState: Record<string, unknown> | null = null;
  
  maintenanceRecord: MaintenanceResponse | null = null;
  appliances: ApplianceResponse[] = [];
  utilities: UtilityResponse[] = [];
  maintenanceItems: MaintenanceItemResponse[] = [];
  housekeepingUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['maintenance', 'appliances', 'utilities', 'maintenanceItems', 'cleaners', 'inspectors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();


  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private maintenanceService: MaintenanceService,
    private applianceService: ApplianceService,
    private maintenanceUtilityService: MaintenanceUtilityService,
    private maintenanceItemsService: MaintenanceItemsService,
    private authService: AuthService,
    private toastr: ToastrService,
    private unsavedChangesDialogService: UnsavedChangesDialogService
  ) {
    this.form = this.buildForm();
  }

  //#region Maintenance
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.setupAssigneeDateSync();
    this.loadPropertyScopedData();
    this.loadHousekeepingUsers();
    this.loadInspectorUsers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      this.loadPropertyScopedData();
    }
  }

  onSave(onComplete?: (saved: boolean) => void): void {
    if (!this.property) {
      onComplete?.(false);
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      onComplete?.(false);
      return;
    }

    this.isSaving = true;
    const raw = this.form.getRawValue();
    const cleanerUserId = this.nullIfBlank(raw.cleanerUserId);
    const carpetUserId = this.nullIfBlank(raw.carpetUserId);
    const inspectorUserId = this.nullIfBlank(raw.inspectorUserId);
    const maintenancePayload: MaintenanceRequest = {
      maintenanceId: this.maintenanceRecord?.maintenanceId || undefined,
      organizationId: raw.organizationId || this.maintenanceRecord?.organizationId || this.property?.organizationId || '',
      officeId: raw.officeId ?? this.maintenanceRecord?.officeId ?? this.property?.officeId ?? 0,
      officeName: raw.officeName || this.maintenanceRecord?.officeName || this.property?.officeName || '',
      propertyId: raw.propertyId || this.maintenanceRecord?.propertyId || this.property?.propertyId || '',
      inspectionCheckList: this.maintenanceRecord?.inspectionCheckList || '',
      cleanerUserId,
      cleaningDate: cleanerUserId ? this.mappingService.toDateOnlyJsonString(raw.cleaningDate) : null,
      carpetUserId,
      carpetDate: carpetUserId ? this.mappingService.toDateOnlyJsonString(raw.carpetDate) : null,
      inspectorUserId,
      inspectingDate: inspectorUserId ? this.mappingService.toDateOnlyJsonString(raw.inspectingDate) : null,
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
          maintenanceId: existing?.maintenanceId ?? maintenancePayload.maintenanceId,
          organizationId: maintenancePayload.organizationId || existing?.organizationId || this.property.organizationId || this.user?.organizationId || '',
          officeId: maintenancePayload.officeId ?? existing?.officeId ?? this.property.officeId ?? 0,
          officeName: maintenancePayload.officeName || existing?.officeName || this.property.officeName || '',
          propertyId: maintenancePayload.propertyId || existing?.propertyId || this.property.propertyId,
          inspectionCheckList: checklistJson,
          cleanerUserId: pickValue(maintenancePayload.cleanerUserId, existing?.cleanerUserId, null),
          cleaningDate: pickValue(maintenancePayload.cleaningDate, existing?.cleaningDate, null),
          carpetUserId: pickValue(maintenancePayload.carpetUserId, existing?.carpetUserId, null),
          carpetDate: pickValue(maintenancePayload.carpetDate, existing?.carpetDate, null),
          inspectorUserId: pickValue(maintenancePayload.inspectorUserId, existing?.inspectorUserId, null),
          inspectingDate: pickValue(maintenancePayload.inspectingDate, existing?.inspectingDate, null),
          notes: pickValue(maintenancePayload.notes, existing?.notes, null),
          isActive: maintenancePayload.isActive ?? existing?.isActive ?? true
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
        onComplete?.(true);
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error('Unable to save maintenance.', CommonMessage.Error);
        onComplete?.(false);
      }
    });
  }

  onApplianceSaveChanges(payload: { upserts: ApplianceRequest[]; deleteIds: number[] }): void {
    if (!this.property) {
      return;
    }

    const upserts = payload.upserts || [];
    if (upserts.length === 0) {
      return;
    }

    this.isSavingAppliances = true;
    const upsertOperations$ = from(upserts).pipe(
      concatMap(request => request.applianceId
        ? this.applianceService.updateAppliance(request)
        : this.applianceService.createAppliance(request))
    );

    upsertOperations$.pipe(
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

  onApplianceDelete(applianceId: number): void {
    if (!Number.isFinite(applianceId)) {
      return;
    }
    this.isSavingAppliances = true;
    this.applianceService.deleteAppliance(applianceId).pipe(take(1), finalize(() => {
      this.isSavingAppliances = false;
    })).subscribe({
      next: () => {
        this.loadAppliances();
        this.toastr.success('Appliance removed.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to remove appliance.', CommonMessage.Error);
      }
    });
  }

  onUtilitySaveChanges(payload: { upserts: UtilityRequest[]; deleteIds: number[] }): void {
    if (!this.property) {
      return;
    }

    const upserts = payload.upserts || [];
    if (upserts.length === 0) {
      return;
    }

    this.isSavingUtilities = true;
    const upsertOperations$ = from(upserts).pipe(
      concatMap(request => request.utilityId
        ? this.maintenanceUtilityService.updateUtility(request)
        : this.maintenanceUtilityService.createUtility(request))
    );

    upsertOperations$.pipe(
      defaultIfEmpty(null),
      finalize(() => {
        this.isSavingUtilities = false;
      })
    ).subscribe({
      complete: () => {
        this.loadUtilities();
        this.toastr.success('Utilities saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save utilities.', CommonMessage.Error);
      }
    });
  }

  onUtilityDelete(utilityId: number): void {
    if (!Number.isFinite(utilityId)) {
      return;
    }
    this.isSavingUtilities = true;
    this.maintenanceUtilityService.deleteUtility(utilityId).pipe(take(1), finalize(() => {
      this.isSavingUtilities = false;
    })).subscribe({
      next: () => {
        this.loadUtilities();
        this.toastr.success('Utility removed.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to remove utility.', CommonMessage.Error);
      }
    });
  }

  onMaintenanceItemSaveChanges(payload: { upserts: MaintenanceItemRequest[]; deleteIds: number[] }): void {
    if (!this.property) {
      return;
    }

    const upserts = payload.upserts || [];
    if (upserts.length === 0) {
      return;
    }

    this.isSavingMaintenanceItems = true;
    const upsertOperations$ = from(upserts).pipe(
      concatMap(request => request.maintenanceItemId
        ? this.maintenanceItemsService.updateMaintenanceItem(request)
        : this.maintenanceItemsService.createMaintenanceItem(request))
    );

    upsertOperations$.pipe(
      defaultIfEmpty(null),
      finalize(() => {
        this.isSavingMaintenanceItems = false;
      })
    ).subscribe({
      complete: () => {
        this.loadMaintenanceItems();
        this.toastr.success('Maintenance items saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save maintenance items.', CommonMessage.Error);
      }
    });
  }

  onMaintenanceItemDelete(maintenanceItemId: number): void {
    if (!Number.isFinite(maintenanceItemId) || !this.property) {
      return;
    }
    this.isSavingMaintenanceItems = true;
    this.maintenanceItemsService.deleteMaintenanceItem(maintenanceItemId).pipe(take(1), finalize(() => {
      this.isSavingMaintenanceItems = false;
    })).subscribe({
      next: () => {
        this.loadMaintenanceItems();
        this.toastr.success('Maintenance item removed.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to remove maintenance item.', CommonMessage.Error);
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
    this.applianceService.getAppliancesByPropertyId(propertyId).pipe(
      takeUntil(this.destroy$),
      switchMap((appliances: ApplianceResponse[]) => {
        const source = appliances || [];
        return from(source).pipe(
          concatMap(appliance => {
            if (!appliance?.applianceId) {
              return of(appliance);
            }
            return this.applianceService.getApplianceById(appliance.applianceId).pipe(
              map((details: ApplianceResponse) => ({
                ...appliance,
                ...details,
                decalFileDetails: details?.decalFileDetails ?? appliance.decalFileDetails
              })),
              catchError(() => of(appliance))
            );
          }),
          toArray()
        );
      }),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'appliances'))
    ).subscribe({
      next: (appliances: ApplianceResponse[]) => {
        this.appliances = appliances;
      },
      error: () => {
        this.appliances = [];
      }
    });
  }

  loadUtilities(): void {
    const propertyId = this.property?.propertyId;
    if (!propertyId) {
      this.utilities = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'utilities');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'utilities');
    this.maintenanceUtilityService.getUtilitiesByPropertyId(propertyId).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'utilities'))).subscribe({
      next: (utilities: UtilityResponse[]) => {
        this.utilities = utilities || [];
      },
      error: () => {
        this.utilities = [];
      }
    });
  }

  loadMaintenanceItems(): void {
    const propertyId = this.property?.propertyId;
    if (!propertyId) {
      this.maintenanceItems = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenanceItems');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'maintenanceItems');
    this.maintenanceItemsService.getMaintenanceItemsByPropertyId(propertyId).pipe(takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'maintenanceItems'))).subscribe({
      next: (items: MaintenanceItemResponse[]) => {
        this.maintenanceItems = items || [];
      },
      error: () => {
        this.maintenanceItems = [];
      }
    });
  }

  loadPropertyScopedData(): void {
    this.loadMaintenance();
    this.loadAppliances();
    this.loadUtilities();
    this.loadMaintenanceItems();
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
    return this.fb.group({
      maintenanceId: new FormControl<string>(''),
      organizationId: new FormControl<string>(''),
      officeId: new FormControl<number | null>(null),
      officeName: new FormControl<string>(''),
      propertyId: new FormControl<string>(''),
      inspectionCheckList: new FormControl<string>(''),
      cleanerUserId: new FormControl<string | null>(null),
      cleaningDate: new FormControl<Date | null>(null),
      carpetUserId: new FormControl<string | null>(null),
      carpetDate: new FormControl<Date | null>(null),
      inspectorUserId: new FormControl<string | null>(null),
      inspectingDate: new FormControl<Date | null>(null),
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
      cleaningDate: this.utilityService.parseCalendarDateInput(source?.cleaningDate ?? null),
      carpetUserId: source?.carpetUserId ?? null,
      carpetDate: this.utilityService.parseCalendarDateInput(source?.carpetDate ?? null),
      inspectorUserId: source?.inspectorUserId ?? null,
      inspectingDate: this.utilityService.parseCalendarDateInput(source?.inspectingDate ?? null),
      notes: source?.notes ?? '',
      isActive: source?.isActive ?? true
    }, { emitEvent: false });
    this.captureSavedStateSignature();
  }

  hasUnsavedChanges(): boolean {
    return !!this.form?.dirty && !this.isSaving && !this.isSavingAppliances && !this.isSavingUtilities && !this.isSavingMaintenanceItems;
  }

  async confirmNavigationWithUnsavedChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const action = await this.unsavedChangesDialogService.confirmLeaveOrSave();
    if (action === 'save') {
      return this.saveMaintenanceAndWait();
    }
    this.discardUnsavedChanges();
    return true;
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

    this.form.get('carpetUserId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.nullIfBlank(value) !== null) {
        return;
      }
      const carpetDateControl = this.form.get('carpetDate');
      if (carpetDateControl?.value !== null) {
        carpetDateControl.setValue(null, { emitEvent: false });
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

  get isLoadingMaintenanceItems(): boolean {
    return this.itemsToLoad$.value.has('maintenanceItems');
  }

  get isLoadingUtilities(): boolean {
    return this.itemsToLoad$.value.has('utilities');
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

      const selectedDay = this.utilityService.parseCalendarDateInput(value);
      if (!selectedDay) {
        return null;
      }

      const today = new Date();
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return selectedDay > todayDay ? { futureDate: true } : null;
    };
  }
  //#endregion

  //#region Utility Methods
  captureSavedStateSignature(): void {
    if (!this.form) {
      return;
    }
    this.savedFormState = structuredClone(this.form.getRawValue() as Record<string, unknown>);
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  saveMaintenanceAndWait(): Promise<boolean> {
    return new Promise(resolve => this.onSave(resolve));
  }

  discardUnsavedChanges(): void {
    if (!this.form || !this.savedFormState) {
      return;
    }
    this.form.reset(structuredClone(this.savedFormState), { emitEvent: false });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
  //#endregion
}
