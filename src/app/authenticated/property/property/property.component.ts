import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter } from 'rxjs';
import { PropertyService } from '../services/property.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { PropertyResponse, PropertyRequest } from '../models/property.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse, ContactListDisplay } from '../../contact/models/contact.model';
import { MappingService } from '../../../services/mapping.service';
import { TrashDays, PropertyStyle, PropertyStatus, PropertyType, BedSizeType } from '../models/property-enums';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-property',
  standalone: true,
  imports: [
    CommonModule, 
    MaterialModule, 
    FormsModule, 
    ReactiveFormsModule
  ],
  templateUrl: './property.component.html',
  styleUrl: './property.component.scss'
})

export class PropertyComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  propertyId: string;
  property: PropertyResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  contacts: ContactListDisplay[] = [];
  trashDays: { value: number, label: string }[] = [];
  propertyStyles: { value: number, label: string }[] = [];
  propertyStatuses: { value: number, label: string }[] = [];
  propertyTypes: { value: number, label: string }[] = [];
  bedSizeTypes: { value: number, label: string }[] = [];
  
  // Accordion expansion states
  expandedSections = {
    availability: true,
    address: true,
    features: true,
    kitchen: true,
    electronics: true,
    outdoor: true,
    pool: true,
    trash: true,
    amenities: true
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
    private authService: AuthService
  ) {
      //this.itemsToLoad.push('property');
      this.loadStates();
  }

  ngOnInit(): void {
    // Initialize dropdown menus
    this.trashDays = Object.keys(TrashDays)
      .filter(key => !isNaN(Number(TrashDays[key])))
      .map(key => ({ value: Number(TrashDays[key]), label: key }));
    
    this.initializePropertyStyles();
    this.initializePropertyStatuses();
    this.initializePropertyTypes();
    this.initializeBedSizeTypes();
    
    // Build form first so template can access it
    this.buildForm();
    
    // Load owner contacts from already-cached source
    this.contactService.getAllOwnerContacts().pipe(
      filter((contacts: ContactResponse[]) => contacts && contacts.length > 0), take(1)).subscribe({
      next: (response: ContactResponse[]) => {
        this.contacts = this.mappingService.mapContacts(response);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Component - Error loading contacts:', err);
      }
    });
    
    // Set isAddMode from route params and load property if needed
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.propertyId = paramMap.get('id');
        this.isAddMode = this.propertyId === 'new';
        
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

        if (this.isAddMode) {
          this.removeLoadItem('property');
        } else {
          this.itemsToLoad.push('property');
          this.getProperty();
        }
      }
    });
    
    // Set up alarm and keypadAccess field enable/disable logic
    this.setupConditionalFields();
    

  }

  getProperty(): void {
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1),
    finalize(() => { this.removeLoadItem('property') })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load property info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  
  saveProperty(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
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
    propertyRequest.checkoutFee = formValue.checkoutFee ? parseFloat(formValue.checkoutFee.toString()) : 0;
    propertyRequest.maidServiceFee = formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0;
    propertyRequest.petFee = formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0;
    
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
                                   'phone', 'view', 'mailbox', 'notes', 'amenities', 'alarmCode', 
                                   'masterKeyCode', 'tenantKeyCode', 'trashRemoval', 'description'];
    optionalStringFields.forEach(field => {
      if (propertyRequest[field] === '' || propertyRequest[field] === null) {
        propertyRequest[field] = undefined;
      }
    });
    
    // Handle phone formatting
    if (formValue.phone) {
      propertyRequest.phone = this.stripPhoneFormatting(formValue.phone);
    } else {
      propertyRequest.phone = '';
    }
    
    // Handle boolean defaults
    if (propertyRequest.yard === undefined) {
      propertyRequest.yard = false;
    }

    if (this.isAddMode) {
      this.propertyService.createProperty(propertyRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: PropertyResponse) => {
          this.toastr.success('Property created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.TenantList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create property request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      propertyRequest.propertyId = this.propertyId;
      propertyRequest.organizationId = this.property?.organizationId || user?.organizationId || '';
      this.propertyService.updateProperty(this.propertyId, propertyRequest).pipe(take(1), finalize(() => this.isSubmitting = false) ).subscribe({
        next: (response: PropertyResponse) => {
          this.toastr.success('Property updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.TenantList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update property request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  // Form methods
  buildForm(): void {
    const contactValidators = [];
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      // Rental tab
      propertyCode: new FormControl('', codeValidators),
      owner1Id: new FormControl('', contactValidators),
      owner2Id: new FormControl(null),
      propertyStyle: new FormControl<number>(PropertyStyle.Standard),
      propertyStatus: new FormControl<number>(PropertyStatus.NotProcessed),
      propertyType: new FormControl<number>(PropertyType.Unspecified),
      phone: new FormControl(''),
      accomodates: new FormControl(0),
      dailyRate: new FormControl<string>('0.00'),
      monthlyRate: new FormControl<string>('0.00'),
      checkoutFee: new FormControl<string>('0.00'),
      maidServiceFee: new FormControl<string>('0.00'),
      petFee: new FormControl<string>('0.00'),
      furnished: new FormControl(false),
      
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
      minStay: new FormControl<number>(0),
      maxStay: new FormControl<number>(0),
      availableFrom: new FormControl<Date | null>(null),
      availableUntil: new FormControl<Date | null>(null),
      
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
      assignedParking: new FormControl(false),
      notes: new FormControl({ value: '', disabled: true }),
      
      // Amenities tab
      amenities: new FormControl(''),
      description: new FormControl(''),
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
      
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.property && this.form) {
      // Start with property object, converting to form-friendly format
      const formData: any = { ...this.property };
      
      // Transform fields that need special handling
      formData.owner1Id = this.property.owner1Id || '';
      formData.owner2Id = this.property.owner2Id || null;
      formData.dailyRate = (this.property.dailyRate ?? 0).toFixed(2);
      formData.monthlyRate = (this.property.monthlyRate ?? 0).toFixed(2);
      formData.checkoutFee = (this.property.checkoutFee ?? 0).toFixed(2);
      formData.maidServiceFee = (this.property.maidServiceFee ?? 0).toFixed(2);
      formData.petFee = (this.property.petFee ?? 0).toFixed(2);
      formData.minStay = this.property.minStay ?? 0;
      formData.maxStay = this.property.maxStay ?? 0;
      
      // Convert date strings to Date objects
      formData.availableFrom = this.property.availableFrom ? new Date(this.property.availableFrom) : null;
      formData.availableUntil = this.property.availableUntil ? new Date(this.property.availableUntil) : null;
      
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
                           'trashRemoval', 'notes', 'amenities', 'alarmCode', 'masterKeyCode', 
                           'tenantKeyCode', 'mailbox', 'phone', 'description'];
      stringFields.forEach(field => {
        formData[field] = this.property[field] || '';
      });
      
      // Handle phone - ensure empty string if null/undefined, then format if present
      formData.phone = this.property.phone || '';
      if (formData.phone) {
        formData.phone = this.formatterService.phoneNumber(formData.phone);
      }
      
      // Set all values at once
      this.form.patchValue(formData);
    }
  }

  setupConditionalFields(): void {
    // Subscribe to alarm checkbox changes to enable/disable alarm code field
    this.form.get('alarm')?.valueChanges.subscribe(value => {
      const alarmCodeControl = this.form.get('alarmCode');
      if (alarmCodeControl) {
        if (value) {
          alarmCodeControl.enable();
        } else {
          alarmCodeControl.disable();
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
        }
      }
      if (tenantKeyCodeControl) {
        if (value) {
          tenantKeyCodeControl.enable();
        } else {
          tenantKeyCodeControl.disable();
        }
      }
    });

    // Subscribe to assignedParking checkbox changes to enable/disable notes field
    this.form.get('assignedParking')?.valueChanges.subscribe(value => {
      const notesControl = this.form.get('notes');
      if (notesControl) {
        if (value) {
          notesControl.enable();
        } else {
          notesControl.disable();
          notesControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Set initial state based on current values
    const alarmValue = this.form.get('alarm')?.value;
    const keypadAccessValue = this.form.get('keypadAccess')?.value;
    const assignedParkingValue = this.form.get('assignedParking')?.value;
    
    if (alarmValue) {
      this.form.get('alarmCode')?.enable();
    } else {
      this.form.get('alarmCode')?.disable();
    }

    if (keypadAccessValue) {
      this.form.get('masterKeyCode')?.enable();
      this.form.get('tenantKeyCode')?.enable();
    } else {
      this.form.get('masterKeyCode')?.disable();
      this.form.get('tenantKeyCode')?.disable();
    }

    if (assignedParkingValue) {
      this.form.get('notes')?.enable();
    } else {
      this.form.get('notes')?.disable();
    }
  }

  // Formatting handlers
  stripPhoneFormatting(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  }

  formatPhone(): void {
    const phoneControl = this.form.get('phone');
    if (phoneControl && phoneControl.value) {
      const phone = phoneControl.value.replace(/\D/g, '');
      if (phone.length === 10) {
        const formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
        phoneControl.setValue(formatted, { emitEvent: false });
      }
    }
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const phone = input.value.replace(/\D/g, '');
    if (phone.length <= 10) {
      let formatted = phone;
      if (phone.length > 6) {
        formatted = `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
      } else if (phone.length > 3) {
        formatted = `(${phone.substring(0, 3)}) ${phone.substring(3)}`;
      } else if (phone.length > 0) {
        formatted = `(${phone}`;
      }
      this.form.get('phone').setValue(formatted, { emitEvent: false });
    }
  }

  formatDecimal(fieldName: string): void {
    const control = this.form.get(fieldName);
    if (control && control.value !== null && control.value !== '') {
      const value = parseFloat(control.value.toString().replace(/[^0-9.]/g, ''));
      if (!isNaN(value)) {
        const formatted = value.toFixed(2);
        control.setValue(formatted, { emitEvent: false });
      } else {
        control.setValue('0.00', { emitEvent: false });
      }
    } else {
      control?.setValue('0.00', { emitEvent: false });
    }
  }

  onDecimalInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9.]/g, '');
    
    // Allow only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
    
    this.form.get(fieldName)?.setValue(input.value, { emitEvent: false });
  }

  selectAllOnFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  // Utility methods
  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }
    
    this.commonService.getStates().pipe(
      filter(states => states && states.length > 0),take(1)
    ).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: (err) => {
        console.error('Property Component - Error loading states:', err);
      }
    });
  }
  
  back(): void {
    this.router.navigateByUrl(RouterUrl.TenantList);
  }

  initializePropertyStyles(): void {
    // Build propertyStyles from the PropertyStyle enum
    this.propertyStyles = Object.keys(PropertyStyle)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .map(key => ({
        value: PropertyStyle[key],
        label: this.formatPropertyStyleLabel(key)
      }));
  }

  initializePropertyStatuses(): void {
    // Build propertyStatuses from the PropertyStatus enum
    this.propertyStatuses = Object.keys(PropertyStatus)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .map(key => ({
        value: PropertyStatus[key],
        label: this.formatPropertyStatusLabel(key)
      }));
  }

  initializePropertyTypes(): void {
    // Build propertyTypes from the PropertyType enum
    // Include all types including Unspecified (0)
    this.propertyTypes = Object.keys(PropertyType)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .map(key => ({
        value: PropertyType[key],
        label: this.formatPropertyTypeLabel(key)
      }));
  }

  initializeBedSizeTypes(): void {
    // Build bedSizeTypes from the BedSizeType enum
    this.bedSizeTypes = Object.keys(BedSizeType)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .map(key => ({
        value: BedSizeType[key],
        label: this.formatBedSizeTypeLabel(key)
      }));
  }

  formatBedSizeTypeLabel(enumKey: string): string {
    // Convert enum key to a readable label
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }


  formatPropertyStyleLabel(enumKey: string): string {
    // Convert enum key to a readable label
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }

  formatPropertyStatusLabel(enumKey: string): string {
    // Convert enum key to a readable label
    // e.g., "NotProcessed" -> "Not Processed"
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }

  formatPropertyTypeLabel(enumKey: string): string {
    // Convert enum key to a readable label
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }

  // Removed formatCheckInTimeLabel and formatCheckOutTimeLabel - CheckInTime and CheckOutTime fields removed from API

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  toNumberOrNull(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }
}

