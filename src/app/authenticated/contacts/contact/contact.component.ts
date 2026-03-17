import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, Inject, OnDestroy, OnInit, Input, Output, EventEmitter, Optional, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, filter, finalize, forkJoin, map, skip, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { getNumberQueryParam } from '../../shared/query-param.utils';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { EntityType, getContactTypes, getEntityType, OwnerType, getOwnerTypes } from '../models/contact-enum';
import { ContactRequest, ContactResponse } from '../models/contact.model';
import { FileDetails } from '../../documents/models/document.model';
import { ContactService } from '../services/contact.service';

@Component({
    standalone: true,
    selector: 'app-contact',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './contact.component.html',
    styleUrl: './contact.component.scss'
})

export class ContactComponent implements OnInit, OnDestroy {
  /** Contact id to edit, or 'new' for add. Component is always embedded (contacts or maintenance tabs). */
  @Input() id: string = 'new';
  @Input() copyFrom: string | null = null;
  @Input() entityTypeId: number | null = null;
  @Input() compactDialogMode: boolean = false;
  @Output() closed = new EventEmitter<{ saved?: boolean; contactId?: string; entityTypeId?: number }>();

  isServiceError: boolean = false;
  contactId: string;
  contact: ContactResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  isEmbedded: boolean = true;
  states: string[] = [];
  availableContactTypes: { value: number, label: string }[] = [];
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  private globalOfficeSubscription?: Subscription;
  EntityType = EntityType; // Expose enum to template
  OwnerType = OwnerType; // Expose enum to template
  availableOwnerTypes: { value: number; label: string }[] = [];
  allProperties: PropertyListResponse[] = [];
  availablePropertyCodes: { value: string; label: string }[] = [];
  readonly ratingStars: number[] = [1, 2, 3, 4, 5];
  w9FileName: string | null = null;
  w9FileDataUrl: string | null = null;
  w9FileContentType: string | null = null;
  w9FileDetails: FileDetails | null = null;
  w9Path: string | null = null;
  hasNewW9Upload = false;
  insuranceFileName: string | null = null;
  insuranceFileDataUrl: string | null = null;
  insuranceFileContentType: string | null = null;
  insuranceFileDetails: FileDetails | null = null;
  insurancePath: string | null = null;
  hasNewInsuranceUpload = false;

