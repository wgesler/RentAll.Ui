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
import { TrashDays, PropertyStyle, PropertyStatus, PropertyType, CheckinTimes, CheckoutTimes } from '../models/property-enums';

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
  checkInTimes: { value: string, label: string }[] = [];
  checkOutTimes: { value: string, label: string }[] = [];
  
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
    private mappingService: MappingService
  ) {
    this.loadStates();
  }

  ngOnInit(): void {
    // Initialize trash days
    this.trashDays = Object.keys(TrashDays)
      .filter(key => !isNaN(Number(TrashDays[key])))
      .map(key => ({ 
        value: Number(TrashDays[key]), 
        label: key 
      }));
    this.propertyStyles = Object.keys(PropertyStyle)
      .filter(key => !isNaN(Number(PropertyStyle[key])))
      .map(key => ({ value: Number(PropertyStyle[key]), label: key }));
    this.propertyStatuses = Object.keys(PropertyStatus)
      .filter(key => !isNaN(Number(PropertyStatus[key])))
      .map(key => ({ value: Number(PropertyStatus[key]), label: key }));
    this.propertyTypes = Object.keys(PropertyType)
      .filter(key => !isNaN(Number(PropertyType[key])))
      .map(key => ({ value: Number(PropertyType[key]), label: key }));
    
    // Initialize check-in times (string enum - values are the labels)
    this.checkInTimes = [
      { value: CheckinTimes.NA, label: 'N/A' },
      { value: CheckinTimes.TwelvePM, label: '12PM' },
      { value: CheckinTimes.OnePM, label: '1PM' },
      { value: CheckinTimes.TwoPM, label: '2PM' },
      { value: CheckinTimes.ThreePM, label: '3PM' },
      { value: CheckinTimes.FourPM, label: '4PM' },
      { value: CheckinTimes.FivePM, label: '5PM' }
    ];
    
    // Initialize check-out times (string enum - values are the labels)
    this.checkOutTimes = [
      { value: CheckoutTimes.NA, label: 'NA' },
      { value: CheckoutTimes.EightAM, label: '8AM' },
      { value: CheckoutTimes.NineAM, label: '9AM' },
      { value: CheckoutTimes.TenAM, label: '10AM' },
      { value: CheckoutTimes.ElevenAM, label: '11AM' },
      { value: CheckoutTimes.TwelvePM, label: '12PM' },
      { value: CheckoutTimes.OnePM, label: '1PM' }
    ];
    
    this.buildForm();    
    this.removeLoadItem('property');
    
    // Set isAddMode from route params and load property if needed
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.propertyId = paramMap.get('id');
        this.isAddMode = this.propertyId === 'new';
        
        // Update form validators based on mode
        const contactControl = this.form.get('contactId');
        const codeControl = this.form.get('propertyCode');

        if (this.isAddMode) {
          contactControl?.setValidators([Validators.required]);
          codeControl?.setValidators([Validators.required]);
        } else {
          contactControl?.clearValidators();
          codeControl?.clearValidators();
        }
        contactControl?.updateValueAndValidity();
        codeControl?.updateValueAndValidity();
        
        if (!this.isAddMode) {          // Add 'property' back to show loading state while fetching
          this.itemsToLoad.push('property');
          this.getProperty();
        }
      }
    });
    
    // Set up alarm and remoteAccess field enable/disable logic
    this.setupConditionalFields();
    
    // Subscribe to owner contacts observable
    this.contactService.getAllOwnerContacts().subscribe({
      next: (response: ContactResponse[]) => {
        this.contacts = this.mappingService.mapContacts(response);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Component - Error loading contacts:', err);
      }
    });
  }

  buildForm(): void {
    const contactValidators = [];
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      // Rental tab
      propertyCode: new FormControl('', codeValidators),
      contactId: new FormControl('', contactValidators),
      propertyStyle: new FormControl(PropertyStyle.Standard),
      propertyStatus: new FormControl(PropertyStatus.NotProcessed),
      propertyType: new FormControl(PropertyType.Unspecified),
      phone: new FormControl(''),
      amount: new FormControl(0),
      amountTypeId: new FormControl(0),
      accomodates: new FormControl(0),
      dailyRate: new FormControl<string>('0.00'),
      monthlyRate: new FormControl<string>('0.00'),
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
      bedSizes: new FormControl(''),
      
      // Kitchen & Electronics tab
      kitchen: new FormControl(false),
      washerDryer: new FormControl(false),
      trashRemoval: new FormControl(''),
      trashPickupId: new FormControl(0),
      oven: new FormControl(false),
      refrigerator: new FormControl(false),
      microwave: new FormControl(false),
      dishwasher: new FormControl(false),
      tv: new FormControl(false),
      cable: new FormControl(false),
      dvd: new FormControl(false),
      fastInternet: new FormControl(false),
      minStay: new FormControl<number>(0),
      maxStay: new FormControl<number>(0),
      checkInTime: new FormControl(''),
      checkOutTime: new FormControl(''),
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
      remoteAccess: new FormControl(false),
      assignedParking: new FormControl(false),
      notes: new FormControl({ value: '', disabled: true }),
      
      // Amenities tab
      amenities: new FormControl(''),
      alarm: new FormControl(false),
      alarmCode: new FormControl({ value: '', disabled: true }),
      keyCode: new FormControl({ value: '', disabled: true }),
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

  back(): void {
    this.router.navigateByUrl(RouterUrl.TenantList);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  private stripPhoneFormatting(phone: string): string {
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

  saveProperty(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    // Use getRawValue() to include disabled form controls
    const formValue = this.form.getRawValue();
    
    // Start with form values - bulk copy
    const propertyRequest: PropertyRequest = { ...formValue } as PropertyRequest;
    
    // Transform fields that need special handling
    propertyRequest.dailyRate = formValue.dailyRate ? parseFloat(formValue.dailyRate.toString()) : 0;
    propertyRequest.monthlyRate = formValue.monthlyRate ? parseFloat(formValue.monthlyRate.toString()) : 0;
    
    // Convert Date objects to ISO strings for API (use empty string instead of null)
    propertyRequest.availableFrom = formValue.availableFrom ? (formValue.availableFrom as Date).toISOString() : '';
    propertyRequest.availableUntil = formValue.availableUntil ? (formValue.availableUntil as Date).toISOString() : '';
    
    // Ensure optional string fields are empty strings, not null or undefined
    const optionalStringFields = ['address2', 'neighborhood', 'crossStreet', 'checkInTime', 'checkOutTime', 
                                   'bedSizes', 'phone', 'view', 'mailbox', 'notes', 'amenities', 'alarmCode', 'keyCode', 'trashRemoval'];
    optionalStringFields.forEach(field => {
      if (!propertyRequest[field] || propertyRequest[field] === null) {
        propertyRequest[field] = '';
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

  private getProperty(): void {
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1),
    finalize(() => { this.removeLoadItem('property') })).subscribe({
      next: (response: PropertyResponse) => {
        console.log('Property loaded:', response);
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

  private populateForm(): void {
    if (this.property && this.form) {
      // Start with property object, converting to form-friendly format
      const formData: any = { ...this.property };
      
      // Transform fields that need special handling
      formData.contactId = this.property.contactId || '';
      formData.propertyStyle = this.property.propertyStyle ?? PropertyStyle.Standard;
      formData.propertyStatus = this.property.propertyStatus ?? PropertyStatus.NotProcessed;
      formData.propertyType = this.property.propertyType ?? PropertyType.Unspecified;
      formData.dailyRate = (this.property.dailyRate ?? 0).toFixed(2);
      formData.monthlyRate = (this.property.monthlyRate ?? 0).toFixed(2);
      formData.minStay = this.property.minStay ?? 0;
      formData.maxStay = this.property.maxStay ?? 0;
      
      // Convert date strings to Date objects
      formData.availableFrom = this.property.availableFrom ? new Date(this.property.availableFrom) : null;
      formData.availableUntil = this.property.availableUntil ? new Date(this.property.availableUntil) : null;
      
      // Handle string fields that might be null/undefined - convert to empty strings
      const stringFields = ['address2', 'suite', 'neighborhood', 'crossStreet', 'checkInTime', 
                           'checkOutTime', 'view', 'bedSizes',
                           'trashRemoval', 'notes', 'amenities', 'alarmCode', 'keyCode', 'mailbox'];
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

  private setupConditionalFields(): void {
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

    // Subscribe to remoteAccess checkbox changes to enable/disable key code field
    this.form.get('remoteAccess')?.valueChanges.subscribe(value => {
      const keyCodeControl = this.form.get('keyCode');
      if (keyCodeControl) {
        if (value) {
          keyCodeControl.enable();
        } else {
          keyCodeControl.disable();
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
    const remoteAccessValue = this.form.get('remoteAccess')?.value;
    const assignedParkingValue = this.form.get('assignedParking')?.value;
    
    if (alarmValue) {
      this.form.get('alarmCode')?.enable();
    } else {
      this.form.get('alarmCode')?.disable();
    }

    if (remoteAccessValue) {
      this.form.get('keyCode')?.enable();
    } else {
      this.form.get('keyCode')?.disable();
    }

    if (assignedParkingValue) {
      this.form.get('notes')?.enable();
    } else {
      this.form.get('notes')?.disable();
    }
  }

  private toNumberOrNull(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return isNaN(parsed) ? null : parsed;
  }

  private loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }
    
    this.commonService.getStates().pipe(
      filter(states => states && states.length > 0),
      take(1)
    ).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: (err) => {
        console.error('Property Component - Error loading states:', err);
      }
    });
  }

}

