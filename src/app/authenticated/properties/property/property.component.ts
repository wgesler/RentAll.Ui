import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, catchError, distinctUntilChanged, filter, finalize, forkJoin, map, of, skip, switchMap, take, takeUntil } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { AreaResponse } from '../../organizations/models/area.model';
import { BuildingResponse } from '../../organizations/models/building.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { RegionResponse } from '../../organizations/models/region.model';
import { AreaService } from '../../organizations/services/area.service';
import { BuildingService } from '../../organizations/services/building.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { RegionService } from '../../organizations/services/region.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { CheckinTimes, CheckoutTimes, PropertyLeaseType, PropertyStatus, PropertyStyle, PropertyType, TrashDays, getBedSizeTypes, getCheckInTimes, getCheckOutTimes, getPropertyLeaseTypes, getPropertyStatuses, getPropertyStyles, getPropertyTypes, normalizeCheckInTimeId, normalizeCheckOutTimeId, normalizePropertyLeaseTypeId } from '../models/property-enums';
import { PropertyLetterResponse } from '../models/property-letter.model';
import { PropertyTitleBarContext } from '../models/property-title-bar-context.model';
import { PropertyRequest, PropertyResponse } from '../models/property.model';
import { PropertyCodeDialogComponent, PropertyCodeDialogResult } from '../property-code-dialog/property-code-dialog.component';
import { PropertyAgreementComponent } from '../property-agreement/property-agreement.component';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyService } from '../services/property.service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { UnsavedChangesDialogService } from '../../shared/modals/unsaved-changes/unsaved-changes-dialog.service';

@Component({
    selector: 'app-property',
    standalone: true,
    imports: [
        CommonModule,
        MaterialModule,
        FormsModule,
        ReactiveFormsModule,
        SearchableSelectComponent,
        PropertyAgreementComponent
    ],
    templateUrl: './property.component.html',
    styleUrls: ['./property.component.scss']
})

