import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, catchError, filter, finalize, forkJoin, map, of, skip, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceStatus, getMaintenanceStatuses } from '../../maintenance/models/maintenance-enums';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { AreaResponse } from '../../organizations/models/area.model';
import { BuildingResponse } from '../../organizations/models/building.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { RegionResponse } from '../../organizations/models/region.model';
import { AreaService } from '../../organizations/services/area.service';
import { BuildingService } from '../../organizations/services/building.service';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { RegionService } from '../../organizations/services/region.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { CheckinTimes, CheckoutTimes, PropertyStatus, PropertyStyle, PropertyType, TrashDays, getBedSizeTypes, getCheckInTimes, getCheckOutTimes, getPropertyStatuses, getPropertyStyles, getPropertyTypes, normalizeCheckInTimeId, normalizeCheckOutTimeId } from '../models/property-enums';
import { PropertyLetterResponse } from '../models/property-letter.model';
import { PropertyRequest, PropertyResponse } from '../models/property.model';
import { PropertyInformationComponent } from '../property-information/property-information.component';
import { PropertyWelcomeLetterComponent } from '../property-welcome/property-welcome-letter.component';
import { PropertyLetterService } from '../services/property-letter.service';
import { PropertyService } from '../services/property.service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
    selector: 'app-property',
    standalone: true,
    imports: [
        CommonModule,
        MaterialModule,
        FormsModule,
        ReactiveFormsModule,
        SearchableSelectComponent,
        TitlebarSelectComponent,
        PropertyWelcomeLetterComponent,
        PropertyInformationComponent,
        DocumentListComponent,
        EmailListComponent
    ],
    templateUrl: './property.component.html',
    styleUrls: ['./property.component.scss']
})

export class PropertyComponent implements OnInit, OnDestroy {
  @ViewChild('propertyDocumentList') propertyDocumentList?: DocumentListComponent;
  @ViewChild('propertyEmailList') propertyEmailList?: EmailListComponent;
  @ViewChild('propertyWelcomeLetter') propertyWelcomeLetterComponent?: PropertyWelcomeLetterComponent;
  @ViewChild(PropertyInformationComponent) propertyInformationComponent?: PropertyInformationComponent;
  
  DocumentType = DocumentType;
  EmailType = EmailType;
  readonly newOwnerOptionValue = '__new_owner__';
  readonly propertyCodeDefaultPrompt = 'Enter Code';
  isAdmin = false;
  isServiceError: boolean = false;
  selectedTabIndex: number = 0;
  listIsActiveFilter: boolean = true;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  propertyId: string;
  property: PropertyResponse;
  propertyInformation: PropertyLetterResponse | null = null; 
  selectedReservationId: string | null = null;
  copiedPropertyInformation: PropertyLetterResponse | null = null; // Store copied property information data
 
  states: string[] = [];
  contacts: ContactResponse[] = [];
  contactsSubscription?: Subscription;
  trashDays: { value: number, label: string }[] = [];
  propertyStyles: { value: number, label: string }[] = [];
  propertyStatuses: { value: number, label: string }[] = [];
  propertyTypes: { value: number, label: string }[] = [];
  maintenanceStatuses: { value: number, label: string }[] = [];
  bedSizeTypes: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
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
  
  // Accordion expansion states - will be initialized based on isAddMode
  expandedSections = { basic: false, features: false, trash: false, maintenance: false, description: false };

  constructor(
    public propertyService: PropertyService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private contactService: ContactService,
    private mappingService: MappingService,
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
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private dialog: MatDialog
  ) {
  }

  //#region Property
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();

