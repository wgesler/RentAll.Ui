import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map, catchError, of, Subscription } from 'rxjs';
import { ReservationService } from '../services/reservation.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ReservationResponse, ReservationRequest, ExtraFeeLineRequest, ExtraFeeLineResponse } from '../models/reservation-model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { ContactService } from '../../contacts/services/contact.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { AgentService } from '../../organizations/services/agent.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { CompanyService } from '../../companies/services/company.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ReservationType, ReservationStatus, BillingType, BillingMethod, Frequency, ReservationNotice, DepositType, ProrateType, getReservationTypes, getReservationStatuses, getBillingTypes, getBillingMethods, getFrequencies, getReservationNotices, getDepositTypes, getProrateTypes } from '../models/reservation-enum';
import { CheckinTimes, CheckoutTimes, getCheckInTimes, getCheckOutTimes, normalizeCheckInTimeId, normalizeCheckOutTimeId } from '../../properties/models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { LeaseComponent } from '../lease/lease.component';
import { LeaseInformationComponent } from '../lease-information/lease-information.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { InvoiceListComponent } from '../../accounting/invoice-list/invoice-list.component';
import { MatDialog } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { LeaseReloadService } from '../services/lease-reload.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { CostCodesResponse } from '../../accounting/models/cost-codes.model';
import { TransactionType } from '../../accounting/models/accounting-enum';

// Display interface for ExtraFeeLine in the UI
interface ExtraFeeLineDisplay {
  extraFeeLineId: string | null;
  feeDescription: string | null;
  feeAmount: number | undefined;
  feeFrequencyId: number | undefined;
  costCodeId: number | undefined;
  isNew?: boolean; // Track if this is a new line
}

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, LeaseComponent, LeaseInformationComponent, DocumentListComponent, InvoiceListComponent],
  templateUrl: './reservation.component.html',
  styleUrl: './reservation.component.scss'
})

export class ReservationComponent implements OnInit, OnDestroy {
  @ViewChild('reservationDocumentList') reservationDocumentList?: DocumentListComponent;
  
