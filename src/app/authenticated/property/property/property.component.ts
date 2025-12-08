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
import { ContactType } from '../../contact/models/contact-type';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-property',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
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
    this.itemsToLoad.push('property');
    this.loadStates();
  }

  ngOnInit(): void {
    this.contactService.getAllOwnerContacts().pipe(take(1)).subscribe({
      next: (response: ContactResponse[]) => {
        this.contacts = this.mappingService.mapContacts(response);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Property Component - Error loading contacts:', err);
      }
    });
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.propertyId = paramMap.get('id');
        this.isAddMode = this.propertyId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('property');
          this.buildForm();
        } else {
          this.getProperty();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  buildForm(): void {
    const contactValidators = this.isAddMode ? [Validators.required] : [];
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      propertyCode: new FormControl('', codeValidators),
      name: new FormControl('', [Validators.required]),
      contactId: new FormControl('', contactValidators),
      address1: new FormControl('', [Validators.required]),
      address2: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required]),
      bedrooms: new FormControl(0, [Validators.required, Validators.min(0)]),
      bathrooms: new FormControl(0, [Validators.required, Validators.min(0)]),
      squareFeet: new FormControl(0, [Validators.required, Validators.min(0)]),
      gated: new FormControl(false),
      alarm: new FormControl(false),
      alarmCode: new FormControl(''),
      washerDryer: new FormControl(false),
      amenities: new FormControl(''),
      pool: new FormControl(false),
      hotTub: new FormControl(false),
      parkingSpaces: new FormControl(0, [Validators.required, Validators.min(0)]),
      yard: new FormControl(false),
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

  saveProperty(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const phoneDigits = this.stripPhoneFormatting(formValue.phone);
    const propertyRequest: PropertyRequest = {
      propertyCode: formValue.propertyCode,
      name: formValue.name,
      contactId: formValue.contactId || undefined,
      address1: formValue.address1,
      address2: formValue.address2 || undefined,
      city: formValue.city,
      state: formValue.state,
      zip: formValue.zip,
      phone: phoneDigits,
      bedrooms: formValue.bedrooms,
      bathrooms: formValue.bathrooms,
      squareFeet: formValue.squareFeet,
      gated: formValue.gated,
      alarm: formValue.alarm,
      alarmCode: formValue.alarmCode || undefined,
      washerDryer: formValue.washerDryer,
      amenities: formValue.amenities || undefined,
      pool: formValue.pool,
      hotTub: formValue.hotTub,
      parkingSpaces: formValue.parkingSpaces,
      yard: formValue.yard,
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
        this.property = response;
        this.buildForm();
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
        name: this.property.name,
        contactId: this.property.contactId || '',
        address1: this.property.address1,
        address2: this.property.address2 || '',
        city: this.property.city,
        state: this.property.state,
        zip: this.property.zip,
        phone: this.formatterService.phoneNumber(this.property.phone),
        bedrooms: this.property.bedrooms,
        bathrooms: this.property.bathrooms,
        squareFeet: this.property.squareFeet,
        gated: this.property.gated,
        alarm: this.property.alarm,
        alarmCode: this.property.alarmCode || '',
        washerDryer: this.property.washerDryer,
        amenities: this.property.amenities || '',
        pool: this.property.pool,
        hotTub: this.property.hotTub,
        parkingSpaces: this.property.parkingSpaces,
        yard: this.property.yard,
        isActive: this.property.isActive
      });
    }
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