    this.loadStates();
    this.loadContacts();
    this.loadOffices();
    this.loadRegions();
    this.loadAreas();
    this.loadBuildings();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0 && !this.property) {
        this.resolveOfficeScope(officeId);
        if (this.form) {
          this.form.patchValue({ officeId: this.selectedOffice?.officeId ?? null });
          this.filterLocationLookupsByOffice();
          this.filterReservations();
        }
      }
    });

    // Initialize dropdown menus
    this.initializeTrashDays();
    this.initializePropertyStyles();
    this.initializePropertyStatuses();
    this.initializePropertyTypes();
    this.initializeMaintenanceStatuses();
    this.initializeBedSizeTypes();
    this.initializeTimeTypes();
    
    this.buildForm();
    this.applyOfficeControlState();

    // Set isAddMode from route params and load property if needed
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.propertyId = paramMap.get('id');
        this.isAddMode = this.propertyId === 'new';
        
        // All accordions expanded when property form is opened (add or edit)
        this.expandedSections = { basic: true, features: true, trash: true, maintenance: true, description: true };
        
        // Update form validators based on mode
        const owner1Control = this.form.get('owner1Id');
        const codeControl = this.form.get('propertyCode');

        if (this.isAddMode) {
          owner1Control?.setValidators([Validators.required]);
          codeControl?.setValidators([Validators.required, this.propertyCodeEntryValidator]);
        } else {
          owner1Control?.clearValidators();
          codeControl?.clearValidators();
        }

        owner1Control?.updateValueAndValidity();
        codeControl?.updateValueAndValidity();
        this.applyOfficeControlState();

        if (!this.isAddMode) {
          this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
          this.getProperty();
          this.loadReservations();
        } else {
          this.loadReservations();
          this.setAddModeDefaults();
          // Check if we're copying from another property
          this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
            if (queryParams['copyFrom']) {
              this.copyFromProperty(queryParams['copyFrom']);
            }
          });
        }
      }
    });
    
    // Check query params for tab selection
    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      if (queryParams['tab'] === 'documents') {
        this.selectedTabIndex = 4; // Documents tab
      } else if (queryParams['tab'] === 'email') {
        this.selectedTabIndex = 3; // Email tab
      }
    });
    
    this.setupConditionalFields();
    this.setupOwnerSelectionHandlers();
  }

  getProperty(): void {
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        this.populateForm();
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }

  copyFromProperty(sourcePropertyId: string): void {
    // Wait for contacts and location lookups to be loaded before copying
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
        }
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }
  
  saveProperty(): void {
    // Mark all fields as touched to show validation errors
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
    
    // Ensure numeric fields are numbers
    propertyRequest.accomodates = formValue.accomodates ? Number(formValue.accomodates) : 0;
    propertyRequest.bedrooms = formValue.bedrooms ? Number(formValue.bedrooms) : 0;
    propertyRequest.bathrooms = formValue.bathrooms ? Number(formValue.bathrooms) : 0;
    propertyRequest.squareFeet = formValue.squareFeet ? Number(formValue.squareFeet) : 0;
    propertyRequest.bedroomId1 = formValue.bedroomId1 ? Number(formValue.bedroomId1) : 0;
    propertyRequest.bedroomId2 = formValue.bedroomId2 ? Number(formValue.bedroomId2) : 0;
    propertyRequest.bedroomId3 = formValue.bedroomId3 ? Number(formValue.bedroomId3) : 0;
    propertyRequest.bedroomId4 = formValue.bedroomId4 ? Number(formValue.bedroomId4) : 0;
    
    // Convert Date objects to ISO strings for API (use null if not set)
    propertyRequest.availableFrom = formValue.availableFrom ? (formValue.availableFrom as Date).toISOString() : null;
    propertyRequest.availableUntil = formValue.availableUntil ? (formValue.availableUntil as Date).toISOString() : null;
    
    // Map enum fields to Id fields
    propertyRequest.propertyStyleId = formValue.propertyStyle ?? PropertyStyle.Standard;
    propertyRequest.propertyTypeId = formValue.propertyType ?? PropertyType.Unspecified;
    propertyRequest.propertyStatusId = formValue.propertyStatus ?? PropertyStatus.Vacant;
    propertyRequest.maintenanceStatusId = Number(formValue.maintenanceStatusId) ?? MaintenanceStatus.UnProcessed;
    
    // Handle owner2Id - set to undefined if empty string or null
    if (!propertyRequest.owner2Id || propertyRequest.owner2Id === '' || propertyRequest.owner2Id === null) {
      propertyRequest.owner2Id = undefined;
    }
    
    // Handle optional nullable string fields - keep as undefined if empty
    const optionalStringFields = ['address2', 'suite', 'neighborhood', 'crossStreet',
                                   'phone', 'view', 'mailbox', 'amenities', 'alarmCode',
                                   'unitMstrCode', 'unitTenantCode', 'bldgMstrCode', 'bldgTenantCode',
                                   'mailRoomCode', 'garageCode', 'trashRemoval', 'description', 'notes'];
    optionalStringFields.forEach(field => {
      if (propertyRequest[field] === '' || propertyRequest[field] === null) {
        propertyRequest[field] = undefined;
      }
    });

    // Handle phone formatting
    if (formValue.phone) {
      propertyRequest.phone = this.formatterService.stripPhoneFormatting(formValue.phone);
    } else {
      propertyRequest.phone = '';
    }
    
    // Handle boolean defaults
    if (propertyRequest.yard === undefined) {
      propertyRequest.yard = false;
    }

    // Assign location IDs directly
    propertyRequest.officeId = formValue.officeId || null;
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
    const dateIsoOrNull = (v: unknown): string | null =>
      v instanceof Date && !isNaN(v.getTime()) ? v.toISOString() : null;

    propertyRequest.gateCode = trimOrNull(formValue.gateCode);
    propertyRequest.trashCode = trimOrNull(formValue.trashCode);
    propertyRequest.storageCode = trimOrNull(formValue.storageCode);
    propertyRequest.filterDescription = trimOrNull(formValue.filterDescription);
    propertyRequest.smokeDetectors = trimOrNull(formValue.smokeDetectors);
    propertyRequest.licenseNo = trimOrNull(formValue.licenseNo);
    propertyRequest.hvacNotes = trimOrNull(formValue.hvacNotes);
    propertyRequest.hvacServiced = dateIsoOrNull(formValue.hvacServiced) ?? null;
    propertyRequest.fireplaceNotes = trimOrNull(formValue.fireplaceNotes);
    propertyRequest.fireplaceServiced = dateIsoOrNull(formValue.fireplaceServiced) ?? null;
    propertyRequest.maintenanceNotes = trimOrNull(formValue.maintenanceNotes);
    propertyRequest.lastFilterChangeDate = dateIsoOrNull(formValue.lastFilterChangeDate) ?? null;
    propertyRequest.lastSmokeChangeDate = dateIsoOrNull(formValue.lastSmokeChangeDate) ?? null;
    propertyRequest.licenseDate = dateIsoOrNull(formValue.licenseDate) ?? null;

    // Explicitly set notes field from form
    propertyRequest.notes = formValue.notes || '';

    if (this.isAddMode) {
      this.propertyService.createProperty(propertyRequest).pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: PropertyResponse) => {
          this.toastr.success('Property created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.propertyId = response.propertyId;
          this.isAddMode = false;
          this.populateForm();
          
          // If this is a copy, get the property information as well
          if (this.propertyInformationComponent) {
            this.propertyInformationComponent.propertyId = response.propertyId;
            if (this.copiedPropertyInformation) {
              this.propertyInformationComponent.savePropertyLetter();
              this.copiedPropertyInformation = null;
            }
          }
          
          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
        },
        error: () => {}
      });
    } else {
      propertyRequest.propertyId = this.propertyId;
      propertyRequest.organizationId = this.property?.organizationId || user?.organizationId || '';
      this.propertyService.updateProperty(propertyRequest).pipe(take(1), finalize(() => this.isSubmitting = false) ).subscribe({
        next: (response: PropertyResponse) => {
          this.toastr.success('Property updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.populateForm();          
          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
        },
        error: () => {}
      });
    }
  }
  //#endregion
  
  //#region Form Methods
  buildForm(): void {
    const contactValidators = [];
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      propertyCode: new FormControl('', codeValidators),
      owner1Id: new FormControl('', contactValidators),
      owner2Id: new FormControl(null),
      owner3Id: new FormControl(null),
      propertyStyle: new FormControl<number>(PropertyStyle.Standard, [Validators.required]),
      propertyStatus: new FormControl<number>(PropertyStatus.Vacant, [Validators.required]),
      propertyType: new FormControl<number>(PropertyType.Unspecified, [Validators.required]),
      phone: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]),
      accomodates: new FormControl(0, [Validators.required, Validators.min(1)]),
      dailyRate: new FormControl<string>('0.00', [Validators.required]),
      monthlyRate: new FormControl<string>('0.00', [Validators.required]),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00', [Validators.required]),
      petFee: new FormControl<string>('0.00', [Validators.required]),
      unfurnished: new FormControl(false),
      
      // Details tab
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      neighborhood: new FormControl(''),
      crossStreet: new FormControl(''),
      bedrooms: new FormControl(0, [Validators.required, Validators.min(0)]),
      bathrooms: new FormControl(0, [Validators.required, Validators.min(0)]),
      squareFeet: new FormControl(0, [Validators.required, Validators.min(0)]),
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
      filterDescription: new FormControl(''),
      lastFilterChangeDate: new FormControl<Date | null>(null),
      smokeDetectors: new FormControl(''),
      lastSmokeChangeDate: new FormControl<Date | null>(null),
      licenseNo: new FormControl(''),
      licenseDate: new FormControl<Date | null>(null),
      maintenanceStatusId: new FormControl<number>(MaintenanceStatus.UnProcessed),
      hvacNotes: new FormControl(''),
      hvacServiced: new FormControl<Date | null>(null),
      fireplaceNotes: new FormControl(''),
      fireplaceServiced: new FormControl<Date | null>(null),
      maintenanceNotes: new FormControl(''),
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
      
      isActive: new FormControl(true)
    });
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
      formData.maintenanceStatusId = this.property.maintenanceStatusId != null ? Number(this.property.maintenanceStatusId) : MaintenanceStatus.UnProcessed;
      
      // Handle bedroom IDs
      formData.bedroomId1 = this.property.bedroomId1 ?? 0;
      formData.bedroomId2 = this.property.bedroomId2 ?? 0;
      formData.bedroomId3 = this.property.bedroomId3 ?? 0;
      formData.bedroomId4 = this.property.bedroomId4 ?? 0;
      formData.washerDryerInUnit = this.property.washerDryerInUnit ?? false;
      formData.washerDryerInBldg = this.property.washerDryerInBldg ?? false;
      formData.sofabed = Number(this.property.sofabed ?? 0);
     
      // Handle string fields that might be null/undefined - convert to empty strings
      const stringFields = ['address2', 'suite', 'neighborhood', 'crossStreet', 'view',
                           'trashRemoval', 'amenities', 'alarmCode', 'unitMstrCode', 'unitTenantCode',
                           'bldgMstrCode', 'bldgTenantCode', 'mailRoomCode', 'garageCode',
                           'gateCode', 'trashCode', 'storageCode',
                           'filterDescription', 'smokeDetectors', 'licenseNo', 'maintenanceNotes',
                           'hvacNotes', 'fireplaceNotes',
                           'mailbox', 'phone', 'description', 'notes', 'poundLimit'];
      stringFields.forEach(field => {
        formData[field] = this.property[field] || '';
      });

      formData.lastFilterChangeDate = this.parseMaintenanceDateOrNull(this.property.lastFilterChangeDate);
      formData.lastSmokeChangeDate = this.parseMaintenanceDateOrNull(this.property.lastSmokeChangeDate);
      formData.licenseDate = this.parseMaintenanceDateOrNull(this.property.licenseDate);
      formData.hvacServiced = this.parseMaintenanceDateOrNull(this.property.hvacServiced);
      formData.fireplaceServiced = this.parseMaintenanceDateOrNull(this.property.fireplaceServiced);
      
      // Handle parkingNotes field (map from parkingNotes in response)
      formData.parkingNotes = this.property.parkingNotes || '';
      
      // Handle boolean fields that might be null/undefined
      formData.dogsOkay = this.property.dogsOkay ?? false;
      formData.catsOkay = this.property.catsOkay ?? false;
      
      // Handle phone - ensure empty string if null/undefined, then format if present
      formData.phone = this.property.phone || '';
      if (formData.phone) {
        formData.phone = this.formatterService.phoneNumber(formData.phone);
      }

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
      
      // Reset reservationId to null BEFORE patching to ensure clean state
      this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      this.selectedReservationId = null;
      
      // Set all values at once without emitting (avoid validation/toast on load)
      this.form.patchValue(formData, { emitEvent: false });
      this.syncConditionalFieldState();
      this.form.markAsUntouched();
      this.form.markAsPristine();

      // Log any invalid fields after load so you can fix defaults or API mapping (check browser console)
      this.logInvalidFormControlsAfterLoad();
    }
  }

  applyOfficeControlState(): void {
    const officeControl = this.form?.get('officeId');
    if (!officeControl) {
      return;
    }
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
  }

  /** Call after loading a saved property. Logs field names (and errors) for any control that is invalid. */
  logInvalidFormControlsAfterLoad(): void {
    const invalid: { path: string; errors: Record<string, unknown> }[] = [];
    const collectInvalid = (group: FormGroup, path = ''): void => {
      Object.keys(group.controls).forEach(key => {
        const control = group.get(key);
        const controlPath = path ? `${path}.${key}` : key;
        if (control instanceof FormControl) {
          if (control.invalid && control.errors) {
            invalid.push({ path: controlPath, errors: { ...control.errors } });
          }
        } else if (control instanceof FormGroup) {
          collectInvalid(control, controlPath);
        }
      });
    };
    collectInvalid(this.form);
    if (invalid.length > 0) {
      console.warn(
        '[Property] Validation errors on load – invalid field(s):',
        invalid.map(i => `${i.path} (${Object.keys(i.errors).join(', ')})`).join('; ')
      );
      console.warn('[Property] Invalid controls detail:', invalid);
    }
  }
  //#endregion

  //#region Owner Dialog
  openNewOwnerDialog(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true
    });

    dialogRef.componentInstance.id = 'new';
    dialogRef.componentInstance.copyFrom = null;
    dialogRef.componentInstance.entityTypeId = EntityType.Owner;
    dialogRef.componentInstance.compactDialogMode = true;
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

  onOwnerSelectionChange(value: string | null): void {
    if (value && value !== this.newOwnerOptionValue) {
      this.openEditOwnerDialog(value);
    }
  }

  onPropertyTypeDropdownChange(value: string | number | null): void {
    this.form.get('propertyType')?.setValue(value == null ? null : Number(value));
    this.form.get('propertyType')?.markAsTouched();
  }

  onOwnerDropdownChange(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id', value: string | number | null): void {
    const normalizedValue = value === null || value === undefined ? (ownerField === 'owner1Id' ? '' : null) : String(value);
    this.form.get(ownerField)?.setValue(normalizedValue);
    this.form.get(ownerField)?.markAsTouched();
    this.onOwnerSelectionChange(normalizedValue === null ? null : String(normalizedValue));
  }

  get ownerOptions(): SearchableSelectOption[] {
    return [
      { value: this.newOwnerOptionValue, label: 'New Owner' },
      ...this.ownerContacts.map(contact => ({ value: contact.contactId, label: contact.fullName ?? '' }))
    ];
  }

  onNumericDropdownChange(controlName: string, value: string | number | null): void {
    this.form.get(controlName)?.setValue(value == null || value === '' ? null : Number(value));
    this.form.get(controlName)?.markAsTouched();
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.form.get('officeId')?.setValue(value == null || value === '' ? null : Number(value));
    this.form.get('officeId')?.markAsTouched();
    this.onOfficeChange();
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

  getOwnerDisplayName(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): string {
    const value = this.form?.get(ownerField)?.value;
    if (value == null || value === '' || value === this.newOwnerOptionValue) {
      return ownerField === 'owner1Id' ? 'Owner' : ownerField === 'owner2Id' ? 'Owner 2 (Optional)' : 'Owner 3 (Optional)';
    }
    const contact = this.contacts.find(c => c.contactId === value);
    return contact?.fullName ?? value;
  }

  onOwnerNameClick(event: Event, ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    event.preventDefault();
    event.stopPropagation();
    const value = this.form?.get(ownerField)?.value;
    if (value && value !== this.newOwnerOptionValue) {
      this.openEditOwnerDialog(value);
    }
  }
  //#endregion
 
  //#region Formatting Handlers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

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

  initializeMaintenanceStatuses(): void {
    this.maintenanceStatuses = getMaintenanceStatuses();
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
        this.contacts = contacts?.filter(c => c.entityTypeId === EntityType.Owner) || [];
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
      this.availableOffices = [];
      this.selectedOffice = null;
      this.showOfficeDropdown = true;
      this.form?.patchValue({ officeId: null }, { emitEvent: false });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.getOffices(orgId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: (offices) => {
        this.offices = (offices || []).filter(f => f.organizationId === orgId && f.isActive);
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);

        if (!this.property && this.form) {
          const globalOfficeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
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
          this.globalOfficeSelectionService.getOfficeUiState$(this.offices, { useGlobalSelection: false, disableSingleOfficeRule: !!this.property?.officeId }).pipe(take(1)).subscribe({
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
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.selectedOffice = null;
        this.showOfficeDropdown = true;
        this.form?.patchValue({ officeId: null }, { emitEvent: false });
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
        this.allBuildingsByOrg = (buildings || []).filter(b => b.organizationId === orgId && b.isActive);
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
        // States are handled globally, just log silently or handle gracefully
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

  //#region Form Response Methods
  onPanelOpened(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = true;
  }

  onPanelClosed(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = false;
  }
  
  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    if (event.index === 3 && this.propertyEmailList) {
      this.propertyEmailList.reload();
    }
    if (event.index === 4 && this.propertyDocumentList) {
      this.propertyDocumentList.reload();
    }
  }
  
  onWelcomeLetterReservationSelected(reservationId: string | null): void {
     this.selectedReservationId = reservationId;
     this.form?.patchValue({ reservationId }, { emitEvent: false });
  }

  onWelcomeLetterOfficeIdChange(officeId: number | null): void {
    // Update form officeId when welcome-letter tab office changes
    if (officeId !== this.form?.get('officeId')?.value) {
      this.form?.patchValue({ officeId });
      this.onOfficeChange();
    }
  }
  
  onDocumentsReservationSelected(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.form?.patchValue({ reservationId }, { emitEvent: false });
  }

  onEmailReservationSelected(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.form?.patchValue({ reservationId }, { emitEvent: false });
  }

  onDocumentOfficeIdChange(officeId: number | null): void {
    // Update form officeId when document tab office changes
    if (officeId !== this.form?.get('officeId')?.value) {
      this.form?.patchValue({ officeId });
      this.onOfficeChange();
    }
  }

  onEmailOfficeIdChange(officeId: number | null): void {
    if (officeId !== this.form?.get('officeId')?.value) {
      this.form?.patchValue({ officeId });
      this.onOfficeChange();
    }
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

  get sharedReservationId(): string | null {
    const value = this.form?.get('reservationId')?.value ?? this.selectedReservationId;
    return value == null ? null : String(value);
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

  get isHeaderOfficeEditable(): boolean {
    return this.isAdmin && this.selectedTabIndex <= 1;
  }

  get isHeaderPropertyCodeEditable(): boolean {
    return this.isAdmin && this.selectedTabIndex <= 1;
  }

  get showContextualSave(): boolean {
    return this.selectedTabIndex <= 2;
  }

  get contextualSaveLabel(): string {
    switch (this.selectedTabIndex) {
      case 1:
        return 'Save Information';
      case 2:
        return 'Save Welcome Letter';
      case 0:
      default:
        return 'Save Property';
    }
  }

  get contextualIsActiveValue(): boolean {
    if (this.selectedTabIndex <= 2) {
      return !!this.form?.get('isActive')?.value;
    }
    return this.listIsActiveFilter;
  }

  get contextualSaveDisabled(): boolean {
    switch (this.selectedTabIndex) {
      case 1:
        return this.isAddMode
          || !this.propertyInformationComponent
          || this.propertyInformationComponent.isSubmitting
          || !this.propertyInformationComponent.form?.valid;
      case 2:
        return this.isAddMode
          || !this.propertyWelcomeLetterComponent
          || this.propertyWelcomeLetterComponent.isSubmitting;
      case 0:
      default:
        return this.isSubmitting || !this.form;
    }
  }

  onContextualSave(): void {
    switch (this.selectedTabIndex) {
      case 1:
        this.propertyInformationComponent?.savePropertyLetter();
        break;
      case 2:
        this.propertyWelcomeLetterComponent?.saveWelcomeLetter();
        break;
      case 0:
      default:
        this.saveProperty();
        break;
    }
  }

  onContextualIsActiveChange(checked: boolean): void {
    if (this.selectedTabIndex <= 2) {
      this.form?.patchValue({ isActive: checked });
      return;
    }

    this.listIsActiveFilter = checked;
    if (this.selectedTabIndex === 3) {
      this.propertyEmailList?.applyFilters();
    } else if (this.selectedTabIndex === 4) {
      this.propertyDocumentList?.applyFilters();
    }
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
    this.globalOfficeSelectionService.setSelectedOfficeId(this.form.get('officeId')?.value ?? null);
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
        owner3Id: null
      }, { emitEvent: false });
    }
  }

  get ownerContacts(): ContactResponse[] {
    const officeId = this.form?.get('officeId')?.value;
    if (!officeId) return [];
    return this.contacts.filter(c => Number(c.officeId) === Number(officeId));
  }

  compareReservationId(a: string | null | undefined, b: string | null | undefined): boolean {
    if ((a == null || a === undefined) && (b == null || b === undefined)) return true;
    if (a == null || a === undefined || b == null || b === undefined) return false;
    return String(a) === String(b);
  }

  onReservationChange(): void {
    const reservationId = this.form.get('reservationId')?.value;
    // Normalize null/undefined to null for consistency
    const normalizedId = reservationId == null ? null : reservationId;
    this.selectedReservationId = normalizedId;
    // Ensure form value is also normalized (in case it was undefined)
    if (reservationId !== normalizedId) {
      this.form.get('reservationId')?.setValue(normalizedId, { emitEvent: false });
    }
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.form.patchValue({ propertyCode: upperValue }, { emitEvent: false });
    input.value = upperValue;
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

  private propertyCodeEntryValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    return value.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()
      ? { defaultCode: true }
      : null;
  };

  /** No default dates in UI: empty unless API sends a real calendar date (sentinels like 0001-01-01 → blank). */
  private parseMaintenanceDateOrNull(iso: string | null | undefined): Date | null {
    if (iso == null || String(iso).trim() === '') return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    if (y < 1900 || y > 2200) return null;
    return d;
  }

  private formatCoordinateValue(value: number | string | null | undefined, defaultValue: string): string {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return defaultValue;
    }
    return num.toFixed(8).replace(/\.?0+$/, '') || String(num);
  }

  private parseCoordinateValue(value: string | number | null | undefined, defaultValue: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }
    return parsed;
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

  back(): void {
    const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
    if (returnTo === 'reservation-board') {
      this.router.navigateByUrl(RouterUrl.ReservationBoard);
      return;
    }
    this.router.navigateByUrl(RouterUrl.PropertyList);
  }
  //#endregion
}