  isServiceError: boolean = false;
  selectedTabIndex: number = 0;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  propertyPanelOpen: boolean = true;
  billingPanelOpen: boolean = true;
  ReservationType = ReservationType; // Expose enum to template
  EntityType = EntityType; // Expose enum to template
  DocumentType = DocumentType; // Expose enum to template
  departureDateStartAt: Date | null = null;
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];
  availableClientTypes: { value: number, label: string }[] = [];
  availableBillingTypes: { value: number, label: string }[] = [];
  availableBillingMethods: { value: number, label: string }[] = [];
  availableProrateTypes: { value: number, label: string }[] = [];
  availableFrequencies: { value: number, label: string }[] = [];
  availableReservationNotices: { value: number, label: string }[] = [];
  availableDepositTypes: { value: number, label: string }[] = [];
  allReservationStatuses: { value: number, label: string }[] = [];
  availableReservationStatuses: { value: number, label: string }[] = [];

  reservationId: string;
  reservation: ReservationResponse;
  organization: OrganizationResponse | null = null;
  agents: AgentResponse[] = [];
  companies: CompanyResponse[] = [];
  selectedCompanyName: string = '';
  contacts: ContactResponse[] = [];
  filteredContacts: ContactResponse[] = [];
  selectedContact: ContactResponse | null = null;
  properties: PropertyListResponse[] = [];
  selectedProperty: PropertyListResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  contactsSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  handlersSetup: boolean = false;
  
  // ExtraFeeLines management
  extraFeeLines: ExtraFeeLineDisplay[] = [];
  
  // Cost codes for ExtraFeeLines (charge types only)
  chargeCostCodes: CostCodesResponse[] = [];
  availableChargeCostCodes: { value: number, label: string }[] = [];
  costCodesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents', 'properties', 'companies', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public reservationService: ReservationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private agentService: AgentService,
    private companyService: CompanyService,
    private officeService: OfficeService,
    private commonService: CommonService,
    private authService: AuthService,
    public formatterService: FormatterService,
    private dialog: MatDialog,
    private leaseReloadService: LeaseReloadService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private costCodesService: CostCodesService
  ) {
  }

  //#region Reservation Page
  ngOnInit(): void {
    this.loadContacts();  
    this.loadOrganization();
    this.loadProperties();
    this.loadAgents();
    this.loadCompanies();
    this.loadOffices();
    
    // Initialize form immediately to prevent template errors
    this.buildForm();
    
    // Get route params first
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      this.reservationId = paramMap.get('id') || null;
      this.isAddMode = !this.reservationId || this.reservationId === 'new';
      
      if (this.isAddMode) {
        this.billingPanelOpen = false;
        this.updatePetFields();
        this.updateMaidServiceFields();
        this.extraFeeLines = [];
      }
    });
    
    // Keep track of the tab so we now where the back button should take us
    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      if (queryParams['tab'] === 'documents') {
        this.selectedTabIndex = 3; // Documents tab
      } else if (queryParams['tab'] === 'invoices') {
        this.selectedTabIndex = 1; // Invoices tab
      }
    });
    
    // Set up handlers after all data is loaded, then load reservation if needed
    this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
      this.setupFormHandlers();
      
       if (!this.isAddMode) {
        this.getReservation();
      }
    });
  }

  getReservation(): void {
    if (this.isAddMode) {
      return;
    }

    this.reservationService.getReservationByGuid(this.reservationId).pipe( take(1)).subscribe({
      next: (response: ReservationResponse) => {
        this.reservation = response;
        this.selectedProperty = this.properties.find(p => p.propertyId === this.reservation.propertyId);
        this.selectedContact = this.contacts.find(c => c.contactId == this.reservation.contactId)
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  saveReservation(): void {
    // Mark all fields as touched to show validation errors
    this.form.markAllAsTouched();
    
    // Also mark individual controls as touched to ensure error messages appear
    // Use emitEvent: false to prevent triggering valueChanges subscriptions that might clear fields
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      if (control) {
        control.markAsTouched();
        control.updateValueAndValidity({ emitEvent: false });
      }
    });
    
    // Explicitly ensure reservationTypeId is validated and shows error
    const reservationTypeControl = this.form.get('reservationTypeId');
    if (reservationTypeControl) {
      reservationTypeControl.markAsTouched();
      reservationTypeControl.updateValueAndValidity({ emitEvent: false });
    }
    
    if (!this.form.valid) {
      this.toastr.error('Please fill in all required fields', CommonMessage.Error);
      return;
    }

    // Validate ExtraFeeLines before saving
    if (!this.validateExtraFeeLines()) {
      return;
    }

    // Check for date overlaps before saving
    this.validateDates('save');
  }

  performSave(): void {
    this.isSubmitting = true;

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    // Ensure required non-nullable fields have values
    const officeId = this.selectedProperty?.officeId;
    if (!officeId) {
      this.toastr.error('Office ID is required', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }

    const agentId = formValue.agentId;
    if (!agentId || agentId === '' || agentId === 'null' || agentId === null) {
      this.toastr.error('Agent is required', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }

    const reservationRequest: ReservationRequest = {
      organizationId: user?.organizationId || '',
      officeId: officeId,
      propertyId: formValue.propertyId,
      agentId: agentId,
      contactId: formValue.contactId,
      reservationTypeId: formValue.reservationTypeId !== null && formValue.reservationTypeId !== undefined ? Number(formValue.reservationTypeId) : ReservationType.Private,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      reservationNoticeId: formValue.reservationNoticeId !== null && formValue.reservationNoticeId !== undefined ? Number(formValue.reservationNoticeId) : ReservationNotice.ThirtyDays,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 1,
      hasPets: formValue.pets ?? false,
      tenantName: formValue.tenantName || '',
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : new Date().toISOString(),
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : new Date().toISOString(),
      checkInTimeId: normalizeCheckInTimeId(formValue.checkInTimeId),
      checkOutTimeId: normalizeCheckOutTimeId(formValue.checkOutTimeId),
      billingTypeId: formValue.billingTypeId ?? BillingType.Monthly,
      billingMethodId: formValue.billingMethodId ?? BillingMethod.Invoice,
      prorateTypeId: formValue.prorateTypeId !== null && formValue.prorateTypeId !== undefined ? Number(formValue.prorateTypeId) : ProrateType.FirstMonth,
      billingRate: formValue.billingRate ? parseFloat(formValue.billingRate.toString()) : 0,
      deposit: formValue.deposit ? parseFloat(formValue.deposit.toString()) : 0,
      depositTypeId: formValue.depositType !== null && formValue.depositType !== undefined ? Number(formValue.depositType) : DepositType.Deposit,
      departureFee: formValue.departureFee ? parseFloat(formValue.departureFee.toString()) : 0,
      maidService: formValue.maidService ?? false,
      maidServiceFee: formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0,
      frequencyId: formValue.frequencyId ?? Frequency.NA,
      maidStartDate: formValue.maidStartDate ? (formValue.maidStartDate as Date).toISOString() : new Date().toISOString(),
      petFee: formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0,
      numberOfPets: formValue.numberOfPets ? Number(formValue.numberOfPets) : 0,
      petDescription: formValue.petDescription || undefined,
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
      extraFeeLines: this.mapExtraFeeLinesToRequest(),
      notes: formValue.notes !== null && formValue.notes !== undefined ? String(formValue.notes) : '',
      allowExtensions: formValue.allowExtensions ?? false,
      currentInvoiceNumber: formValue.currentInvoiceNumber ?? 0,
      creditDue: formValue.creditDue ?? 0,
      isActive: formValue.isActive ?? true
    };

    if (!this.isAddMode) {
      reservationRequest.reservationId = this.reservationId;
      reservationRequest.organizationId = this.reservation?.organizationId || user?.organizationId || '';
      reservationRequest.reservationCode = this.reservation?.reservationCode || formValue.reservationCode || '';
    }


    const save$ = this.isAddMode
      ? this.reservationService.createReservation(reservationRequest)
      : this.reservationService.updateReservation(reservationRequest);

    save$.pipe(take(1),  finalize(() => this.isSubmitting = false) ).subscribe({
      next: (response: ReservationResponse) => {
        const message = this.isAddMode ? 'Reservation created successfully' : 'Reservation updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        
        // If in add mode, navigate back to reservation list
        if (this.isAddMode && response) {
          this.router.navigateByUrl(RouterUrl.ReservationList);
        } else if (!this.isAddMode && response) {
          // Update the reservation data with the response
          this.reservation = response;
          this.populateForm();
        }
        
        // Trigger lease reload event
        this.leaseReloadService.triggerReload();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 400) {
          // Show API validation error message if available
          const errorData = err?.error;
          console.error('400 Validation Error Response:', errorData);
          
          if (errorData && typeof errorData === 'object') {
            // Check for ASP.NET Core ProblemDetails format
            const problemDetails = errorData as any;
            
            // Show title/message
            let message = problemDetails.title || problemDetails.message || problemDetails.Message || 'Validation failed.';
            
            // If there are specific field errors, append them
            if (problemDetails.errors && typeof problemDetails.errors === 'object') {
              const fieldErrors: string[] = [];
              Object.keys(problemDetails.errors).forEach(key => {
                const errors = problemDetails.errors[key];
                if (Array.isArray(errors) && errors.length > 0) {
                  fieldErrors.push(`${key}: ${errors.join(', ')}`);
                }
              });
              if (fieldErrors.length > 0) {
                message += '\n' + fieldErrors.join('\n');
              }
            }
            
            this.toastr.error(message, CommonMessage.Error, { timeOut: 10000 });
          } else {
            this.toastr.error('Validation failed. Please check your input.', CommonMessage.Error);
          }
        } else {
          const failMessage = this.isAddMode ? 'Create reservation request has failed. ' : 'Update reservation request has failed. ';
          this.toastr.error(failMessage + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      isActive: new FormControl(true),
      allowExtensions: new FormControl(true),
      reservationCode: new FormControl({ value: '', disabled: true }), // Read-only, only shown in Edit Mode
      propertyCode: new FormControl({ value: '', disabled: true }), // Read-only
      propertyId: new FormControl('', [Validators.required]),
      propertyAddress: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      agentId: new FormControl(null, [Validators.required]),
      tenantName: new FormControl('', [Validators.required]), // Always enabled
      contactId: new FormControl('', [Validators.required]), // Always enabled
      entityCompanyName: new FormControl({ value: '', disabled: true }), // Display Company name if EntityTypeId is Company
      reservationTypeId: new FormControl(null, [Validators.required]),
      reservationStatusId: new FormControl(null, [Validators.required]),
      reservationNoticeId: new FormControl(null, [Validators.required]),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl<number>(CheckinTimes.FourPM, [Validators.required]),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.ElevenAM, [Validators.required]),
      billingTypeId: new FormControl(BillingType.Monthly, [Validators.required]),
      billingModelId: new FormControl(BillingMethod.Invoice, [Validators.required]),
      prorateTypeId: new FormControl<number | null>(null),
      billingRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(1, [Validators.required]),
      pets: new FormControl(false, [Validators.required]),
      petFee: new FormControl<string>('0.00'),
      numberOfPets: new FormControl(0),
      petDescription: new FormControl(''),
      maidService: new FormControl(false, [Validators.required]),
      maidStartDate: new FormControl<Date | null>(null),
      phone: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      email: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      depositType: new FormControl(DepositType.Deposit, [Validators.required]),
      deposit: new FormControl<string>('0.00'),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00'),
      frequencyId: new FormControl(Frequency.NA),
      taxes: new FormControl(null),
      notes: new FormControl(''),
      currentInvoiceNumber: new FormControl(0),
      creditDue: new FormControl(0)
    });

    // Initialize field states
    this.initializeEnums();
  }

  populateForm(): void {
    if (!this.reservation || !this.form) {
      return;
    }

    // Set selected property
    this.selectedProperty = this.properties.find(p => p.propertyId === this.reservation.propertyId) || null;
    this.selectedOffice = this.offices.find(o => o.officeId === this.selectedProperty.officeId) || null;
    this.selectedContact = this.contacts.find(c => c.contactId == this.reservation.contactId)
    // Load cost codes when office is set
    if (this.selectedOffice) {
      this.loadCostCodes();
    }


    // Patch form with reservationTypeId and adjust dropdowns accordingly
    this.form.patchValue({ reservationTypeId: this.reservation.reservationTypeId }, { emitEvent: false });
    this.updateReservationStatusesByReservationType();
    this.updateContactsByReservationType();
    this.updateEnabledFieldsByReservationType();
  
    // Patch all form values directly from reservation (without contact fields first)
    this.form.patchValue({
      isActive: typeof this.reservation.isActive === 'number' ? this.reservation.isActive === 1 : Boolean(this.reservation.isActive),
      allowExtensions: this.reservation.allowExtensions ?? true,
      reservationCode: this.reservation.reservationCode || '',
      propertyId: this.reservation.propertyId,
      propertyCode: this.selectedProperty?.propertyCode || '',
      propertyAddress: this.selectedProperty?.shortAddress || '',
      agentId: this.reservation.agentId || null,
      contactId: this.reservation.contactId || null,
      tenantName: this.reservation.tenantName || '',
      entityCompanyName: this.selectedCompanyName,
      reservationStatusId: this.reservation.reservationStatusId,
      reservationNoticeId: this.reservation.reservationNoticeId,
      arrivalDate: this.reservation.arrivalDate ? new Date(this.reservation.arrivalDate) : null,
      departureDate: this.reservation.departureDate ? new Date(this.reservation.departureDate) : null,
      checkInTimeId: this.reservation.checkInTimeId,
      checkOutTimeId: this.reservation.checkOutTimeId,
      billingTypeId: this.reservation.billingTypeId ?? BillingType.Monthly,
      billingMethodId: this.reservation.billingMethodId ?? BillingMethod.Invoice,
      prorateTypeId: this.reservation.prorateTypeId ?? null,
      billingRate: (this.reservation.billingRate ?? 0).toFixed(2),
      numberOfPeople: this.reservation.numberOfPeople === 0 ? 1 : this.reservation.numberOfPeople,
      depositType: this.reservation.depositTypeId ?? DepositType.Deposit,
      deposit: this.reservation.deposit !== null && this.reservation.deposit !== undefined ? this.reservation.deposit.toFixed(2) : '0.00',
      departureFee: (this.reservation.departureFee ?? 0).toFixed(2),
      pets: this.reservation.hasPets ?? false,
      petFee: (this.reservation.petFee ?? 0).toFixed(2),
      numberOfPets: this.reservation.numberOfPets ?? 0,
      petDescription: this.reservation.petDescription || '',
      maidService: this.reservation.maidService ?? false,
      maidStartDate: this.reservation.maidStartDate ? new Date(this.reservation.maidStartDate) : null,
      maidServiceFee: (this.reservation.maidServiceFee ?? 0).toFixed(2),
      frequencyId: this.reservation.frequencyId ?? Frequency.NA,
      taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes,
      notes: this.reservation.notes || ''
    }, { emitEvent: false });

    // Find selected contact - contacts are guaranteed to be loaded at this point
    this.selectedContact = this.contacts.find(c => c.contactId === this.reservation.contactId) || null;
    this.updateContactFields();
   
    // Update pet and maid service fields after patching
    this.updatePetFields();
    this.updateMaidServiceFields();
    this.loadExtraFeeLines();
    this.updateMaidStartDate();
  }
    
  setupFormHandlers(): void {
    // Prevent setting up handlers multiple times
    if (this.handlersSetup) {
      return;
    }
    
    // Set up handlers that depend on loaded data (office, properties, etc.)
    this.setupPropertySelectionHandler();
    this.setupContactSelectionHandler();
    this.setupReservationTypeHandler();
    this.setupDepositHandlers();
    this.setupBillingTypeHandler();
    this.setupPetFeeHandler();
    this.setupMaidServiceHandler();
    this.setupMaidStartDateHandler();
    this.setupDepartureDateStartAtHandler();
    
    this.handlersSetup = true;
  }

  //#endregion

  //#region Form Value Change Handlers
  setupPropertySelectionHandler(): void {
    this.form.get('propertyId')?.valueChanges.subscribe(propertyId => {
      this.selectedProperty = propertyId ? this.properties.find(p => p.propertyId === propertyId) || null : null;
      this.selectedOffice = this.offices.find(o => o.officeId === this.selectedProperty.officeId) || null;
      // Load cost codes when office is set
      if (this.selectedOffice) {
        this.loadCostCodes();
      }
      if(this.reservation?.contactId)
        this.selectedContact = this.contacts.find(c => c.contactId == this.reservation.contactId)

      const propertyAddress = this.selectedProperty?.shortAddress || '';
      const propertyCode = this.selectedProperty?.propertyCode || '';
      this.form.patchValue({ 
        propertyAddress: propertyAddress,
        propertyCode: propertyCode
      }, { emitEvent: false });
     
      // Property affects the deposit and billing amounts
      this.updateDepositValues();
      this.updateBillingValues();
      this.updateDepartureFeeValue();
      this.updatePetFields();
      this.updateMaidServiceFields();
    });
  }

  setupContactSelectionHandler(): void {
    this.form.get('contactId')?.valueChanges.subscribe(contactId => {
      this.selectedContact = contactId ? this.contacts.find(c => c.contactId === contactId) || null : null;
      this.updateContactFields();
    });
  }

  setupReservationTypeHandler(): void {
    this.form.get('reservationTypeId')?.valueChanges.subscribe(reservationTypeId => {
      // Filter statuses and contacts based on reservation type
      this.updateReservationStatusesByReservationType();
      this.updateContactsByReservationType();
      this.updateEnabledFieldsByReservationType();

       // Always clear reservation status when type changes
      this.form.patchValue({ reservationStatusId: null }, { emitEvent: false });
      
      // When reservation type changes, always clear contact-related fields
      this.form.patchValue({ 
        phone: '',
        email: '',
        entityCompanyName: '',
        tenantName: '',
        contactId: ''
      }, { emitEvent: false });
      
      // Clear selected contact reference and entity names
      this.selectedContact = null;
      this.selectedCompanyName = '';
    });
  }
    
  setupDepositHandlers(): void {
    this.form.get('depositType')?.valueChanges.subscribe(() => {
      this.updateDepositValues();
    });
  }

  setupBillingTypeHandler(): void {
    this.form.get('billingTypeId')?.valueChanges.subscribe(billingTypeId => {
      this.updateBillingValues();
    });
  }

  setupPetFeeHandler(): void {
    this.form.get('pets')?.valueChanges.subscribe(pets => {
      this.updatePetFields();
    });
  }

  updateMaidStartDate(): void {
    const arrivalDate = this.form.get('arrivalDate')?.value;
    const maidStartDateControl = this.form.get('maidStartDate');
    
    // Always update maidStartDate to arrivalDate + 7 days when arrivalDate changes
    // (field will be disabled/grayed out if maidService is false)
    if (arrivalDate && maidStartDateControl) {
      const arrival = new Date(arrivalDate);
      const arrivalPlus7Days = new Date(arrival);
      arrivalPlus7Days.setDate(arrivalPlus7Days.getDate() + 7);
      const currentMaidStartDate = maidStartDateControl.value ? new Date(maidStartDateControl.value) : null;
      
      // If maidStartDate is null or before arrivalDate, set it to arrivalDate + 7 days
      if (!currentMaidStartDate || currentMaidStartDate < arrival) {
        maidStartDateControl.setValue(arrivalPlus7Days, { emitEvent: false });
      }
    }
  }

  setupMaidServiceHandler(): void {
    this.form.get('maidService')?.valueChanges.subscribe(maidService => {
      this.updateMaidServiceFields();
      
      // When maidService becomes enabled, initialize maidStartDate if arrivalDate exists
      if (maidService) {
        this.updateMaidStartDate();
      }
    });
  }

  setupMaidStartDateHandler(): void {
    this.form.get('arrivalDate')?.valueChanges.subscribe(() => {
      this.updateMaidStartDate();
    });
  }

  setupDepartureDateStartAtHandler(): void {
    this.form.get('arrivalDate')?.valueChanges.subscribe(arrivalDate => {
      const departureDate = this.form.get('departureDate')?.value;
      
      // If arrival date is set and departure date is unset, start calendar at arrival date
      if (arrivalDate && !departureDate) {
        this.departureDateStartAt = new Date(arrivalDate);
      } else if (!arrivalDate) {
        this.departureDateStartAt = null;
      }
    });
  }


  initializeEnums(): void {
    this.availableClientTypes = getReservationTypes();
    this.allReservationStatuses = getReservationStatuses();
    // Initialize with all statuses, will be filtered based on reservation type
    this.updateReservationStatusesByReservationType();
    this.checkInTimes = getCheckInTimes();
    this.checkOutTimes = getCheckOutTimes();
    this.availableBillingTypes = getBillingTypes();
    this.availableBillingMethods = getBillingMethods();
    this.availableProrateTypes = getProrateTypes();
    this.availableFrequencies = getFrequencies();
    this.availableReservationNotices = getReservationNotices();
    this.availableDepositTypes = getDepositTypes();
  }
  //#endregion

  //#region Dynamic Form Adjustment Methods
  updateContactsByReservationType(): void {
    if (!this.form) {
       return;
    }

    const reservationTypeId = this.form.get('reservationTypeId')?.value as number;
    const contactId = this.form.get('contactId')?.value || this.reservation?.contactId;

    if (reservationTypeId === ReservationType.Private) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Tenant);
    else if (reservationTypeId === ReservationType.Corporate) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Company);
    else if (reservationTypeId === ReservationType.Owner) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Owner);
    else
      this.filteredContacts = this.contacts;
    
    if (contactId)  {
      this.updateContactFields();
    }
  }

  updateReservationStatusesByReservationType(): void {
    if (!this.form) {
      this.availableReservationStatuses = this.allReservationStatuses;
      return;
    }

    const reservationTypeId = this.form.get('reservationTypeId')?.value ?? null as number | null;
   
    if (reservationTypeId === ReservationType.Owner) {
      // For Owner type: show only Owner Blocked and Maintenance (in that order - Owner Blocked first)
      this.availableReservationStatuses = [
        { value: ReservationStatus.OwnerBlocked, label: 'Owner Blocked' },
        { value: ReservationStatus.Maintenance, label: 'Maintenance' }
      ];
    } else {
      // For all other types: show everything EXCEPT Maintenance and Owner Blocked
      this.availableReservationStatuses = this.allReservationStatuses.filter(status => 
        status.value !== ReservationStatus.Maintenance && 
        status.value !== ReservationStatus.OwnerBlocked
      );
    }
  }

  updateEnabledFieldsByReservationType(): void {
    const reservationTypeId = this.form.get('reservationTypeId')?.value ?? null as number | null;

    if (reservationTypeId === ReservationType.Owner) {
      // Make billing and fee fields readonly for Owner type
      this.disableFieldWithValidation('billingTypeId');
      this.disableFieldWithValidation('billingModelId');
      this.disableFieldWithValidation('billingRate');
      this.disableFieldWithValidation('depositType');      
      this.disableFieldWithValidation('deposit');
      this.disableFieldWithValidation('departureFee');
      this.disableFieldWithValidation('pets');
      this.disableFieldWithValidation('petFee');
      this.disableFieldWithValidation('numberOfPets');
      this.disableFieldWithValidation('petDescription');
      this.disableFieldWithValidation('maidService');
      this.disableFieldWithValidation('maidServiceFee');
      this.disableFieldWithValidation('frequencyId');
      this.disableFieldWithValidation('taxes');
    } else {
      // Enable fields for non-Owner types (with appropriate validators)
      this.enableFieldWithValidation('billingTypeId', [Validators.required]);
      this.enableFieldWithValidation('billingModelId', [Validators.required]);
      this.enableFieldWithValidation('billingRate', [Validators.required]);
      this.enableFieldWithValidation('depositType', [Validators.required]);
      this.enableFieldWithValidation('deposit', [Validators.required]);
      this.enableFieldWithValidation('departureFee', [Validators.required]);
      this.enableFieldWithValidation('taxes');
      this.enableFieldWithValidation('pets', [Validators.required]);      
      this.enableFieldWithValidation('maidService', [Validators.required]);      
      this.updatePetFields();
      this.updateMaidServiceFields();
      
      // Set departureDateStartAt if arrival date is set and departure date is unset
      const arrivalDate = this.form.get('arrivalDate')?.value;
      const departureDate = this.form.get('departureDate')?.value;
      if (arrivalDate && !departureDate) {
        this.departureDateStartAt = new Date(arrivalDate);
      }
    }
  }

  updateContactFields(): void {
    if (!this.selectedContact) {
      return;
    }

    // Phone and email remain disabled (read-only) - just update their values
    this.form.patchValue({
      phone: this.formatterService.phoneNumber(this.selectedContact.phone) || '',
      email: this.selectedContact.email || '',
    }, { emitEvent: false });
  
    // Update company name based on entityTypeId and entityId
    if (this.selectedContact.entityTypeId === EntityType.Company && this.selectedContact.entityId) {
      const company = this.companies.find(c => c.companyId === this.selectedContact.entityId);
      if (company) {
        this.selectedCompanyName = company.name;
        this.form.patchValue({ entityCompanyName: company.name}, { emitEvent: false });
      } else {
        this.selectedCompanyName = '';
        this.form.patchValue({ entityCompanyName: '' }, { emitEvent: false });
      }
    } else {
      this.selectedCompanyName = '';
      this.form.patchValue({ entityCompanyName: ''
      }, { emitEvent: false });
    }
    
    // If the reservation already has a tenantName, use this
    const tenantName = this.form.get('tenantName')?.value;
    if(tenantName === null || tenantName === undefined) {
      if (this.selectedContact.entityTypeId !== EntityType.Company) {
        const contactName = `${this.selectedContact.firstName || ''} ${this.selectedContact.lastName || ''}`.trim();
        this.form.patchValue({ tenantName: contactName }, { emitEvent: false });
      }
    }
 }

  updateDepositValues(): void {
    if (!this.selectedOffice) {
      return;
    }

    const depositControl = this.form.get('deposit')!;
    const depositType = this.form.get('depositType')!.value;

    let defaultDeposit = '0.00';
    if (depositType === DepositType.SDW) {
      defaultDeposit = this.selectedOffice.defaultSdw.toFixed(2);
    } else if (depositType === DepositType.Deposit) {
      defaultDeposit = this.selectedOffice.defaultDeposit.toFixed(2);
    }

    depositControl.setValue(defaultDeposit, { emitEvent: false });
  }

  updateBillingValues(): void {
    if (!this.selectedProperty) {
      return;
    }

    const billingControl = this.form.get('billingRate')!;
    const billingTypeId = this.form.get('billingTypeId')!.value;

    let billingRate: string;
    if (billingTypeId === BillingType.Monthly) {
      billingRate = this.selectedProperty.monthlyRate.toFixed(2);
    } else {
      billingRate = this.selectedProperty.dailyRate.toFixed(2);
    }

    billingControl.setValue(billingRate, { emitEvent: false });
  }

  updateDepartureFeeValue(): void {
    if (!this.selectedProperty) {
      return;
    }

    const departureControl = this.form.get('departureFee')!;
    const departureFee = this.selectedProperty.departureFee != null 
      ? this.selectedProperty.departureFee.toFixed(2) 
      : '0.00';
    departureControl.setValue(departureFee, { emitEvent: false });
  }

  updatePetFields(): void {
    const hasPets = this.form.get('pets')?.value ?? false;
    const petFeeControl = this.form.get('petFee');
    const numberOfPetsControl = this.form.get('numberOfPets');
    const petDescriptionControl = this.form.get('petDescription');
    
    if (hasPets === false) {
      petFeeControl.setValue('0.00', { emitEvent: false });
      this.disableFieldWithValidation('petFee');

      numberOfPetsControl.setValue(0, { emitEvent: false });
      this.disableFieldWithValidation('numberOfPets');
      
      petDescriptionControl.setValue('', { emitEvent: false });
      this.disableFieldWithValidation('petDescription');  
    } 
    else {
      // Only need selectedProperty when enabling fields
      if (!this.selectedProperty) {
        return;
      }
      
      const petFee = this.selectedProperty.petFee != null 
        ? this.selectedProperty.petFee.toFixed(2) 
        : '0.00';
      petFeeControl.setValue(petFee, { emitEvent: false });
      this.enableFieldWithValidation('petFee', [Validators.required]);
      
      numberOfPetsControl.setValue(1, { emitEvent: false });
      this.enableFieldWithValidation('numberOfPets', [Validators.required]);
      
      this.enableFieldWithValidation('petDescription', [Validators.required]);
    }
  }
  
  updateMaidServiceFields(): void {
    const hasMaidService = this.form.get('maidService')?.value ?? false;
    const maidServiceFeeControl = this.form.get('maidServiceFee');
    const frequencyControl = this.form.get('frequencyId');
    
    if (hasMaidService === false) {
      maidServiceFeeControl.setValue('0.00', { emitEvent: false });
      this.disableFieldWithValidation('maidServiceFee');
      
      frequencyControl.setValue(Frequency.NA, { emitEvent: false });
      this.disableFieldWithValidation('frequencyId');

      this.disableFieldWithValidation('maidStartDate');

    } 
    else {
      // Only need selectedProperty when enabling fields
      if (!this.selectedProperty) {
        return;
      }
      
      maidServiceFeeControl.setValue(this.selectedProperty.maidServiceFee.toFixed(2), { emitEvent: false });
      this.enableFieldWithValidation('maidServiceFee', [Validators.required]);

      // Only set frequency to OneTime if it's currently NA (don't override existing values from API)
      const currentFrequency = frequencyControl.value;
      if (currentFrequency === null || currentFrequency === undefined || currentFrequency === Frequency.NA) {
        frequencyControl.setValue(Frequency.OneTime, { emitEvent: false });
      }
      this.enableFieldWithValidation('frequencyId', [Validators.required]);

      this.enableFieldWithValidation('maidStartDate', [Validators.required]);
    }
  }
 
  //#endregion

  //#region ExtraFeeLines Management
  getExtraFeeFrequencyValue(frequencyId: number | undefined | null): number | null {
    if (frequencyId === undefined || frequencyId === null) {
      return null;
    }
    // Ensure it's a number and matches one of the available frequencies (Frequency enum)
    const numValue = Number(frequencyId);
    const isValidFrequency = this.availableFrequencies.some(f => f.value === numValue);
    return isValidFrequency ? numValue : null;
  }

  loadExtraFeeLines(): void {
    if (!this.reservation || !this.reservation.extraFeeLines) {
      this.extraFeeLines = [];
      return;
    }
    
    this.extraFeeLines = this.reservation.extraFeeLines.map(line => ({
      extraFeeLineId: line.extraFeeLineId,
      feeDescription: line.feeDescription,
      feeAmount: line.feeAmount,
      feeFrequencyId: line.feeFrequencyId !== null && line.feeFrequencyId !== undefined ? Number(line.feeFrequencyId) : undefined,
      costCodeId: line.costCodeId !== null && line.costCodeId !== undefined ? Number(line.costCodeId) : undefined,
      isNew: false
    }));
  }

  addExtraFeeLine(): void {
    const newLine: ExtraFeeLineDisplay = {
      extraFeeLineId: null,
      feeDescription: null,
      feeAmount: undefined,
      feeFrequencyId: undefined,
      costCodeId: undefined,
      isNew: true
    };
    this.extraFeeLines.push(newLine);
  }

  removeExtraFeeLine(index: number): void {
    if (index >= 0 && index < this.extraFeeLines.length) {
      this.extraFeeLines.splice(index, 1);
    }
  }

  updateExtraFeeLineField(index: number, field: keyof ExtraFeeLineDisplay, value: any): void {
    if (index >= 0 && index < this.extraFeeLines.length) {
      (this.extraFeeLines[index] as any)[field] = value;
    }
  }

  validateExtraFeeLines(): boolean {
    if (!this.extraFeeLines || this.extraFeeLines.length === 0) {
      return true; // Empty list is valid
    }

    for (let i = 0; i < this.extraFeeLines.length; i++) {
      const line = this.extraFeeLines[i];
      
      // Check if feeDescription is provided
      if (!line.feeDescription || line.feeDescription.trim() === '') {
        this.toastr.error(`Extra Fee Line ${i + 1}: Fee Description is required`, CommonMessage.Error);
        return false;
      }

      // Check if feeAmount is provided and greater than 0
      if (line.feeAmount === undefined || line.feeAmount === null || line.feeAmount <= 0) {
        this.toastr.error(`Extra Fee Line ${i + 1}: Fee Amount must be greater than 0`, CommonMessage.Error);
        return false;
      }

      // Check if feeFrequencyId is provided (must be a valid Frequency enum value)
      if (line.feeFrequencyId === undefined || line.feeFrequencyId === null) {
        this.toastr.error(`Extra Fee Line ${i + 1}: Frequency is required`, CommonMessage.Error);
        return false;
      }

      // Check if costCodeId is provided
      if (line.costCodeId === undefined || line.costCodeId === null) {
        this.toastr.error(`Extra Fee Line ${i + 1}: Cost Code is required`, CommonMessage.Error);
        return false;
      }
    }

    return true;
  }

  mapExtraFeeLinesToRequest(): ExtraFeeLineRequest[] {
    if (!this.extraFeeLines || this.extraFeeLines.length === 0) {
      return [];
    }

    return this.extraFeeLines.map(line => ({
      extraFeeLineId: line.extraFeeLineId || undefined,
      reservationId: this.isAddMode ? undefined : (this.reservationId || undefined),
      feeDescription: line.feeDescription || null,
      feeAmount: line.feeAmount || 0,
      feeFrequencyId: line.feeFrequencyId !== undefined && line.feeFrequencyId !== null ? Number(line.feeFrequencyId) : Frequency.OneTime,
      costCodeId: line.costCodeId !== undefined && line.costCodeId !== null ? Number(line.costCodeId) : 0
    }));
  }
  //#endregion

  //#region Data Load Methods
  loadContacts(): void {
    // Wait for contacts to be loaded initially, then subscribe to changes for updates
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe(contacts => {
        this.contacts = contacts || [];
       });
    });
  }


  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1)).subscribe({
      next: (organization: OrganizationResponse) => {
        this.organization = organization;
      },
      error: (err: HttpErrorResponse) => {
        // Organization is handled globally, just handle gracefully
      }
    });
  }
  
  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'); })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.agents = agents;
      },
      error: (err: HttpErrorResponse) => {
        this.agents = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load agents. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties: PropertyListResponse[]) => {
        this.properties = properties;
       },
      error: (err: HttpErrorResponse) => {
        this.properties = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load properties. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadCompanies(): void {
    this.companyService.getCompanies().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies'); })).subscribe({
      next: (companies: CompanyResponse[]) => {
        this.companies = companies;
      },
      error: (err: HttpErrorResponse) => {
        this.companies = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load companies. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes for updates
    // Offices are loaded globally on login, so we just subscribe to the global state
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe({
      next: () => {
        this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.selectedOffice = this.offices.find(o => o.officeId === this.selectedProperty?.officeId);
          // Load cost codes when office is selected
          if (this.selectedOffice) {
            this.loadCostCodes();
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        this.availableOffices = [];
        // Offices are handled globally, just handle gracefully
      }
    });
  }

  //#endregion

  //#region Validator Update Methods
  disableFieldWithValidation(controlName: string): void {
    const control = this.form?.get(controlName);
    if (control) {
      // Clear validators when disabling
      control.clearValidators();
      control.disable();
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  enableFieldWithValidation(controlName: string, validators?: any[]): void {
    const control = this.form?.get(controlName);
    if (control) {
      // Restore validators when enabling
      if (validators && validators.length > 0) {
        control.setValidators(validators);
      }
      control.enable({ emitEvent: false });
      control.updateValueAndValidity({ emitEvent: false });
    }
  }
  //#endregion

  // #region Date Validation Methods
  validateDates(offendingField: 'arrivalDate' | 'departureDate' | 'save'): void {
    const propertyId = this.form.get('propertyId')?.value;
    const arrivalDate = this.form.get('arrivalDate')?.value;
    const departureDate = this.form.get('departureDate')?.value;

    // Need property and both dates to check for overlaps
    if (!propertyId || !arrivalDate || !departureDate) {
      // If called from save and dates are missing, proceed with save (validation will catch it)
      if (offendingField === 'save') {
        this.performSave();
      }
      return;
    }

    // Convert dates to Date objects if they aren't already
    const arrival = arrivalDate instanceof Date ? new Date(arrivalDate) : new Date(arrivalDate);
    const departure = departureDate instanceof Date ? new Date(departureDate) : new Date(departureDate);

    // Reset time to compare dates only
    arrival.setHours(0, 0, 0, 0);
    departure.setHours(0, 0, 0, 0);

    // Get all reservations for this property
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1),catchError(() => of([] as ReservationResponse[]))
    ).subscribe(reservations => {
      // Filter out the current reservation if editing
      const otherReservations = reservations.filter(r => 
        !this.reservation || r.reservationId !== this.reservation.reservationId
      );

      // Check for overlaps
      const conflictingReservation = otherReservations.find(r => {
        if (!r.arrivalDate || !r.departureDate) {
          return false;
        }

        const rArrival = new Date(r.arrivalDate);
        const rDeparture = new Date(r.departureDate);
        rArrival.setHours(0, 0, 0, 0);
        rDeparture.setHours(0, 0, 0, 0);

        // Check if dates overlap
        // Overlap occurs if: (arrival <= rDeparture && departure >= rArrival)
        return arrival <= rDeparture && departure >= rArrival;
      });

      if (conflictingReservation) {
        const reservationCode = conflictingReservation.reservationCode || conflictingReservation.reservationId;
        
        if (offendingField === 'save') {
          // On save, clear both dates and prevent save
          this.showDateOverlapDialog(reservationCode, true);
        } else {
          // On date change, clear the offending date
          this.showDateOverlapDialog(reservationCode, false);
          this.clearOffendingDate(offendingField);
        }
      } else if (offendingField === 'save') {
        // No overlap, proceed with save
        this.performSave();
      }
    });
  }

  clearOffendingDate(field: 'arrivalDate' | 'departureDate'): void {
    if (field === 'arrivalDate') {
      this.form.patchValue({ arrivalDate: null }, { emitEvent: false });
      this.departureDateStartAt = null;
    } else if (field === 'departureDate') {
      this.form.patchValue({ departureDate: null }, { emitEvent: false });
    }
  }

  showDateOverlapDialog(reservationCode: string, resetDates: boolean = false): void {
    const dialogData: GenericModalData = {
      title: 'Date Conflict',
      message: `The selected dates overlap with an existing reservation.<br><div style="text-align: center; margin-top: 10px;"><strong>${reservationCode}</strong></div>`,
      icon: 'warning' as any,
      iconColor: 'warn',
      no: '',
      yes: 'OK',
      callback: (dialogRef, result) => {
        if (resetDates) {
          // Reset arrival and departure dates
          this.form.patchValue({
            arrivalDate: null,
            departureDate: null
          }, { emitEvent: false });
          this.departureDateStartAt = null;
        }
        dialogRef.close();
      },
      useHTML: true
    };

    this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });
  }
  //#endregion
 
  //#region Format Methods
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.form.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  onIntegerInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.form.get(fieldName)?.setValue(value, { emitEvent: false });
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  onExtraFeeAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.extraFeeLines[index];
    let value = input.value;
    
    // Check if value starts with minus sign
    const isNegative = value.startsWith('-');
    
    // Strip non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Allow negative sign if present
    if (isNegative) {
      value = '-' + value;
    }
    
    // Allow only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
  }

  onExtraFeeAmountFocus(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.extraFeeLines[index];
    // Set initial value on focus - show raw number without formatting (same as ledger line)
    if (line && line.feeAmount != null && line.feeAmount !== undefined) {
      input.value = line.feeAmount.toString();
      input.select(); // Select all text (same as selectAllOnFocus)
    } else {
      input.value = '';
    }
  }

  onExtraFeeAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.extraFeeLines[index];
    if (line) {
      // Check if value is negative
      const isNegative = input.value.startsWith('-');
      // Parse and format exactly like ledger line amount
      const rawValue = input.value.replace(/[^0-9.]/g, '').trim();
      let numValue: number;
      let formattedValue: string;
      
      if (rawValue !== '' && rawValue !== null) {
        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed)) {
          // Use sign from input (allow negative amounts)
          const finalValue = isNegative ? -parsed : parsed;
          // Format to 2 decimal places (same as ledger line)
          formattedValue = finalValue.toFixed(2);
          numValue = parseFloat(formattedValue);
        } else {
          formattedValue = '0.00';
          numValue = 0;
        }
      } else {
        formattedValue = '0.00';
        numValue = 0;
      }
      
      // Update the input display value
      input.value = formattedValue;
      
      // Update the model
      this.updateExtraFeeLineField(index, 'feeAmount', numValue);
    }
  }

  onExtraFeeAmountEnter(event: Event, index: number): void {
    // Prevent default form submission behavior
    event.preventDefault();
    // Blur the input to complete the edit (same as pressing Tab)
    const input = event.target as HTMLInputElement;
    input.blur();
  }
  //#endregion

  //#region Utility Methods
  loadCostCodes(): void {
    if (!this.selectedOffice) {
      this.chargeCostCodes = [];
      this.availableChargeCostCodes = [];
      return;
    }

    // Wait for cost codes to be loaded, then filter for charge types
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe({
      next: () => {
        this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(() => {
          // Get cost codes for the selected office and filter for charge types (non-payment)
          const costCodes = this.costCodesService.getCostCodesForOffice(this.selectedOffice!.officeId);
          this.chargeCostCodes = costCodes.filter(c => c.isActive && c.transactionTypeId !== TransactionType.Payment);
          this.availableChargeCostCodes = this.chargeCostCodes.map(c => ({
            value: parseInt(c.costCodeId, 10),
            label: `${c.costCode}: ${c.description}`
          }));
        });
      },
      error: (err: HttpErrorResponse) => {
        this.chargeCostCodes = [];
        this.availableChargeCostCodes = [];
      }
    });
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }

  onTabChange(event: any): void {
    // When Documents tab (index 3) is selected, reload the document list
    if (event.index === 3 && this.reservationDocumentList) {
      this.reservationDocumentList.reload();
    }
  }
  //#endregion
}
