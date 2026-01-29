import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, forkJoin, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { PropertyService } from '../services/property.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { PropertyResponse, PropertyRequest } from '../models/property.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { EntityType } from '../../contact/models/contact-enum';
import { MappingService } from '../../../services/mapping.service';
import { TrashDays, PropertyStyle, PropertyStatus, PropertyType, getCheckInTimes, getCheckOutTimes, getPropertyStatuses, getPropertyTypes, getBedSizeTypes, getPropertyStyles, normalizeCheckInTimeId, normalizeCheckOutTimeId } from '../models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { RegionService } from '../../organization-configuration/region/services/region.service';
import { AreaService } from '../../organization-configuration/area/services/area.service';
import { BuildingService } from '../../organization-configuration/building/services/building.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { RegionResponse } from '../../organization-configuration/region/models/region.model';
import { AreaResponse } from '../../organization-configuration/area/models/area.model';
import { BuildingResponse } from '../../organization-configuration/building/models/building.model';
import { PropertyWelcomeLetterComponent } from '../property-welcome/property-welcome-letter.component';
import { PropertyLetterInformationComponent } from '../property-information/property-letter-information.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { UtilityService } from '../../../services/utility.service';

@Component({
  selector: 'app-property',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
    FormsModule, 
    ReactiveFormsModule,
    PropertyWelcomeLetterComponent,
    PropertyLetterInformationComponent,
    DocumentListComponent
  ],
  templateUrl: './property.component.html',
  styleUrls: ['./property.component.scss']
})

export class PropertyComponent implements OnInit, OnDestroy {
  @ViewChild('propertyDocumentList') propertyDocumentList?: DocumentListComponent;
  
  DocumentType = DocumentType; // Make DocumentType available in template
  isServiceError: boolean = false;
  selectedTabIndex: number = 0;
  propertyId: string;
  property: PropertyResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
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
  regions: RegionResponse[] = [];
  areas: AreaResponse[] = [];
  buildings: BuildingResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['locationLookups', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  
  // Accordion expansion states - will be initialized based on isAddMode
  expandedSections = {
    basic: false,
    address: false,
    location: false,
    features: false,
    kitchen: false,
    electronics: false,
    outdoor: false,
    pool: false,
    trash: false,
    amenities: false,
    description: false
  };

  onPanelOpened(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = true;
  }

  onPanelClosed(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = false;
  }

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
    private utilityService: UtilityService
  ) {
  }