export class PropertyComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  readonly newOwnerOptionValue = '__new_owner__';
  readonly newVendorOptionValue = '__new_vendor__';
  readonly propertyCodeDefaultPrompt = 'Enter Code';
  readonly propertyLeaseTypeOptions = getPropertyLeaseTypes();

  isAdmin = false;
  isServiceError: boolean = false;
  form: FormGroup;
  @ViewChild(PropertyAgreementComponent) propertyAgreementSection?: PropertyAgreementComponent;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  propertyId: string;
  property: PropertyResponse;
  selectedReservationId: string | null = null;
  copiedPropertyInformation: PropertyLetterResponse | null = null; 
 
  states: string[] = [];
  contacts: ContactResponse[] = [];
  contactsSubscription?: Subscription;
  trashDays: { value: number, label: string }[] = [];
  propertyStyles: { value: number, label: string }[] = [];
  propertyStatuses: { value: number, label: string }[] = [];
  propertyTypes: { value: number, label: string }[] = [];
  bedSizeTypes: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];

  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
 
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
 
  regions: RegionResponse[] = [];
  areas: AreaResponse[] = [];
  buildings: BuildingResponse[] = [];
  allRegionsByOrg: RegionResponse[] = [];
  allAreasByOrg: AreaResponse[] = [];
  allBuildingsByOrg: BuildingResponse[] = [];

  globalOfficeSubscription?: Subscription;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'regions', 'areas', 'buildings', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  
  expandedSections = { basic: true, features: true, description: true, agreement: false };
  savedFormState: Record<string, unknown> | null = null;

  @Output() titleBarContextChange = new EventEmitter<PropertyTitleBarContext>();

  constructor(
    public propertyService: PropertyService,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private contactService: ContactService,
    private authService: AuthService,
    private officeService: OfficeService,
    private regionService: RegionService,
    private areaService: AreaService,
    private buildingService: BuildingService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private documentReloadService: DocumentReloadService,
    private utilityService: UtilityService,
    private propertyLetterService: PropertyLetterService,
    private reservationService: ReservationService,
    private globalSelectionService: GlobalSelectionService,
    private dialog: MatDialog,
    private unsavedChangesDialogService: UnsavedChangesDialogService
  ) {
  }

  //#region Property
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    const initialRouteId = this.route.snapshot.paramMap.get('id');
    if (initialRouteId) {
      this.expandedSections.agreement = this.isAdmin;
    }

    this.loadStates();
    this.loadContacts();
    this.loadOffices();
    this.loadRegions();
    this.loadAreas();
    this.loadBuildings();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0 && !this.property) {
        this.resolveOfficeScope(officeId);
        if (this.form) {
          this.form.patchValue({ officeId: this.selectedOffice?.officeId ?? null });
          this.filterLocationLookupsByOffice();
          this.filterReservations();
          this.emitTitleBarContextToShell();
        }
      }
    });

    // Initialize dropdown menus
    this.initializeTrashDays();
    this.initializePropertyStyles();
    this.initializePropertyStatuses();
    this.initializePropertyTypes();
    this.initializeBedSizeTypes();
    this.initializeTimeTypes();
    
    this.buildForm();
    this.applyOfficeControlState();

    this.route.paramMap.pipe(takeUntil(this.destroy$), map(pm => pm.get('id')), filter((id): id is string => id != null && id !== ''), distinctUntilChanged()).subscribe(id => {
      this.propertyId = id;
      this.isAddMode = id === 'new';
      this.expandedSections.agreement = this.isAdmin;

      const codeControl = this.form.get('propertyCode');
      if (this.isAddMode) {
        codeControl?.setValidators([Validators.required, this.propertyCodeEntryValidator]);
      } else {
        codeControl?.clearValidators();
      }
      codeControl?.updateValueAndValidity();
      this.applyOwnerVendorLeaseValidators();
      this.applyOfficeControlState();

      if (!this.isAddMode) {      
        this.getProperty();
      } else {
        this.setAddModeDefaults();
        this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
          if (queryParams['copyFrom']) {
            this.copyFromProperty(queryParams['copyFrom']);
          }
        });
      }
      this.loadReservations();
      this.captureSavedStateSignature();
    });
    
    // Check query params for tab selection
    this.setupConditionalFields();
    this.setupBuildingAmenitySyncFromSelection();
    this.setupOwnerSelectionHandlers();
    this.setupVendorSelectionHandlers();
    this.setupLeaseTypeOwnerVendorValidators();
  }

  getProperty(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        this.populateForm();
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  copyFromProperty(sourcePropertyId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    const contactsLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('contacts')), filter(loaded => loaded === true), take(1));
    const officesLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('offices')), filter(loaded => loaded === true), take(1));
    const regionsLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('regions')), filter(loaded => loaded === true), take(1));
    const areasLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('areas')), filter(loaded => loaded === true), take(1));
    const buildingsLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('buildings')), filter(loaded => loaded === true), take(1));
    
    // Wait for lookups to complete, then load the property and property letter to copy
    forkJoin({
      contacts: contactsLoaded$,
      offices: officesLoaded$,
      regions: regionsLoaded$,
      areas: areasLoaded$,
      buildings: buildingsLoaded$
    }).pipe(take(1),
      switchMap(() => forkJoin({
        property: this.propertyService.getPropertyByGuid(sourcePropertyId).pipe(take(1)),
        propertyInformation: this.propertyLetterService.getPropertyInformationByGuid(sourcePropertyId).pipe(take(1), catchError(() => of(null)))
      })),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })
    ).subscribe({
      next: (result: { property: PropertyResponse; propertyInformation: PropertyLetterResponse | null }) => {
         this.property = result.property;
         this.copiedPropertyInformation = result.propertyInformation;
        
        // Populate form with all copied values
        if (this.property && this.form) {
          // Enable all conditional fields temporarily so patchValue can update them
          this.form.get('parkingNotes')?.enable({ emitEvent: false });
          this.form.get('dogsOkay')?.enable({ emitEvent: false });
          this.form.get('catsOkay')?.enable({ emitEvent: false });
          this.form.get('poundLimit')?.enable({ emitEvent: false });

          this.populateForm();
          this.form.get('propertyCode')?.setValue(this.propertyCodeDefaultPrompt);

          // Now set conditional fields based on copied values
          const parkingValue = this.form.get('parking')?.value;
          const petsAllowedValue = this.form.get('petsAllowed')?.value;

          if (parkingValue) {
            this.form.get('parkingNotes')?.enable({ emitEvent: false });
          } else {
            this.form.get('parkingNotes')?.disable({ emitEvent: false });
            this.form.get('parkingNotes')?.setValue('', { emitEvent: false });
          }
          
          if (petsAllowedValue) {
            this.form.get('dogsOkay')?.enable({ emitEvent: false });
            this.form.get('catsOkay')?.enable({ emitEvent: false });
            this.form.get('poundLimit')?.enable({ emitEvent: false });
          } else {
            this.form.get('dogsOkay')?.disable({ emitEvent: false });
            this.form.get('dogsOkay')?.setValue(false, { emitEvent: false });
            this.form.get('catsOkay')?.disable({ emitEvent: false });
            this.form.get('catsOkay')?.setValue(false, { emitEvent: false });
            this.form.get('poundLimit')?.disable({ emitEvent: false });
            this.form.get('poundLimit')?.setValue('', { emitEvent: false });
          }
          this.emitTitleBarContextToShell();
        }
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }
  
  saveProperty(onComplete?: (saved: boolean) => void): void {
    this.form.markAllAsTouched();
    
    // Also mark individual controls as touched to ensure error messages appear
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      if (control) {
        control.markAsTouched();
        control.updateValueAndValidity({ emitEvent: false });
      }
    });
    
    if (!this.form.valid) {
      this.toastr.error('Please fill in all required fields', CommonMessage.Error);
      onComplete?.(false);
      return;
    }

    this.isSubmitting = true;
    // Use getRawValue() to include disabled form controls
    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();

    // Exclude enum/display-only controls from request
    const { ...restFormValue } = formValue;
    const propertyRequest: PropertyRequest = { ...restFormValue, organizationId: user?.organizationId || '' } as PropertyRequest;
    
    // Transform fields that need special handling
    propertyRequest.dailyRate = formValue.dailyRate ? parseFloat(formValue.dailyRate.toString()) : 0;
    propertyRequest.monthlyRate = formValue.monthlyRate ? parseFloat(formValue.monthlyRate.toString()) : 0;
    propertyRequest.departureFee = formValue.departureFee ? parseFloat(formValue.departureFee.toString()) : 0;
    propertyRequest.maidServiceFee = formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0;
    propertyRequest.petFee = formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0;
    
    // Ensure time fields are integers
    propertyRequest.checkInTimeId = normalizeCheckInTimeId(formValue.checkInTimeId);
    propertyRequest.checkOutTimeId = normalizeCheckOutTimeId(formValue.checkOutTimeId);
    propertyRequest.propertyLeaseTypeId = normalizePropertyLeaseTypeId(formValue.propertyLeaseTypeId);

    if (propertyRequest.propertyLeaseTypeId === PropertyLeaseType.PropertyManagement) {
      propertyRequest.vendorId = null;
    } else {
      propertyRequest.owner1Id = undefined;
      propertyRequest.owner2Id = undefined;
      propertyRequest.owner3Id = undefined;
      const vid = formValue.vendorId;
      propertyRequest.vendorId =
        vid != null && String(vid).trim() !== '' ? String(vid).trim() : null;
    }

    // Ensure numeric fields are numbers
    propertyRequest.accomodates = formValue.accomodates ? Number(formValue.accomodates) : 0;
    propertyRequest.bedrooms = formValue.bedrooms ? Number(formValue.bedrooms) : 0;
    propertyRequest.bathrooms = formValue.bathrooms ? Number(formValue.bathrooms) : 0;
    propertyRequest.squareFeet = formValue.squareFeet ? Number(formValue.squareFeet) : 0;
    propertyRequest.unitLevel = formValue.unitLevel != null && formValue.unitLevel !== '' ? Number(formValue.unitLevel) : 1;
    propertyRequest.bedroomId1 = formValue.bedroomId1 ? Number(formValue.bedroomId1) : 0;
    propertyRequest.bedroomId2 = formValue.bedroomId2 ? Number(formValue.bedroomId2) : 0;
    propertyRequest.bedroomId3 = formValue.bedroomId3 ? Number(formValue.bedroomId3) : 0;
    propertyRequest.bedroomId4 = formValue.bedroomId4 ? Number(formValue.bedroomId4) : 0;
    
    // Convert Date objects to ISO strings for API (use null if not set)
    propertyRequest.availableFrom = formValue.availableFrom ? (formValue.availableFrom as Date).toISOString() : undefined;
    propertyRequest.availableUntil = formValue.availableUntil ? (formValue.availableUntil as Date).toISOString() : undefined;
    
    // Map enum fields to Id fields
    propertyRequest.propertyStyleId = formValue.propertyStyle ?? PropertyStyle.Standard;
    propertyRequest.propertyTypeId = formValue.propertyType ?? PropertyType.Unspecified;
    propertyRequest.propertyStatusId = formValue.propertyStatus ?? PropertyStatus.Vacant;

    // Handle owner2Id - set to undefined if empty string or null
    if (!propertyRequest.owner2Id || propertyRequest.owner2Id === '' || propertyRequest.owner2Id === null) {
      propertyRequest.owner2Id = undefined;
    }
    
    // Handle optional nullable string fields - keep as undefined if empty
    const optionalStringFields = ['address2', 'suite', 'communityAddress', 'neighborhood', 'crossStreet',
                                   'view', 'mailbox', 'amenities', 'alarmCode',
                                   'unitMstrCode', 'unitTenantCode', 'bldgMstrCode', 'bldgTenantCode',
                                   'mailRoomCode', 'garageCode', 'trashRemoval', 'description', 'notes'];
    optionalStringFields.forEach(field => {
      if (propertyRequest[field] === '' || propertyRequest[field] === null) {
        propertyRequest[field] = undefined;
      }
    });

    const bldgNoTrim = String(formValue.bldgNo ?? '').trim();
    propertyRequest.bldgNo = bldgNoTrim.length > 0 ? bldgNoTrim : undefined;

    const existingPhone = this.property?.phone;
    propertyRequest.phone = !this.isAddMode && existingPhone != null && String(existingPhone).trim() !== '' ? String(existingPhone).trim() : undefined;
    
    // Handle boolean defaults
    if (propertyRequest.yard === undefined) {
      propertyRequest.yard = false;
    }

    // Assign location IDs directly
    const officeId = formValue.officeId ?? this.selectedOffice?.officeId ?? this.property?.officeId ?? null;
    if (!officeId) {
      this.form.get('officeId')?.markAsTouched();
      this.toastr.error('Office is required', CommonMessage.Error);
      this.isSubmitting = false;
      onComplete?.(false);
      return;
    }
    propertyRequest.officeId = Number(officeId);
    propertyRequest.regionId = formValue.regionId || null;
    propertyRequest.areaId = formValue.areaId || null;
    propertyRequest.buildingId = formValue.buildingId || null;
    propertyRequest.latitude = this.parseCoordinateValue(formValue.latitude, 0);
    propertyRequest.longitude = this.parseCoordinateValue(formValue.longitude, 0);

    // Sofabed is a bed-size dropdown; send selected bed type id.
    propertyRequest.sofabed = formValue.sofabed ? Number(formValue.sofabed) : 0;
    
    // Map parkingNotes field (note: API expects lowercase 'parkingnotes' in request)
    propertyRequest.parkingnotes = formValue.parkingNotes || '';
    delete (propertyRequest as unknown as Record<string, unknown>)['parkingNotes'];

    const trimOrNull = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    };

    propertyRequest.communityAddress = trimOrNull(formValue.communityAddress) ?? undefined;

    propertyRequest.gateCode = trimOrNull(formValue.gateCode);
    propertyRequest.trashCode = trimOrNull(formValue.trashCode);
    propertyRequest.storageCode = trimOrNull(formValue.storageCode);

    // Explicitly set notes field from form
    propertyRequest.notes = formValue.notes || '';

    if (this.isAddMode) {
      this.propertyService.createProperty(propertyRequest).pipe(
        switchMap((response: PropertyResponse) => {
          const persist$ = this.propertyAgreementSection?.persistAgreementForNewProperty(response.propertyId) ?? of(true);
          return persist$.pipe(map(() => response));
        }),
        take(1),
        finalize(() => { this.isSubmitting = false; })
      ).subscribe({
        next: (response) => {
          this.toastr.success('Property created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.propertyId = response.propertyId;
          this.isAddMode = false;
          this.populateForm();
          this.captureSavedStateSignature();

          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
          this.loadReservations();
          onComplete?.(true);
        },
        error: () => {
          onComplete?.(false);
        }
      });
    } else {
      propertyRequest.propertyId = this.propertyId;
      propertyRequest.organizationId = this.property?.organizationId || user?.organizationId || '';
      this.propertyService.updateProperty(propertyRequest).pipe(
        switchMap((response: PropertyResponse) => {
          const persist$ = this.propertyAgreementSection?.persistAgreementIfDirty() ?? of(true);
          return persist$.pipe(map(ok => ({ response, ok })));
        }),
        take(1),
        finalize(() => { this.isSubmitting = false; })
      ).subscribe({
        next: ({ response, ok }) => {
          this.toastr.success('Property updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.populateForm();
          this.captureSavedStateSignature();
          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
          onComplete?.(ok);
        },
        error: () => {
          onComplete?.(false);
        }
      });
    }
  }
  //#endregion
  
  //#region Form Methods
  buildForm(): void {
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      propertyCode: new FormControl('', codeValidators),
      owner1Id: new FormControl(''),
      owner2Id: new FormControl(null),
      owner3Id: new FormControl(null),
      vendorId: new FormControl<string | null>(null),
      propertyStyle: new FormControl<number>(PropertyStyle.Standard, [Validators.required]),
      propertyStatus: new FormControl<number>(PropertyStatus.Vacant, [Validators.required]),
      propertyType: new FormControl<number>(PropertyType.Unspecified, [Validators.required]),
      unitLevel: new FormControl<number>(1, [Validators.required, Validators.min(0)]),
      bldgNo: new FormControl(''),
      accomodates: new FormControl(0, [Validators.required, Validators.min(1)]),
      dailyRate: new FormControl<string>('0.00', [Validators.required]),
      monthlyRate: new FormControl<string>('0.00', [Validators.required]),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00', [Validators.required]),
      petFee: new FormControl<string>('0.00', [Validators.required]),
      unfurnished: new FormControl(false),
      
      // Details tab
      address1: new FormControl('', [Validators.required]),
      communityAddress: new FormControl(''),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      neighborhood: new FormControl(''),
      crossStreet: new FormControl(''),
      bedrooms: new FormControl(0, [Validators.required, Validators.min(0)]),
      bathrooms: new FormControl(0, [Validators.required, Validators.min(1)]),
      squareFeet: new FormControl(0, [Validators.required, Validators.min(1)]),
      bedroomId1: new FormControl(0),
      bedroomId2: new FormControl(0),
      bedroomId3: new FormControl(0),
      bedroomId4: new FormControl(0),
      
      // Kitchen & Electronics tab
      kitchen: new FormControl(false),
      washerDryerInUnit: new FormControl(false),
      washerDryerInBldg: new FormControl(false),
      trashRemoval: new FormControl(''),
      trashPickupId: new FormControl(null, [Validators.required]),
      oven: new FormControl(false),
      refrigerator: new FormControl(false),
      microwave: new FormControl(false),
      dishwasher: new FormControl(false),
      tv: new FormControl(false),
      cable: new FormControl(false),
      streaming: new FormControl(false),
      fastInternet: new FormControl(false),
      internetNetwork: new FormControl(''),
      internetPassword: new FormControl(''),
      minStay: new FormControl<number>(0),
      maxStay: new FormControl<number>(0),
      availableFrom: new FormControl<Date | null>(null),
      availableUntil: new FormControl<Date | null>(null),
      checkInTimeId: new FormControl<number | null>(null, [Validators.required]),
      checkOutTimeId: new FormControl<number | null>(null, [Validators.required]),
      
      // Living tab
      view: new FormControl(''),
      deck: new FormControl(false),
      garden: new FormControl(false),
      patio: new FormControl(false),
      yard: new FormControl(false),
      commonPool: new FormControl(false),
      privatePool: new FormControl(false),
      jacuzzi: new FormControl(false),
      sauna: new FormControl(false),
      bathtub: new FormControl(false),
      gym: new FormControl(false),
      security: new FormControl(false),
      elevator: new FormControl(false),
      parking: new FormControl(false),
      parkingNotes: new FormControl({ value: '', disabled: true }),
      
      // Amenities tab – code fields (send/receive with API)
      amenities: new FormControl(''),
      description: new FormControl(''),
      notes: new FormControl(''),
      alarmCode: new FormControl(''),
      unitMstrCode: new FormControl(''),
      unitTenantCode: new FormControl(''),
      bldgMstrCode: new FormControl(''),
      bldgTenantCode: new FormControl(''),
      mailRoomCode: new FormControl(''),
      garageCode: new FormControl(''),
      gateCode: new FormControl(''),
      trashCode: new FormControl(''),
      storageCode: new FormControl(''),
      mailbox: new FormControl(''),
      gated: new FormControl(false),
      heating: new FormControl(false),
      ac: new FormControl(false),
      sofabed: new FormControl(0),
      smoking: new FormControl(false),
      petsAllowed: new FormControl(false),
      dogsOkay: new FormControl({ value: false, disabled: true }),
      catsOkay: new FormControl({ value: false, disabled: true }),
      poundLimit: new FormControl({ value: '', disabled: true }),

      // Location section (officeId also used in title bar)
      officeId: new FormControl<number | null>(null, [Validators.required]),
      reservationId: new FormControl<string | null>(null), // title bar + tabs; synced with selectedReservationId
      regionId: new FormControl<number | null>(null),
      areaId: new FormControl<number | null>(null),
      buildingId: new FormControl<number | null>(null),
      latitude: new FormControl('0.00', [Validators.pattern(/^-?\d+(\.\d{1,8})?$/)]),
      longitude: new FormControl('-0.00', [Validators.pattern(/^-?\d+(\.\d{1,8})?$/)]),
      
      isActive: new FormControl(true),
      propertyLeaseTypeId: new FormControl<number>(PropertyLeaseType.PropertyManagement, [Validators.required])
    }, { validators: [this.bedSelectionValidator] });
  }

  populateForm(): void {
    if (this.property && this.form) {
      // Start with property object, converting to form-friendly format
      const formData: any = { ...this.property };
      
      // Transform fields that need special handling
      const code = this.property.propertyCode?.toUpperCase() || '';
      formData.propertyCode = code;
      formData.owner1Id = this.property.owner1Id || '';
      formData.owner2Id = this.property.owner2Id || null;
      formData.owner3Id = this.property.owner3Id || null;
      formData.dailyRate = this.property.dailyRate !== null && this.property.dailyRate !== undefined ? this.property.dailyRate.toFixed(2) : '0.00';
      formData.monthlyRate = this.property.monthlyRate !== null && this.property.monthlyRate !== undefined ? this.property.monthlyRate.toFixed(2) : '0.00';
      formData.departureFee = this.property.departureFee !== null && this.property.departureFee !== undefined ? this.property.departureFee.toFixed(2) : '0.00';
      formData.maidServiceFee = this.property.maidServiceFee !== null && this.property.maidServiceFee !== undefined ? this.property.maidServiceFee.toFixed(2) : '0.00';
      formData.petFee = this.property.petFee !== null && this.property.petFee !== undefined ? this.property.petFee.toFixed(2) : '0.00';
      formData.minStay = this.property.minStay ?? 0;
      formData.maxStay = this.property.maxStay ?? 0;
      
      // Convert date strings to Date objects
      formData.availableFrom = this.property.availableFrom ? new Date(this.property.availableFrom) : null;
      formData.availableUntil = this.property.availableUntil ? new Date(this.property.availableUntil) : null;
      // Normalize values
      formData.checkInTimeId = normalizeCheckInTimeId(this.property.checkInTimeId);
      formData.checkOutTimeId = normalizeCheckOutTimeId(this.property.checkOutTimeId);
      
      // Handle enum Id fields as numbers (map from Id fields)
      const propertyStyleValue = this.property.propertyStyleId != null ? Number(this.property.propertyStyleId) : PropertyStyle.Standard;
      const propertyStatusValue = this.property.propertyStatusId != null ? Number(this.property.propertyStatusId) : PropertyStatus.Vacant;
      const propertyTypeValue = this.property.propertyTypeId != null ? Number(this.property.propertyTypeId) : PropertyType.Unspecified;
      
      formData.propertyStyle = propertyStyleValue;
      formData.propertyStatus = propertyStatusValue;
      formData.propertyType = propertyTypeValue;
      formData.propertyLeaseTypeId = this.property.propertyLeaseTypeId != null && this.property.propertyLeaseTypeId !== undefined
        ? Number(this.property.propertyLeaseTypeId)
        : PropertyLeaseType.PropertyManagement;

      const leaseNorm = normalizePropertyLeaseTypeId(formData.propertyLeaseTypeId);
      if (leaseNorm === PropertyLeaseType.PropertyManagement) {
        formData.vendorId = null;
      } else {
        formData.owner1Id = '';
        formData.owner2Id = null;
        formData.owner3Id = null;
        formData.vendorId = this.property.vendorId ?? null;
      }
      
      // Handle bedroom IDs
      formData.bedroomId1 = this.property.bedroomId1 ?? 0;
      formData.bedroomId2 = this.property.bedroomId2 ?? 0;
      formData.bedroomId3 = this.property.bedroomId3 ?? 0;
      formData.bedroomId4 = this.property.bedroomId4 ?? 0;
      formData.washerDryerInUnit = this.property.washerDryerInUnit ?? false;
      formData.washerDryerInBldg = this.property.washerDryerInBldg ?? false;
      formData.sofabed = Number(this.property.sofabed ?? 0);
     
      // Handle string fields that might be null/undefined - convert to empty strings
      const stringFields = ['address2', 'suite', 'communityAddress', 'bldgNo', 'neighborhood', 'crossStreet', 'view',
                           'trashRemoval', 'amenities', 'alarmCode', 'unitMstrCode', 'unitTenantCode',
                           'bldgMstrCode', 'bldgTenantCode', 'mailRoomCode', 'garageCode',
                           'gateCode', 'trashCode', 'storageCode',
                           'mailbox', 'description', 'notes', 'poundLimit'];
      stringFields.forEach(field => {
        formData[field] = this.property[field] || '';
      });
      
      // Handle parkingNotes field (map from parkingNotes in response)
      formData.parkingNotes = this.property.parkingNotes || '';
      
      // Handle boolean fields that might be null/undefined
      formData.dogsOkay = this.property.dogsOkay ?? false;
      formData.catsOkay = this.property.catsOkay ?? false;
      
      formData.unitLevel =
        this.property.unitLevel != null && this.property.unitLevel !== undefined
          ? Number(this.property.unitLevel)
          : 1;

      formData.bldgNo =
        this.property.bldgNo != null && String(this.property.bldgNo).trim() !== ''
          ? String(this.property.bldgNo).trim()
          : '';

      // Assign location IDs directly from API (now GUIDs)
      formData.officeId = this.property.officeId || null;
      formData.regionId = this.property.regionId || null;
      formData.areaId = this.property.areaId || null;
      formData.buildingId = this.property.buildingId || null;
      formData.latitude = this.formatCoordinateValue(this.property.latitude, '0.00');
      formData.longitude = this.formatCoordinateValue(this.property.longitude, '-0.00');

      // Default required fields when API omits them so validation does not run as if user had left them empty
      if (this.property.trashPickupId == null || this.property.trashPickupId === undefined) {
        formData.trashPickupId = TrashDays.None;
      }
      
      // Set selectedOffice if offices are already loaded
      if (formData.officeId && this.offices.length > 0) {
        this.selectedOffice = this.offices.find(o => o.officeId === formData.officeId) || null;
        // Filter reservations after setting office
        if (this.reservations.length > 0) {
          this.filterReservations();
        }
      }
      
      // Remove reservationId from formData (it's not a property field, only used in title bar)
      delete formData.reservationId;
      delete formData.phone;
      
      // Reset reservationId to null BEFORE patching to ensure clean state
      this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      this.selectedReservationId = null;
      
      // Set all values at once without emitting (avoid validation/toast on load)
      this.form.patchValue(formData, { emitEvent: false });
      this.syncConditionalFieldState();
      this.applyOwnerVendorLeaseValidators();
      this.form.markAsUntouched();
      this.form.markAsPristine();
      this.captureSavedStateSignature();
      this.emitTitleBarContextToShell();
    }
  }

  applyOfficeControlState(): void {
    const officeControl = this.form?.get('officeId');
    if (!officeControl) {
      return;
    }

    // Only Admins can change a property's office
    if (this.isAdmin) {
      officeControl.enable({ emitEvent: false });
    } else {
      officeControl.disable({ emitEvent: false });
    }
  }

  setAddModeDefaults(): void {
    if (!this.form) return;
    this.form.patchValue({
      propertyCode: this.propertyCodeDefaultPrompt,
      propertyLeaseTypeId: PropertyLeaseType.PropertyManagement,
      vendorId: null,
      unitLevel: 1,
      bldgNo: '',
      checkInTimeId: CheckinTimes.FourPM,
      checkOutTimeId: CheckoutTimes.ElevenAM,
      heating: true,
      ac: true,
      kitchen: true,
      oven: true,
      refrigerator: true,
      microwave: true,
      dishwasher: true,
      tv: true,
      fastInternet: true
    }, { emitEvent: false });
    this.applyOwnerVendorLeaseValidators();
    this.captureSavedStateSignature();
    this.emitTitleBarContextToShell();
  }
  //#endregion

  //#region Validators
  setupLeaseTypeOwnerVendorValidators(): void {
    this.form.get('propertyLeaseTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyOwnerVendorLeaseValidators();
    });
  }

  applyOwnerVendorLeaseValidators(): void {
    const owner1 = this.form?.get('owner1Id');
    const vendor = this.form?.get('vendorId');
    const leaseCtl = this.form?.get('propertyLeaseTypeId');
    if (!this.form || !owner1 || !vendor || !leaseCtl) {
      return;
    }
    const pm = normalizePropertyLeaseTypeId(leaseCtl.value) === PropertyLeaseType.PropertyManagement;
    if (pm) {
      owner1.setValidators([Validators.required]);
      vendor.clearValidators();
    } else {
      owner1.clearValidators();
      vendor.setValidators([Validators.required]);
    }
    owner1.updateValueAndValidity({ emitEvent: false });
    vendor.updateValueAndValidity({ emitEvent: false });
  }

  bedSelectionValidator(control: AbstractControl): ValidationErrors | null {
    const formGroup = control as FormGroup;
    const bedroomsRaw = formGroup.get('bedrooms')?.value;
    const bedrooms = Number(bedroomsRaw);
    if (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 4) {
      return null;
    }

    const bedValues = [
      Number(formGroup.get('bedroomId1')?.value ?? 0),
      Number(formGroup.get('bedroomId2')?.value ?? 0),
      Number(formGroup.get('bedroomId3')?.value ?? 0),
      Number(formGroup.get('bedroomId4')?.value ?? 0)
    ];

    const requiredBedIndexes: number[] = [];
    const noneRequiredBedIndexes: number[] = [];

    for (let index = 0; index < bedValues.length; index++) {
      const bedNumber = index + 1;
      const bedValue = bedValues[index];
      if (bedNumber <= bedrooms) {
        if (!Number.isFinite(bedValue) || bedValue <= 0) {
          requiredBedIndexes.push(bedNumber);
        }
      } else if (Number.isFinite(bedValue) && bedValue > 0) {
        noneRequiredBedIndexes.push(bedNumber);
      }
    }

    if (requiredBedIndexes.length === 0 && noneRequiredBedIndexes.length === 0) {
      return null;
    }

    return {
      bedSelection: {
        requiredBedIndexes,
        noneRequiredBedIndexes
      }
    };
  }

  propertyCodeEntryValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    return value.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()
      ? { defaultCode: true }
      : null;
  };

  showBedDropdownError(bedNumber: number): boolean {
    if (!this.form) {
      return false;
    }
    const bedSelectionErrors = this.form.errors?.['bedSelection'] as {
      requiredBedIndexes?: number[];
      noneRequiredBedIndexes?: number[];
    } | undefined;
    if (!bedSelectionErrors) {
      return false;
    }

    const isAffected =
      (bedSelectionErrors.requiredBedIndexes || []).includes(bedNumber) ||
      (bedSelectionErrors.noneRequiredBedIndexes || []).includes(bedNumber);
    if (!isAffected) {
      return false;
    }

    return !!(this.form.get('bedrooms')?.touched || this.form.get(`bedroomId${bedNumber}`)?.touched);
  }
  //#endregion

  //#region Owner/Vendor Dialog
  isPropertyCodeMissingForAdd(): boolean {
    if (!this.isAddMode || !this.form) {
      return false;
    }
    const raw = String(this.form.get('propertyCode')?.value ?? '').trim();
    if (!raw) {
      return true;
    }
    return raw.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase();
  }

  openPropertyCodeDialog(): Observable<string | null> {
    const ref = this.dialog.open(PropertyCodeDialogComponent, {
      width: '28rem',
      maxWidth: '95vw'
    });
    return ref.afterClosed().pipe(
      map((r: PropertyCodeDialogResult | undefined) => {
        const c = r?.code?.trim();
        return c ? c.toUpperCase() : null;
      })
    );
  }

  buildNewContactDialogData(entityTypeId: number): {
    compactDialogMode: true;
    entityTypeId: number;
    preselectPropertyCodes?: string[];
    preselectPropertyOfficeId?: number;
  } {
    const base = { compactDialogMode: true as const, entityTypeId };
    if (!this.isAddMode || !this.form) {
      return base;
    }
    const rawCode = String(this.form.get('propertyCode')?.value ?? '').trim();
    if (!rawCode || rawCode.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()) {
      return base;
    }
    const officeId =
      this.form.getRawValue().officeId ??
      this.selectedOffice?.officeId ??
      this.globalSelectionService.getSelectedOfficeIdValue() ??
      this.offices[0]?.officeId ??
      null;
    if (officeId == null || officeId === '') {
      return base;
    }
    return {
      ...base,
      preselectPropertyCodes: [rawCode.toUpperCase()],
      preselectPropertyOfficeId: Number(officeId)
    };
  }

  openNewOwnerDialog(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    const openContact = () => this.openNewOwnerContactDialog(ownerField);
    if (!this.isPropertyCodeMissingForAdd()) {
      openContact();
      return;
    }
    this.openPropertyCodeDialog().pipe(take(1)).subscribe(code => {
      if (code == null) {
        return;
      }
      this.applyTitleBarPropertyCode(code);
      openContact();
    });
  }

  openNewOwnerContactDialog(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true,
      data: this.buildNewContactDialogData(EntityType.Owner)
    });

    dialogRef.componentInstance.id = 'new';
    dialogRef.componentInstance.copyFrom = null;
    dialogRef.componentInstance.closed
      .pipe(take(1))
      .subscribe((result: { saved?: boolean; contactId?: string; entityTypeId?: number }) => dialogRef.close(result));

    dialogRef.afterClosed().pipe(take(1)).subscribe((result?: { saved?: boolean; contactId?: string; entityTypeId?: number }) => {
      if (!result?.saved || !result.contactId) {
        return;
      }

      this.contactService.refreshContacts().pipe(take(1)).subscribe({
        next: (contacts) => {
          this.contacts = (contacts || []).filter(c => c.entityTypeId === EntityType.Owner);
          this.form.patchValue({ [ownerField]: result.contactId }, { emitEvent: false });
        },
        error: () => {}
      });
    });
  }

  openNewVendorDialog(): void {
    const openContact = () => this.openNewVendorContactDialog();
    if (!this.isPropertyCodeMissingForAdd()) {
      openContact();
      return;
    }
    this.openPropertyCodeDialog().pipe(take(1)).subscribe(code => {
      if (code == null) {
        return;
      }
      this.applyTitleBarPropertyCode(code);
      openContact();
    });
  }

  openNewVendorContactDialog(): void {
    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true,
      data: this.buildNewContactDialogData(EntityType.Vendor)
    });

    dialogRef.componentInstance.id = 'new';
    dialogRef.componentInstance.copyFrom = null;
    dialogRef.componentInstance.closed
      .pipe(take(1))
      .subscribe((result: { saved?: boolean; contactId?: string; entityTypeId?: number }) => dialogRef.close(result));

    dialogRef.afterClosed().pipe(take(1)).subscribe((result?: { saved?: boolean; contactId?: string; entityTypeId?: number }) => {
      if (!result?.saved || !result.contactId) {
        return;
      }

      this.contactService.refreshContacts().pipe(take(1)).subscribe({
        next: (contacts) => {
          this.contacts = (contacts || []).filter(c => c.entityTypeId === EntityType.Owner);
          this.form.patchValue({ vendorId: result.contactId }, { emitEvent: false });
        },
        error: () => {}
      });
    });
  }

  openEditOwnerDialog(contactId: string): void {
    if (!contactId || contactId === this.newOwnerOptionValue) return;

    this.contactService.getContactByGuid(contactId).pipe(take(1)).subscribe({
      next: (contact) => {
        const dialogRef = this.dialog.open(ContactComponent, {
          width: '1200px',
          maxWidth: '95vw',
          disableClose: true,
          data: {
            preloadedContact: contact,
            entityTypeId: EntityType.Owner,
            compactDialogMode: true
          }
        });

        dialogRef.componentInstance.closed
          .pipe(take(1))
          .subscribe((result: { saved?: boolean; contactId?: string; entityTypeId?: number }) => dialogRef.close(result));

        dialogRef.afterClosed().pipe(take(1)).subscribe(() => {
          this.contactService.refreshContacts().pipe(take(1)).subscribe({
            next: (contacts) => {
              this.contacts = (contacts || []).filter(c => c.entityTypeId === EntityType.Owner);
            },
            error: () => {}
          });
        });
      },
      error: () => {
        this.toastr.error('Failed to load contact.');
      }
    });
  }

  onPropertyTypeDropdownChange(value: string | number | null): void {
    const control = this.form.get('propertyType');
    control?.setValue(value == null ? null : Number(value));
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onOwnerDropdownChange(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id', value: string | number | null): void {
    const normalizedValue = value === null || value === undefined ? (ownerField === 'owner1Id' ? '' : null) : String(value);
    const control = this.form.get(ownerField);
    control?.setValue(normalizedValue);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onVendorDropdownChange(value: string | number | null): void {
    const control = this.form.get('vendorId');
    const normalized = value == null || value === '' ? null : String(value);
    control?.setValue(normalized);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onNumericDropdownChange(controlName: string, value: string | number | null): void {
    const control = this.form.get(controlName);
    control?.setValue(value == null || value === '' ? null : Number(value));
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onOwnerNameClick(event: Event, ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    event.preventDefault();
    event.stopPropagation();
    const value = this.form?.get(ownerField)?.value;
    if (value && value !== this.newOwnerOptionValue) {
      this.openEditOwnerDialog(value);
    }
  }

  hasOwnerSelected(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): boolean {
    const value = this.form?.get(ownerField)?.value;
    return !!value && value !== this.newOwnerOptionValue;
  }
  //#endregion

  //#region Title Bar context 
  emitTitleBarContextToShell(): void {
    if (!this.form) {
      return;
    }
    const officeRaw = this.form.get('officeId')?.value;
    const resRaw = this.form.get('reservationId')?.value ?? this.selectedReservationId;
    const codeRaw = this.form.get('propertyCode')?.value;
    this.titleBarContextChange.emit({
      officeId: officeRaw == null || officeRaw === '' ? null : Number(officeRaw),
      reservationId: resRaw == null || resRaw === '' ? null : String(resRaw),
      propertyCode: codeRaw == null || codeRaw === undefined ? null : (String(codeRaw).trim() === '' ? null : String(codeRaw).trim())
    });
  }

  applyTitleBarOfficeSelection(value: string | number | null): void {
    const nextId = value == null || value === '' ? null : Number(value);
    const cur = this.form.get('officeId')?.value;
    const curNum = cur == null || cur === '' ? null : Number(cur);
    if (nextId === curNum) {
      return;
    }
    const control = this.form.get('officeId');
    control?.setValue(nextId);
    control?.markAsTouched();
    control?.markAsDirty();
    this.onOfficeChange();
    this.emitTitleBarContextToShell();
  }

  applyTitleBarReservationSelection(value: string | number | null): void {
    const normalizedId = value == null || value === '' ? null : String(value);
    this.selectedReservationId = normalizedId;
    this.form.get('reservationId')?.setValue(normalizedId, { emitEvent: false });
    this.emitTitleBarContextToShell();
  }

  applyTitleBarPropertyCode(upperValue: string): void {
    this.form.patchValue({ propertyCode: upperValue }, { emitEvent: false });
    this.form.get('propertyCode')?.markAsDirty();
    this.form.get('propertyCode')?.markAsTouched();
    this.emitTitleBarContextToShell();
  }
  //#endregion

  //#region Getter Methods
  get isPropertyManagementLease(): boolean {
    if (!this.form) {
      return true;
    }
    return normalizePropertyLeaseTypeId(this.form.get('propertyLeaseTypeId')?.value) === PropertyLeaseType.PropertyManagement;
  }

  get ownerContacts(): ContactResponse[] {
    const officeId = this.form?.get('officeId')?.value;
    if (!officeId) return [];
    return this.contacts.filter(c => Number(c.officeId) === Number(officeId));
  }

  get vendorContactsForOffice(): ContactResponse[] {
    const officeId = this.form?.get('officeId')?.value;
    if (!officeId) return [];
    return this.contactService
      .getAllContactsValue()
      .filter(c => c.entityTypeId === EntityType.Vendor && Number(c.officeId) === Number(officeId));
  }

  get ownerOptions(): SearchableSelectOption[] {
    return [
      { value: this.newOwnerOptionValue, label: 'New Owner' },
      ...this.ownerContacts.map(contact => ({ value: contact.contactId, label: contact.fullName ?? '' }))
    ];
  }

  get vendorOptions(): SearchableSelectOption[] {
    return [
      { value: this.newVendorOptionValue, label: 'New Vendor' },
      ...this.vendorContactsForOffice.map(contact => ({
        value: contact.contactId,
        label: contact.fullName ?? ''
      }))
    ];
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get bedSizeOptionsWithNone(): SearchableSelectOption[] {
    return [{ value: 0, label: 'None' }, ...this.bedSizeTypes];
  }

  get regionOptions(): { value: number, label: string }[] {
    return this.regions.map(region => ({ value: region.regionId, label: `${region.regionCode} - ${region.name}` }));
  }

  get areaOptions(): { value: number, label: string }[] {
    return this.areas.map(area => ({ value: area.areaId, label: `${area.areaCode} - ${area.name}` }));
  }

  get buildingOptions(): { value: number, label: string }[] {
    return this.buildings.map(building => ({ value: building.buildingId, label: `${building.buildingCode} - ${building.name}` }));
  }

  get sharedOfficeId(): number | null {
    return this.form?.get('officeId')?.value ?? this.selectedOffice?.officeId ?? this.property?.officeId ?? null;
  }

  get sharedPropertyCode(): string | null {
    const formCode = this.form?.get('propertyCode')?.value;
    if (typeof formCode === 'string') {
      const normalized = formCode.trim();
      return normalized === '' ? null : normalized;
    }
    return this.property?.propertyCode ?? null;
  }

  get sharedOfficeName(): string {
    if (this.selectedOffice?.name) {
      return this.selectedOffice.name;
    }
    const officeId = this.sharedOfficeId;
    if (officeId != null) {
      const office = this.offices.find(o => o.officeId === officeId);
      if (office?.name) {
        return office.name;
      }
    }
    return this.property?.officeName || '';
  }

  get showTitleBarOfficeError(): boolean {
    if (!this.isAddMode || !this.form) {
      return false;
    }
    const c = this.form.get('officeId');
    if (!c?.touched) {
      return false;
    }
    const effectiveId = this.form.getRawValue().officeId ?? this.selectedOffice?.officeId ?? null;
    return effectiveId == null || effectiveId === '';
  }

  get showTitleBarPropertyCodeError(): boolean {
    if (!this.isAddMode || !this.form) {
      return false;
    }
    const c = this.form.get('propertyCode');
    return !!(c?.invalid && c.touched);
  }

  //#endregion

  //#region Formatting Handlers
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.form.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }
  //#endregion

  //#region Setup and Initialize
  setupOwnerSelectionHandlers(): void {
    const ownerFields: ('owner1Id' | 'owner2Id' | 'owner3Id')[] = ['owner1Id', 'owner2Id', 'owner3Id'];
    ownerFields.forEach(ownerField => {
      this.form.get(ownerField)?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
        if (value === this.newOwnerOptionValue) {
          const emptyValue = ownerField === 'owner1Id' ? '' : null;
          this.form.patchValue({ [ownerField]: emptyValue }, { emitEvent: false });
          this.openNewOwnerDialog(ownerField);
        }
      });
    });
  }

  setupVendorSelectionHandlers(): void {
    this.form.get('vendorId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (value === this.newVendorOptionValue) {
        this.form.patchValue({ vendorId: null }, { emitEvent: false });
        this.openNewVendorDialog();
      }
    });
  }

  setupConditionalFields(): void {
    // Subscribe to parking checkbox changes to enable/disable parkingNotes field
    this.form.get('parking')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      const parkingNotesControl = this.form.get('parkingNotes');
      if (parkingNotesControl) {
        if (value) {
          parkingNotesControl.enable();
        } else {
          parkingNotesControl.disable();
          parkingNotesControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Subscribe to petsAllowed checkbox changes to enable/disable pet-related fields
    this.form.get('petsAllowed')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      const dogsOkayControl = this.form.get('dogsOkay');
      const catsOkayControl = this.form.get('catsOkay');
      const poundLimitControl = this.form.get('poundLimit');
      
      if (dogsOkayControl) {
        if (value) {
          dogsOkayControl.enable();
        } else {
          dogsOkayControl.disable();
          dogsOkayControl.setValue(false, { emitEvent: false });
        }
      }
      
      if (catsOkayControl) {
        if (value) {
          catsOkayControl.enable();
        } else {
          catsOkayControl.disable();
          catsOkayControl.setValue(false, { emitEvent: false });
        }
      }
      
      if (poundLimitControl) {
        if (value) {
          poundLimitControl.enable();
        } else {
          poundLimitControl.disable();
          poundLimitControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Set initial state based on current values
    this.syncConditionalFieldState();
  }

  syncConditionalFieldState(): void {
    const parkingValue = this.form.get('parking')?.value;
    const petsAllowedValue = this.form.get('petsAllowed')?.value;

    if (parkingValue) {
      this.form.get('parkingNotes')?.enable({ emitEvent: false });
    } else {
      this.form.get('parkingNotes')?.disable({ emitEvent: false });
      this.form.get('parkingNotes')?.setValue('', { emitEvent: false });
    }

    if (petsAllowedValue) {
      this.form.get('dogsOkay')?.enable({ emitEvent: false });
      this.form.get('catsOkay')?.enable({ emitEvent: false });
      this.form.get('poundLimit')?.enable({ emitEvent: false });
    } else {
      this.form.get('dogsOkay')?.disable({ emitEvent: false });
      this.form.get('dogsOkay')?.setValue(false, { emitEvent: false });
      this.form.get('catsOkay')?.disable({ emitEvent: false });
      this.form.get('catsOkay')?.setValue(false, { emitEvent: false });
      this.form.get('poundLimit')?.disable({ emitEvent: false });
      this.form.get('poundLimit')?.setValue('', { emitEvent: false });
    }
  }

  initializeTrashDays(): void {
    this.trashDays = Object.keys(TrashDays)
      .filter(key => !isNaN(Number(TrashDays[key])))
      .map(key => ({ value: Number(TrashDays[key]), label: key })); 
  }

  initializePropertyStyles(): void {
    this.propertyStyles = getPropertyStyles();
  }

  initializePropertyStatuses(): void {
    this.propertyStatuses = getPropertyStatuses();
  }

  initializePropertyTypes(): void {
    this.propertyTypes = getPropertyTypes();
  }

  initializeBedSizeTypes(): void {
    this.bedSizeTypes = getBedSizeTypes();
  }

  initializeTimeTypes(): void {
    this.checkInTimes = getCheckInTimes();
    this.checkOutTimes = getCheckOutTimes();
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: (contacts) => {
        this.contacts = (contacts || []).filter(c => c.entityTypeId === EntityType.Owner);
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadOffices(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.offices = [];
      this.selectedOffice = null;
      this.showOfficeDropdown = true;
      this.form?.patchValue({ officeId: null }, { emitEvent: false });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.emitTitleBarContextToShell();
      return;
    }

    this.officeService.getOffices(orgId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: (offices) => {
        this.offices = (offices || []).filter(f => f.organizationId === orgId && f.isActive);

        if (!this.property && this.form) {
          const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
          const globalOffice = globalOfficeId != null
            ? this.offices.find(o => o.officeId === globalOfficeId) || null
            : null;

          // Add mode defaults:
          // - Specific global office -> preselect it
          // - Global "All Offices" (null) -> keep null so user must pick a specific office
          this.selectedOffice = globalOffice;
          this.showOfficeDropdown = true;
          this.form.patchValue({ officeId: this.selectedOffice?.officeId ?? null }, { emitEvent: false });
          this.filterReservations();
        } else {
          this.globalSelectionService.getOfficeUiState$(this.offices, { useGlobalSelection: false, disableSingleOfficeRule: !!this.property?.officeId }).pipe(take(1)).subscribe({
            next: uiState => {
              this.showOfficeDropdown = uiState.showOfficeDropdown;
              if (uiState.autoSelectedOfficeId !== null) {
                this.selectedOffice = uiState.selectedOffice;
                this.form?.patchValue({ officeId: uiState.autoSelectedOfficeId }, { emitEvent: false });
              }
            }
          });
        }

        if (this.property && this.form) {
          const propertyOfficeId = this.property.officeId;
          if (propertyOfficeId) {
            this.selectedOffice = this.offices.find(o => o.officeId === propertyOfficeId) || null;
          }
          this.form.patchValue({
            officeId: propertyOfficeId || null,
            regionId: this.property.regionId || null,
            areaId: this.property.areaId || null,
            buildingId: this.property.buildingId || null,
          }, { emitEvent: false });
          this.filterReservations();
        }

        this.filterLocationLookupsByOffice();
        this.emitTitleBarContextToShell();
      },
      error: () => {
        this.offices = [];
        this.selectedOffice = null;
        this.showOfficeDropdown = true;
        this.form?.patchValue({ officeId: null }, { emitEvent: false });
        this.emitTitleBarContextToShell();
      }
    });
  }

  loadRegions(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.allRegionsByOrg = [];
      this.regions = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'regions');
      return;
    }

    this.regionService.getRegions().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'regions'); })).subscribe({
      next: (regions) => {
        this.allRegionsByOrg = (regions || []).filter(r => r.organizationId === orgId && r.isActive);
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.allRegionsByOrg = [];
        this.regions = [];
      }
    });
  }

  loadAreas(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.allAreasByOrg = [];
      this.areas = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas');
      return;
    }

    this.areaService.getAreas().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas'); })).subscribe({
      next: (areas) => {
        this.allAreasByOrg = (areas || []).filter(a => a.organizationId === orgId && a.isActive);
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.allAreasByOrg = [];
        this.areas = [];
      }
    });
  }

  loadBuildings(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.allBuildingsByOrg = [];
      this.buildings = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
      return;
    }

    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings'); })).subscribe({
      next: (buildings) => {
        this.allBuildingsByOrg = (buildings || []).filter(b => b.isActive);
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.allBuildingsByOrg = [];
        this.buildings = [];
      }
    });
  }

  filterLocationLookupsByOffice(): void {
    const officeId = this.form?.get('officeId')?.value ?? this.selectedOffice?.officeId ?? null;
    const officeNum = officeId != null ? Number(officeId) : null;

    this.regions = officeNum != null ? this.allRegionsByOrg.filter(r => Number(r.officeId) === officeNum) : [];
    this.areas = officeNum != null ? this.allAreasByOrg.filter(a => Number(a.officeId) === officeNum) : [];
    this.buildings = officeNum != null ? this.allBuildingsByOrg.filter(b => Number(b.officeId) === officeNum) : [];

    if (!this.form) return;
    const regionId = this.form.get('regionId')?.value;
    const areaId = this.form.get('areaId')?.value;
    const buildingId = this.form.get('buildingId')?.value;
    const updates: { regionId?: number | null; areaId?: number | null; buildingId?: number | null } = {};
    if (regionId != null && !this.regions.some(r => r.regionId === regionId)) {
      updates.regionId = null;
    }
    if (areaId != null && !this.areas.some(a => a.areaId === areaId)) {
      updates.areaId = null;
    }
    if (buildingId != null && !this.buildings.some(b => b.buildingId === buildingId)) {
      updates.buildingId = null;
    }
    if (Object.keys(updates).length > 0) {
      this.form.patchValue(updates, { emitEvent: false });
    }
  }

  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }
    
    this.commonService.getStates().pipe(filter(states => states && states.length > 0),take(1)).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: () => {
        // States are handled globally, ignore
      }
    });
  }

  loadReservations(): void {
    if (this.isAddMode || !this.propertyId) {
      // In add mode, no reservations to load
      this.reservations = [];
      this.availableReservations = [];
      return;
    }
    
    // In edit mode, load reservations for this property only
    this.reservationService.getReservationsByPropertyId(this.propertyId).pipe(take(1)).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }
  //#endregion

  //#region Building amenity sync from selection
  setupBuildingAmenitySyncFromSelection(): void {
    this.form.get('buildingId')?.valueChanges.pipe(distinctUntilChanged(), takeUntil(this.destroy$)).subscribe(buildingId => {
      if (buildingId != null && typeof buildingId === 'number') {
        const building = this.allBuildingsByOrg.find(b => b.buildingId === buildingId);
        if (building) {
          this.applyBuildingAmenitiesToPropertyForm(building);
        }
      }
    });
  }

  applyBuildingAmenitiesToPropertyForm(building: BuildingResponse): void {
    const patch = this.mappingService.mapBuildingAmenitiesToPropertyFormPatch(building);
    this.form.patchValue(patch, { emitEvent: false });
    this.syncConditionalFieldState();
  }
  //#endregion

  //#region Form Response Methods
  onPanelOpened(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = true;
  }

  onPanelClosed(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = false;
  }

  filterReservations(): void {
    const officeId = this.form?.get('officeId')?.value;
    if (!officeId) {
      this.availableReservations = [];
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === officeId);
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.contacts.find(c => c.contactId === r.contactId) ?? null)
    }));
  }

  onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.form.get('officeId')?.value ?? null);
    this.resolveOfficeScope(this.form.get('officeId')?.value ?? null);
    this.filterLocationLookupsByOffice();
    this.filterReservations();
    this.form.get('reservationId')?.setValue(null, { emitEvent: false });
    this.selectedReservationId = null;

    // In Add mode, enforce owner-office consistency by clearing owner selections
    // whenever office changes.
    if (this.isAddMode) {
      this.form.patchValue({
        owner1Id: '',
        owner2Id: null,
        owner3Id: null,
        vendorId: null
      }, { emitEvent: false });
    }
  }

  onPropertyCodeFocus(event: FocusEvent): void {
    if (!this.isAddMode) {
      return;
    }
    const input = event.target as HTMLInputElement | null;
    const currentValue = String(this.form?.get('propertyCode')?.value ?? '').trim();
    if (input && currentValue.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()) {
      input.select();
    }
  }

  formatCoordinateValue(value: number | string | null | undefined, defaultValue: string): string {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return defaultValue;
    }
    return num.toFixed(8).replace(/\.?0+$/, '') || String(num);
  }

  parseCoordinateValue(value: string | number | null | undefined, defaultValue: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }
    return parsed;
  }
  //#endregion

  //#region Save Tracking Methods
  captureSavedStateSignature(): void {
    if (!this.form) {
      return;
    }
    this.savedFormState = this.cloneFormState(this.form.getRawValue() as Record<string, unknown>);
    this.form?.markAsPristine();
    this.form?.markAsUntouched();
  }

  hasUnsavedChanges(): boolean {
    if (this.isSubmitting) {
      return false;
    }
    return !!this.form?.dirty || !!this.propertyAgreementSection?.isAgreementDirty;
  }

  async confirmNavigationWithUnsavedChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const action = await this.unsavedChangesDialogService.confirmLeaveOrSave();
    if (action === 'save') {
      return this.savePropertyAndWait();
    }
    this.discardUnsavedChanges();
    return true;
  }

  canDeactivate(): Promise<boolean> | boolean {
    return this.confirmNavigationWithUnsavedChanges();
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }

  savePropertyAndWait(): Promise<boolean> {
    return new Promise(resolve => this.saveProperty(resolve));
  }

  discardUnsavedChanges(): void {
    if (!this.form || !this.savedFormState) {
      return;
    }

    this.form.reset(this.cloneFormState(this.savedFormState), { emitEvent: false });
    this.applyOfficeControlState();
    this.applyOwnerVendorLeaseValidators();
    this.syncConditionalFieldState();

    const officeId = this.form.get('officeId')?.value;
    this.resolveOfficeScope(officeId == null ? null : Number(officeId));
    this.filterLocationLookupsByOffice();
    this.filterReservations();

    const reservationId = this.form.get('reservationId')?.value;
    this.selectedReservationId = reservationId == null ? null : String(reservationId);

    this.form.markAsPristine();
    this.form.markAsUntouched();

    this.propertyAgreementSection?.discardAndReloadIfDirty();
    this.emitTitleBarContextToShell();
  }

  cloneFormState<T>(state: T): T {
    return structuredClone(state);
  }
  //#endregion

  //#region Utility Methods
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

