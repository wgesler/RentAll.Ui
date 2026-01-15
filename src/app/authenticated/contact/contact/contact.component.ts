import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
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
import { CompanyService } from '../../company/services/company.service';
import { CompanyResponse } from '../../company/models/company.model';
import { VendorService } from '../../vendor/services/vendor.service';
import { VendorResponse } from '../../vendor/models/vendor.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss'
})

export class ContactComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  contactId: string;
  contact: ContactResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  states: string[] = [];
  availableContactTypes: { value: number, label: string }[] = [];
  companies: CompanyResponse[] = [];
  vendors: VendorResponse[] = [];
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  EntityType = EntityType; // Expose enum to template

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['contact', 'companies', 'vendors']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public contactService: ContactService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private authService: AuthService,
    private companyService: CompanyService,
    private vendorService: VendorService,
    private officeService: OfficeService,
    private mappingService: MappingService
  ) {
  }

  //#region Contacts
  ngOnInit(): void {
    this.initializeContactTypes();
    this.loadStates();
    this.loadOffices();
    this.loadCompanies();
    this.loadVendors();
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
    this.contactService.getContactByGuid(this.contactId).pipe(take(1),finalize(() => { this.removeLoadItem('contact'); })).subscribe({
      next: (response: ContactResponse) => {
        this.contact = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
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
    const entityTypeId = formValue.contactTypeId;
    let entityId: string | null = null;
    
    // Set entityId based on entityTypeId
    if (entityTypeId === EntityType.Company && formValue.companyId) {
      entityId = formValue.companyId;
    } else if (entityTypeId === EntityType.Vendor && formValue.vendorId) {
      entityId = formValue.vendorId;
    }

    const contactRequest: ContactRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      entityTypeId: entityTypeId, // Map contactTypeId from form to entityTypeId in request
      entityId: entityId,
      officeId: formValue.officeId || undefined,
      address1: formValue.address1 || '',
      address2: formValue.address2 || '',
      city: formValue.city || '',
      state: formValue.state || '',
      zip: formValue.zip || '',
      phone: this.formatterService.stripPhoneFormatting(formValue.phone),
      notes: formValue.notes || '',
      companyId: formValue.companyId || undefined
    };
    // Remove contactTypeId and vendorId from request since we're using entityTypeId and entityId
    delete (contactRequest as any).contactTypeId;
    delete (contactRequest as any).vendorId;

    if (!this.isAddMode) {
      contactRequest.contactId = this.contactId;
      contactRequest.contactCode = this.contact?.contactCode;
      contactRequest.organizationId = this.contact?.organizationId || user?.organizationId || '';
    }

    const save$ = this.isAddMode
      ? this.contactService.createContact(contactRequest)
      : this.contactService.updateContact(this.contactId, contactRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Contact created successfully' : 'Contact updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.ContactList);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }
  //#endregion

  //#region Form methods
  buildForm(): void {
    this.form = this.fb.group({
      contactCode: new FormControl(''), // Not required - only shown in Edit Mode
      contactTypeId: new FormControl(EntityType.Unknown, [Validators.required]),
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      officeId: new FormControl(null),
      companyId: new FormControl(null),
      vendorId: new FormControl(null),
      phone: new FormControl('', [Validators.required, Validators.pattern(/^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$/)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      address1: new FormControl(''),
      address2: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zip: new FormControl(''),
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });

    // Show/hide company/vendor dropdown based on contact type
    this.form.get('contactTypeId')?.valueChanges.subscribe(contactTypeId => {
      const companyIdControl = this.form.get('companyId');
      const vendorIdControl = this.form.get('vendorId');
      
      if (contactTypeId === EntityType.Company) {
        companyIdControl?.setValidators([Validators.required]);
        companyIdControl?.updateValueAndValidity();
        vendorIdControl?.clearValidators();
        vendorIdControl?.setValue(null);
        vendorIdControl?.updateValueAndValidity();
      } else if (contactTypeId === EntityType.Vendor) {
        vendorIdControl?.setValidators([Validators.required]);
        vendorIdControl?.updateValueAndValidity();
        companyIdControl?.clearValidators();
        companyIdControl?.setValue(null);
        companyIdControl?.updateValueAndValidity();
      } else {
        companyIdControl?.clearValidators();
        companyIdControl?.setValue(null);
        companyIdControl?.updateValueAndValidity();
        vendorIdControl?.clearValidators();
        vendorIdControl?.setValue(null);
        vendorIdControl?.updateValueAndValidity();
      }
    });
  }

  populateForm(): void {
    if (this.contact && this.form) {
      const isActiveValue = typeof this.contact.isActive === 'number' 
        ? this.contact.isActive === 1 
        : Boolean(this.contact.isActive);
      
      const contactTypeId = this.contact.entityTypeId ?? EntityType.Unknown;
      let companyId = null;
      let vendorId = null;
      
      // Set companyId or vendorId based on entityTypeId and entityId
      if (contactTypeId === EntityType.Company && this.contact.entityId) {
        companyId = this.contact.entityId;
      } else if (contactTypeId === EntityType.Vendor && this.contact.entityId) {
        vendorId = this.contact.entityId;
      } else {
        // Fallback to companyId if entityId is not set (for backward compatibility)
        companyId = this.contact.companyId || null;
      }

      this.form.patchValue({
        contactCode: this.contact.contactCode,
        contactTypeId: contactTypeId, // Map entityTypeId from response to contactTypeId in form
        firstName: this.contact.firstName,
        lastName: this.contact.lastName,
        officeId: this.contact.officeId || null,
        companyId: companyId,
        vendorId: vendorId,
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

      // Disable contact type when editing (not in add mode)
      if (!this.isAddMode) {
        this.form.get('contactTypeId')?.disable();
      }

      // Update companyId/vendorId validators based on contact type
      const companyIdControl = this.form.get('companyId');
      const vendorIdControl = this.form.get('vendorId');
      
      if (contactTypeId === EntityType.Company) {
        companyIdControl?.setValidators([Validators.required]);
        companyIdControl?.updateValueAndValidity();
        vendorIdControl?.clearValidators();
        vendorIdControl?.updateValueAndValidity();
      } else if (contactTypeId === EntityType.Vendor) {
        vendorIdControl?.setValidators([Validators.required]);
        vendorIdControl?.updateValueAndValidity();
        companyIdControl?.clearValidators();
        companyIdControl?.updateValueAndValidity();
      } else {
        companyIdControl?.clearValidators();
        companyIdControl?.updateValueAndValidity();
        vendorIdControl?.clearValidators();
        vendorIdControl?.updateValueAndValidity();
      }
    }
  }

  initializeContactTypes(): void {
    const includedTypes = ['Company', 'Tenant', 'Owner','Vendor', 'Hoa'];
    this.availableContactTypes = includedTypes
      .map(key => ({
        value: EntityType[key as keyof typeof EntityType],
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
  //#endregion

  //#region Data loading methods
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

  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
    });
  }
  
  loadCompanies(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      this.removeLoadItem('companies');
      return;
    }

    this.companyService.getCompanies().pipe(take(1),finalize(() => { this.removeLoadItem('companies'); })).subscribe({
      next: (companies: CompanyResponse[]) => {
        this.companies = (companies || []).filter(c => c.organizationId === orgId && c.isActive);
      },
      error: (err: HttpErrorResponse) => {
        this.companies = [];
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  loadVendors(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      this.removeLoadItem('vendors');
      return;
    }

    this.vendorService.getVendors().pipe(take(1),finalize(() => { this.removeLoadItem('vendors'); })).subscribe({
      next: (vendors: VendorResponse[]) => {
        this.vendors = (vendors || []).filter(v => v.organizationId === orgId && v.isActive);
      },
      error: (err: HttpErrorResponse) => {
        this.vendors = [];
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }
  //#endregion

  //#region Phone helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }
  //#endregion

  //#region Utility methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.ContactList);
  }
  //#endregion
}