  //#region Property
  ngOnInit(): void {
    this.loadStates();
    this.loadContacts();
    this.loadLocationLookups();

    // Initialize dropdown menus
    this.initializeTrashDays();
    this.initializePropertyStyles();
    this.initializePropertyStatuses();
    this.initializePropertyTypes();
    this.initializeBedSizeTypes();
    this.initializeTimeTypes();
    
    // Build form first so template can access it
    this.buildForm();
  
    // Set isAddMode from route params and load property if needed
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.propertyId = paramMap.get('id');
        this.isAddMode = this.propertyId === 'new';
        
        // Set panel expansion state based on mode
        const allExpanded = this.isAddMode;
        this.expandedSections = {
          basic: allExpanded,
          address: allExpanded,
          location: allExpanded,
          features: allExpanded,
          kitchen: allExpanded,
          electronics: allExpanded,
          outdoor: allExpanded,
          pool: allExpanded,
          trash: allExpanded,
          amenities: allExpanded,
          description: allExpanded
        };
        
        // Update form validators based on mode
        const owner1Control = this.form.get('owner1Id');
        const codeControl = this.form.get('propertyCode');

        if (this.isAddMode) {
          owner1Control?.setValidators([Validators.required]);
          codeControl?.setValidators([Validators.required]);
        } else {
          owner1Control?.clearValidators();
          codeControl?.clearValidators();
        }

        owner1Control?.updateValueAndValidity();
        codeControl?.updateValueAndValidity();

        if (!this.isAddMode) {
          const currentSet = this.itemsToLoad$.value;
          const newSet = new Set(currentSet);
          newSet.add('property');
          this.itemsToLoad$.next(newSet);
          this.getProperty();
        }
      }
    });
    
    // Check query params for tab selection
    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      if (queryParams['tab'] === 'documents') {
        this.selectedTabIndex = 3; // Documents tab
      }
    });
    
    // Set up alarm and keypadAccess field enable/disable logic
    this.setupConditionalFields();
  }

  getProperty(): void {
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
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
    
    // Start with form values - bulk copy (excluding fields that need special mapping)
    const { propertyStyle, propertyType, propertyStatus, ...restFormValue } = formValue;
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
    propertyRequest.propertyStatusId = formValue.propertyStatus ?? PropertyStatus.NotProcessed;
    
    // Handle owner2Id - set to undefined if empty string or null
    if (!propertyRequest.owner2Id || propertyRequest.owner2Id === '' || propertyRequest.owner2Id === null) {
      propertyRequest.owner2Id = undefined;
    }
    
    // Handle optional nullable string fields - keep as undefined if empty
    const optionalStringFields = ['address2', 'suite', 'neighborhood', 'crossStreet', 
                                   'phone', 'view', 'mailbox', 'amenities', 'alarmCode', 
                                   'masterKeyCode', 'tenantKeyCode', 'trashRemoval', 'description', 'notes'];
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

    // Assign location IDs directly (now GUIDs)
    propertyRequest.officeId = formValue.officeId || null;
    propertyRequest.regionId = formValue.regionId || null;
    propertyRequest.areaId = formValue.areaId || null;
    propertyRequest.buildingId = formValue.buildingId || null;
    
    // Map parkingNotes field (note: API expects lowercase 'parkingnotes' in request)
    propertyRequest.parkingnotes = formValue.parkingNotes || '';
    
    // Explicitly set notes field from form
    propertyRequest.notes = formValue.notes || '';

    if (this.isAddMode) {
      this.propertyService.createProperty(propertyRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: PropertyResponse) => {
          this.toastr.success('Property created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          
          // Update property data and switch to edit mode
          this.property = response;
          this.propertyId = response.propertyId;
          this.isAddMode = false;
          // Update the URL to reflect edit mode
          this.router.navigate(['/tenants', this.propertyId], { replaceUrl: true });
          this.populateForm();
          
          // Trigger welcome letter reload event
          this.welcomeLetterReloadService.triggerReload();
          
          // Trigger document reload event
          this.documentReloadService.triggerReload();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Create property request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      propertyRequest.propertyId = this.propertyId;
      propertyRequest.organizationId = this.property?.organizationId || user?.organizationId || '';
      this.propertyService.updateProperty(propertyRequest).pipe(take(1), finalize(() => this.isSubmitting = false) ).subscribe({
        next: (response: PropertyResponse) => {
          this.toastr.success('Property updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          
          // Update the property data with the response
          this.property = response;
          this.populateForm();
          
          // Trigger welcome letter reload event
          this.welcomeLetterReloadService.triggerReload();
          
          // Trigger document reload event
          this.documentReloadService.triggerReload();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Update property request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }
  //#endregion
  
  //#region Form methods
  buildForm(): void {
    const contactValidators = [];
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      // Rental tab
      propertyCode: new FormControl('', codeValidators),
      owner1Id: new FormControl('', contactValidators),
      owner2Id: new FormControl(null),
      owner3Id: new FormControl(null),
      propertyStyle: new FormControl<number>(PropertyStyle.Standard, [Validators.required]),
      propertyStatus: new FormControl<number>(PropertyStatus.NotProcessed, [Validators.required]),
      propertyType: new FormControl<number>(PropertyType.Unspecified, [Validators.required]),
      phone: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4})?$/)]),
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
      washerDryer: new FormControl(false),
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
      keypadAccess: new FormControl(false),
      parking: new FormControl(false),
      parkingNotes: new FormControl({ value: '', disabled: true }),
      
      // Amenities tab
      amenities: new FormControl(''),
      description: new FormControl(''),
      notes: new FormControl(''),
      alarm: new FormControl(false),
      alarmCode: new FormControl({ value: '', disabled: true }),
      masterKeyCode: new FormControl({ value: '', disabled: true }),
      tenantKeyCode: new FormControl({ value: '', disabled: true }),
      mailbox: new FormControl(''),
      gated: new FormControl(false),
      heating: new FormControl(false),
      ac: new FormControl(false),
      sofabeds: new FormControl(false),
      smoking: new FormControl(false),
      petsAllowed: new FormControl(false),

      // Location section
      officeId: new FormControl<number | null>(null, [Validators.required]),
      regionId: new FormControl<number | null>(null),
      areaId: new FormControl<number | null>(null),
      buildingId: new FormControl<number | null>(null),
      
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.property && this.form) {
      // Start with property object, converting to form-friendly format
      const formData: any = { ...this.property };
      
      // Transform fields that need special handling
      // Convert propertyCode to uppercase
      formData.propertyCode = this.property.propertyCode?.toUpperCase() || '';
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
      const propertyStatusValue = this.property.propertyStatusId != null ? Number(this.property.propertyStatusId) : PropertyStatus.NotProcessed;
      const propertyTypeValue = this.property.propertyTypeId != null ? Number(this.property.propertyTypeId) : PropertyType.Unspecified;
      
      formData.propertyStyle = propertyStyleValue;
      formData.propertyStatus = propertyStatusValue;
      formData.propertyType = propertyTypeValue;
      
      // Handle bedroom IDs
      formData.bedroomId1 = this.property.bedroomId1 ?? 0;
      formData.bedroomId2 = this.property.bedroomId2 ?? 0;
      formData.bedroomId3 = this.property.bedroomId3 ?? 0;
      formData.bedroomId4 = this.property.bedroomId4 ?? 0;
     
      // Handle string fields that might be null/undefined - convert to empty strings
      const stringFields = ['address2', 'suite', 'neighborhood', 'crossStreet', 'view',
                           'trashRemoval', 'amenities', 'alarmCode', 'masterKeyCode', 
                           'tenantKeyCode', 'mailbox', 'phone', 'description', 'notes'];
      stringFields.forEach(field => {
        formData[field] = this.property[field] || '';
      });
      
      // Handle parkingNotes field (map from parkingNotes in response)
      formData.parkingNotes = this.property.parkingNotes || '';
      
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
      
      // Set all values at once
      this.form.patchValue(formData);
    }
  }
  //#endregion

  //#region Formatting handlers
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

  toNumberOrNull(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
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

  //#region Setup and Initialize 
  setupConditionalFields(): void {
    // Subscribe to alarm checkbox changes to enable/disable alarm code field
    this.form.get('alarm')?.valueChanges.subscribe(value => {
      const alarmCodeControl = this.form.get('alarmCode');
      if (alarmCodeControl) {
        if (value) {
          alarmCodeControl.enable();
        } else {
          alarmCodeControl.disable();
          alarmCodeControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Subscribe to keypadAccess checkbox changes to enable/disable key code fields
    this.form.get('keypadAccess')?.valueChanges.subscribe(value => {
      const masterKeyCodeControl = this.form.get('masterKeyCode');
      const tenantKeyCodeControl = this.form.get('tenantKeyCode');
      if (masterKeyCodeControl) {
        if (value) {
          masterKeyCodeControl.enable();
        } else {
          masterKeyCodeControl.disable();
          masterKeyCodeControl.setValue('', { emitEvent: false });
        }
      }
      if (tenantKeyCodeControl) {
        if (value) {
          tenantKeyCodeControl.enable();
        } else {
          tenantKeyCodeControl.disable();
          tenantKeyCodeControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Subscribe to parking checkbox changes to enable/disable parkingNotes field
    this.form.get('parking')?.valueChanges.subscribe(value => {
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

    // Set initial state based on current values
    const alarmValue = this.form.get('alarm')?.value;
    const keypadAccessValue = this.form.get('keypadAccess')?.value;
    const parkingValue = this.form.get('parking')?.value;
    
    if (alarmValue) {
      this.form.get('alarmCode')?.enable();
    } else {
      this.form.get('alarmCode')?.disable();
      this.form.get('alarmCode')?.setValue('', { emitEvent: false });
    }

    if (keypadAccessValue) {
      this.form.get('masterKeyCode')?.enable();
      this.form.get('tenantKeyCode')?.enable();
    } else {
      this.form.get('masterKeyCode')?.disable();
      this.form.get('masterKeyCode')?.setValue('', { emitEvent: false });
      this.form.get('tenantKeyCode')?.disable();
      this.form.get('tenantKeyCode')?.setValue('', { emitEvent: false });
    }

    if (parkingValue) {
      this.form.get('parkingNotes')?.enable();
    } else {
      this.form.get('parkingNotes')?.disable();
      this.form.get('parkingNotes')?.setValue('', { emitEvent: false });
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
    // Wait for contacts to be loaded initially, then subscribe to changes for updates
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe(contacts => {
        this.contacts = contacts?.filter(c => c.entityTypeId === EntityType.Owner) || [];
      });
    });
  }

  loadLocationLookups(): void {
    const orgId = this.authService.getUser()?.organizationId || '';

    forkJoin({
      offices: this.officeService.getOffices().pipe(take(1)),
      regions: this.regionService.getRegions().pipe(take(1)),
      areas: this.areaService.getAreas().pipe(take(1)),
      buildings: this.buildingService.getBuildings().pipe(take(1)),
    }).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'locationLookups'); })).subscribe({
      next: ({ offices, regions, areas, buildings }) => {
        this.offices = (offices || []).filter(f => f.organizationId === orgId && f.isActive);
        this.regions = (regions || []).filter(r => r.organizationId === orgId && r.isActive);
        this.areas = (areas || []).filter(a => a.organizationId === orgId && a.isActive);
        this.buildings = (buildings || []).filter(b => b.organizationId === orgId && b.isActive);
        
        // If property is already loaded, update location fields in form
        if (this.property && this.form) {
          this.form.patchValue({
            officeId: this.property.officeId || null,
            regionId: this.property.regionId || null,
            areaId: this.property.areaId || null,
            buildingId: this.property.buildingId || null,
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        this.regions = [];
        this.areas = [];
        this.buildings = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load location lookups. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('locationLookups');
      }
    });
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
      error: (err: HttpErrorResponse) => {
        // States are handled globally, just log silently or handle gracefully
      }
    });
  }
  //#endregion

  //#region Utility Methods
  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.form.patchValue({ propertyCode: upperValue }, { emitEvent: false });
    input.value = upperValue;
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
    this.contactsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.TenantList);
  }

  onTabChange(event: any): void {
    // When Documents tab (index 3) is selected, reload the document list
    if (event.index === 3 && this.propertyDocumentList) {
      this.propertyDocumentList.reload();
    }
  }
  //#endregion
}

