import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, forkJoin, map, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { getNumberQueryParam } from '../../shared/query-param.utils';
import { CompanyResponse } from '../../companies/models/company.model';
import { VendorResponse } from '../../companies/models/vendor.model';
import { CompanyService } from '../../companies/services/company.service';
import { VendorService } from '../../companies/services/vendor.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { EntityType, getContactTypes } from '../models/contact-enum';
import { ContactRequest, ContactResponse } from '../models/contact.model';
import { ContactService } from '../services/contact.service';

@Component({
    selector: 'app-contact',
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
  destroy$ = new Subject<void>();

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
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) {
  }

  //#region Contacts
  ngOnInit(): void {
    this.initializeContactTypes();
    this.loadStates();
    this.loadOffices();
    this.loadCompanies();
    this.loadVendors();
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.contactId = paramMap.get('id');
        this.isAddMode = this.contactId === 'new';
        if (this.isAddMode) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact');
          this.buildForm();
          // Check if we're copying from another contact
          this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
            if (queryParams['copyFrom']) {
              this.copyFromContact(queryParams['copyFrom']);
            } else {
              // Set officeId and contactTypeId from query params after form is built
              this.setFormValuesFromQueryParams();
            }
          });
        } else {
          this.getContact();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }
  
  setFormValuesFromQueryParams(): void {
    // Wait for offices to be loaded, then set values from query params
    if (!this.form) {
      return;
    }
    
    // If offices are already loaded, set immediately
    if (this.offices && this.offices.length > 0) {
      this.applyFormValuesFromQueryParams();
    } else {
      // Otherwise wait for offices to load
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.applyFormValuesFromQueryParams();
        });
      });
    }
  }
  
  applyFormValuesFromQueryParams(): void {
    if (!this.form || !this.offices || this.offices.length === 0) {
      return;
    }
    
    const queryParams = this.route.snapshot.queryParams;
    
    const officeId = getNumberQueryParam(queryParams, 'officeId');
    if (officeId !== null) {
      const office = this.offices.find(o => o.officeId === officeId);
      if (office) {
        this.form.patchValue({ officeId: office.officeId });
      }
    }
    
    const entityTypeId = getNumberQueryParam(queryParams, 'entityTypeId');
    if (entityTypeId !== null && Object.values(EntityType).includes(entityTypeId)) {
      this.form.patchValue({ contactTypeId: entityTypeId });
    }
  }

  getContact(): void {
    this.contactService.getContactByGuid(this.contactId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact'); })).subscribe({
      next: (response: ContactResponse) => {
        this.contact = response;
        this.buildForm();
        this.populateForm();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  copyFromContact(sourceContactId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'contact');
    
    // Wait for offices, companies, and vendors to be loaded before copying
    const officesLoaded$ = this.officeService.areOfficesLoaded().pipe(
      filter(loaded => loaded === true),
      take(1)
    );
    
    const companiesLoaded$ = this.itemsToLoad$.pipe(
      map(items => !items.has('companies')),
      filter(loaded => loaded === true),
      take(1)
    );
    
    const vendorsLoaded$ = this.itemsToLoad$.pipe(
      map(items => !items.has('vendors')),
      filter(loaded => loaded === true),
      take(1)
    );
    
    // Wait for all dependencies to complete, then load the contact to copy
    forkJoin({
      offices: officesLoaded$,
      companies: companiesLoaded$,
      vendors: vendorsLoaded$
    }).pipe(
      take(1),
      switchMap(() => this.contactService.getContactByGuid(sourceContactId).pipe(take(1))),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact'); })
    ).subscribe({
      next: (response: ContactResponse) => {
        // Temporarily store the source contact
        this.contact = response;
        // Populate form with all copied values
        if (this.contact && this.form) {
          this.populateForm();
          // Clear the contact code since this is a new contact
          this.form.get('contactCode')?.setValue('');
        }
        // Clear the contact ID reference after populating
        this.contact = null;
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact');
        this.setFormValuesFromQueryParams();
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

    const isInternational = formValue.isInternational || false;
    const contactRequest: ContactRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      entityTypeId: entityTypeId, // Map contactTypeId from form to entityTypeId in request
      entityId: entityId,
      officeId: formValue.officeId || undefined,
      address1: formValue.address1 || '',
      address2: formValue.address2 || undefined,
      city: isInternational ? undefined : (formValue.city || '').trim() || undefined,
      state: isInternational ? undefined : (formValue.state || '').trim() || undefined,
      zip: isInternational ? undefined : (formValue.zip || '').trim() || undefined,
      phone: this.formatterService.stripPhoneFormatting(formValue.phone),
      notes: formValue.notes || undefined,
      companyId: formValue.companyId || undefined,
      isInternational: isInternational
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
      : this.contactService.updateContact(contactRequest);

    save$.pipe(take(1),finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Contact created successfully' : 'Contact updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        // Reload contacts globally to ensure all components have the latest data
        this.contactService.loadAllContacts();
        
        // Preserve query params (including officeId and tab) when navigating back
        const currentQueryParams = this.route.snapshot.queryParams;
        const queryParams: any = {};
        if (currentQueryParams['officeId']) {
          queryParams.officeId = currentQueryParams['officeId'];
        }
        if (currentQueryParams['tab']) {
          queryParams.tab = currentQueryParams['tab'];
        }
        
        // Navigate back to contact list, preserving query params
        this.router.navigate([RouterUrl.ContactList], {
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
        });
      },
      error: () => {}
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
      phone: new FormControl('', [Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      address1: new FormControl(''),
      address2: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zip: new FormControl(''),
      notes: new FormControl(''),
      isInternational: new FormControl(false),
      isActive: new FormControl(true)
    });

    // Setup conditional validation for international addresses
    this.setupConditionalFields();

    // Show/hide company/vendor dropdown based on contact type
    this.form.get('contactTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(contactTypeId => {
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

  setupConditionalFields(): void {
    this.form.get('isInternational')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(isInternational => {
      const cityControl = this.form.get('city');
      const stateControl = this.form.get('state');
      const zipControl = this.form.get('zip');

      if (isInternational) {
        cityControl?.clearValidators();
        stateControl?.clearValidators();
        zipControl?.clearValidators();
      } else {
        // Note: City, State, Zip are optional for contacts, so no validators needed
      }

      cityControl?.updateValueAndValidity({ emitEvent: false });
      stateControl?.updateValueAndValidity({ emitEvent: false });
      zipControl?.updateValueAndValidity({ emitEvent: false });
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
        isInternational: this.contact.isInternational || false,
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
    this.availableContactTypes = getContactTypes();
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
        
        // If in add mode and form is built, set values from query params
        if (this.isAddMode && this.form) {
          this.applyFormValuesFromQueryParams();
        }
      });
    });
  }
  
  loadCompanies(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies');
      return;
    }

    this.companyService.getCompanies().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies'); })).subscribe({
      next: (companies: CompanyResponse[]) => {
        this.companies = (companies || []).filter(c => c.organizationId === orgId && c.isActive);
      },
      error: () => {
        this.companies = [];
      }
    });
  }

  loadVendors(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendors');
      return;
    }

    this.vendorService.getVendors().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'vendors'); })).subscribe({
      next: (vendors: VendorResponse[]) => {
        this.vendors = (vendors || []).filter(v => v.organizationId === orgId && v.isActive);
      },
      error: () => {
        this.vendors = [];
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
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  getOfficeName(): string {
    if (!this.contact) {
      return '';
    }
    // Use officeName from contact response if available, otherwise look it up
    if (this.contact.officeName) {
      return this.contact.officeName;
    }
    if (this.contact.officeId && this.offices && this.offices.length > 0) {
      const office = this.offices.find(o => o.officeId === this.contact.officeId);
      return office ? office.name : '';
    }
    return '';
  }

  back(): void {
    // Preserve query params (including officeId and tab) when navigating back
    const currentQueryParams = this.route.snapshot.queryParams;
    const queryParams: any = {};
    if (currentQueryParams['officeId']) {
      queryParams.officeId = currentQueryParams['officeId'];
    }
    if (currentQueryParams['tab']) {
      queryParams.tab = currentQueryParams['tab'];
    }
    
    // Navigate back to contact list, preserving query params
    this.router.navigate([RouterUrl.ContactList], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }
  //#endregion
}

