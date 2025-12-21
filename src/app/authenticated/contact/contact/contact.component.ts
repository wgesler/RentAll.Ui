import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter } from 'rxjs';
import { ContactService } from '../services/contact.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ContactResponse, ContactRequest } from '../models/contact.model';
import { EntityType } from '../models/contact-type';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss'
})

export class ContactComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  contactId: string;
  contact: ContactResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  availableContactTypes: { value: number, label: string }[] = [];

  constructor(
    public contactService: ContactService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private authService: AuthService
  ) {
    this.itemsToLoad.push('contact');
    this.loadStates();
  }

  ngOnInit(): void {
    this.initializeContactTypes();
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.contactId = paramMap.get('id');
        this.isAddMode = this.contactId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('contact');
          this.buildForm();
        } else {
          this.getContact();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  getContact(): void {
    this.contactService.getContactByGuid(this.contactId).pipe(
      take(1),
      finalize(() => { this.removeLoadItem('contact'); })
    ).subscribe({
      next: (response: ContactResponse) => {
        this.contact = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load contact info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  saveContact(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    // Bulk map: form → request, normalizing optional strings to empty string
    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const contactRequest: ContactRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      entityTypeId: formValue.contactTypeId, // Map contactTypeId from form to entityTypeId in request
      address1: formValue.address1 || '',
      address2: formValue.address2 || '',
      city: formValue.city || '',
      state: formValue.state || '',
      zip: formValue.zip || '',
      phone: this.stripPhoneFormatting(formValue.phone),
      notes: formValue.notes || ''
    };
    // Remove contactTypeId from request since we're using entityTypeId
    delete (contactRequest as any).contactTypeId;

    if (!this.isAddMode) {
      contactRequest.contactId = this.contactId;
      contactRequest.contactCode = this.contact?.contactCode;
      contactRequest.organizationId = this.contact?.organizationId || user?.organizationId || '';
    }

    const save$ = this.isAddMode
      ? this.contactService.createContact(contactRequest)
      : this.contactService.updateContact(this.contactId, contactRequest);

    save$.pipe(
      take(1),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Contact created successfully' : 'Contact updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.ContactList);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoadError = true;
        if (err.status !== 400) {
          const failMessage = this.isAddMode ? 'Create contact request has failed. ' : 'Update contact request has failed. ';
          this.toastr.error(failMessage + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form methods
  buildForm(): void {
    this.form = this.fb.group({
      contactCode: new FormControl(''), // Not required - only shown in Edit Mode
      contactTypeId: new FormControl(EntityType.Unknown, [Validators.required]),
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      address1: new FormControl(''),
      address2: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zip: new FormControl(''),
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.contact && this.form) {
      const isActiveValue = typeof this.contact.isActive === 'number' 
        ? this.contact.isActive === 1 
        : Boolean(this.contact.isActive);
      
      this.form.patchValue({
        contactCode: this.contact.contactCode,
        contactTypeId: this.contact.entityTypeId ?? EntityType.Unknown, // Map entityTypeId from response to contactTypeId in form
        firstName: this.contact.firstName,
        lastName: this.contact.lastName,
        address1: this.contact.address1 || '',
        address2: this.contact.address2 || '',
        city: this.contact.city || '',
        state: this.contact.state || '',
      zip: this.contact.zip || '',
      phone: this.formatterService.phoneNumber(this.contact.phone),
      email: this.contact.email,
      notes: this.contact.notes || '',
      isActive: isActiveValue
      });
    }
  }

  initializeContactTypes(): void {
    // Build availableContactTypes from the EntityType enum
    // Exclude Unknown (0) from the list
    this.availableContactTypes = Object.keys(EntityType)
      .filter(key => isNaN(Number(key))) // Filter out numeric keys
      .filter(key => EntityType[key] !== EntityType.Unknown) // Exclude Unknown
      .map(key => ({
        value: EntityType[key],
        label: this.formatContactTypeLabel(key)
      }));
  }

  formatContactTypeLabel(enumKey: string): string {
    // Convert enum key to a readable label
    // e.g., "Company" -> "Company", "Owner" -> "Owner"
    return enumKey
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim()
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
  }
  
  // Phone helpers
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

  // Utility helpers
  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }
    
    this.commonService.getStates().pipe(filter(states => states && states.length > 0), take(1)).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: (err) => {
        console.error('Contact Component - Error loading states:', err);
      }
    });
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.ContactList);
  }
}

