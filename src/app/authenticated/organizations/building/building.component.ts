import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { TrashDays } from '../../properties/models/property-enums';
import { BuildingRequest, BuildingResponse } from '../models/building.model';
import { OfficeResponse } from '../models/office.model';
import { BuildingService } from '../services/building.service';
import { OfficeService } from '../services/office.service';

@Component({
    standalone: true,
    selector: 'app-building',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './building.component.html',
    styleUrl: './building.component.scss'
})

export class BuildingComponent implements OnInit, OnDestroy, OnChanges {
  @Input() id: string | number | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @ViewChild('firstInput') firstInputRef: ElementRef<HTMLInputElement>;
  
  isServiceError: boolean = false;
  routeBuildingId: string | null = null;
  building: BuildingResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  trashDays: { value: number, label: string }[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['building', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    public buildingService: BuildingService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService,
    private officeService: OfficeService,
    private formatterService: FormatterService,
    private mappingService: MappingService
  ) {
  }

  //#region Buildings
  ngOnInit(): void {
    this.initializeTrashDays();
    this.loadOffices();
    // Check for returnTo query parameter
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // Use the input id
    if (this.id) {
      this.isAddMode = this.id === 'new' || this.id === 'new';
      if (this.isAddMode) {
        this.removeLoadItem('building');
        this.buildForm();
        this.scheduleFocusFirstField();
      } else {
        this.getBuilding(this.id.toString());
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If id changes, reload building
    if (changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getBuilding(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('building');
        this.buildForm();
        this.scheduleFocusFirstField();
      }
    }
  }

  getBuilding(id?: string | number): void {
    const idToUse = id || this.id || this.routeBuildingId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const buildingIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(buildingIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid building ID', CommonMessage.Error);
      return;
    }
    this.buildingService.getBuildingById(buildingIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('building'); })).subscribe({
      next: (response: BuildingResponse) => {
        this.building = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.removeLoadItem('building');
      }
    });
  }

  saveBuilding(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const buildingRequest: BuildingRequest = {
      organizationId: user?.organizationId || '',
      buildingCode: formValue.buildingCode,
      name: formValue.name,
      description: formValue.description || undefined,
      officeId: formValue.officeId != null ? String(formValue.officeId) : '',
      hoaName: formValue.hoaName || undefined,
      hoaPhone: formValue.hoaPhone ? this.formatterService.stripPhoneFormatting(formValue.hoaPhone) : undefined,
      hoaEmail: formValue.hoaEmail || undefined,
      heating: !!formValue.heating,
      ac: !!formValue.ac,
      elevator: !!formValue.elevator,
      security: !!formValue.security,
      gated: !!formValue.gated,
      petsAllowed: !!formValue.petsAllowed,
      dogsOkay: !!formValue.dogsOkay,
      catsOkay: !!formValue.catsOkay,
      poundLimit: formValue.poundLimit ?? '',
      trashPickupId: this.normalizeTrashPickupId(formValue.trashPickupId),
      trashRemoval: formValue.trashRemoval?.trim() ? formValue.trashRemoval.trim() : null,
      washerDryerInBldg: !!formValue.washerDryerInBldg,
      deck: !!formValue.deck,
      patio: !!formValue.patio,
      yard: !!formValue.yard,
      garden: !!formValue.garden,
      commonPool: !!formValue.commonPool,
      privatePool: !!formValue.privatePool,
      jacuzzi: !!formValue.jacuzzi,
      sauna: !!formValue.sauna,
      gym: !!formValue.gym,
      isActive: !!formValue.isActive
    };

    if (this.isAddMode) {
      this.buildingService.createBuilding(buildingRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: BuildingResponse) => {
          this.toastr.success('Building created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    } else {
      const idToUse = this.id || this.routeBuildingId;
      const buildingIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(buildingIdNum)) {
        this.toastr.error('Invalid building ID', CommonMessage.Error);
        return;
      }
      buildingRequest.buildingId = buildingIdNum;
      buildingRequest.organizationId = this.building?.organizationId || user?.organizationId || '';
      this.buildingService.updateBuilding(buildingRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: BuildingResponse) => {
          this.toastr.success('Building updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.backEvent.emit();
        },
        error: (_err: HttpErrorResponse) => {}
      });
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.removeLoadItem('offices');
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      buildingCode: new FormControl('', [Validators.required]),
      name: new FormControl('', [Validators.required]),
      description: new FormControl(''),
      officeId: new FormControl(null, [Validators.required]),
      hoaName: new FormControl(''),
      hoaPhone: new FormControl('', [
        Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)
      ]),
      hoaEmail: new FormControl('', [Validators.email]),
      heating: new FormControl(false),
      ac: new FormControl(false),
      elevator: new FormControl(false),
      security: new FormControl(false),
      gated: new FormControl(false),
      petsAllowed: new FormControl(false),
      dogsOkay: new FormControl(false),
      catsOkay: new FormControl(false),
      poundLimit: new FormControl(''),
      trashPickupId: new FormControl<number | null>(null, [Validators.required]),
      trashRemoval: new FormControl(''),
      washerDryerInBldg: new FormControl(false),
      deck: new FormControl(false),
      patio: new FormControl(false),
      yard: new FormControl(false),
      garden: new FormControl(false),
      commonPool: new FormControl(false),
      privatePool: new FormControl(false),
      jacuzzi: new FormControl(false),
      sauna: new FormControl(false),
      gym: new FormControl(false),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.building && this.form) {
      this.form.patchValue({
        buildingCode: this.building.buildingCode?.toUpperCase() || '',
        name: this.building.name,
        description: this.building.description || '',
        officeId: this.building.officeId ? parseInt(this.building.officeId, 10) : null,
        hoaName: this.building.hoaName || '',
        hoaPhone: this.formatterService.phoneNumber(this.building.hoaPhone) || '',
        hoaEmail: this.building.hoaEmail || '',
        heating: this.building.heating ?? false,
        ac: this.building.ac ?? false,
        elevator: this.building.elevator ?? false,
        security: this.building.security ?? false,
        gated: this.building.gated ?? false,
        petsAllowed: this.building.petsAllowed ?? false,
        dogsOkay: this.building.dogsOkay ?? false,
        catsOkay: this.building.catsOkay ?? false,
        poundLimit: this.building.poundLimit ?? '',
        trashPickupId:
          this.building.trashPickupId == null || this.building.trashPickupId === undefined
            ? TrashDays.None
            : this.building.trashPickupId,
        trashRemoval: this.building.trashRemoval ?? '',
        washerDryerInBldg: this.building.washerDryerInBldg ?? false,
        deck: this.building.deck ?? false,
        patio: this.building.patio ?? false,
        yard: this.building.yard ?? false,
        garden: this.building.garden ?? false,
        commonPool: this.building.commonPool ?? false,
        privatePool: this.building.privatePool ?? false,
        jacuzzi: this.building.jacuzzi ?? false,
        sauna: this.building.sauna ?? false,
        gym: this.building.gym ?? false,
        isActive: this.building.isActive
      });
    }
  }

