import { CommonModule } from '@angular/common';
import { Component, ElementRef, Inject, OnDestroy, OnInit, Input, Output, EventEmitter, Optional, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
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
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { EntityType, getContactTypes, getEntityType, OwnerType, getOwnerTypes, VendorType, getVendorTypes } from '../models/contact-enum';
import { ContactRequest, ContactResponse } from '../models/contact.model';
import { FileDetails } from '../../documents/models/document.model';
import { ContactService } from '../services/contact.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { UserService } from '../../users/services/user.service';
import { UserRequest, UserResponse } from '../../users/models/user.model';
import { UserGroups } from '../../users/models/user-enums';
import { ImageViewDialogComponent } from '../../shared/modals/image-view-dialog/image-view-dialog.component';
import { ImageViewDialogData } from '../../shared/modals/image-view-dialog/image-view-dialog-data';

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
  /** Preset for the Contact Type field (`entityTypeId`) when opening Add from a list tab or dialog. */
  @Input() presetEntityTypeId: number | null = null;
  @Input() compactDialogMode: boolean = false;
  @Output() closed = new EventEmitter<{ saved?: boolean; contactId?: string; entityTypeId?: number }>();

  readonly ratingStars: number[] = [1, 2, 3, 4, 5];
  EntityType = EntityType;
  OwnerType = OwnerType;
  VendorType = VendorType;

  isServiceError: boolean = false;
  form: FormGroup;
  isAddMode: boolean = false;
  isEmbedded: boolean = true;
  returnUrl: string | null = null;
  states: string[] = [];
  
  contactId: string;
  contact: ContactResponse;
  availableContactTypes: { value: number, label: string }[] = [];
  availableOwnerTypes: { value: number; label: string }[] = [];
  availableVendorTypes: { value: number; label: string }[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  availableDefaultOffices: { value: number, name: string }[] = [];
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

  w9PdfThumbnailUrl: string | null = null;
  insurancePdfThumbnailUrl: string | null = null;

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
    private globalSelectionService: GlobalSelectionService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private propertyService: PropertyService,
    private pdfThumbnailService: PdfThumbnailService,
    private userService: UserService,
    private dialog: MatDialog,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData?: {
      preloadedContact?: ContactResponse;
      entityTypeId?: number;
      compactDialogMode?: boolean;
      /** Codes not yet on the server (e.g. new property) — merged into Properties list and pre-selected for owners. */
      preselectPropertyCodes?: string[];
      preselectPropertyOfficeId?: number;
    }
  ) {
  }

  //#region Contacts
  ngOnInit(): void {
    this.initializeContactTypes();
    this.availableOwnerTypes = getOwnerTypes();
    this.availableVendorTypes = getVendorTypes();
    this.loadStates();
    this.loadOffices();
    this.loadAllProperties();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.isAddMode && this.form && this.offices.length > 0) {
        const currentOfficeId = this.form.get('officeId')?.value ?? null;
        const nextOfficeId = officeId ?? null;
        if (currentOfficeId !== nextOfficeId) {
          const nextOfficeAccess = nextOfficeId != null ? [nextOfficeId] : [];
          this.form.patchValue({ officeAccess: nextOfficeAccess, officeId: nextOfficeId }, { emitEvent: false });
          this.syncDefaultOfficeOptions();
        }
      }
      this.filterPropertiesByGlobalOffice();
    });

    // When opened in dialog with preloaded contact (e.g. from property owner click), use it so the form shows filled immediately (no jump).
    if (this.dialogData?.preloadedContact) {
      this.contact = this.dialogData.preloadedContact;
      this.contactId = this.contact.contactId;
      this.isAddMode = false;
      if (this.dialogData.entityTypeId != null) this.presetEntityTypeId = this.dialogData.entityTypeId;
      if (this.dialogData.compactDialogMode != null) this.compactDialogMode = this.dialogData.compactDialogMode;
    } else {
      if (this.dialogData) {
        if (this.dialogData.entityTypeId != null) {
          this.presetEntityTypeId = this.dialogData.entityTypeId;
        }
        if (this.dialogData.compactDialogMode != null) {
          this.compactDialogMode = this.dialogData.compactDialogMode;
        }
      }
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
    this.captureReturnUrl();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contact');
    this.buildForm();
    if (this.dialogData?.preloadedContact) {
      this.populateForm();
    } else if (this.isAddMode) {
      if (this.copyFrom) {
        this.copyFromContact(this.copyFrom);
      } else {
        this.setFormValuesFromQueryParams();
        if (this.presetEntityTypeId != null) {
          const patch: { entityTypeId: number; ownerTypeId?: number; vendorTypeId?: number | null } = { entityTypeId: this.presetEntityTypeId };
          if (this.presetEntityTypeId === EntityType.Owner) {
            patch.ownerTypeId = OwnerType.Individual;
          }
          if (this.presetEntityTypeId === EntityType.Vendor) {
            patch.vendorTypeId = VendorType.Company;
          }
          this.form?.patchValue(patch, { emitEvent: false });
        }
      }
    } else {
      this.getContact();
    }
    this.applyContactTypeLockedState();
    if (this.isAddMode && !this.copyFrom) {
      this.applyEntityTypeContactValidators(this.form?.getRawValue()?.entityTypeId);
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
        this.form.patchValue({ officeAccess: [office.officeId], officeId: office.officeId }, patchOptions);
      }
    } else if (this.isAddMode) {
      const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      if (globalOfficeId != null) {
        const office = this.offices.find(o => o.officeId === globalOfficeId);
        if (office) {
          this.form.patchValue({ officeAccess: [office.officeId], officeId: office.officeId }, patchOptions);
        }
      }
    }

    this.syncDefaultOfficeOptions();
    
    const entityTypeId = getNumberQueryParam(queryParams, 'entityTypeId');
    if (entityTypeId !== null && Object.values(EntityType).includes(entityTypeId)) {
      this.form.patchValue({ entityTypeId: entityTypeId }, patchOptions);
      if (this.isAddMode && entityTypeId === EntityType.Vendor && this.form.getRawValue().vendorTypeId == null) {
        this.form.patchValue({ vendorTypeId: VendorType.Company }, patchOptions);
      }
    }
    this.applyEntityTypeContactValidators(this.form.getRawValue().entityTypeId);
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
    if (!this.form) {
      return;
    }
    this.form.markAllAsTouched();

    if (!this.form.valid) {
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      return;
    }

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const entityTypeId = formValue.entityTypeId;
    const officeAccess = this.mappingService.normalizeOfficeAccessNumbers(formValue.officeAccess || []);
    const pickedDefault = Number(formValue.officeId);
    const resolvedOfficeId = Number.isFinite(pickedDefault) && pickedDefault > 0 ? pickedDefault : 0;
    if (resolvedOfficeId <= 0) {
      this.form.get('officeId')?.markAsTouched();
      this.toastr.error('Default office is required.', CommonMessage.Error);
      return;
    }

    // Bulk map: form → request, normalizing optional strings to empty string
    const isInternational = formValue.isInternational || false;
    const strippedPhone = this.formatterService.stripPhoneFormatting(formValue.phone);
    const isCompanyType = entityTypeId === EntityType.Company;
    const derivedDisplayName = isCompanyType && (formValue.displayName || '').trim()
      ? (formValue.displayName || '').trim() : `${(formValue.firstName || '').trim()} ${(formValue.lastName || '').trim()}`.trim() || null;
    const contactRequest: ContactRequest = {
      ...formValue,
      organizationId: user?.organizationId || '',
      entityTypeId: entityTypeId,
      officeAccess,
      officeId: resolvedOfficeId,
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
      // Compact dialog: preserve W9/insurance not shown there.
      w9Path: this.compactDialogMode && this.contact ? (this.w9Path ?? this.contact.w9Path ?? null) : (this.hasNewW9Upload ? undefined : this.w9Path),
      w9FileDetails: this.compactDialogMode && this.contact ? (this.w9FileDetails ?? this.contact.w9FileDetails ?? null) : (this.hasNewW9Upload ? (this.w9FileDetails ?? null) : undefined),
      insurancePath: this.compactDialogMode && this.contact ? (this.insurancePath ?? this.contact.insurancePath ?? null) : (this.hasNewInsuranceUpload ? undefined : this.insurancePath),
      insuranceFileDetails: this.compactDialogMode && this.contact ? (this.insuranceFileDetails ?? this.contact.insuranceFileDetails ?? null) : (this.hasNewInsuranceUpload ? (this.insuranceFileDetails ?? null) : undefined),
      insuranceExpiration: this.compactDialogMode && this.contact ? (this.utilityService.formatDateOnlyForApi(formValue.insuranceExpiration) ?? this.contact.insuranceExpiration ?? null) : (this.utilityService.formatDateOnlyForApi(formValue.insuranceExpiration)),
      revenueSplitOwner: this.parseAgreementPercentFromForm(formValue.revenueSplitOwner),
      revenueSplitOffice: this.parseAgreementPercentFromForm(formValue.revenueSplitOffice),
      workingCapitalBalance: this.parseAgreementDecimalFromForm(formValue.workingCapitalBalance),
      linenAndTowelFee: this.parseAgreementDecimalFromForm(formValue.linenAndTowelFee),
      bankName: (formValue.bankName || '').trim() || null,
      routingNumber: (formValue.routingNumber || '').trim() || null,
      accountNumber: (formValue.accountNumber || '').trim() || null
    };
    delete (contactRequest as any).propertyCodes;
    delete (contactRequest as any).vendorId;
    this.applyEntityTypeSpecificContactFields(contactRequest, entityTypeId, formValue);
    contactRequest.companyName = ((formValue.companyName || '').trim() || undefined);
    contactRequest.companyEmail = ((formValue.companyEmail || '').trim() || undefined);
    const isCompany = entityTypeId === EntityType.Company;
    contactRequest.displayName = isCompany ? ((formValue.displayName || '').trim() || null) : (this.contact?.displayName ?? undefined);

    if (!this.isAddMode) {
      contactRequest.contactId = this.contactId;
      contactRequest.contactCode = this.contact?.contactCode;
      contactRequest.organizationId = this.contact?.organizationId || user?.organizationId || '';
      contactRequest.userId = this.contact?.userId;
    }

    const save$ = this.isAddMode
      ? this.contactService.createContact(contactRequest)
      : this.contactService.updateContact(contactRequest);

    save$.pipe(take(1)).subscribe({
      next: (savedContact: ContactResponse) => {
        const message = this.isAddMode ? 'Contact created successfully' : 'Contact updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        const savedContactId = savedContact?.contactId || contactRequest.contactId;
        const savedEntityTypeId = savedContact?.entityTypeId ?? contactRequest.entityTypeId;
        const finalizeContactSave = (): void => {
          this.contactService.refreshContacts().pipe(take(1)).subscribe({
            next: () => {
              if (this.isEmbedded) {
                this.closed.emit({ saved: true, contactId: savedContactId, entityTypeId: savedEntityTypeId });
              } else {
                this.navigateBackToOrigin();
              }
            },
            error: () => {
              if (this.isEmbedded) this.closed.emit({ saved: true, contactId: savedContactId, entityTypeId: savedEntityTypeId });
              else this.navigateBackToOrigin();
            }
          });
        };
        const finishSave = (): void => {
          finalizeContactSave();
        };

        if (this.isAddMode && entityTypeId === EntityType.Owner && this.shouldCreateOwnerUser(savedContact)) {
          const ownerUserRequest = this.buildOwnerUserRequest(savedContact, contactRequest);
          if (!ownerUserRequest) {
            this.toastr.warning('Owner saved, but user account could not be created (missing contact code or email).', CommonMessage.Error);
            finishSave();
            return;
          }
          this.runCreateUserAndLinkContact(
            savedContact,
            contactRequest,
            ownerUserRequest,
            'Owner user account created and linked successfully.',
            'Owner saved, but user account or link step could not be completed.',
            finishSave
          );
          return;
        }

        if (this.isAddMode && entityTypeId === EntityType.Vendor && this.shouldCreateVendorUser(formValue, savedContact)) {
          const vendorUserRequest = this.buildVendorUserRequest(savedContact, contactRequest);
          if (!vendorUserRequest) {
            this.toastr.warning('Vendor saved, but user account could not be created (missing vendor code or email).', CommonMessage.Error);
            finishSave();
            return;
          }
          this.runCreateUserAndLinkContact(
            savedContact,
            contactRequest,
            vendorUserRequest,
            'Vendor user account created and linked successfully.',
            'Vendor saved, but user account or link step could not be completed.',
            finishSave
          );
          return;
        }

        finishSave();
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      contactCode: new FormControl(''), // Not required - only shown in Edit Mode
      entityTypeId: new FormControl(EntityType.Unknown, [Validators.required]),
      ownerTypeId: new FormControl<number | null>(null),
      vendorTypeId: new FormControl<number | null>(null),
      propertyCodes: new FormControl<string[]>([]),
      firstName: new FormControl('', [Validators.required]),
      lastName: new FormControl('', [Validators.required]),
      officeAccess: new FormControl<number[]>([], [Validators.required]),
      officeId: new FormControl<number | null>(null, [Validators.required]),
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
      insuranceExpiration: new FormControl<Date | null>(null),
      addAsUser: new FormControl(false)
    });

    this.setupConditionalFields();
    this.formatContractMarkup();

    this.form.get('entityTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(entityTypeId => {
      this.applyEntityTypeContactValidators(entityTypeId);
      if (entityTypeId !== EntityType.Company) {
        this.form.get('displayName')?.setValue('', { emitEvent: false });
      }
      if (entityTypeId !== EntityType.Vendor) {
        this.form.get('addAsUser')?.setValue(false, { emitEvent: false });
      }
    });

    this.form.get('addAsUser')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const entityTypeId = this.form.getRawValue().entityTypeId;
      const phoneControl = this.form.get('phone');
      if (this.needsStrictPhoneValidation(entityTypeId)) {
        phoneControl?.setValidators([Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
      } else {
        phoneControl?.setValidators([Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
      }
      phoneControl?.updateValueAndValidity({ emitEvent: false });
    });

    this.form.get('vendorTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.form?.getRawValue().entityTypeId === EntityType.Vendor) {
        this.applyVendorNameCompanyValidators();
      }
    });

    this.applyEntityTypeContactValidators(this.form.getRawValue().entityTypeId);

    this.form.get('officeAccess')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncDefaultOfficeOptions();
    });

    // When not in compact dialog mode, syncing contact's default office to global selection is desired (e.g. add contact).
    // In compact dialog mode (e.g. owner edit from property page) do not overwrite global office so property list stays filtered by user's office.
    this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(selectedOfficeId => {
      if (!this.compactDialogMode) {
        this.globalSelectionService.setSelectedOfficeId(selectedOfficeId ?? null);
      }
    });
  }

  applyEntityTypeContactValidators(entityTypeId: number | null | undefined): void {
    if (!this.form) {
      return;
    }
    const isCompany = entityTypeId === EntityType.Company;
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
    const vendorTypeIdControl = this.form.get('vendorTypeId');

    if (isCompany) {
      companyNameControl?.setValidators([Validators.required]);
      companyEmailControl?.setValidators([Validators.required, Validators.email]);
      displayNameControl?.setValidators([Validators.required]);
      firstNameControl?.clearValidators();
      lastNameControl?.clearValidators();
      vendorTypeIdControl?.clearValidators();
      phoneControl?.setValidators([Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
      emailControl?.setValidators([Validators.required, Validators.email]);
      address1Control?.setValidators([Validators.required]);
      cityControl?.setValidators([Validators.required]);
      stateControl?.setValidators([Validators.required]);
      zipControl?.setValidators([Validators.required]);
    } else if (entityTypeId === EntityType.Vendor) {
      companyEmailControl?.setValidators([Validators.email]);
      displayNameControl?.clearValidators();
      phoneControl?.setValidators([Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
      emailControl?.setValidators([Validators.required, Validators.email]);
      address1Control?.clearValidators();
      cityControl?.clearValidators();
      stateControl?.clearValidators();
      zipControl?.clearValidators();
      vendorTypeIdControl?.setValidators([Validators.required]);
      this.applyVendorNameCompanyValidators();
    } else {
      companyNameControl?.clearValidators();
      companyEmailControl?.setValidators([Validators.email]);
      displayNameControl?.clearValidators();
      firstNameControl?.setValidators([Validators.required]);
      lastNameControl?.setValidators([Validators.required]);
      phoneControl?.setValidators([Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
      emailControl?.setValidators([Validators.required, Validators.email]);
      address1Control?.clearValidators();
      cityControl?.clearValidators();
      stateControl?.clearValidators();
      zipControl?.clearValidators();
      vendorTypeIdControl?.clearValidators();
    }

    if (this.needsStrictPhoneValidation(entityTypeId)) {
      phoneControl?.setValidators([Validators.required, Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+|^$)$/)]);
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
    vendorTypeIdControl?.updateValueAndValidity({ emitEvent: false });
  }

  applyVendorNameCompanyValidators(): void {
    if (!this.form || this.form.getRawValue().entityTypeId !== EntityType.Vendor) {
      return;
    }
    const vendorTypeId = this.form.getRawValue().vendorTypeId;
    const companyNameControl = this.form.get('companyName');
    const firstNameControl = this.form.get('firstName');
    const lastNameControl = this.form.get('lastName');
    if (vendorTypeId === VendorType.Company) {
      companyNameControl?.setValidators([Validators.required]);
      firstNameControl?.clearValidators();
      lastNameControl?.clearValidators();
    } else if (vendorTypeId === VendorType.Individual) {
      companyNameControl?.clearValidators();
      firstNameControl?.setValidators([Validators.required]);
      lastNameControl?.setValidators([Validators.required]);
    } else {
      companyNameControl?.clearValidators();
      firstNameControl?.clearValidators();
      lastNameControl?.clearValidators();
    }
    companyNameControl?.updateValueAndValidity({ emitEvent: false });
    firstNameControl?.updateValueAndValidity({ emitEvent: false });
    lastNameControl?.updateValueAndValidity({ emitEvent: false });
  }

  vendorFirstLastRequired(): boolean {
    const raw = this.form?.getRawValue();
    return raw?.entityTypeId === EntityType.Vendor && raw?.vendorTypeId === VendorType.Individual;
  }

  vendorCompanyNameRequired(): boolean {
    const raw = this.form?.getRawValue();
    return raw?.entityTypeId === EntityType.Vendor && raw?.vendorTypeId === VendorType.Company;
  }

  populateForm(): void {
    if (this.contact && this.form) {
      const isActiveValue = typeof this.contact.isActive === 'number' ? this.contact.isActive === 1 : Boolean(this.contact.isActive);
      const entityTypeId = this.contact.entityTypeId ?? EntityType.Unknown;
      const companyName = this.contact.companyName ?? (this.contact as any).companyName ?? '';
      const officeAccess = this.mappingService.normalizeOfficeAccessNumbers(this.contact.officeAccess);
      const normalizedOfficeAccess = officeAccess.length > 0
        ? officeAccess
        : (Number.isFinite(Number(this.contact.officeId)) && Number(this.contact.officeId) > 0 ? [Number(this.contact.officeId)] : []);
      const rawContactOfficeId = Number(this.contact.officeId);
      const patchOfficeId = Number.isFinite(rawContactOfficeId) && rawContactOfficeId > 0
        ? rawContactOfficeId
        : (normalizedOfficeAccess[0] ?? null);
      const rawCodes = (this.contact.properties ?? []) as string[] | string;
      const propertyCodesArray = Array.isArray(rawCodes) ? rawCodes : (typeof rawCodes === 'string' && rawCodes ? rawCodes.split(',').map(c => c.trim()).filter(c => c) : []);

      const insuranceExpirationDate = this.utilityService.parseApiDateOnlyToDate(this.contact.insuranceExpiration ?? null);
      this.form.patchValue({
        contactCode: this.contact.contactCode,
        entityTypeId: entityTypeId,
        ownerTypeId: this.contact.ownerTypeId ?? null,
        vendorTypeId: entityTypeId === EntityType.Vendor ? (this.contact.vendorTypeId ?? null) : null,
        propertyCodes: propertyCodesArray,
        firstName: this.contact.firstName,
        lastName: this.contact.lastName,
        officeAccess: normalizedOfficeAccess,
        officeId: patchOfficeId,
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
        insuranceExpiration: insuranceExpirationDate,
        addAsUser: (this.contact.addAsUser ?? 0) === 1
      }, { emitEvent: false });

      this.syncDefaultOfficeOptions();

      if (!this.isAddMode) {
        this.form.get('entityTypeId')?.disable();
      }

      this.applyEntityTypeContactValidators(entityTypeId);

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

  setPdfThumbnail(
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

  dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64] = dataUrl.split(',');
    const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'application/pdf';
    const binary = atob(base64 ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  filterPropertiesByGlobalOffice(): void {
    const officeId = this.globalSelectionService.getSelectedOfficeIdValue();
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
      const isCompany = this.form.get('entityTypeId')?.value === EntityType.Company;

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
      ? (this.form?.get('entityTypeId')?.value ?? this.presetEntityTypeId)
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

  syncDefaultOfficeOptions(): void {
    if (!this.form) {
      return;
    }

    const officeAccess = this.mappingService.normalizeOfficeAccessNumbers(this.form.get('officeAccess')?.value || []);
    const selectedSet = new Set<number>(officeAccess);
    this.availableDefaultOffices = this.availableOffices.filter(office => selectedSet.has(office.value));

    const currentDefaultOffice = this.form.get('officeId')?.value;
    const hasCurrentDefaultOffice = this.availableDefaultOffices.some(office => office.value === currentDefaultOffice);
    if (!hasCurrentDefaultOffice) {
      this.form.get('officeId')?.setValue(officeAccess[0] ?? null, { emitEvent: false });
    }
  }

  needsStrictPhoneValidation(entityTypeId: number | null | undefined): boolean {
    const id = Number(entityTypeId);
    if (id === EntityType.Company || id === EntityType.Owner || id === EntityType.Vendor) {
      return true;
    }
    return false;
  }

  applyEntityTypeSpecificContactFields(
    contactRequest: ContactRequest,
    entityTypeId: number,
    formValue: { ownerTypeId?: number | null; vendorTypeId?: number | null; propertyCodes?: string[]; addAsUser?: boolean }
  ): void {
    if (entityTypeId === EntityType.Owner) {
      contactRequest.ownerTypeId = formValue.ownerTypeId ?? this.contact?.ownerTypeId ?? null;
      contactRequest.properties = formValue.propertyCodes || [];
      contactRequest.addAsUser = 0;
      contactRequest.vendorTypeId = null;
      return;
    }
    contactRequest.ownerTypeId = undefined;
    contactRequest.properties = [];
    if (entityTypeId === EntityType.Vendor) {
      contactRequest.vendorTypeId = formValue.vendorTypeId ?? this.contact?.vendorTypeId ?? null;
    } else {
      contactRequest.vendorTypeId = null;
    }
    contactRequest.addAsUser = entityTypeId === EntityType.Vendor && formValue.addAsUser ? 1 : 0;
  }

  applyContactTypeLockedState(): void {
    if (!this.form || !this.isAddMode) {
      return;
    }
    const locked =
      !this.copyFrom &&
      (this.presetEntityTypeId === EntityType.Owner ||
        this.presetEntityTypeId === EntityType.Vendor ||
        this.presetEntityTypeId === EntityType.Tenant ||
        this.presetEntityTypeId === EntityType.Company);
    const ctl = this.form.get('entityTypeId');
    if (!ctl) {
      return;
    }
    if (locked) {
      ctl.disable({ emitEvent: false });
    } else {
      ctl.enable({ emitEvent: false });
    }
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
        this.syncDefaultOfficeOptions();
        
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
        this.mergePreselectPropertiesFromDialogData();
        this.filterPropertiesByGlobalOffice();
        this.patchPreselectedOwnerPropertyCodes();
      },
      error: () => {}
    });
  }

  mergePreselectPropertiesFromDialogData(): void {
    const codes = (this.dialogData?.preselectPropertyCodes ?? [])
      .map(c => String(c ?? '').trim())
      .filter(c => c.length > 0);
    const officeId = this.dialogData?.preselectPropertyOfficeId;
    if (!codes.length || officeId == null || !Number.isFinite(Number(officeId))) {
      return;
    }
    const oid = Number(officeId);
    const officeName = this.offices.find(o => o.officeId === oid)?.name ?? '';
    for (const code of codes) {
      const upper = code.toUpperCase();
      const exists = this.allProperties.some(p => (p.propertyCode || '').toUpperCase() === upper);
      if (!exists) {
        this.allProperties.push(this.createSyntheticPropertyListItem(upper, oid, officeName));
      }
    }
  }

  createSyntheticPropertyListItem(propertyCode: string, officeId: number, officeName: string): PropertyListResponse {
    return {
      propertyId: '',
      propertyCode,
      propertyLeaseId: 0,
      shortAddress: '',
      officeId,
      officeName,
      contactName: '',
      unitLevel: 0,
      bedrooms: 0,
      bathrooms: 0,
      accomodates: 0,
      squareFeet: 0,
      monthlyRate: 0,
      dailyRate: 0,
      propertyTypeId: 0,
      departureFee: 0,
      petFee: 0,
      maidServiceFee: 0,
      propertyStatusId: 0,
      bedroomId1: 0,
      bedroomId2: 0,
      bedroomId3: 0,
      bedroomId4: 0,
      isActive: true
    };
  }

  patchPreselectedOwnerPropertyCodes(): void {
    if (!this.form || !this.isAddMode || this.form.get('entityTypeId')?.value !== EntityType.Owner) {
      return;
    }
    const codes = (this.dialogData?.preselectPropertyCodes ?? [])
      .map(c => String(c ?? '').trim().toUpperCase())
      .filter(c => c.length > 0);
    if (!codes.length) {
      return;
    }
    const cur = (this.form.get('propertyCodes')?.value as string[]) ?? [];
    const merged: string[] = [...cur];
    const seen = new Set(merged.map(c => String(c).toUpperCase()));
    for (const want of codes) {
      const opt = this.availablePropertyCodes.find(o => (o.value || '').toUpperCase() === want);
      const v = opt?.value ?? want;
      const key = v.toUpperCase();
      if (!seen.has(key)) {
        merged.push(v);
        seen.add(key);
      }
    }
    this.form.patchValue({ propertyCodes: merged }, { emitEvent: false });
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

  openW9Preview(event?: Event): void {
    const imageSrc = this.w9FileContentType?.startsWith('image/')
      ? this.w9FileDataUrl
      : this.w9PdfThumbnailUrl;
    this.openContactAttachmentPreview(imageSrc, 'W9 Form', event);
  }

  openInsurancePreview(event?: Event): void {
    const imageSrc = this.insuranceFileContentType?.startsWith('image/')
      ? this.insuranceFileDataUrl
      : this.insurancePdfThumbnailUrl;
    this.openContactAttachmentPreview(imageSrc, 'Insurance Form', event);
  }

  openContactAttachmentPreview(imageSrc: string | null, title: string, event?: Event): void {
    event?.stopPropagation();
    if (!imageSrc) {
      return;
    }
    const data: ImageViewDialogData = { imageSrc, title };
    this.dialog.open(ImageViewDialogComponent, { data, width: '70vw', maxWidth: '520px' });
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

  formatAgreementCurrency(n: number): string {
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

  //#region User Create Methods
  shouldCreateOwnerUser(savedContact: ContactResponse): boolean {
    const email = (savedContact?.email || '').trim();
    const code = (savedContact?.contactCode || '').trim();
    return email.length > 0 && code.length > 0;
  }

  shouldCreateVendorUser(formValue: { addAsUser?: boolean; email?: string }, savedContact: ContactResponse): boolean {
    if (!formValue?.addAsUser) {
      return false;
    }
    const vendorEmail = (savedContact?.email || formValue?.email || '').trim();
    return vendorEmail.length > 0;
  }

  buildOwnerUserRequest(savedContact: ContactResponse, contactRequest: ContactRequest): UserRequest | null {
    const contactCode = (savedContact.contactCode || contactRequest.contactCode || '').trim();
    const email = (savedContact.email || contactRequest.email || '').trim();
    if (!contactCode || !email) {
      return null;
    }

    const officeAccess = this.mappingService.normalizeOfficeAccessNumbers(savedContact.officeAccess ?? contactRequest.officeAccess);
    const officeId = Number(savedContact.officeId ?? contactRequest.officeId);
    const firstName = (savedContact.firstName || contactRequest.firstName || '').trim();
    const lastName = (savedContact.lastName || contactRequest.lastName || '').trim();
    const phone = this.formatterService.stripPhoneFormatting(savedContact.phone || contactRequest.phone || '');

    return {
      userId: email,
      organizationId: savedContact.organizationId || contactRequest.organizationId,
      firstName: firstName || 'Owner',
      lastName: lastName || 'Owner',
      email,
      phone: phone || '',
      password: contactCode,
      userGroups: [UserGroups[UserGroups.Owner]],
      officeAccess: officeAccess.length > 0 ? officeAccess : [officeId],
      properties: contactRequest.properties || [],
      startupPageId: 0,
      defaultOfficeId: officeId,
      isActive: typeof savedContact.isActive === 'number' ? savedContact.isActive === 1 : !!savedContact.isActive
    };
  }

  buildVendorUserRequest(savedContact: ContactResponse, contactRequest: ContactRequest): UserRequest | null {
    const vendorCode = (savedContact?.contactCode || contactRequest.contactCode || '').trim();
    const vendorEmail = (savedContact?.email || contactRequest.email || '').trim();
    if (!vendorCode || !vendorEmail) {
      return null;
    }

    const officeAccess = this.mappingService.normalizeOfficeAccessNumbers(savedContact.officeAccess ?? contactRequest.officeAccess);
    const officeId = Number(savedContact.officeId ?? contactRequest.officeId);
    const firstName = (savedContact?.firstName || contactRequest.firstName || '').trim() || (savedContact?.companyName || contactRequest.companyName || 'Vendor').trim();
    const lastName = (savedContact?.lastName || contactRequest.lastName || '').trim() || 'Vendor';
    const phone = this.formatterService.stripPhoneFormatting(savedContact?.phone || contactRequest.phone || '');

    return {
      organizationId: savedContact?.organizationId || contactRequest.organizationId,
      firstName,
      lastName,
      email: vendorEmail,
      phone: phone || '',
      password: vendorCode,
      userGroups: [UserGroups[UserGroups.Vendor]],
      officeAccess: officeAccess.length > 0 ? officeAccess : [officeId],
      properties: [],
      startupPageId: 0,
      defaultOfficeId: officeId,
      isActive: !!savedContact?.isActive
    };
  }

  userResponseToUserRequestForUpdate(user: UserResponse, overrides: Partial<UserRequest>): UserRequest {
    return {
      userId: user.userId,
      organizationId: user.organizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: this.formatterService.stripPhoneFormatting(user.phone || '') || '',
      password: null,
      userGroups: user.userGroups || [],
      officeAccess: user.officeAccess || [],
      properties: user.properties || [],
      profilePath: user.profilePath,
      fileDetails: user.fileDetails,
      startupPageId: user.startupPageId ?? 0,
      defaultOfficeId: user.defaultOfficeId ?? null,
      agentId: user.agentId ?? null,
      commissionRate: user.commissionRate ?? null,
      contactId: overrides.contactId !== undefined ? overrides.contactId : user.contactId,
      isActive: user.isActive
    };
  }

  buildContactRequestWithUserId(savedContact: ContactResponse, originalRequest: ContactRequest, userId: string): ContactRequest {
    const isActive =
      typeof savedContact.isActive === 'number' ? savedContact.isActive === 1 : !!savedContact.isActive;
    return {
      ...originalRequest,
      contactId: savedContact.contactId,
      contactCode: savedContact.contactCode,
      organizationId: savedContact.organizationId,
      officeId: savedContact.officeId,
      officeAccess: this.mappingService.normalizeOfficeAccessNumbers(savedContact.officeAccess ?? originalRequest.officeAccess),
      userId,
      entityTypeId: savedContact.entityTypeId,
      ownerTypeId: savedContact.entityTypeId === EntityType.Owner ? (savedContact.ownerTypeId ?? originalRequest.ownerTypeId ?? null) : undefined,
      vendorTypeId:
        savedContact.entityTypeId === EntityType.Vendor ? (savedContact.vendorTypeId ?? originalRequest.vendorTypeId ?? null) : null,
      properties: savedContact.entityTypeId === EntityType.Owner ? (savedContact.properties ?? originalRequest.properties ?? []) : [],
      companyName: savedContact.companyName ?? originalRequest.companyName,
      companyEmail: savedContact.companyEmail ?? originalRequest.companyEmail,
      displayName: savedContact.displayName ?? originalRequest.displayName,
      firstName: savedContact.firstName ?? originalRequest.firstName,
      lastName: savedContact.lastName ?? originalRequest.lastName,
      address1: savedContact.address1 ?? originalRequest.address1,
      address2: savedContact.address2 ?? originalRequest.address2,
      city: savedContact.city ?? originalRequest.city,
      state: savedContact.state ?? originalRequest.state,
      zip: savedContact.zip ?? originalRequest.zip,
      phone: savedContact.phone ?? originalRequest.phone,
      email: savedContact.email,
      rating: savedContact.rating ?? originalRequest.rating,
      notes: savedContact.notes ?? originalRequest.notes,
      isInternational: savedContact.isInternational ?? originalRequest.isInternational,
      w9Path: savedContact.w9Path ?? originalRequest.w9Path,
      w9FileDetails: savedContact.w9FileDetails ?? originalRequest.w9FileDetails,
      insurancePath: savedContact.insurancePath ?? originalRequest.insurancePath,
      insuranceFileDetails: savedContact.insuranceFileDetails ?? originalRequest.insuranceFileDetails,
      insuranceExpiration: savedContact.insuranceExpiration ?? originalRequest.insuranceExpiration,
      markup: savedContact.markup ?? originalRequest.markup,
      revenueSplitOwner: savedContact.revenueSplitOwner ?? originalRequest.revenueSplitOwner,
      revenueSplitOffice: savedContact.revenueSplitOffice ?? originalRequest.revenueSplitOffice,
      workingCapitalBalance: savedContact.workingCapitalBalance ?? originalRequest.workingCapitalBalance,
      linenAndTowelFee: savedContact.linenAndTowelFee ?? originalRequest.linenAndTowelFee,
      bankName: savedContact.bankName ?? originalRequest.bankName,
      routingNumber: savedContact.routingNumber ?? originalRequest.routingNumber,
      accountNumber: savedContact.accountNumber ?? originalRequest.accountNumber,
      addAsUser: savedContact.addAsUser ?? originalRequest.addAsUser ?? 0,
      isActive
    };
  }

  runCreateUserAndLinkContact(
    savedContact: ContactResponse,
    contactRequest: ContactRequest,
    userRequest: UserRequest,
    successMessage: string,
    failureMessage: string,
    finalizeContactSave: () => void
  ): void {
    this.userService.createUser(userRequest).pipe(
      switchMap(created =>
        this.userService.getUserByGuid(created.userId).pipe(
          switchMap(retrieved =>
            this.userService.updateUser(this.userResponseToUserRequestForUpdate(retrieved, { contactId: savedContact.contactId }))
          ),
          switchMap(() =>
            this.contactService.updateContact(this.buildContactRequestWithUserId(savedContact, contactRequest, created.userId))
          )
        )
      ),
      take(1)
    ).subscribe({
      next: () => {
        this.toastr.success(successMessage, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        finalizeContactSave();
      },
      error: (err: unknown) => {
        const httpErr = err as { error?: { message?: string; title?: string }; message?: string };
        const apiMessage = String(httpErr?.error?.message || httpErr?.error?.title || httpErr?.message || '').trim();
        const message = apiMessage ? `${failureMessage} ${apiMessage}` : failureMessage;
        this.toastr.warning(message, CommonMessage.Error);
        finalizeContactSave();
      }
    });
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
      this.navigateBackToOrigin();
    }
  }

  captureReturnUrl(): void {
    const fromQuery = getStringQueryParam(this.route.snapshot.queryParams, 'returnUrl');
    if (fromQuery) {
      const normalized = fromQuery.startsWith('/') ? fromQuery : `/${fromQuery}`;
      if (normalized.startsWith('/auth/') && !/\/contacts\/[^/?]+/.test(normalized)) {
        this.returnUrl = normalized;
        return;
      }
    }

    const returnTo = getStringQueryParam(this.route.snapshot.queryParams, 'returnTo');
    if (returnTo === 'reservation-list') {
      this.returnUrl = RouterUrl.ReservationList;
      return;
    }
    if (returnTo === 'property-list') {
      this.returnUrl = RouterUrl.PropertyList;
      return;
    }
    if (returnTo === 'maintenance-list') {
      this.returnUrl = RouterUrl.MaintenanceList;
      return;
    }
    if (returnTo === 'dashboard-main') {
      this.returnUrl = RouterUrl.Dashboard;
      return;
    }

    this.returnUrl = null;
  }

  navigateBackToOrigin(): void {
    if (this.returnUrl) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    this.router.navigate([RouterUrl.ContactList]);
  }
  //#endregion
}

