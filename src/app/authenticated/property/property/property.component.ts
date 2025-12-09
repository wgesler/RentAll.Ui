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
import { TrashDays, PropertyStyle, PropertyStatus, PropertyType } from '../models/property-enums';

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
  checkInOptions: string[] = ['12:00 PM', '3:00 PM', '4:00 PM', 'Flexible'];
  checkOutOptions: string[] = ['10:00 AM', '11:00 AM', '12:00 PM', 'Flexible'];

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
    
    this.contactService.getAllOwnerContacts().pipe(take(1)).subscribe({
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
      phone: new FormControl('', [Validators.required]),
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
      minStay: new FormControl<number | null>(null),
      maxStay: new FormControl<number | null>(null),
      checkInTime: new FormControl(''),
      checkOutTime: new FormControl(''),
      availableFrom: new FormControl(''),
      availableUntil: new FormControl(''),
      
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
    const formValue = this.form.value;
    const phoneDigits = this.stripPhoneFormatting(formValue.phone);
    const minStay = this.toNumberOrNull(formValue.minStay);
    const maxStay = this.toNumberOrNull(formValue.maxStay);
    const propertyRequest: PropertyRequest = {
      propertyCode: formValue.propertyCode,
      contactId: formValue.contactId || null,
      propertyStyle: formValue.propertyStyle,
      propertyStatus: formValue.propertyStatus,
      propertyType: formValue.propertyType,
      address1: formValue.address1,
      address2: formValue.address2 || null,
      suite: formValue.suite || null,
      city: formValue.city,
      state: formValue.state,
      zip: formValue.zip,
      neighborhood: formValue.neighborhood || null,
      crossStreet: formValue.crossStreet || null,
      phone: phoneDigits,
      furnished: formValue.furnished,
      bedrooms: formValue.bedrooms,
      bathrooms: formValue.bathrooms,
      accomodates: formValue.accomodates,
      squareFeet: formValue.squareFeet,
      bedSizes: formValue.bedSizes,
      gated: formValue.gated,
      heating: formValue.heating,
      ac: formValue.ac,
      sofabeds: formValue.sofabeds,
      smoking: formValue.smoking,
      petsAllowed: formValue.petsAllowed,
      kitchen: formValue.kitchen,
      washerDryer: formValue.washerDryer,
      trashRemoval: formValue.trashRemoval,
      trashPickupId: formValue.trashPickupId,
      oven: formValue.oven,
      refrigerator: formValue.refrigerator,
      microwave: formValue.microwave,
      dishwasher: formValue.dishwasher,
      tv: formValue.tv,
      cable: formValue.cable,
      dvd: formValue.dvd,
      fastInternet: formValue.fastInternet,
      minStay,
      maxStay,
      checkInTime: formValue.checkInTime || null,
      checkOutTime: formValue.checkOutTime || null,
      availableFrom: formValue.availableFrom || null,
      availableUntil: formValue.availableUntil || null,
      view: formValue.view,
      deck: formValue.deck,
      garden: formValue.garden,
      patio: formValue.patio,
      yard: formValue.yard || false,
      commonPool: formValue.commonPool,
      privatePool: formValue.privatePool,
      jacuzzi: formValue.jacuzzi,
      sauna: formValue.sauna,
      bathtub: formValue.bathtub,
      gym: formValue.gym,
      security: formValue.security,
      elevator: formValue.elevator,
      remoteAccess: formValue.remoteAccess,
      assignedParking: formValue.assignedParking,
      notes: formValue.notes || null,
      amenities: formValue.amenities || null,
      alarm: formValue.alarm,
      alarmCode: formValue.alarmCode || null,
      keyCode: formValue.keyCode || null,
      mailbox: formValue.mailbox || null,
      amount: formValue.amount,
      amountTypeId: formValue.amountTypeId,
      dailyRate: formValue.dailyRate ? parseFloat(formValue.dailyRate.toString()) : 0,
      monthlyRate: formValue.monthlyRate ? parseFloat(formValue.monthlyRate.toString()) : 0,
      isActive: formValue.isActive
    };

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
      this.propertyService.updateProperty(this.propertyId, propertyRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
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
      this.form.patchValue({
        propertyCode: this.property.propertyCode,
        contactId: this.property.contactId || '',
        propertyStyle: this.property.propertyStyle ?? PropertyStyle.Standard,
        propertyStatus: this.property.propertyStatus ?? PropertyStatus.NotProcessed,
        propertyType: this.property.propertyType ?? PropertyType.Unspecified,
        address1: this.property.address1,
        address2: this.property.address2 || '',
        suite: this.property.suite || '',
        city: this.property.city,
        state: this.property.state,
        zip: this.property.zip,
        neighborhood: this.property.neighborhood || '',
        crossStreet: this.property.crossStreet || '',
        phone: this.formatterService.phoneNumber(this.property.phone),
        furnished: this.property.furnished,
        bedrooms: this.property.bedrooms,
        bathrooms: this.property.bathrooms,
        accomodates: this.property.accomodates,
        squareFeet: this.property.squareFeet,
        bedSizes: this.property.bedSizes || '',
        gated: this.property.gated,
        heating: this.property.heating,
        ac: this.property.ac,
        sofabeds: this.property.sofabeds,
        smoking: this.property.smoking,
        petsAllowed: this.property.petsAllowed,
        kitchen: this.property.kitchen,
        washerDryer: this.property.washerDryer || false,
        trashRemoval: this.property.trashRemoval || '',
        trashPickupId: this.property.trashPickupId,
        oven: this.property.oven,
        refrigerator: this.property.refrigerator,
        microwave: this.property.microwave,
        dishwasher: this.property.dishwasher,
        tv: this.property.tv,
        cable: this.property.cable,
        dvd: this.property.dvd,
        fastInternet: this.property.fastInternet,
        dailyRate: (this.property.dailyRate ?? 0).toFixed(2),
        monthlyRate: (this.property.monthlyRate ?? 0).toFixed(2),
        minStay: this.property.minStay ?? null,
        maxStay: this.property.maxStay ?? null,
        checkInTime: this.property.checkInTime || '',
        checkOutTime: this.property.checkOutTime || '',
        availableFrom: this.property.availableFrom || '',
        availableUntil: this.property.availableUntil || '',
        view: this.property.view || '',
        deck: this.property.deck,
        garden: this.property.garden,
        patio: this.property.patio,
        yard: this.property.yard || false,
        commonPool: this.property.commonPool,
        privatePool: this.property.privatePool,
        jacuzzi: this.property.jacuzzi,
        sauna: this.property.sauna,
        bathtub: this.property.bathtub,
        gym: this.property.gym,
        security: this.property.security,
        elevator: this.property.elevator,
        remoteAccess: this.property.remoteAccess,
        assignedParking: this.property.assignedParking,
        notes: this.property.notes || '',
        amenities: this.property.amenities || '',
        alarm: this.property.alarm,
        alarmCode: this.property.alarmCode || '',
        keyCode: this.property.keyCode || '',
        mailbox: this.property.mailbox || '',
        amount: this.property.amount,
        amountTypeId: this.property.amountTypeId,
        isActive: this.property.isActive
      });
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

