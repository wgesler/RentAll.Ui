import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  filter,
  finalize,
  forkJoin,
  map,
  of,
  take,
  takeUntil
} from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { UtilityService } from '../../../services/utility.service';
import { AreaResponse } from '../../organizations/models/area.model';
import { BuildingResponse } from '../../organizations/models/building.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { RegionResponse } from '../../organizations/models/region.model';
import { AreaService } from '../../organizations/services/area.service';
import { BuildingService } from '../../organizations/services/building.service';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { RegionService } from '../../organizations/services/region.service';
import { PropertyStatus } from '../models/property-enums';
import { PropertySelectionRequest, PropertySelectionResponse } from '../models/property-selection.model';
import { PropertySelectionFilterService } from '../services/property-selection-filter.service';
import { PropertyService } from '../services/property.service';

@Component({
    standalone: true,
    selector: 'app-property-selection',
    imports: [CommonModule, MaterialModule, ReactiveFormsModule],
    templateUrl: './property-selection.component.html',
    styleUrl: './property-selection.component.scss'
})
export class PropertySelectionComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isSubmitting: boolean = false;
  isServiceError: boolean = false;
  states: string[] = [];
  offices: OfficeResponse[] = [];
  regions: RegionResponse[] = [];
  areas: AreaResponse[] = [];
  buildings: BuildingResponse[] = [];
  allRegionsByOrg: RegionResponse[] = [];
  allAreasByOrg: AreaResponse[] = [];
  allBuildingsByOrg: BuildingResponse[] = [];
  propertyStatuses: { value: number; label: string }[] = [];
  preloadedSelection: PropertySelectionResponse | null = null;
  globalOfficeSubscription?: Subscription;
  /** Where the user came from. Used for Back navigation. */
  returnSource: 'reservation-board' | 'property-list' | 'reservation-list' | 'maintenance-list' = 'reservation-board';
  /** Path to return to for reservation-list (e.g. /auth/rentals vs /auth/reservations). */
  reservationListReturnPath: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['selection', 'lookups']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  private readonly destroy$ = new Subject<void>();
  private formFilterTrackingSetup = false;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private propertyService: PropertyService,
    private authService: AuthService,
    private toastr: ToastrService,
    private commonService: CommonService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private regionService: RegionService,
    private areaService: AreaService,
    private buildingService: BuildingService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private propertySelectionFilterService: PropertySelectionFilterService
  ) {
  }

  //#region Property-Selection
  ngOnInit(): void {
    this.buildForm();
    this.initializePropertyStatuses();
    this.loadStates();
    this.loadDropDownLookups();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().subscribe(() => {
      this.applyOfficeFilterToLookups();
    });

    this.itemsToLoad$
      .pipe(
        map((s) => s.size),
        filter((n) => n === 0),
        take(1),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.setupFormFilterTrackingOnce();
        this.propertySelectionFilterService.setFromResponse(this.buildSyntheticResponseFromForm());
      });

    // If we navigated here from the board or property list, it may have preloaded the selection.
    const state = history.state || {};
    const source = state['source'] as 'reservation-board' | 'property-list' | 'reservation-list' | 'maintenance-list' | undefined;
    if (source === 'property-list') this.returnSource = 'property-list';
    else if (source === 'reservation-list') {
      this.returnSource = 'reservation-list';
      const path = state['listReturnPath'] as string | undefined;
      this.reservationListReturnPath = path?.trim() || null;
    } else if (source === 'maintenance-list') this.returnSource = 'maintenance-list';
    else this.returnSource = 'reservation-board';

    const preloaded = (state['selection'] as PropertySelectionResponse) || null;
    if (preloaded) {
      this.preloadedSelection = preloaded;
      this.patchFormFromResponse(preloaded);
      this.propertySelectionFilterService.setFromResponse(preloaded);
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'selection');
    } else {
      this.loadPropertySelection();
    }
  }

  loadPropertySelection(): void {
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.isServiceError = true;
      this.toastr.error('No userId found for this session.', CommonMessage.Unauthorized);
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'selection');
      return;
    }

    this.propertyService.getPropertySelection(userId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'selection'))).subscribe({
      next: (response: PropertySelectionResponse | null) => {
        this.preloadedSelection = response;
        this.patchFormFromResponse(response);
        this.propertySelectionFilterService.setFromResponse(response);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.patchFormFromResponse(null);
          this.propertySelectionFilterService.setFromResponse(null);
        } else {
          this.isServiceError = true;
        }
      }
    });
  }
  
  savePropertySelections(): void {
    if (!this.form) return;

    const request = this.buildRequestFromForm();
    if (!request) {
      this.toastr.error('No userId found for this session.', CommonMessage.Unauthorized);
      return;
    }

    this.isSubmitting = true;

    this.propertyService.putPropertySelection(request).pipe(take(1), finalize(() => (this.isSubmitting = false))).subscribe({
      next: (response: PropertySelectionResponse) => {
        this.preloadedSelection = response;
        this.propertySelectionFilterService.setFromResponse(response);
        this.toastr.success('Selection saved successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.goBack();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }

    // Subscribe to observable (states are loaded by app.component)
    this.commonService.getStates().pipe(
      filter(states => states && states.length > 0),
      take(1)
    ).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: () => {}
    });
  }

  loadDropDownLookups(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lookups');
      return;
    }

    forkJoin({
      offices: this.officeService.getOffices(orgId).pipe(take(1)),
      regions: this.regionService.getRegions().pipe(take(1)),
      areas: this.areaService.getAreas().pipe(take(1)),
      buildings: this.buildingService.getBuildings().pipe(take(1)),
    }).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lookups'); })).subscribe({
      next: ({ offices, regions, areas, buildings }) => {
        this.offices = (offices || []).filter(f => f.organizationId === orgId && f.isActive);
        this.allRegionsByOrg = (regions || []).filter(r => r.organizationId === orgId && r.isActive);
        this.allAreasByOrg = (areas || []).filter(a => a.organizationId === orgId && a.isActive);
        this.allBuildingsByOrg = (buildings || []).filter(b => b.organizationId === orgId && b.isActive);
        this.applyOfficeFilterToLookups();

        // If selection is already loaded, update location fields in form
        if (this.form && this.preloadedSelection) {
          const officeId = this.getCodeToId(this.preloadedSelection.officeCode, this.offices, 'officeCode');
          this.form.patchValue({
            officeId: officeId ?? '',
            buildingCodes: this.preloadedSelection.buildingCodes ?? [],
            regionCodes: this.preloadedSelection.regionCodes ?? [],
            areaCodes: this.preloadedSelection.areaCodes ?? [],
          });
        }
      },
      error: () => {
        this.offices = [];
        this.allRegionsByOrg = [];
        this.allAreasByOrg = [];
        this.allBuildingsByOrg = [];
        this.regions = [];
        this.areas = [];
        this.buildings = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lookups');
      }
    });
  }

  applyOfficeFilterToLookups(): void {
    const officeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
    if (officeId == null) {
      this.regions = [...this.allRegionsByOrg];
      this.areas = [...this.allAreasByOrg];
      this.buildings = [...this.allBuildingsByOrg];
    } else {
      this.regions = this.allRegionsByOrg.filter(r => r.officeId === officeId);
      this.areas = this.allAreasByOrg.filter(a => Number(a.officeId) === officeId);
      this.buildings = this.allBuildingsByOrg.filter(b => Number(b.officeId) === officeId);
    }
  }

  initializePropertyStatuses(): void {
    this.propertyStatuses = Object.keys(PropertyStatus)
      .filter(key => !isNaN(Number((PropertyStatus as any)[key])))
      .map(key => ({ value: Number((PropertyStatus as any)[key]), label: this.formatEnumLabel(key) }));
  }

  formatEnumLabel(enumKey: string): string {
    return enumKey
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, str => str.toUpperCase());
  }
  //#endregion
  
  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      // Use '' to match other dropdowns (e.g. Office) where All is selected by default
      propertyStatusId: new FormControl<number | ''>(''),
      fromBeds: new FormControl<number | null>(null),
      toBeds: new FormControl<number | null>(null),
      accomodates: new FormControl<number | null>(null),
      propertyCode: new FormControl<string>(''),
      city: new FormControl<string>(''),
      state: new FormControl<string>(''),
      maxRent: new FormControl<number | null>(null),
      unfurnished: new FormControl<boolean>(false),
      cable: new FormControl<boolean>(false),
      streaming: new FormControl<boolean>(false),
      pool: new FormControl<boolean>(false),
      jacuzzi: new FormControl<boolean>(false),
      security: new FormControl<boolean>(false),
      parking: new FormControl<boolean>(false),
      pets: new FormControl<boolean>(false),
      smoking: new FormControl<boolean>(false),
      highSpeedInternet: new FormControl<boolean>(false),
      officeId: new FormControl<number | ''>(''),
      buildingCodes: new FormControl<string[]>([]),
      regionCodes: new FormControl<string[]>([]),
      areaCodes: new FormControl<string[]>([]),
    });
  }

  patchFormFromResponse(response: PropertySelectionResponse | null): void {
    if (!this.form) return;

    const officeId = this.offices.length > 0 && response?.officeCode
      ? (this.getCodeToId(response.officeCode, this.offices, 'officeCode') ?? '')
      : '';

    this.form.patchValue({
      fromBeds: response?.fromBeds ?? null,
      toBeds: response?.toBeds ?? null,
      accomodates: response?.accomodates ?? null,
      maxRent: response?.maxRent ?? null,
      propertyCode: response?.propertyCode ?? '',
      city: response?.city ?? '',
      state: response?.state ?? '',

      unfurnished: response?.unfurnished ?? false,
      cable: response?.cable ?? false,
      streaming: response?.streaming ?? false,
      pool: response?.pool ?? false,
      jacuzzi: response?.jacuzzi ?? false,
      security: response?.security ?? false,
      parking: response?.parking ?? false,
      pets: response?.pets ?? false,
      smoking: response?.smoking ?? false,
      highSpeedInternet: response?.highSpeedInternet ?? false,

      propertyStatusId: response?.propertyStatusId === 0 ? '' : (response?.propertyStatusId ?? ''),
      officeId: officeId as number | '',
      buildingCodes: response?.buildingCodes ?? [],
      regionCodes: response?.regionCodes ?? [],
      areaCodes: response?.areaCodes ?? [],
    });
  }

  /** After selection + lookups load, track form edits for global Selection button highlight. */
  private setupFormFilterTrackingOnce(): void {
    if (this.formFilterTrackingSetup || !this.form) return;
    this.formFilterTrackingSetup = true;
    this.form.valueChanges.pipe(debounceTime(250), takeUntil(this.destroy$)).subscribe(() => {
      this.propertySelectionFilterService.setFromResponse(this.buildSyntheticResponseFromForm());
    });
  }

  private buildSyntheticResponseFromForm(): PropertySelectionResponse {
    const req = this.buildRequestFromForm();
    if (!req) {
      return {
        userId: '',
        fromBeds: 0,
        toBeds: 0,
        accomodates: 0,
        maxRent: 0,
        propertyCode: null,
        city: null,
        state: null,
        unfurnished: false,
        cable: false,
        streaming: false,
        pool: false,
        jacuzzi: false,
        security: false,
        parking: false,
        pets: false,
        smoking: false,
        highSpeedInternet: false,
        propertyStatusId: 0,
        officeCode: null,
        buildingCodes: [],
        regionCodes: [],
        areaCodes: []
      };
    }
    return { ...req } as PropertySelectionResponse;
  }

  /** Clears all filters, persists defaults to the server, and updates global filter state. */
  resetForm(): void {
    if (!this.form) return;

    this.form.reset({
      propertyStatusId: '',
      fromBeds: null,
      toBeds: null,
      accomodates: null,
      propertyCode: '',
      city: '',
      state: '',
      maxRent: null,
      unfurnished: false,
      cable: false,
      streaming: false,
      pool: false,
      jacuzzi: false,
      security: false,
      parking: false,
      pets: false,
      smoking: false,
      highSpeedInternet: false,
      officeId: '',
      buildingCodes: [],
      regionCodes: [],
      areaCodes: []
    });

    this.form.markAsUntouched();
    this.form.markAsPristine();

    const request = this.buildRequestFromForm();
    if (!request) {
      this.toastr.error('No userId found for this session.', CommonMessage.Unauthorized);
      return;
    }

    this.isSubmitting = true;
    this.propertyService.putPropertySelection(request).pipe(take(1), finalize(() => (this.isSubmitting = false))).subscribe({
      next: (response: PropertySelectionResponse) => {
        this.preloadedSelection = response;
        this.propertySelectionFilterService.setFromResponse(response);
        this.toastr.success('Property filters cleared.', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
      },
      error: () => {
        this.isServiceError = true;
        this.loadPropertySelection();
      }
    });
  }

  private buildRequestFromForm(): PropertySelectionRequest | null {
    if (!this.form) return null;
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) return null;
    const v = this.form.getRawValue() as any;
    return {
      userId,
      fromBeds: this.toNumber(v.fromBeds, 0),
      toBeds: this.toNumber(v.toBeds, 0),
      accomodates: this.toNumber(v.accomodates, 0),
      maxRent: this.toNumber(v.maxRent, 0),
      propertyCode: this.toStringOrNull(v.propertyCode),
      city: this.toStringOrNull(v.city),
      state: this.toStringOrNull(v.state),
      unfurnished: !!v.unfurnished,
      cable: !!v.cable,
      streaming: !!v.streaming,
      pool: !!v.pool,
      jacuzzi: !!v.jacuzzi,
      security: !!v.security,
      parking: !!v.parking,
      pets: !!v.pets,
      smoking: !!v.smoking,
      highSpeedInternet: !!v.highSpeedInternet,
      propertyStatusId: this.toNumber(v.propertyStatusId, 0),
      officeCode: this.getIdToCode(v.officeId, this.offices, 'officeCode'),
      buildingCodes: Array.isArray(v.buildingCodes) ? v.buildingCodes : [],
      regionCodes: Array.isArray(v.regionCodes) ? v.regionCodes : [],
      areaCodes: Array.isArray(v.areaCodes) ? v.areaCodes : []
    };
  }
  //#endregion

  //#region Get Code Methods
  getOfficeCode(officeId?: number): string | undefined {
    if (!officeId) return undefined;
    return this.offices.find(f => f.officeId === officeId)?.officeCode;
  }

  getRegionCode(regionId?: number): string | undefined {
    if (!regionId) return undefined;
    return this.regions.find(r => r.regionId === regionId)?.regionCode;
  }

  getAreaCode(areaId?: number): string | undefined {
    if (!areaId) return undefined;
    return this.areas.find(a => a.areaId === areaId)?.areaCode;
  }

  getBuildingCode(buildingId?: number): string | undefined {
    if (!buildingId) return undefined;
    return this.buildings.find(b => b.buildingId === buildingId)?.buildingCode;
  }

  findOfficeIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.offices.find(f => f.officeCode === c)?.officeId;
  }

  findRegionIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.regions.find(r => r.regionCode === c)?.regionId;
  }

  findAreaIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.areas.find(a => a.areaCode === c)?.areaId;
  }

  findBuildingIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.buildings.find(b => b.buildingCode === c)?.buildingId;
  }
  //#endregion

  //#region Conversion Methods
  toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const s = value.toString().trim();
    return s.length > 0 ? s : null;
  }

  toNumber(value: unknown, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }

  toNumberFromDropdown(value: unknown, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }

  getIdToCode(id: number | null | string | '', list: any[], codeField: string): string | null {
    if (id === null || id === undefined || id === '' || id === 0) {
      return null;
    }
    const numericId = typeof id === 'number' ? id : Number(id);
    if (!Number.isFinite(numericId) || numericId === 0) {
      return null;
    }
    const idField = codeField.replace('Code', 'Id');
    const item = list.find(item => item[idField] === numericId);
    return item?.[codeField] || null;
  }

  getCodeToId(code: string | null | undefined, list: any[], codeField: string): number | null {
    if (!code || code.trim() === '') {
      return null;
    }
    const idField = codeField.replace('Code', 'Id');
    const item = list.find(item => item[codeField] === code);
    return item?.[idField] || null;
  }
  //#endregion

  //#region Utility Methods
  numbersOnly(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Tab',
      'Enter',
      'Escape',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'Delete',
    ];

    if (allowedKeys.includes(event.key)) return;

    // Allow copy/paste/select-all shortcuts
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    // Digits only (prevents e/E/+/-/.)
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  private navigateBackFromSelection(): void {
    if (this.returnSource === 'property-list') {
      this.router.navigateByUrl(RouterUrl.PropertyList);
      return;
    }
    if (this.returnSource === 'reservation-list') {
      const path = this.reservationListReturnPath || RouterUrl.ReservationList;
      this.router.navigateByUrl(path.startsWith('/') ? path : `/${path}`);
      return;
    }
    if (this.returnSource === 'maintenance-list') {
      this.router.navigateByUrl(RouterUrl.MaintenanceList);
      return;
    }
    this.router.navigateByUrl(RouterUrl.ReservationBoard);
  }

  goBack(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!this.form?.dirty || !userId) {
      this.navigateBackFromSelection();
      return;
    }
    this.propertyService
      .getPropertySelection(userId)
      .pipe(
        take(1),
        catchError((err: unknown) =>
          err instanceof HttpErrorResponse && err.status === 404 ? of(null) : of(this.preloadedSelection)
        )
      )
      .subscribe((s) => {
        this.propertySelectionFilterService.setFromResponse(s);
        this.navigateBackFromSelection();
      });
  }
  //#endregion
}
