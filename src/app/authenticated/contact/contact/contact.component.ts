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
import { ContactType } from '../models/contact-type';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';

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
  availableContactTypes: { value: number, label: string }[] = [
    { value: ContactType.Unknown, label: 'Unknown' },
    { value: ContactType.Company, label: 'Company' },
    { value: ContactType.Owner, label: 'Owner' },
    { value: ContactType.Tenant, label: 'Tenant' },
    { value: ContactType.Rentor, label: 'Rentor' },
    { value: ContactType.Rentee, label: 'Rentee' }
  ];

  constructor(
    public contactService: ContactService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService
  ) {
    this.itemsToLoad.push('contact');
    this.loadStates();
  }

  ngOnInit(): void {
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

  buildForm(): void {
    this.form = this.fb.group({
      contactCode: new FormControl('', [Validators.required, Validators.maxLength(15)]),
      contactTypeId: new FormControl(ContactType.Unknown, [Validators.required]),
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      address1: new FormControl(''),
      address2: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zip: new FormControl(''),
      isActive: new FormControl(true)
    });
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.ContactList);
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

  saveContact(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const phoneDigits = this.stripPhoneFormatting(formValue.phone);
    const contactRequest: ContactRequest = {
      contactCode: formValue.contactCode,
      contactTypeId: formValue.contactTypeId,
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      phone: phoneDigits,
      email: formValue.email,
      address1: formValue.address1 || undefined,
      address2: formValue.address2 || undefined,
      city: formValue.city || undefined,
      state: formValue.state || undefined,
      zip: formValue.zip || undefined,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.contactService.createContact(contactRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: ContactResponse) => {
          this.toastr.success('Contact created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.ContactList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create contact request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      contactRequest.contactId = this.contactId;
      this.contactService.updateContact(this.contactId, contactRequest).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: (response: ContactResponse) => {
          this.toastr.success('Contact updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.ContactList);
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update contact request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  private getContact(): void {
    this.contactService.getContactByGuid(this.contactId).pipe(take(1),
    finalize(() => { this.removeLoadItem('contact') })).subscribe({
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

  private populateForm(): void {
    if (this.contact && this.form) {
      const isActiveValue = typeof this.contact.isActive === 'number' 
        ? this.contact.isActive === 1 
        : Boolean(this.contact.isActive);
      
      this.form.patchValue({
        contactCode: this.contact.contactCode,
        contactTypeId: this.contact.contactTypeId ?? ContactType.Unknown,
        firstName: this.contact.firstName,
        lastName: this.contact.lastName,
        address1: this.contact.address1 || '',
        address2: this.contact.address2 || '',
        city: this.contact.city || '',
        state: this.contact.state || '',
        zip: this.contact.zip || '',
        phone: this.formatterService.phoneNumber(this.contact.phone),
        email: this.contact.email,
        isActive: isActiveValue
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
        console.error('Contact Component - Error loading states:', err);
      }
    });
  }
}

