import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { PropertyService } from '../../property/services/property.service';
import { AuthService } from '../../../services/auth.service';
import { PropertySelectionRequest, PropertySelectionResponse } from '../models/reservation-selection-model';
import { take, finalize, filter, forkJoin } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonService } from '../../../services/common.service';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { RegionService } from '../../organization-configuration/region/services/region.service';
import { AreaService } from '../../organization-configuration/area/services/area.service';
import { BuildingService } from '../../organization-configuration/building/services/building.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { RegionResponse } from '../../organization-configuration/region/models/region.model';
import { AreaResponse } from '../../organization-configuration/area/models/area.model';
import { BuildingResponse } from '../../organization-configuration/building/models/building.model';
import { PropertyStatus } from '../../property/models/property-enums';

@Component({
  selector: 'app-reservation-board-selection',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './reservation-board-selection.component.html',
  styleUrl: './reservation-board-selection.component.scss',
})
export class ReservationBoardSelectionComponent implements OnInit {
  form: FormGroup;
  isSubmitting: boolean = false;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;

  states: string[] = [];
  offices: OfficeResponse[] = [];
  regions: RegionResponse[] = [];
  areas: AreaResponse[] = [];
  buildings: BuildingResponse[] = [];
  propertyStatuses: { value: number; label: string }[] = [];
  private preloadedSelection: PropertySelectionResponse | null = null;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private propertyService: PropertyService,
    private authService: AuthService,
    private toastr: ToastrService,
    private commonService: CommonService,
    private officeService: OfficeService,
    private regionService: RegionService,
    private areaService: AreaService,
    private buildingService: BuildingService
  ) {
    this.itemsToLoad.push('selection');
  }

  ngOnInit(): void {
    this.buildForm();
    this.initializePropertyStatuses();
    this.loadStates();
    this.loadDropDownLookups();

    // If we navigated here from the board, it may have preloaded the selection.
    const preloaded = (history.state && (history.state.selection as PropertySelectionResponse)) || null;
    if (preloaded) {
      this.preloadedSelection = preloaded;
      this.patchFormFromResponse(preloaded);
      this.removeLoadItem('selection');
    } else {
      this.loadPropertySelection();
    }
  }

  backToBoard(): void {
    this.router.navigateByUrl(RouterUrl.ReservationBoard);
  }

  savePropertySelections (): void {
    if (!this.form) return;

    this.isSubmitting = true;

    const userId = this.authService.getUser()?.userId || '';
    const v = this.form.getRawValue() as any;

    const request: PropertySelectionRequest = {
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
      // Convert IDs from dropdowns to codes for API
      // If "All" or empty is selected, send null
      officeCode: this.getIdToCode(v.officeId, this.offices, 'officeCode'),
      buildingCode: this.getIdToCode(v.buildingId, this.buildings, 'buildingCode'),
      regionCode: this.getIdToCode(v.regionId, this.regions, 'regionCode'),
      areaCode: this.getIdToCode(v.areaId, this.areas, 'areaCode'),
    };

    if (!request.userId) {
      this.isSubmitting = false;
      this.toastr.error('No userId found for this session.', CommonMessage.Unauthorized);
      return;
    }

    this.propertyService.putPropertySelection(request).pipe(
      take(1),
      finalize(() => (this.isSubmitting = false))
    ).subscribe({
      next: (_response: PropertySelectionResponse) => {
        this.toastr.success('Selection saved successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.backToBoard();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not save selection.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

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

  loadPropertySelection(): void {
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.isServiceError = true;
      this.toastr.error('No userId found for this session.', CommonMessage.Unauthorized);
      this.removeLoadItem('selection');
      return;
    }

    this.propertyService.getPropertySelection(userId).pipe(take(1), finalize(() => this.removeLoadItem('selection'))).subscribe({
      next: (response: PropertySelectionResponse | null) => {
        this.preloadedSelection = response;
        this.patchFormFromResponse(response);
      },
      error: (err: HttpErrorResponse) => {
        // If selection isn't found (404), treat as new user and set default furnished to true
        if (err.status === 404) {
          this.patchFormFromResponse(null);
        } else {
          this.isServiceError = true;
          if (err.status !== 400) {
            this.toastr.error('Could not load selection.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      }
    });
  }

  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }

    // Trigger load if not already loaded
    this.commonService.loadStates();

    this.commonService.getStates().pipe(
      filter(states => states && states.length > 0),
      take(1)
    ).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: (err) => {
        console.error('Reservation Board Selection - Error loading states:', err);
      }
    });
  }

  loadDropDownLookups(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      return;
    }

    forkJoin({
      offices: this.officeService.getOffices().pipe(take(1)),
      regions: this.regionService.getRegions().pipe(take(1)),
      areas: this.areaService.getAreas().pipe(take(1)),
      buildings: this.buildingService.getBuildings().pipe(take(1)),
    }).pipe(take(1)).subscribe({
      next: ({ offices, regions, areas, buildings }) => {
        this.offices = (offices || []).filter(f => f.organizationId === orgId && f.isActive);
        this.regions = (regions || []).filter(r => r.organizationId === orgId && r.isActive);
        this.areas = (areas || []).filter(a => a.organizationId === orgId && a.isActive);
        this.buildings = (buildings || []).filter(b => b.organizationId === orgId && b.isActive);
        
        // If selection is already loaded, update location fields in form
        // This handles the case where lookups load after the selection response
        if (this.form && this.preloadedSelection) {
          const officeId = this.getCodeToId(this.preloadedSelection.officeCode, this.offices, 'officeCode');
          const regionId = this.getCodeToId(this.preloadedSelection.regionCode, this.regions, 'regionCode');
          const areaId = this.getCodeToId(this.preloadedSelection.areaCode, this.areas, 'areaCode');
          const buildingId = this.getCodeToId(this.preloadedSelection.buildingCode, this.buildings, 'buildingCode');
          
          this.form.patchValue({
            officeId: officeId ?? '',
            regionId: regionId ?? '',
            areaId: areaId ?? '',
            buildingId: buildingId ?? '',
          });
        }
      },
      error: (err) => {
        console.error('Reservation Board Selection - Error loading lookups:', err);
      }
    });
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

  // Form Methods
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
      regionId: new FormControl<number | ''>(''),
      areaId: new FormControl<number | ''>(''),
      buildingId: new FormControl<number | ''>(''),
    });
  }

  patchFormFromResponse(response: PropertySelectionResponse | null): void {
    if (!this.form) return;

    // Convert codes from API to IDs for dropdowns (only if lookups are loaded)
    const officeId = this.offices.length > 0 
      ? (this.getCodeToId(response.officeCode, this.offices, 'officeCode') ?? '')
      : '';
    const regionId = this.regions.length > 0
      ? (this.getCodeToId(response.regionCode, this.regions, 'regionCode') ?? '')
      : '';
    const areaId = this.areas.length > 0
      ? (this.getCodeToId(response.areaCode, this.areas, 'areaCode') ?? '')
      : '';
    const buildingId = this.buildings.length > 0
      ? (this.getCodeToId(response.buildingCode, this.buildings, 'buildingCode') ?? '')
      : '';

    this.form.patchValue({
      fromBeds: response.fromBeds ?? null,
      toBeds: response.toBeds ?? null,
      accomodates: response.accomodates ?? null,
      maxRent: response.maxRent ?? null,
      propertyCode: response.propertyCode ?? '',
      city: response.city ?? '',
      state: response.state ?? '',

      unfurnished: response.unfurnished ?? false,
      cable: response.cable ?? false,
      streaming: response.streaming ?? false,
      pool: response.pool ?? false,
      jacuzzi: response.jacuzzi ?? false,
      security: response.security ?? false,
      parking: response.parking ?? false,
      pets: response.pets ?? false,
      smoking: response.smoking ?? false,
      highSpeedInternet: response.highSpeedInternet ?? false,

      propertyStatusId: response.propertyStatusId === 0 ? '' : (response.propertyStatusId ?? ''),
      // Convert codes from API to IDs for dropdowns
      // If code is null/empty, set to '' for "All" option
      officeId: officeId as number | '',
      regionId: regionId as number | '',
      areaId: areaId as number | '',
      buildingId: buildingId as number | '',
    });
  }

  private getOfficeCode(officeId?: number): string | undefined {
    if (!officeId) return undefined;
    return this.offices.find(f => f.officeId === officeId)?.officeCode;
  }

  private getRegionCode(regionId?: number): string | undefined {
    if (!regionId) return undefined;
    return this.regions.find(r => r.regionId === regionId)?.regionCode;
  }

  private getAreaCode(areaId?: number): string | undefined {
    if (!areaId) return undefined;
    return this.areas.find(a => a.areaId === areaId)?.areaCode;
  }

  private getBuildingCode(buildingId?: number): string | undefined {
    if (!buildingId) return undefined;
    return this.buildings.find(b => b.buildingId === buildingId)?.buildingCode;
  }

  private findOfficeIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.offices.find(f => f.officeCode === c)?.officeId;
  }

  private findRegionIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.regions.find(r => r.regionCode === c)?.regionId;
  }

  private findAreaIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.areas.find(a => a.areaCode === c)?.areaId;
  }

  private findBuildingIdFromCode(code?: string): number | undefined {
    const c = (code || '').trim();
    if (!c) return undefined;
    return this.buildings.find(b => b.buildingCode === c)?.buildingId;
  }

  // Utility Methods
  // Converts value to string or null (for nullable string fields)
  // Use null explicitly so JSON.stringify includes it in the request
  private toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    const s = value.toString().trim();
    return s.length > 0 ? s : null;
  }

  // Converts value to number with default (for NOT NULL number fields)
  // Always returns a number, never null or undefined
  private toNumber(value: unknown, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }

  // Converts dropdown value to number (handles empty string '' from "All" option)
  // Dropdowns use '' for "All" which should convert to 0 (not filtering)
  private toNumberFromDropdown(value: unknown, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }

  // Convert ID from dropdown to Code for API
  // Returns null if ID is null/empty/0 (meaning "All" or not selected)
  private getIdToCode(id: number | null | string | '', list: any[], codeField: string): string | null {
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

  // Convert Code from API to ID for dropdown
  // Returns null if code is null/empty (meaning not set)
  private getCodeToId(code: string | null | undefined, list: any[], codeField: string): number | null {
    if (!code || code.trim() === '') {
      return null;
    }
    const idField = codeField.replace('Code', 'Id');
    const item = list.find(item => item[codeField] === code);
    return item?.[idField] || null;
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

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
      regionId: '',
      areaId: '',
      buildingId: ''
    });
    
    this.form.markAsUntouched();
    this.form.markAsPristine();
  }
}