  @ViewChild('w9FileInput') w9FileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('insuranceFileInput') insuranceFileInputRef: ElementRef<HTMLInputElement> | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['contact']));
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
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private propertyService: PropertyService,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData?: { preloadedContact?: ContactResponse; entityTypeId?: number; compactDialogMode?: boolean }
  ) {
  }
  //#region Contacts
  ngOnInit(): void {
    this.initializeContactTypes();
    this.availableOwnerTypes = getOwnerTypes();
    this.loadStates();
    this.loadOffices();
    this.loadAllProperties();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.isAddMode && this.form && this.offices.length > 0) {
        this.form.patchValue({ officeId: officeId ?? null });
      }
      this.filterPropertiesByGlobalOffice();
    });

    // When opened in dialog with preloaded contact (e.g. from property owner click), use it so the form shows filled immediately (no jump).
    if (this.dialogData?.preloadedContact) {
      this.contact = this.dialogData.preloadedContact;
      this.contactId = this.contact.contactId;
      this.isAddMode = false;
      if (this.dialogData.entityTypeId != null) this.entityTypeId = this.dialogData.entityTypeId;
      if (this.dialogData.compactDialogMode != null) this.compactDialogMode = this.dialogData.compactDialogMode;
    } else {
      // Only use route param when we're on the contact detail URL (/auth/.../contacts/:id). When embedded
      // in maintenance or contacts tabs, the route has a different :id (e.g. property id) so we must use the input.
      const url = this.router.url;
      const contactDetailRoute = /\/contacts\/[^/]+$/.test(url);
      const routeId = contactDetailRoute ? this.route.snapshot.paramMap.get('id') : null;
      if (routeId != null) {
        this.isEmbedded = false;
        this.contactId = routeId;
      } else {
        this.contactId = this.id ?? 'new';
      }
      this.isAddMode = this.contactId === 'new';
    }
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact');
    this.buildForm();
    if (this.dialogData?.preloadedContact) {
      this.populateForm();
    } else if (this.isAddMode) {
      if (this.copyFrom) {
        this.copyFromContact(this.copyFrom);
      } else {
        this.setFormValuesFromQueryParams();
        if (this.entityTypeId != null) {
          const patch: { contactTypeId: number; ownerTypeId?: number } = { contactTypeId: this.entityTypeId };
          if (this.entityTypeId === EntityType.Owner) {
            patch.ownerTypeId = OwnerType.Individual;
          }
          this.form?.patchValue(patch, { emitEvent: false });
        }
      }
    } else {
      this.getContact();
    }
  }
  
  setFormValuesFromQueryParams(): void {
    if (!this.form) {
      return;
    }
    
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
    const patchOptions = { emitEvent: false };

    const officeId = getNumberQueryParam(queryParams, 'officeId');
    if (officeId !== null) {
      const office = this.offices.find(o => o.officeId === officeId);
      if (office) {
        this.form.patchValue({ officeId: office.officeId }, patchOptions);
      }
    } else if (this.isAddMode) {
      const globalOfficeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
      if (globalOfficeId != null) {
        const office = this.offices.find(o => o.officeId === globalOfficeId);
        if (office) {
          this.form.patchValue({ officeId: office.officeId }, patchOptions);
        }
      }
    }
    
    const entityTypeId = getNumberQueryParam(queryParams, 'entityTypeId');
    if (entityTypeId !== null && Object.values(EntityType).includes(entityTypeId)) {
      this.form.patchValue({ contactTypeId: entityTypeId }, patchOptions);
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

    const officesLoaded$ = this.officeService.areOfficesLoaded().pipe(
      filter(loaded => loaded === true),
      take(1)
    );

    forkJoin({
      offices: officesLoaded$
    }).pipe(take(1),switchMap(() => this.contactService.getContactByGuid(sourceContactId).pipe(take(1))),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact'); })
    ).subscribe({
      next: (response: ContactResponse) => {
        this.contact = response;
        if (this.contact && this.form) {
          this.populateForm();
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
    const isInternational = formValue.isInternational || false;
    const strippedPhone = this.formatterService.stripPhoneFormatting(formValue.phone);
    const isCompanyType = entityTypeId === EntityType.Company;
    const derivedDisplayName = isCompanyType && (formValue.displayName || '').trim()
      ? (formValue.displayName || '').trim()
      : `${(formValue.firstName || '').trim()} ${(formValue.lastName || '').trim()}`.trim() || null;
    const contactRequest: ContactRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      entityTypeId: entityTypeId,
      entityId: this.contact?.entityId ?? undefined,
      officeId: formValue.officeId || undefined,
      address1: formValue.address1 || '',
      address2: formValue.address2 || undefined,
      city: isInternational ? undefined : (formValue.city || '').trim() || undefined,
      state: isInternational ? undefined : (formValue.state || '').trim() || undefined,
      zip: isInternational ? undefined : (formValue.zip || '').trim() || undefined,
      phone: strippedPhone ? strippedPhone : null,
      notes: this.compactDialogMode && this.contact ? (this.contact.notes ?? undefined) : (formValue.notes || undefined),
      markup: this.compactDialogMode && this.contact != null ? (this.contact.markup ?? this.formatterService.parsePercentageValue(formValue.markup, 25)) : this.formatterService.parsePercentageValue(formValue.markup, 25),
      rating: Number(formValue.rating ?? 0),
      companyId: this.contact?.companyId ?? undefined,
      displayName: derivedDisplayName,
      isInternational: isInternational,
      // In compact dialog we don't show W9/insurance UI; preserve loaded values so we don't delete them
      w9Path: this.compactDialogMode && this.contact ? (this.w9Path ?? this.contact.w9Path ?? null) : (this.hasNewW9Upload ? undefined : this.w9Path),
      w9FileDetails: this.compactDialogMode && this.contact ? (this.w9FileDetails ?? this.contact.w9FileDetails ?? null) : (this.hasNewW9Upload ? (this.w9FileDetails ?? null) : undefined),
      w9Expiration: this.compactDialogMode && this.contact ? (this.formatExpirationDate(formValue.w9Expiration) ?? this.contact.w9Expiration ?? null) : (this.formatExpirationDate(formValue.w9Expiration)),
      insurancePath: this.compactDialogMode && this.contact ? (this.insurancePath ?? this.contact.insurancePath ?? null) : (this.hasNewInsuranceUpload ? undefined : this.insurancePath),
      insuranceFileDetails: this.compactDialogMode && this.contact ? (this.insuranceFileDetails ?? this.contact.insuranceFileDetails ?? null) : (this.hasNewInsuranceUpload ? (this.insuranceFileDetails ?? null) : undefined),
      insuranceExpiration: this.compactDialogMode && this.contact ? (this.formatExpirationDate(formValue.insuranceExpiration) ?? this.contact.insuranceExpiration ?? null) : (this.formatExpirationDate(formValue.insuranceExpiration))
    };
    delete (contactRequest as any).contactTypeId;
    delete (contactRequest as any).vendorId;
    contactRequest.ownerTypeId = entityTypeId === EntityType.Owner ? (formValue.ownerTypeId ?? this.contact?.ownerTypeId ?? null) : undefined;
    contactRequest.properties = entityTypeId === EntityType.Owner ? (formValue.propertyCodes || []) : [];
    contactRequest.companyName = ((formValue.companyName || '').trim() || undefined);
    const isCompany = entityTypeId === EntityType.Company;
    contactRequest.displayName = isCompany ? ((formValue.displayName || '').trim() || null) : (this.contact?.displayName ?? undefined);

    if (!this.isAddMode) {
      contactRequest.contactId = this.contactId;
      contactRequest.contactCode = this.contact?.contactCode;
      contactRequest.organizationId = this.contact?.organizationId || user?.organizationId || '';
    }

    // In compact dialog we don't show Agreements UI; preserve loaded agreements so we don't delete them
    if (this.compactDialogMode && this.contact && this.contact.agreements != null) {
      contactRequest.agreements = this.contact.agreements;
    }

    const save$ = this.isAddMode
      ? this.contactService.createContact(contactRequest)
      : this.contactService.updateContact(contactRequest);

    save$.pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: (savedContact: ContactResponse) => {
        const message = this.isAddMode ? 'Contact created successfully' : 'Contact updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        const savedContactId = savedContact?.contactId || contactRequest.contactId;
        const savedEntityTypeId = savedContact?.entityTypeId ?? contactRequest.entityTypeId;

        this.contactService.loadAllContacts().pipe(take(1)).subscribe({
          next: () => {
            if (this.isEmbedded) {
              this.closed.emit({ saved: true, contactId: savedContactId, entityTypeId: savedEntityTypeId });
            } else {
              this.router.navigate([RouterUrl.ContactList]);
            }
          },
          error: () => {
            if (this.isEmbedded) this.closed.emit({ saved: true, contactId: savedContactId, entityTypeId: savedEntityTypeId });
            else this.router.navigate([RouterUrl.ContactList]);
          }
        });
      },
      error: () => {}
    });
  }

  private formatExpirationDate(value: Date | null | undefined): string | null {
    if (!value || !(value instanceof Date) || isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  //#endregion

  //#region Form methods
  buildForm(): void {
    this.form = this.fb.group({
      contactCode: new FormControl(''), // Not required - only shown in Edit Mode
      contactTypeId: new FormControl(EntityType.Unknown, [Validators.required]),
      ownerTypeId: new FormControl<number | null>(null),
      propertyCodes: new FormControl<string[]>([]),
      firstName: new FormControl(''),
      lastName: new FormControl(''),
      officeId: new FormControl(null, [Validators.required]),
      companyName: new FormControl(''),
      displayName: new FormControl(''),
      phone: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      address1: new FormControl(''),
      address2: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zip: new FormControl(''),
      notes: new FormControl(''),
      markup: new FormControl('25%'),
      rating: new FormControl(0, [Validators.min(0), Validators.max(5)]),
      isInternational: new FormControl(false),
      isActive: new FormControl(true),
      w9Expiration: new FormControl<Date | null>(null),
      insuranceExpiration: new FormControl<Date | null>(null)
    });

    this.setupConditionalFields();
    this.formatContractMarkup();

    // Company/Vendor require company name. Tenant and Owner have optional company name.
    this.form.get('contactTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(contactTypeId => {
      const companyNameControl = this.form.get('companyName');
      const displayNameControl = this.form.get('displayName');
      if (contactTypeId === EntityType.Company || contactTypeId === EntityType.Vendor) {
        companyNameControl?.setValidators([Validators.required]);
      } else {
        companyNameControl?.clearValidators();
      }
      if (contactTypeId !== EntityType.Company && displayNameControl) {
        displayNameControl.setValue('');
      }
      companyNameControl?.updateValueAndValidity({ emitEvent: false });
    });

    // When not in compact dialog mode, syncing contact's office to global selection is desired (e.g. add contact).
    // In compact dialog mode (e.g. owner edit from property page) do not overwrite global office so property list stays filtered by user's office.
    this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      if (!this.compactDialogMode) {
        this.globalOfficeSelectionService.setSelectedOfficeId(officeId ?? null);
      }
    });
  }

  populateForm(): void {
    if (this.contact && this.form) {
      const isActiveValue = typeof this.contact.isActive === 'number' 
        ? this.contact.isActive === 1 
        : Boolean(this.contact.isActive);
      
      const contactTypeId = this.contact.entityTypeId ?? EntityType.Unknown;
      const companyName = this.contact.companyName ?? (this.contact as any).companyName ?? '';
      const rawCodes = (this.contact.properties ?? []) as string[] | string;
      const propertyCodesArray = Array.isArray(rawCodes) ? rawCodes : (typeof rawCodes === 'string' && rawCodes ? rawCodes.split(',').map(c => c.trim()).filter(c => c) : []);

      const w9DateStr = this.contact.w9Expiration?.split('T')[0] ?? '';
      const w9D = w9DateStr ? new Date(w9DateStr + 'T00:00:00') : null;
      const w9ExpirationDate = w9D && !isNaN(w9D.getTime()) ? w9D : null;
      const insDateStr = this.contact.insuranceExpiration?.split('T')[0] ?? '';
      const insD = insDateStr ? new Date(insDateStr + 'T00:00:00') : null;
      const insuranceExpirationDate = insD && !isNaN(insD.getTime()) ? insD : null;
      this.form.patchValue({
        contactCode: this.contact.contactCode,
        contactTypeId: contactTypeId,
        ownerTypeId: this.contact.ownerTypeId ?? null,
        propertyCodes: propertyCodesArray,
        firstName: this.contact.firstName,
        lastName: this.contact.lastName,
        officeId: this.contact.officeId || null,
        companyName: companyName,
        displayName: this.contact.displayName ?? '',
        address1: this.contact.address1 || '',
        address2: this.contact.address2 || '',
        city: this.contact.city || '',
        state: this.contact.state || '',
        zip: this.contact.zip || '',
        phone: this.formatterService.phoneNumber(this.contact.phone),
        email: this.contact.email,
        notes: this.contact.notes || '',
        markup: this.formatterService.formatPercentageValue(this.contact.markup, 25),
        rating: this.contact.rating ?? 0,
        isInternational: this.contact.isInternational || false,
        isActive: isActiveValue,
        w9Expiration: w9ExpirationDate,
        insuranceExpiration: insuranceExpirationDate
      }, { emitEvent: false });

      if (!this.isAddMode) {
        this.form.get('contactTypeId')?.disable();
      }

      // Populate W9 and Insurance from response
      this.populateW9FromContact();
      this.populateInsuranceFromContact();
    }
  }

  populateW9FromContact(): void {
    if (!this.contact) return;
    const fd = this.contact.w9FileDetails;
    const path = this.contact.w9Path;
    this.hasNewW9Upload = false;
    if (fd?.file && fd?.contentType) {
      this.w9FileDetails = fd;
      this.w9Path = path ?? null;
      this.w9FileDataUrl = `data:${fd.contentType};base64,${fd.file}`;
      this.w9FileContentType = fd.contentType;
      this.w9FileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'W9 Form';
    } else if (path) {
      this.w9Path = path;
      this.w9FileDetails = null;
      this.w9FileName = path.replace(/^.*[/\\]/, '') || 'W9 Form';
      this.w9FileDataUrl = null;
      this.w9FileContentType = null;
    } else {
      this.w9Path = null;
      this.w9FileDetails = null;
      this.w9FileName = null;
      this.w9FileDataUrl = null;
      this.w9FileContentType = null;
    }
  }

  populateInsuranceFromContact(): void {
    if (!this.contact) return;
    const fd = this.contact.insuranceFileDetails;
    const path = this.contact.insurancePath;
    this.hasNewInsuranceUpload = false;
    if (fd?.file && fd?.contentType) {
      this.insuranceFileDetails = fd;
      this.insurancePath = path ?? null;
      this.insuranceFileDataUrl = `data:${fd.contentType};base64,${fd.file}`;
      this.insuranceFileContentType = fd.contentType;
      this.insuranceFileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'Insurance Form';
    } else if (path) {
      this.insurancePath = path;
      this.insuranceFileDetails = null;
      this.insuranceFileName = path.replace(/^.*[/\\]/, '') || 'Insurance Form';
      this.insuranceFileDataUrl = null;
      this.insuranceFileContentType = null;
    } else {
      this.insurancePath = null;
      this.insuranceFileDetails = null;
      this.insuranceFileName = null;
      this.insuranceFileDataUrl = null;
      this.insuranceFileContentType = null;
    }
  }

  filterPropertiesByGlobalOffice(): void {
    const officeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
    const list = (this.allProperties || []);
    const filtered = officeId != null ? list.filter(p => p.officeId === officeId) : list;
    this.availablePropertyCodes = filtered.map(p => ({
      value: p.propertyCode || '',
      label: p.propertyCode || ''
    })).filter(p => p.value);
  }

  initializeContactTypes(): void {
    this.availableContactTypes = getContactTypes();
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

  get contactTypeTitleLabel(): string {
    const id = this.isAddMode
      ? (this.form?.get('contactTypeId')?.value ?? this.entityTypeId)
      : this.contact?.entityTypeId;
    const label = getEntityType(id);
    const known = [EntityType.Tenant, EntityType.Owner, EntityType.Company, EntityType.Vendor].includes(Number(id));
    return known && label ? label : 'Contact';
  }

  get ratingValue(): number {
    const raw = Number(this.form?.get('rating')?.value ?? 0);
    return Math.min(5, Math.max(0, Math.round(raw)));
  }

  setRating(star: number): void {
    const normalized = Math.min(5, Math.max(0, Math.round(star)));
    this.form?.get('rating')?.setValue(normalized);
    this.form?.get('rating')?.markAsDirty();
    this.form?.get('rating')?.markAsTouched();
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
  //#endregion

  //#region Data Loading Methods
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

  loadAllProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1)).subscribe({
      next: (list) => {
        this.allProperties = list || [];
        this.filterPropertiesByGlobalOffice();
      },
      error: () => {}
    });
  }
  //#endregion

  //#region w9/insurance Sections
  onW9FileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.w9FileName = null;
      this.w9FileDataUrl = null;
      this.w9FileContentType = null;
      this.w9FileDetails = null;
      return;
    }
    const file = input.files[0];
    this.w9FileName = file.name;
    this.w9FileContentType = file.type;
    this.w9Path = null;
    this.hasNewW9Upload = true;
    this.w9FileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl = reader.result as string;
      this.w9FileDataUrl = dataUrl;
      if (this.w9FileDetails) {
        this.w9FileDetails.dataUrl = dataUrl;
        const base64String = dataUrl.split(',')[1];
        this.w9FileDetails.file = base64String ?? '';
      }
    };
    reader.readAsDataURL(file);
  }

  removeW9Form(): void {
    this.w9Path = null;
    this.w9FileName = null;
    this.w9FileDataUrl = null;
    this.w9FileContentType = null;
    this.w9FileDetails = null;
    this.hasNewW9Upload = false;
    if (this.w9FileInputRef?.nativeElement) {
      this.w9FileInputRef.nativeElement.value = '';
    }
  }

  onInsuranceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.insuranceFileName = null;
      this.insuranceFileDataUrl = null;
      this.insuranceFileContentType = null;
      this.insuranceFileDetails = null;
      return;
    }
    const file = input.files[0];
    this.insuranceFileName = file.name;
    this.insuranceFileContentType = file.type;
    this.insurancePath = null;
    this.hasNewInsuranceUpload = true;
    this.insuranceFileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl = reader.result as string;
      this.insuranceFileDataUrl = dataUrl;
      if (this.insuranceFileDetails) {
        this.insuranceFileDetails.dataUrl = dataUrl;
        const base64String = dataUrl.split(',')[1];
        this.insuranceFileDetails.file = base64String ?? '';
      }
    };
    reader.readAsDataURL(file);
  }

  removeInsuranceForm(): void {
    this.insurancePath = null;
    this.insuranceFileName = null;
    this.insuranceFileDataUrl = null;
    this.insuranceFileContentType = null;
    this.insuranceFileDetails = null;
    this.hasNewInsuranceUpload = false;
    if (this.insuranceFileInputRef?.nativeElement) {
      this.insuranceFileInputRef.nativeElement.value = '';
    }
  }
  //#endregion

  //#region Contract negotiation helpers
  onContractMarkupInput(event: Event): void {
    this.formatterService.formatPercentageInput(event, this.form.get('markup'));
  }

  clearContractMarkupOnFocus(event: FocusEvent): void {
    this.formatterService.clearPercentageOnFocus(event, this.form.get('markup'));
  }

  formatContractMarkupOnEnter(event: KeyboardEvent): void {
    this.formatterService.formatPercentageOnEnter(event, this.form.get('markup'), 25);
  }

  formatContractMarkup(): void {
    this.formatterService.formatPercentageOnBlur(this.form.get('markup'), 25);
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
    this.globalOfficeSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    if (this.isEmbedded) {
      this.closed.emit({});
    } else {
      this.router.navigate([RouterUrl.ContactList]);
    }
  }
  //#endregion
}

