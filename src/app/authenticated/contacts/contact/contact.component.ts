import { CommonModule } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, OnInit, Input, Output, EventEmitter, Optional, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';

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

  readonly ratingStars: number[] = [1, 2, 3, 4, 5];
  EntityType = EntityType;
  OwnerType = OwnerType; 
 
  isServiceError: boolean = false;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  isEmbedded: boolean = true;
  states: string[] = [];
  
  contactId: string;
  contact: ContactResponse;
  availableContactTypes: { value: number, label: string }[] = [];
  availableOwnerTypes: { value: number; label: string }[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;

  allProperties: PropertyListResponse[] = [];
  availablePropertyCodes: { value: string; label: string }[] = [];

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
  agreementFileName: string | null = null;
  agreementFileDataUrl: string | null = null;
  agreementFileContentType: string | null = null;
  agreementFileDetails: FileDetails | null = null;
  agreementPath: string | null = null;
  hasNewAgreementUpload = false;

  w9PdfThumbnailUrl: string | null = null;
  insurancePdfThumbnailUrl: string | null = null;
  agreementPdfThumbnailUrl: string | null = null;

  @ViewChild('w9FileInput') w9FileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('insuranceFileInput') insuranceFileInputRef: ElementRef<HTMLInputElement> | null = null;
  @ViewChild('agreementFileInput') agreementFileInputRef: ElementRef<HTMLInputElement> | null = null;

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
    private pdfThumbnailService: PdfThumbnailService,
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
      displayName: derivedDisplayName,
      isInternational: isInternational,
      // In compact dialog we don't show agreements section; preserve loaded values so we don't delete them
      w9Path: this.compactDialogMode && this.contact ? (this.w9Path ?? this.contact.w9Path ?? null) : (this.hasNewW9Upload ? undefined : this.w9Path),
      w9FileDetails: this.compactDialogMode && this.contact ? (this.w9FileDetails ?? this.contact.w9FileDetails ?? null) : (this.hasNewW9Upload ? (this.w9FileDetails ?? null) : undefined),
      insurancePath: this.compactDialogMode && this.contact ? (this.insurancePath ?? this.contact.insurancePath ?? null) : (this.hasNewInsuranceUpload ? undefined : this.insurancePath),
      insuranceFileDetails: this.compactDialogMode && this.contact ? (this.insuranceFileDetails ?? this.contact.insuranceFileDetails ?? null) : (this.hasNewInsuranceUpload ? (this.insuranceFileDetails ?? null) : undefined),
      insuranceExpiration: this.compactDialogMode && this.contact ? (this.formatExpirationDate(formValue.insuranceExpiration) ?? this.contact.insuranceExpiration ?? null) : (this.formatExpirationDate(formValue.insuranceExpiration)),
      agreementPath: this.compactDialogMode && this.contact ? (this.agreementPath ?? this.contact.agreementPath ?? null) : (this.hasNewAgreementUpload ? undefined : this.agreementPath),
      agreementFileDetails: this.compactDialogMode && this.contact ? (this.agreementFileDetails ?? this.contact.agreementFileDetails ?? null) : (this.hasNewAgreementUpload ? (this.agreementFileDetails ?? null) : undefined),
      revenueSplitOwner: this.parseAgreementPercentFromForm(formValue.revenueSplitOwner),
      revenueSplitOffice: this.parseAgreementPercentFromForm(formValue.revenueSplitOffice),
      workingCapitalBalance: this.parseAgreementDecimalFromForm(formValue.workingCapitalBalance),
      linenAndTowelFee: this.parseAgreementDecimalFromForm(formValue.linenAndTowelFee),
      bankName: (formValue.bankName || '').trim() || null,
      routingNumber: (formValue.routingNumber || '').trim() || null,
      accountNumber: (formValue.accountNumber || '').trim() || null
    };
    delete (contactRequest as any).contactTypeId;
    delete (contactRequest as any).vendorId;
    contactRequest.ownerTypeId = entityTypeId === EntityType.Owner ? (formValue.ownerTypeId ?? this.contact?.ownerTypeId ?? null) : undefined;
    contactRequest.properties = entityTypeId === EntityType.Owner ? (formValue.propertyCodes || []) : [];
    contactRequest.companyName = ((formValue.companyName || '').trim() || undefined);
    contactRequest.companyEmail = ((formValue.companyEmail || '').trim() || undefined);
    const isCompany = entityTypeId === EntityType.Company;
    contactRequest.displayName = isCompany ? ((formValue.displayName || '').trim() || null) : (this.contact?.displayName ?? undefined);

    if (!this.isAddMode) {
      contactRequest.contactId = this.contactId;
      contactRequest.contactCode = this.contact?.contactCode;
      contactRequest.organizationId = this.contact?.organizationId || user?.organizationId || '';
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

        this.contactService.refreshContacts().pipe(take(1)).subscribe({
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

  //#region Form Methods
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
      companyEmail: new FormControl('', [Validators.email]),
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
      revenueSplitOwner: new FormControl<string>('0%'),
      revenueSplitOffice: new FormControl<string>('0%'),
      workingCapitalBalance: new FormControl<string>('$0.00'),
      linenAndTowelFee: new FormControl<string>('$0.00'),
      bankName: new FormControl(''),
      routingNumber: new FormControl(''),
      accountNumber: new FormControl(''),
      rating: new FormControl(0, [Validators.min(0), Validators.max(5)]),
      isInternational: new FormControl(false),
      isActive: new FormControl(true),
      insuranceExpiration: new FormControl<Date | null>(null)
    });

    this.setupConditionalFields();
    this.formatContractMarkup();

    this.form.get('contactTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(contactTypeId => {
      const isCompany = contactTypeId === EntityType.Company;
      const companyNameControl = this.form.get('companyName');
      const companyEmailControl = this.form.get('companyEmail');
      const displayNameControl = this.form.get('displayName');
      const firstNameControl = this.form.get('firstName');
      const lastNameControl = this.form.get('lastName');
      const phoneControl = this.form.get('phone');
      const emailControl = this.form.get('email');
      const address1Control = this.form.get('address1');
      const cityControl = this.form.get('city');
      const stateControl = this.form.get('state');
      const zipControl = this.form.get('zip');

      if (isCompany) {
        companyNameControl?.setValidators([Validators.required]);
        companyEmailControl?.setValidators([Validators.required, Validators.email]);
        displayNameControl?.setValidators([Validators.required]);
        firstNameControl?.setValidators([Validators.required]);
        lastNameControl?.setValidators([Validators.required]);
        phoneControl?.setValidators([Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
        emailControl?.setValidators([Validators.required, Validators.email]);
        address1Control?.setValidators([Validators.required]);
        cityControl?.setValidators([Validators.required]);
        stateControl?.setValidators([Validators.required]);
        zipControl?.setValidators([Validators.required]);
      } else {
        companyNameControl?.clearValidators();
        companyEmailControl?.setValidators([Validators.email]);
        displayNameControl?.clearValidators();
        firstNameControl?.clearValidators();
        lastNameControl?.clearValidators();
        phoneControl?.setValidators([Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
        emailControl?.setValidators([Validators.required, Validators.email]);
        address1Control?.clearValidators();
        cityControl?.clearValidators();
        stateControl?.clearValidators();
        zipControl?.clearValidators();
      }

      if (!isCompany && displayNameControl) {
        displayNameControl.setValue('');
      }

      companyNameControl?.updateValueAndValidity({ emitEvent: false });
      companyEmailControl?.updateValueAndValidity({ emitEvent: false });
      displayNameControl?.updateValueAndValidity({ emitEvent: false });
      firstNameControl?.updateValueAndValidity({ emitEvent: false });
      lastNameControl?.updateValueAndValidity({ emitEvent: false });
      phoneControl?.updateValueAndValidity({ emitEvent: false });
      emailControl?.updateValueAndValidity({ emitEvent: false });
      address1Control?.updateValueAndValidity({ emitEvent: false });
      cityControl?.updateValueAndValidity({ emitEvent: false });
      stateControl?.updateValueAndValidity({ emitEvent: false });
      zipControl?.updateValueAndValidity({ emitEvent: false });
    });

    this.form.get('contactTypeId')?.updateValueAndValidity({ emitEvent: true });

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
      const isActiveValue = typeof this.contact.isActive === 'number' ? this.contact.isActive === 1 : Boolean(this.contact.isActive);
      const contactTypeId = this.contact.entityTypeId ?? EntityType.Unknown;
      const companyName = this.contact.companyName ?? (this.contact as any).companyName ?? '';
      const rawCodes = (this.contact.properties ?? []) as string[] | string;
      const propertyCodesArray = Array.isArray(rawCodes) ? rawCodes : (typeof rawCodes === 'string' && rawCodes ? rawCodes.split(',').map(c => c.trim()).filter(c => c) : []);

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
        companyEmail: this.contact.companyEmail ?? '',
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
        revenueSplitOwner: this.formatAgreementPercentForDisplay(this.contact.revenueSplitOwner),
        revenueSplitOffice: this.formatAgreementPercentForDisplay(this.contact.revenueSplitOffice),
        workingCapitalBalance: this.formatAgreementDecimalForDisplay(this.contact.workingCapitalBalance),
        linenAndTowelFee: this.formatAgreementDecimalForDisplay(this.contact.linenAndTowelFee),
        bankName: this.contact.bankName ?? '',
        routingNumber: this.contact.routingNumber ?? '',
        accountNumber: this.contact.accountNumber ?? '',
        rating: this.contact.rating ?? 0,
        isInternational: this.contact.isInternational || false,
        isActive: isActiveValue,
        insuranceExpiration: insuranceExpirationDate
      }, { emitEvent: false });

      if (!this.isAddMode) {
        this.form.get('contactTypeId')?.disable();
      }

      // Populate W9, Insurance and Agreement from response
      this.populateW9FromContact();
      this.populateInsuranceFromContact();
      this.populateAgreementFromContact();
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
      this.setPdfThumbnail(this.w9FileDataUrl, fd.contentType, u => this.w9PdfThumbnailUrl = u);
    } else if (path) {
      this.w9Path = path;
      this.w9FileDetails = null;
      this.w9FileName = path.replace(/^.*[/\\]/, '') || 'W9 Form';
      this.w9FileDataUrl = null;
      this.w9FileContentType = null;
      this.w9PdfThumbnailUrl = null;
    } else {
      this.w9Path = null;
      this.w9FileDetails = null;
      this.w9FileName = null;
      this.w9FileDataUrl = null;
      this.w9FileContentType = null;
      this.w9PdfThumbnailUrl = null;
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
      this.setPdfThumbnail(this.insuranceFileDataUrl, fd.contentType, u => this.insurancePdfThumbnailUrl = u);
    } else if (path) {
      this.insurancePath = path;
      this.insuranceFileDetails = null;
      this.insuranceFileName = path.replace(/^.*[/\\]/, '') || 'Insurance Form';
      this.insuranceFileDataUrl = null;
      this.insuranceFileContentType = null;
      this.insurancePdfThumbnailUrl = null;
    } else {
      this.insurancePath = null;
      this.insuranceFileDetails = null;
      this.insuranceFileName = null;
      this.insuranceFileDataUrl = null;
      this.insuranceFileContentType = null;
      this.insurancePdfThumbnailUrl = null;
    }
  }

  populateAgreementFromContact(): void {
    if (!this.contact) return;
    const fd = this.contact.agreementFileDetails;
    const path = this.contact.agreementPath;
    this.hasNewAgreementUpload = false;
    if (fd?.file && fd?.contentType) {
      this.agreementFileDetails = fd;
      this.agreementPath = path ?? null;
      this.agreementFileDataUrl = `data:${fd.contentType};base64,${fd.file}`;
      this.agreementFileContentType = fd.contentType;
      this.agreementFileName = fd.fileName ?? path?.replace(/^.*[/\\]/, '') ?? 'Agreement';
      this.setPdfThumbnail(this.agreementFileDataUrl, fd.contentType, u => this.agreementPdfThumbnailUrl = u);
    } else if (path) {
      this.agreementPath = path;
      this.agreementFileDetails = null;
      this.agreementFileName = path.replace(/^.*[/\\]/, '') || 'Agreement';
      this.agreementFileDataUrl = null;
      this.agreementFileContentType = null;
      this.agreementPdfThumbnailUrl = null;
    } else {
      this.agreementPath = null;
      this.agreementFileDetails = null;
      this.agreementFileName = null;
      this.agreementFileDataUrl = null;
      this.agreementFileContentType = null;
      this.agreementPdfThumbnailUrl = null;
    }
  }

  onAgreementFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.agreementFileName = null;
      this.agreementFileDataUrl = null;
      this.agreementFileContentType = null;
      this.agreementFileDetails = null;
      this.agreementPdfThumbnailUrl = null;
      return;
    }
    const file = input.files[0];
    this.agreementFileName = file.name;
    this.agreementFileContentType = file.type;
    this.agreementPath = null;
    this.hasNewAgreementUpload = true;
    this.agreementFileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };
    const reader = new FileReader();
    reader.onload = (): void => {
      const dataUrl = reader.result as string;
      this.agreementFileDataUrl = dataUrl;
      if (this.agreementFileDetails) {
        this.agreementFileDetails.dataUrl = dataUrl;
        const base64String = dataUrl.split(',')[1];
        this.agreementFileDetails.file = base64String ?? '';
      }
      this.setPdfThumbnail(dataUrl, file.type, u => this.agreementPdfThumbnailUrl = u);
    };
    reader.readAsDataURL(file);
  }

  removeAgreementForm(): void {
    this.agreementPath = null;
    this.agreementFileName = null;
    this.agreementFileDataUrl = null;
    this.agreementFileContentType = null;
    this.agreementFileDetails = null;
    this.agreementPdfThumbnailUrl = null;
    this.hasNewAgreementUpload = false;
    if (this.agreementFileInputRef?.nativeElement) {
      this.agreementFileInputRef.nativeElement.value = '';
    }
  }

  private setPdfThumbnail(
    dataUrl: string | null,
    contentType: string | null,
    setter: (url: string | null) => void
  ): void {
    if (!dataUrl || !contentType?.toLowerCase().includes('pdf')) {
      setter(null);
      return;
    }
    setter(null);
    this.pdfThumbnailService.getFirstPageDataUrl(dataUrl).then(url => setter(url));
  }

  /** Open a data URL (e.g. PDF) in a new tab using the browser's PDF viewer. */
  openFileInNewTab(dataUrl: string | null): void {
    if (!dataUrl) return;
    try {
      const blob = this.dataUrlToBlob(dataUrl);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      window.open(dataUrl, '_blank', 'noopener');
    }
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'application/pdf';
    const binary = atob(base64 ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
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
      const isCompany = this.form.get('contactTypeId')?.value === EntityType.Company;

      if (isInternational && !isCompany) {
        cityControl?.clearValidators();
        stateControl?.clearValidators();
        zipControl?.clearValidators();
      } else {
        if (isCompany) {
          cityControl?.setValidators([Validators.required]);
          stateControl?.setValidators([Validators.required]);
          zipControl?.setValidators([Validators.required]);
        } else {
          cityControl?.clearValidators();
          stateControl?.clearValidators();
          zipControl?.clearValidators();
        }
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

  //#region W9 and Insurance Methods
  onW9FileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.w9FileName = null;
      this.w9FileDataUrl = null;
      this.w9FileContentType = null;
      this.w9FileDetails = null;
      this.w9PdfThumbnailUrl = null;
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
      this.setPdfThumbnail(dataUrl, file.type, u => this.w9PdfThumbnailUrl = u);
    };
    reader.readAsDataURL(file);
  }

  removeW9Form(): void {
    this.w9Path = null;
    this.w9FileName = null;
    this.w9FileDataUrl = null;
    this.w9FileContentType = null;
    this.w9FileDetails = null;
    this.w9PdfThumbnailUrl = null;
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
      this.insurancePdfThumbnailUrl = null;
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
      this.setPdfThumbnail(dataUrl, file.type, u => this.insurancePdfThumbnailUrl = u);
    };
    reader.readAsDataURL(file);
  }

  removeInsuranceForm(): void {
    this.insurancePath = null;
    this.insuranceFileName = null;
    this.insuranceFileDataUrl = null;
    this.insuranceFileContentType = null;
    this.insuranceFileDetails = null;
    this.insurancePdfThumbnailUrl = null;
    this.hasNewInsuranceUpload = false;
    if (this.insuranceFileInputRef?.nativeElement) {
      this.insuranceFileInputRef.nativeElement.value = '';
    }
  }
  //#endregion

  //#region Contract Negotiation Helpers
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

  /** Agreement numeric fields: default 0% or 0.00, select-all on focus, number-only input. */
  formatAgreementPercentForDisplay(value: number | string | null | undefined): string {
    if (value == null || value === '') return '0%';
    const n = Number(String(value).replace(/%\s*$/, ''));
    return isNaN(n) ? '0%' : `${n}%`;
  }

  formatAgreementDecimalForDisplay(value: number | string | null | undefined): string {
    if (value == null || value === '') return '$0.00';
    const n = Number(String(value).replace(/[$,]/g, ''));
    return isNaN(n) ? '$0.00' : this.formatAgreementCurrency(n);
  }

  private formatAgreementCurrency(n: number): string {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  parseAgreementPercentFromForm(value: string | number | null | undefined): number | null {
    if (value == null || value === '') return 0;
    const s = String(value).replace(/%\s*$/, '').trim();
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  parseAgreementDecimalFromForm(value: string | number | null | undefined): number | null {
    if (value == null || value === '') return 0;
    const s = String(value).replace(/[$,\s]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  formatAgreementPercentBlur(controlName: 'revenueSplitOwner' | 'revenueSplitOffice'): void {
    const c = this.form.get(controlName);
    const v = c?.value;
    if (v == null || v === '') {
      c?.setValue('0%', { emitEvent: false });
      return;
    }
    const s = String(v).replace(/%\s*$/, '').trim();
    const n = Number(s);
    c?.setValue(isNaN(n) ? '0%' : `${n}%`, { emitEvent: false });
  }

  formatAgreementDecimalBlur(controlName: 'workingCapitalBalance' | 'linenAndTowelFee'): void {
    const c = this.form.get(controlName);
    const v = c?.value;
    if (v == null || v === '') {
      c?.setValue('$0.00', { emitEvent: false });
      return;
    }
    const n = this.parseAgreementDecimalFromForm(v);
    c?.setValue(n == null ? '$0.00' : this.formatAgreementCurrency(n), { emitEvent: false });
  }

  selectAllOnFocus(event: FocusEvent): void {
    (event.target as HTMLInputElement)?.select();
  }

  /** Allow only digits and optionally one decimal point. */
  allowNumericOnly(event: KeyboardEvent, allowDecimal: boolean): void {
    const key = event.key;
    if (['Backspace', 'Tab', 'End', 'Home', 'ArrowLeft', 'ArrowRight', 'Delete'].includes(key)) return;
    if (event.ctrlKey || event.metaKey) {
      if (['a', 'c', 'v', 'x'].includes(key.toLowerCase())) return;
    }
    if (key === '.' && allowDecimal) {
      const el = event.target as HTMLInputElement;
      if (el?.value?.includes('.')) event.preventDefault();
      return;
    }
    if (!/^\d$/.test(key)) event.preventDefault();
  }
  //#endregion

  //#region Phone Helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }
  //#endregion

  //#region Utility Methods
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