  initializeTrashDays(): void {
    this.trashDays = (Object.keys(TrashDays) as (keyof typeof TrashDays)[])
      .filter(key => typeof TrashDays[key] === 'number')
      .map(key => ({ value: TrashDays[key] as number, label: key as string }));
  }

  normalizeTrashPickupId(value: unknown): number {
    if (value === '' || value === null || value === undefined) {
      return TrashDays.None;
    }
    const n = Number(value);
    return Number.isNaN(n) ? TrashDays.None : n;
  }
  //#endregion

  //#region Phone formatting methods
  formatHoaPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('hoaPhone'));
  }

  onHoaPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('hoaPhone'));
  }
  //#endregion

  //#region Utility Methods
  onCodeInput(event: Event): void {
    this.formatterService.formatCodeInput(event, this.form.get('buildingCode'));
  }

  focusFirstField(): void {
    const el = this.firstInputRef?.nativeElement;
    if (el?.focus) {
      el.focus();
    }
  }

  scheduleFocusFirstField(): void {
    if (!this.isAddMode) return;
    this.isLoading$.pipe(filter(loaded => !loaded), take(1)).subscribe(() => {
      setTimeout(() => this.focusFirstField(), 100);
    });
  }

  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.backEvent.emit();
  }

  onEnterKey(event: Event): void {
    const target = (event as KeyboardEvent).target as HTMLElement;
    if (target?.closest?.('.mat-mdc-select-panel') || target?.closest?.('.cdk-overlay-pane')) {
      return;
    }
    (event as KeyboardEvent).preventDefault();
    if (this.form?.valid && !this.isSubmitting) {
      this.saveBuilding();
    }
  }
  //#endregion
}

