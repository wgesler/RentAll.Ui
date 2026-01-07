import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter, BehaviorSubject, Observable, map, catchError, of } from 'rxjs';
import { ReservationService } from '../services/reservation.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ReservationResponse, ReservationRequest } from '../models/reservation-model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { AgentService } from '../../organization-configuration/agent/services/agent.service';
import { AgentResponse } from '../../organization-configuration/agent/models/agent.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { OfficeConfigurationService } from '../../organization-configuration/office-configuration/services/office-configuration.service';
import { OfficeConfigurationResponse } from '../../organization-configuration/office-configuration/models/office-configuration.model';
import { CompanyService } from '../../company/services/company.service';
import { CompanyResponse } from '../../company/models/company.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { CommonService } from '../../../services/common.service';
import { EntityType } from '../../contact/models/contact-type';
import { ReservationType, ReservationStatus, BillingType, Frequency, ReservationNotice, DepositType } from '../models/reservation-enum';
import { CheckinTimes, CheckoutTimes } from '../../property/models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { LeaseComponent } from '../lease/lease.component';
import { LeaseInformationComponent } from '../lease-information/lease-information.component';
import { MatDialog } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, LeaseComponent, LeaseInformationComponent],
  templateUrl: './reservation.component.html',
  styleUrl: './reservation.component.scss'
})

export class ReservationComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  reservationId: string;
  reservation: ReservationResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  propertyPanelOpen: boolean = true;
  billingPanelOpen: boolean = false;
  ReservationType = ReservationType; // Expose enum to template
  EntityType = EntityType; // Expose enum to template
  departureDateStartAt: Date | null = null;
  availableClientTypes: { value: number, label: string }[] = [];
  availableReservationStatuses: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];
  availableBillingTypes: { value: number, label: string }[] = [];
  availableFrequencies: { value: number, label: string }[] = [];
  availableReservationNotices: { value: number, label: string }[] = [];
  availableDepositTypes: { value: number, label: string }[] = [];
 
  organization: OrganizationResponse | null = null;
  agents: AgentResponse[] = [];
  companies: CompanyResponse[] = [];
  selectedCompanyName: string = '';
  contacts: ContactResponse[] = [];
  filteredContacts: ContactResponse[] = [];
  selectedContact: ContactResponse | null = null;
  properties: PropertyResponse[] = [];
  filteredProperties: PropertyResponse[] = [];
  selectedProperty: PropertyResponse | null = null;
  selectedOffice: OfficeResponse | null = null;
  selectedOfficeConfiguration: OfficeConfigurationResponse | null = null; 
 
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents', 'properties', 'companies', 'reservation']));
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
    private officeConfigurationService: OfficeConfigurationService,
    private commonService: CommonService,
    private authService: AuthService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private dialog: MatDialog
  ) {
  }

  //#region Reservation Page
  ngOnInit(): void {
    this.initializeEnums();
    this.loadOrganization();
    this.loadContacts();
    this.loadAgents();
    this.loadProperties();
    this.loadCompanies();
    
    // Initialize form immediately to prevent template errors
    this.buildForm();
    
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.reservationId = paramMap.get('id');
        this.isAddMode = this.reservationId === 'new';
        
        // Set accordion panel states based on mode
        if (this.isAddMode) {
          // Add mode: property open, billing closed
          this.propertyPanelOpen = true;
          this.billingPanelOpen = true;
          this.removeLoadItem('reservation');
          // Form already built, just need to reset it
          this.buildForm();
        } else {
          // Edit mode: property open, billing closed
          this.propertyPanelOpen = true;
          this.billingPanelOpen = false;
          this.getReservation();
        }
      } else {
        // No ID in route, initialize form for add mode
        this.isAddMode = true;
        this.propertyPanelOpen = true;
        this.billingPanelOpen = true;
        this.removeLoadItem('reservation');
        // Form already built
      }
    });
  }

  getReservation(): void {
    if (!this.reservationId || this.reservationId === 'new') {
      this.removeLoadItem('reservation');
      this.isServiceError = true;
      this.toastr.error('Invalid reservation ID', CommonMessage.Error);
      return;
    }

    // Ensure 'reservation' is in the loading set
    const currentSet = this.itemsToLoad$.value;
    if (!currentSet.has('reservation')) {
      const newSet = new Set(currentSet);
      newSet.add('reservation');
      this.itemsToLoad$.next(newSet);
    }

    this.reservationService.getReservationByGuid(this.reservationId).pipe(
      take(1),
      catchError((err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load reservation info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('reservation');
        return of(null); // Return a null observable to complete the stream
      }),
      finalize(() => { 
        this.removeLoadItem('reservation'); 
      })
    ).subscribe({
      next: (response: ReservationResponse | null) => {
        if (response) {
          this.reservation = response;
          this.buildForm();
          this.populateForm();
        }
      }
    });
  }

  saveReservation(): void {
    // Ensure contactId is disabled if reservationTypeId is not set
    const reservationTypeId = this.form.get('reservationTypeId')?.value;
    if (reservationTypeId === null || reservationTypeId === undefined || reservationTypeId === '') {
      this.disableFieldWithValidation('contactId');
      this.form.patchValue({ contactId: '' }, { emitEvent: false });
    }
    
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

    // Check for date overlaps before saving
    this.validateDates('save');
  }

  performSave(): void {
    this.isSubmitting = true;

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const reservationRequest: ReservationRequest = {
      organizationId: user?.organizationId || '',
      officeId: this.selectedProperty?.officeId || null,
      propertyId: formValue.propertyId,
      agentId: formValue.agentId || null,
      contactId: formValue.contactId,
      reservationTypeId: formValue.reservationTypeId !== null && formValue.reservationTypeId !== undefined ? Number(formValue.reservationTypeId) : ReservationType.Private,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      reservationNoticeId: formValue.reservationNoticeId ?? null,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 1,
      hasPets: formValue.pets ?? false,
      tenantName: formValue.tenantName || '',
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : new Date().toISOString(),
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : new Date().toISOString(),
      checkInTimeId: this.utilityService.normalizeCheckInTimeId(formValue.checkInTimeId),
      checkOutTimeId: this.utilityService.normalizeCheckOutTimeId(formValue.checkOutTimeId),
      billingTypeId: formValue.billingTypeId ?? BillingType.Monthly,
      billingRate: formValue.billingRate ? parseFloat(formValue.billingRate.toString()) : 0,
      deposit: formValue.deposit ? parseFloat(formValue.deposit.toString()) : null,
      depositTypeId: formValue.depositType !== null && formValue.depositType !== undefined ? Number(formValue.depositType) : undefined,
      departureFee: formValue.departureFee ? parseFloat(formValue.departureFee.toString()) : 0,
      maidService: formValue.maidService ?? false,
      maidServiceFee: formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0,
      frequencyId: formValue.frequencyId ?? Frequency.NA,
      petFee: formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0,
      numberOfPets: formValue.numberOfPets ? Number(formValue.numberOfPets) : undefined,
      petDescription: formValue.petDescription || undefined,
      extraFee: formValue.extraFee ? parseFloat(formValue.extraFee.toString()) : 0,
      extraFeeName: formValue.extraFeeName || '',
      extraFee2: formValue.extraFee2 ? parseFloat(formValue.extraFee2.toString()) : 0,
      extraFee2Name: formValue.extraFee2Name || '',
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
      notes: formValue.notes !== null && formValue.notes !== undefined ? String(formValue.notes) : '',
      allowExtensions: formValue.allowExtensions ?? false,
      isActive: formValue.isActive ?? true
    };

    if (!this.isAddMode) {
      reservationRequest.reservationId = this.reservationId;
      reservationRequest.organizationId = this.reservation?.organizationId || user?.organizationId || '';
      reservationRequest.reservationCode = this.reservation?.reservationCode || formValue.reservationCode || '';
    }

    const save$ = this.isAddMode
      ? this.reservationService.createReservation(reservationRequest)
      : this.reservationService.updateReservation(this.reservationId, reservationRequest);

    save$.pipe(take(1),  finalize(() => this.isSubmitting = false) ).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Reservation created successfully' : 'Reservation updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.ReservationList);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
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
      reservationCode: new FormControl({ value: '', disabled: true }), // Read-only, only shown in Edit Mode
      propertyCode: new FormControl({ value: '', disabled: true }), // Read-only
      propertyId: new FormControl('', [Validators.required]),
      propertyAddress: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      agentId: new FormControl(null, [Validators.required]),
      tenantName: new FormControl('', [Validators.required]), // Always enabled
      contactId: new FormControl({ value: '', disabled: true }), // No validators - will be added when enabled
      entityCompanyName: new FormControl({ value: '', disabled: true }), // Display Company name if EntityTypeId is Company
      reservationTypeId: new FormControl(null, [Validators.required]),
      reservationStatusId: new FormControl(null, [Validators.required]),
      reservationNoticeId: new FormControl(null, [Validators.required]),
      isActive: new FormControl(true),
      allowExtensions: new FormControl(true),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl<number>(CheckinTimes.NA, [Validators.required]),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.NA, [Validators.required]),
      billingTypeId: new FormControl(BillingType.Monthly, [Validators.required]),
      billingRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(1, [Validators.required]),
      pets: new FormControl(false, [Validators.required]),
      petFee: new FormControl<string>('0.00'),
      numberOfPets: new FormControl(0),
      petDescription: new FormControl(''),
      maidService: new FormControl(false, [Validators.required]),
      phone: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      email: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      depositType: new FormControl(DepositType.Deposit, [Validators.required]),
      deposit: new FormControl<string>(this.getDefaultDeposit()),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00'),
      frequencyId: new FormControl(Frequency.NA),
      extraFee: new FormControl<string>('0.00'),
      extraFeeName: new FormControl(''),
      extraFee2: new FormControl<string>('0.00'),
      extraFee2Name: new FormControl(''),
      taxes: new FormControl(null),
      notes: new FormControl('')
    });

    // Setup all form value change handlers
    this.setupPropertySelectionHandler();
    this.setupArrivalDateHandler();
    this.setupDepartureDateHandler();
    this.setupContactSelectionHandler();
    this.setupReservationTypeHandler();
    this.setupFrequencyHandler();
    this.setupDepositHandlers();
    this.setupPetsHandler();
    this.setupMaidServiceHandler();
    this.setupExtraFeeHandlers();
    this.setupBillingTypeHandler();
    
    // Initialize field states
    this.initializeFieldStates();
  }

  populateForm(): void {
    if (!this.reservation || !this.form) {
      return;
    }
    
    const reservation = this.reservation;
    
    // Find and set selected property
    this.selectedProperty = this.properties.find(p => p.propertyId === reservation.propertyId) || null;
    const propertyAddress = this.selectedProperty 
      ? `${this.selectedProperty.address1}${this.selectedProperty.suite ? ' ' + this.selectedProperty.suite : ''}`.trim()
      : '';
    const propertyCode = this.selectedProperty?.propertyCode || '';
    
    // Load office and office configuration from property's officeId
    if (this.selectedProperty && this.selectedProperty.officeId) {
      this.loadOffice(this.selectedProperty.officeId);
      this.loadOfficeConfiguration(this.selectedProperty.officeId);
    }
    
    // Filter contacts based on reservation type
    this.filterContactsByClientType(reservation.reservationTypeId);
    
    // Update available reservation statuses based on reservation type
    this.updateAvailableReservationStatuses(reservation.reservationTypeId);
    
    // Enable contactId field
    this.enableFieldWithValidation('contactId', [Validators.required]);
    
    // Update tenantName validator based on reservation type
    this.updateTenantNameValidator(reservation.reservationTypeId);
    
    // Determine numberOfPeople value - if Owner type, set to 0
    let numberOfPeopleValue = reservation.numberOfPeople === 0 ? 1 : reservation.numberOfPeople;
    if (reservation.reservationTypeId === ReservationType.Owner) {
      numberOfPeopleValue = 0;
    }
    
    // Convert isActive from number to boolean if needed
    const isActiveValue = typeof reservation.isActive === 'number' 
      ? reservation.isActive === 1 
      : Boolean(reservation.isActive);
    
    // Populate read-only fields first (no handlers for these)
            this.form.patchValue({ 
      reservationCode: reservation.reservationCode || '',
      propertyCode: propertyCode,
      propertyAddress: propertyAddress
            }, { emitEvent: false });
    
    // Set fields with handlers in the correct order (emitEvent: true to trigger handlers)
    // Order matters: propertyId first, then reservationTypeId (affects contact filtering), then contactId   
    this.form.get('propertyId')?.setValue(reservation.propertyId, { emitEvent: true });
    this.form.get('reservationTypeId')?.setValue(reservation.reservationTypeId, { emitEvent: true });
    this.form.get('reservationNoticeId')?.setValue(reservation.reservationNoticeId, { emitEvent: false });
    this.form.get('billingTypeId')?.setValue(reservation.billingTypeId ?? BillingType.Monthly, { emitEvent: true });
    this.form.get('depositType')?.setValue(reservation.depositTypeId ?? DepositType.Deposit, { emitEvent: true });
    this.form.get('pets')?.setValue(reservation.hasPets ?? false, { emitEvent: true });
    this.form.get('maidService')?.setValue(reservation.maidService , { emitEvent: true });
    this.form.get('frequencyId')?.setValue(reservation.frequencyId ?? Frequency.NA, { emitEvent: true });
    this.form.get('extraFee')?.setValue((reservation.extraFee ?? 0).toFixed(2), { emitEvent: true });
    this.form.get('extraFee2')?.setValue((reservation.extraFee2 ?? 0).toFixed(2), { emitEvent: true });

    if (reservation.contactId) {
      this.form.get('contactId')?.setValue(reservation.contactId, { emitEvent: true });
    }
    
    if (reservation.arrivalDate) {
      this.form.get('arrivalDate')?.setValue(new Date(reservation.arrivalDate), { emitEvent: true });
    }
    
    if (reservation.departureDate) {
      this.form.get('departureDate')?.setValue(new Date(reservation.departureDate), { emitEvent: false });
    }
    
   if (reservation.deposit !== null && reservation.deposit !== undefined) {
      this.form.get('deposit')?.setValue(reservation.deposit.toFixed(2), { emitEvent: true });
    }
    
    // Set fields without handlers (no emitEvent needed)
    // Note: reservationTypeId and reservationNoticeId are already set above with emitEvent: true
    this.form.patchValue({ 
      agentId: reservation.agentId || null,
      tenantName: reservation.tenantName || '',
      reservationStatusId: reservation.reservationStatusId,
      isActive: isActiveValue,
      allowExtensions: reservation.allowExtensions ?? true,
      checkInTimeId: this.utilityService.normalizeCheckInTimeId(reservation.checkInTimeId),
      checkOutTimeId: this.utilityService.normalizeCheckOutTimeId(reservation.checkOutTimeId),
      billingRate: (reservation.billingRate ?? 0).toFixed(2),
      numberOfPeople: numberOfPeopleValue,
      departureFee: (reservation.departureFee ?? 0).toFixed(2),
      maidServiceFee: (reservation.maidServiceFee ?? 0).toFixed(2),
      petFee: (reservation.petFee ?? 0).toFixed(2),
      numberOfPets: reservation.hasPets ? (reservation.numberOfPets ?? 1) : 0,
      petDescription: reservation.petDescription || '',
      extraFeeName: reservation.extraFeeName || '',
      extraFee2Name: reservation.extraFee2Name || '',
      taxes: reservation.taxes === 0 ? null : reservation.taxes,
      notes: reservation.notes || ''
        }, { emitEvent: false });
  }
  //#endregion

  //#region Form Value Change Handlers
  setupPropertySelectionHandler(): void {
    this.form.get('propertyId')?.valueChanges.subscribe(propertyId => {
      if (propertyId) {
        this.selectedProperty = this.properties.find(p => p.propertyId === propertyId) || null;
        const propertyAddress = this.selectedProperty ? `${this.selectedProperty.address1}${this.selectedProperty.suite ? ' ' + this.selectedProperty.suite : ''}`.trim() : '';
        const propertyCode = this.selectedProperty?.propertyCode || '';
        
        // Pre-load property values into form fields
        const patchValues: any = {
          propertyCode: propertyCode,
          propertyAddress: propertyAddress
        };
        
        if (this.selectedProperty) {
          // Load office and office configuration based on property's officeId
          if (this.selectedProperty.officeId) {
            this.loadOffice(this.selectedProperty.officeId);
            this.loadOfficeConfiguration(this.selectedProperty.officeId);
          }
          
          // Set Billing Rate based on current Billing Type
          const currentBillingTypeId = this.form.get('billingTypeId')?.value ?? BillingType.Monthly;
          if (currentBillingTypeId === BillingType.Monthly) {
            // Use Monthly Rate
          if (this.selectedProperty.monthlyRate !== null && this.selectedProperty.monthlyRate !== undefined) {
            patchValues.billingRate = this.selectedProperty.monthlyRate.toFixed(2);
          } else {
            patchValues.billingRate = '0.00';
            }
          } else if (currentBillingTypeId === BillingType.Daily || currentBillingTypeId === BillingType.Nightly) {
            // Use Daily Rate for both Daily and Nightly
            if (this.selectedProperty.dailyRate !== null && this.selectedProperty.dailyRate !== undefined) {
              patchValues.billingRate = this.selectedProperty.dailyRate.toFixed(2);
            } else {
              patchValues.billingRate = '0.00';
            }
          } else {
            // Default to Monthly Rate if billing type is unknown
            if (this.selectedProperty.monthlyRate !== null && this.selectedProperty.monthlyRate !== undefined) {
              patchValues.billingRate = this.selectedProperty.monthlyRate.toFixed(2);
            } else {
              patchValues.billingRate = '0.00';
            }
          }
          
          // Pre-load departure fee
          if (this.selectedProperty.departureFee !== null && this.selectedProperty.departureFee !== undefined) {
            patchValues.departureFee = this.selectedProperty.departureFee.toFixed(2);
          }
          
          // Pre-load pet fee if pets is Yes
          const currentPets = this.form.get('pets')?.value;
          if (currentPets === true && this.selectedProperty.petFee !== null && this.selectedProperty.petFee !== undefined) {
            patchValues.petFee = this.selectedProperty.petFee.toFixed(2);
          }
          
          // Pre-load maid service fee if MaidService is Yes
          const currentMaidService = this.form.get('maidService')?.value;
          if (currentMaidService === true && this.selectedProperty.maidServiceFee !== null && this.selectedProperty.maidServiceFee !== undefined) {
            patchValues.maidServiceFee = this.selectedProperty.maidServiceFee.toFixed(2);
          }
          
          // Pre-load deposit
          patchValues.depositTypeId = DepositType.Deposit;
          patchValues.deposit = this.getDefaultDeposit();
          
          // Pre-load taxes (default to null if not available on property)
          patchValues.taxes = null;
          
          // Pre-load check-in time from property (defaults to FourPM if property doesn't have one)
          const checkInTime = this.utilityService.normalizeCheckInTimeId(this.selectedProperty.checkInTimeId);
          patchValues.checkInTimeId = checkInTime !== CheckinTimes.NA ? checkInTime : CheckinTimes.FourPM;
          
          // Pre-load check-out time from property (defaults to ElevenAM if property doesn't have one)
          const checkOutTime = this.utilityService.normalizeCheckOutTimeId(this.selectedProperty.checkOutTimeId);
          patchValues.checkOutTimeId = checkOutTime !== CheckoutTimes.NA ? checkOutTime : CheckoutTimes.ElevenAM;
          
          // If Reservation Type is Owner, populate Tenant Name with Owner1's name
          const reservationTypeId = this.form.get('reservationTypeId')?.value;
          if (reservationTypeId === ReservationType.Owner && this.selectedProperty.owner1Id) {
            const owner1 = this.contacts.find(c => c.contactId === this.selectedProperty.owner1Id);
            if (owner1) {
              patchValues.tenantName = `${owner1.firstName} ${owner1.lastName}`.trim();
            }
          }
        }
        
        this.form.patchValue(patchValues, { emitEvent: false });
        
        // Update tenantName validation if it was auto-populated
        if (patchValues.tenantName) {
          const tenantNameControl = this.form.get('tenantName');
          if (tenantNameControl) {
            tenantNameControl.updateValueAndValidity({ emitEvent: false });
          }
        }
      } else {
        this.selectedProperty = null;
        this.form.patchValue({ propertyCode: '', propertyAddress: '' }, { emitEvent: false });
      }
    });
  }

  setupArrivalDateHandler(): void {
    this.form.get('arrivalDate')?.valueChanges.subscribe(arrivalDate => {
      if (arrivalDate && arrivalDate instanceof Date) {
        this.departureDateStartAt = new Date(arrivalDate);
      } else if (arrivalDate) {
        this.departureDateStartAt = new Date(arrivalDate);
      } else {
        this.departureDateStartAt = null;
      }
      
      // Check for date overlaps when arrival date changes
      this.validateDates('arrivalDate');
    });
  }

  setupDepartureDateHandler(): void {
    this.form.get('departureDate')?.valueChanges.subscribe(() => {
      // Check for date overlaps when departure date changes
      this.validateDates('departureDate');
    });
  }

  setupContactSelectionHandler(): void {
    this.form.get('contactId')?.valueChanges.subscribe(contactId => {
      if (contactId) {
        const contact = this.filteredContacts.find(c => c.contactId === contactId) || 
                        this.contacts.find(c => c.contactId === contactId);
        if (contact) {
          this.selectedContact = contact;
          this.updateContactFields(contact);
          this.updateEntityNames(contact);
          
          // Update tenant name if contact type is NOT company
          if (contact.entityTypeId !== EntityType.Company) {
            const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
            if (contactName) {
              this.form.patchValue({ tenantName: contactName }, { emitEvent: false });
              // Update validation to ensure the field passes validation
              const tenantNameControl = this.form.get('tenantName');
              if (tenantNameControl) {
                tenantNameControl.updateValueAndValidity({ emitEvent: false });
              }
            }
          }
        }
      } else {
        this.selectedContact = null;
        this.form.patchValue({ 
          phone: '',
          email: '',
          entityCompanyName: ''
        }, { emitEvent: false });
        this.selectedCompanyName = '';
      }
    });
  }

  setupReservationTypeHandler(): void {
    this.form.get('reservationTypeId')?.valueChanges.subscribe(reservationTypeId => {
      const selectedReservationType = reservationTypeId;
      
      // Filter contacts based on reservation type
      this.filterContactsByClientType(selectedReservationType);
      this.updateTenantNameValidator(selectedReservationType);
      
      // Enable contactId field only when a valid reservation type is selected
      // Check for null, undefined, and empty string
      if (selectedReservationType !== null && selectedReservationType !== undefined && selectedReservationType !== '') {
        this.enableFieldWithValidation('contactId', [Validators.required]);
      } else {
        this.disableFieldWithValidation('contactId');
      }
      
      // Update available reservation statuses and reset the field
      this.updateAvailableReservationStatuses(selectedReservationType);
      // Always clear reservation status when type changes
      this.form.patchValue({ reservationStatusId: null }, { emitEvent: false });
      
      // When reservation type changes, always clear contact-related fields
      // This happens every time the type changes, not just when clearing
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
      
      // Handle Owner type field disabling/enabling
      if (selectedReservationType === ReservationType.Owner) {
        // Make billing and fee fields readonly for Owner type
        this.disableFieldWithValidation('checkInTimeId');
        this.disableFieldWithValidation('checkOutTimeId');
        this.disableFieldWithValidation('billingTypeId');
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
        this.disableFieldWithValidation('extraFee');
        this.disableFieldWithValidation('extraFeeName');
        this.disableFieldWithValidation('extraFee2');
        this.disableFieldWithValidation('extraFee2Name');
        this.disableFieldWithValidation('taxes');
      } else {
        // Enable fields for non-Owner types (with appropriate validators)
        this.enableFieldWithValidation('checkInTimeId', [Validators.required]);
        this.enableFieldWithValidation('checkOutTimeId', [Validators.required]);
        this.enableFieldWithValidation('billingTypeId', [Validators.required]);
        this.enableFieldWithValidation('billingRate', [Validators.required]);
        this.enableFieldWithValidation('depositType', [Validators.required]);
        this.enableFieldWithValidation('deposit', [Validators.required]);
        this.enableFieldWithValidation('departureFee', [Validators.required]);
        this.enableFieldWithValidation('pets', [Validators.required]);
        this.enableFieldWithValidation('maidService', [Validators.required]);
        this.enableFieldWithValidation('taxes');
        // Other fields like deposit, petFee, maidServiceFee, extraFee are handled by their respective handlers
      }
    });
  }

  setupFrequencyHandler(): void {
    this.form.get('frequencyId')?.valueChanges.subscribe(frequencyId => {
      const maidServiceFeeControl = this.form.get('maidServiceFee');
      
      // If Frequency goes back to NA, clear the Maid Service Fee
      if (frequencyId === null || frequencyId === undefined || frequencyId === Frequency.NA) {
        if (maidServiceFeeControl) {
          maidServiceFeeControl.setValue('0.00', { emitEvent: false });
        }
      }
      
      this.updateMaidServiceFeeValidator(frequencyId);
    });
  }
    
  setupDepositHandlers(): void {
    this.form.get('depositType')?.valueChanges.subscribe(depositType => {
      this.updateDepositValidator(depositType);
    });
    
    // Also validate when deposit value changes
    this.form.get('deposit')?.valueChanges.subscribe(() => {
      const depositType = this.form.get('depositType')?.value;
      this.updateDepositValidator(depositType);
    });
  }

  setupPetsHandler(): void {
    this.form.get('pets')?.valueChanges.subscribe(hasPets => {
      const petFeeControl = this.form.get('petFee');
      const numberOfPetsControl = this.form.get('numberOfPets');
      const petDescriptionControl = this.form.get('petDescription');
      
      if (hasPets === false) {
        // Disable pet-related fields when pets is NO and reset values
        if (petFeeControl) {
          petFeeControl.setValue('0.00', { emitEvent: false });
          petFeeControl.disable({ emitEvent: false });
          petFeeControl.clearValidators();
          petFeeControl.updateValueAndValidity({ emitEvent: false });
        }
        if (numberOfPetsControl) {
          numberOfPetsControl.setValue(0, { emitEvent: false });
          numberOfPetsControl.disable({ emitEvent: false });
          numberOfPetsControl.clearValidators();
          numberOfPetsControl.updateValueAndValidity({ emitEvent: false });
        }
        if (petDescriptionControl) {
          petDescriptionControl.setValue('', { emitEvent: false });
          petDescriptionControl.disable({ emitEvent: false });
          petDescriptionControl.clearValidators();
          petDescriptionControl.updateValueAndValidity({ emitEvent: false });
        }
      } else {
        // Enable pet-related fields when pets is YES and set default values
        if (petFeeControl) {
          // Set pet fee from selected property if available, otherwise keep current value
          if (this.selectedProperty && this.selectedProperty.petFee !== null && this.selectedProperty.petFee !== undefined) {
            petFeeControl.setValue(this.selectedProperty.petFee.toFixed(2), { emitEvent: false });
          }
          petFeeControl.enable({ emitEvent: false });
          petFeeControl.setValidators([Validators.required]);
          petFeeControl.updateValueAndValidity({ emitEvent: false });
        }
        if (numberOfPetsControl) {
          // Only set to 1 if current value is 0 (to avoid overwriting user input)
          const currentValue = numberOfPetsControl.value;
          if (!currentValue || currentValue === 0) {
            numberOfPetsControl.setValue(1, { emitEvent: false });
          }
          numberOfPetsControl.enable({ emitEvent: false });
          numberOfPetsControl.setValidators([Validators.required]);
          numberOfPetsControl.updateValueAndValidity({ emitEvent: false });
        }
        if (petDescriptionControl) {
          petDescriptionControl.enable({ emitEvent: false });
          petDescriptionControl.setValidators([Validators.required]);
          petDescriptionControl.updateValueAndValidity({ emitEvent: false });
        }
      }
    });
  }

  setupMaidServiceHandler(): void {
    this.form.get('maidService')?.valueChanges.subscribe(hasMaidService => {
      this.updateMaidServiceFields(hasMaidService);
    });

    // Also validate frequency when it changes
    this.form.get('frequencyId')?.valueChanges.subscribe(() => {
      const hasMaidService = this.form.get('maidService')?.value;
      this.updateMaidServiceFields(hasMaidService);
    });
  }

  setupExtraFeeHandlers(): void {
    // Update Extra Fee fields based on ExtraFee1 value
    this.form.get('extraFee')?.valueChanges.subscribe(extraFeeValue => {
      const extraFeeNameControl = this.form.get('extraFeeName');
      const extraFee2Control = this.form.get('extraFee2');
      const extraFee2NameControl = this.form.get('extraFee2Name');
      
      const extraFeeNum = extraFeeValue ? parseFloat(extraFeeValue.toString()) : 0;
      
      if (extraFeeNum === 0 || isNaN(extraFeeNum)) {
        // Disable Extra Fee 1 Name, Extra Fee 2, and Extra Fee 2 Name
        if (extraFeeNameControl) {
          extraFeeNameControl.disable({ emitEvent: false });
          extraFeeNameControl.clearValidators();
          extraFeeNameControl.updateValueAndValidity({ emitEvent: false });
        }
        if (extraFee2Control) {
          extraFee2Control.disable({ emitEvent: false });
          // Also set extraFee2 to 0
          extraFee2Control.setValue('0.00', { emitEvent: false });
        }
        if (extraFee2NameControl) {
          extraFee2NameControl.disable({ emitEvent: false });
          extraFee2NameControl.clearValidators();
          extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
        }
      } else {
        // Enable Extra Fee 1 Name (required) and Extra Fee 2
        if (extraFeeNameControl) {
          extraFeeNameControl.enable({ emitEvent: false });
          extraFeeNameControl.setValidators([Validators.required]);
          extraFeeNameControl.updateValueAndValidity({ emitEvent: false });
        }
        if (extraFee2Control) {
          extraFee2Control.enable({ emitEvent: false });
        }
        // Extra Fee 2 Name depends on ExtraFee2 value, handled below
      }
    });

    // Update Extra Fee 2 Name based on ExtraFee2 value
    this.form.get('extraFee2')?.valueChanges.subscribe(extraFee2Value => {
      const extraFee2NameControl = this.form.get('extraFee2Name');
      
      if (extraFee2NameControl) {
        const extraFee2Num = extraFee2Value ? parseFloat(extraFee2Value.toString()) : 0;
        
        if (extraFee2Num > 0 && !isNaN(extraFee2Num)) {
          // Enable and make required when Extra Fee 2 > 0
          extraFee2NameControl.enable({ emitEvent: false });
          extraFee2NameControl.setValidators([Validators.required]);
        } else {
          // Disable when Extra Fee 2 is 0 or invalid
          extraFee2NameControl.disable({ emitEvent: false });
          extraFee2NameControl.clearValidators();
        }
        extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
      }
    });
  }

  setupBillingTypeHandler(): void {
    this.form.get('billingTypeId')?.valueChanges.subscribe(billingTypeId => {
      if (this.selectedProperty && billingTypeId !== null && billingTypeId !== undefined) {
        if (billingTypeId === BillingType.Monthly) {
          // Use Monthly Rate
          if (this.selectedProperty.monthlyRate !== null && this.selectedProperty.monthlyRate !== undefined) {
            this.form.get('billingRate')?.setValue(this.selectedProperty.monthlyRate.toFixed(2), { emitEvent: false });
          }
        } else if (billingTypeId === BillingType.Daily || billingTypeId === BillingType.Nightly) {
          // Use Daily Rate for both Daily and Nightly
          if (this.selectedProperty.dailyRate !== null && this.selectedProperty.dailyRate !== undefined) {
            this.form.get('billingRate')?.setValue(this.selectedProperty.dailyRate.toFixed(2), { emitEvent: false });
          }
        }
      }
    });
  }

  initializeFieldStates(): void {
    // Initialize maidService fields based on initial maidService value
    const initialMaidService = this.form.get('maidService')?.value;
    this.updateMaidServiceFields(initialMaidService);

    // Initialize deposit field state based on initial depositType value
    const initialDepositType = this.form.get('depositType')?.value;
    this.updateDepositValidator(initialDepositType);

    // Initialize pets field states
    const initialPets = this.form.get('pets')?.value;
    const petFeeControlInit = this.form.get('petFee');
    const numberOfPetsControlInit = this.form.get('numberOfPets');
    const petDescriptionControlInit = this.form.get('petDescription');
    
    if (initialPets === false) {
      // Set values to defaults when pets is NO
      if (petFeeControlInit) {
        petFeeControlInit.setValue('0.00', { emitEvent: false });
        petFeeControlInit.disable({ emitEvent: false });
        petFeeControlInit.clearValidators();
        petFeeControlInit.updateValueAndValidity({ emitEvent: false });
      }
      if (numberOfPetsControlInit) {
        numberOfPetsControlInit.setValue(0, { emitEvent: false });
        numberOfPetsControlInit.disable({ emitEvent: false });
        numberOfPetsControlInit.clearValidators();
        numberOfPetsControlInit.updateValueAndValidity({ emitEvent: false });
      }
      if (petDescriptionControlInit) {
        petDescriptionControlInit.setValue('', { emitEvent: false });
        petDescriptionControlInit.disable({ emitEvent: false });
        petDescriptionControlInit.clearValidators();
        petDescriptionControlInit.updateValueAndValidity({ emitEvent: false });
      }
    } else {
      // Set defaults when pets is YES
      if (petFeeControlInit) {
        // Set pet fee from selected property if available
        if (this.selectedProperty && this.selectedProperty.petFee !== null && this.selectedProperty.petFee !== undefined) {
          petFeeControlInit.setValue(this.selectedProperty.petFee.toFixed(2), { emitEvent: false });
        }
        petFeeControlInit.enable({ emitEvent: false });
        petFeeControlInit.setValidators([Validators.required]);
        petFeeControlInit.updateValueAndValidity({ emitEvent: false });
      }
      if (numberOfPetsControlInit) {
        // Default to 1 if not already set
        const currentValue = numberOfPetsControlInit.value;
        if (!currentValue || currentValue === 0) {
          numberOfPetsControlInit.setValue(1, { emitEvent: false });
        }
        numberOfPetsControlInit.enable({ emitEvent: false });
        numberOfPetsControlInit.setValidators([Validators.required]);
        numberOfPetsControlInit.updateValueAndValidity({ emitEvent: false });
      }
      if (petDescriptionControlInit) {
        petDescriptionControlInit.enable({ emitEvent: false });
        petDescriptionControlInit.setValidators([Validators.required]);
        petDescriptionControlInit.updateValueAndValidity({ emitEvent: false });
      }
    }

    // Initialize Extra Fee field states
    const initialExtraFee = this.form.get('extraFee')?.value;
    const extraFeeNumInit = initialExtraFee ? parseFloat(initialExtraFee.toString()) : 0;
    const extraFeeNameControlInit = this.form.get('extraFeeName');
    const extraFee2ControlInit = this.form.get('extraFee2');
    const extraFee2NameControlInit = this.form.get('extraFee2Name');
    
    if (extraFeeNumInit === 0 || isNaN(extraFeeNumInit)) {
      if (extraFeeNameControlInit) {
        extraFeeNameControlInit.disable({ emitEvent: false });
        extraFeeNameControlInit.clearValidators();
      }
      if (extraFee2ControlInit) {
        extraFee2ControlInit.disable({ emitEvent: false });
      }
      if (extraFee2NameControlInit) {
        extraFee2NameControlInit.disable({ emitEvent: false });
        extraFee2NameControlInit.clearValidators();
      }
    } else {
      if (extraFeeNameControlInit) {
        extraFeeNameControlInit.enable({ emitEvent: false });
        extraFeeNameControlInit.setValidators([Validators.required]);
      }
      if (extraFee2ControlInit) {
        extraFee2ControlInit.enable({ emitEvent: false });
      }
      // Check extraFee2 value for extraFee2Name
      const initialExtraFee2 = this.form.get('extraFee2')?.value;
      const extraFee2NumInit = initialExtraFee2 ? parseFloat(initialExtraFee2.toString()) : 0;
      if (extraFee2NameControlInit) {
        if (extraFee2NumInit > 0 && !isNaN(extraFee2NumInit)) {
          extraFee2NameControlInit.enable({ emitEvent: false });
          extraFee2NameControlInit.setValidators([Validators.required]);
        } else {
          extraFee2NameControlInit.disable({ emitEvent: false });
          extraFee2NameControlInit.clearValidators();
        }
      }
    }

    // Update Billing Rate based on Billing Type selection
    this.form.get('billingTypeId')?.valueChanges.subscribe(billingTypeId => {
      if (this.selectedProperty && billingTypeId !== null && billingTypeId !== undefined) {
        if (billingTypeId === BillingType.Monthly) {
          // Use Monthly Rate
          if (this.selectedProperty.monthlyRate !== null && this.selectedProperty.monthlyRate !== undefined) {
            this.form.get('billingRate')?.setValue(this.selectedProperty.monthlyRate.toFixed(2), { emitEvent: false });
          }
        } else if (billingTypeId === BillingType.Daily || billingTypeId === BillingType.Nightly) {
          // Use Daily Rate for both Daily and Nightly
          if (this.selectedProperty.dailyRate !== null && this.selectedProperty.dailyRate !== undefined) {
            this.form.get('billingRate')?.setValue(this.selectedProperty.dailyRate.toFixed(2), { emitEvent: false });
          }
        }
      }
    });
  }

  initializeEnums(): void {
    this.availableClientTypes = [
      { value: ReservationType.Private, label: 'Private' },
      { value: ReservationType.Corporate, label: 'Corporate' },
      { value: ReservationType.Owner, label: 'Owner' }
    ];

    // Initialize with all statuses, will be filtered based on reservation type
    this.updateAvailableReservationStatuses(null);

    this.checkInTimes = this.utilityService.getCheckInTimes();
    this.checkOutTimes = this.utilityService.getCheckOutTimes();

    this.availableBillingTypes = [
      { value: BillingType.Monthly, label: 'Monthly' },
      { value: BillingType.Daily, label: 'Daily' },
      { value: BillingType.Nightly, label: 'Nightly' }
    ];

    this.availableFrequencies = [
      { value: Frequency.NA, label: 'N/A' },
      { value: Frequency.OneTime, label: 'One Time' },
      { value: Frequency.Weekly, label: 'Weekly' },
      { value: Frequency.EOW, label: 'EOW' },
      { value: Frequency.Monthly, label: 'Monthly' }
    ];

    this.availableReservationNotices = [
      { value: ReservationNotice.ThirtyDays, label: '30 Days' }, // 0
      { value: ReservationNotice.FourteenDays, label: '14 Days' } // 1
    ];

    this.availableDepositTypes = [
      { value: DepositType.Deposit, label: 'Deposit' },
      { value: DepositType.CLR, label: 'CLR' },
      { value: DepositType.SDW, label: 'SDW' },
    ];
  }
  //#endregion

  //#region Dynamic Form Adjustment Methods
  filterContactsByClientType(reservationTypeId: number | null, callback?: () => void): void {
    if (reservationTypeId === null || reservationTypeId === undefined) {
      this.filteredContacts = [];
      if (callback) callback();
      return;
    }

    if (reservationTypeId === ReservationType.Private) {
      // Get tenants
      this.contactService.getAllTenantContacts().pipe(take(1)).subscribe({
        next: (tenants: ContactResponse[]) => {
          this.filteredContacts = tenants;
          if (callback) callback();
        },
        error: (err: HttpErrorResponse) => {
          // Contacts are handled globally, just handle gracefully
          this.filteredContacts = [];
          if (callback) callback();
        }
      });
    } else if (reservationTypeId === ReservationType.Corporate) {
      // Get companies
      this.contactService.getAllCompanyContacts().pipe(take(1)).subscribe({
        next: (companies: ContactResponse[]) => {
          this.filteredContacts = companies;
          if (callback) callback();
        },
        error: (err: HttpErrorResponse) => {
          // Contacts are handled globally, just handle gracefully
          this.filteredContacts = [];
          if (callback) callback();
        }
      });
          } else if (reservationTypeId === ReservationType.Owner) {
      // Get owners
      this.contactService.getAllOwnerContacts().pipe(take(1)).subscribe({
        next: (owners: ContactResponse[]) => {
          this.filteredContacts = owners;
          if (callback) callback();
        },
        error: (err: HttpErrorResponse) => {
          // Contacts are handled globally, just handle gracefully
          this.filteredContacts = [];
          if (callback) callback();
        }
      });
    } else {
      this.filteredContacts = [];
      if (callback) callback();
    }
  }

  updateContactFields(contact: ContactResponse): void {
    // Phone and email remain disabled (read-only) - just update their values
    this.form.patchValue({
      phone: this.formatterService.phoneNumber(contact.phone) || '',
      email: contact.email || ''
    }, { emitEvent: false });
  }

  updateEntityNames(contact: ContactResponse): void {
    if (contact.entityTypeId === EntityType.Company && contact.entityId) {
      const company = this.companies.find(c => c.companyId === contact.entityId);
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
  }

  getDefaultDeposit(): string {
    if (!this.selectedOfficeConfiguration) {
      return '0.00';
    }
    const defaultDeposit = this.selectedOfficeConfiguration.defaultDeposit;
    if (defaultDeposit !== null && defaultDeposit !== undefined) {
      return defaultDeposit.toFixed(2);
    }
    return '0.00';
  }

  updateDepositValidator(depositType: number | null): void {
    const depositControl = this.form?.get('deposit');
    if (depositControl) {
      // Don't update deposit field if reservation type is Owner (field should remain disabled)
      const reservationTypeId = this.form?.get('reservationTypeId')?.value;
      if (reservationTypeId === ReservationType.Owner) {
        return; // Exit early, keep field disabled
      }
      
      if (depositType === DepositType.Deposit) {
        // Set deposit to office configuration defaultDeposit (only if current value is 0)
        const currentDeposit = parseFloat(depositControl.value || '0');
        if (currentDeposit === 0) {
          if (this.selectedOfficeConfiguration) {
            const defaultDeposit = this.selectedOfficeConfiguration.defaultDeposit !== null && this.selectedOfficeConfiguration.defaultDeposit !== undefined 
              ? this.selectedOfficeConfiguration.defaultDeposit.toFixed(2) 
              : '0.00';
            depositControl.setValue(defaultDeposit, { emitEvent: false });
          } else {
            // Fallback to organization default if no office configuration found
          const defaultDeposit = this.getDefaultDeposit();
          depositControl.setValue(defaultDeposit, { emitEvent: false });
        }
        }
        // Make deposit required and editable
        depositControl.enable({ emitEvent: false });
        depositControl.setValidators([Validators.required]);
        depositControl.updateValueAndValidity({ emitEvent: false });
      } else if (depositType === DepositType.CLR || depositType === DepositType.SDW) {
        // Clear validators, but keep field enabled and value unchanged (unless Owner type)
        if (reservationTypeId !== ReservationType.Owner) {
          depositControl.enable({ emitEvent: false });
        }
        depositControl.clearValidators();
        depositControl.updateValueAndValidity({ emitEvent: false });
      }
    }
  }

  updateMaidServiceFields(hasMaidService: boolean | null): void {
    const maidServiceFeeControl = this.form.get('maidServiceFee');
    const frequencyControl = this.form.get('frequencyId');
    
    if (hasMaidService === false) {
      // Set maid service fee to 0 and disable when maid service is NO
      if (maidServiceFeeControl) {
        maidServiceFeeControl.setValue('0.00', { emitEvent: false });
        maidServiceFeeControl.disable({ emitEvent: false });
        maidServiceFeeControl.clearValidators();
        maidServiceFeeControl.updateValueAndValidity({ emitEvent: false });
      }
      // Set frequency to NA when maid service is NO
      if (frequencyControl) {
        frequencyControl.setValue(Frequency.NA, { emitEvent: false });
        frequencyControl.disable({ emitEvent: false });
        frequencyControl.clearValidators();
        frequencyControl.updateValueAndValidity({ emitEvent: false });
      }
    } else {
      // Enable maid service fee when maid service is YES and set default from property
      if (maidServiceFeeControl) {
        // Set maid service fee from selected property if available, otherwise keep current value
        if (this.selectedProperty && this.selectedProperty.maidServiceFee !== null && this.selectedProperty.maidServiceFee !== undefined) {
          maidServiceFeeControl.setValue(this.selectedProperty.maidServiceFee.toFixed(2), { emitEvent: false });
        }
        maidServiceFeeControl.enable({ emitEvent: false });
        // Update validators based on frequencyId (will be set by frequency control)
        // This ensures maidServiceFee is required when maidService is Yes
        const currentFrequency = this.form.get('frequencyId')?.value;
        // If frequency is not set yet (NA), still make maidServiceFee required
        if (currentFrequency === null || currentFrequency === undefined || currentFrequency === Frequency.NA) {
          maidServiceFeeControl.setValidators([Validators.required]);
          maidServiceFeeControl.updateValueAndValidity({ emitEvent: false });
        } else {
          this.updateMaidServiceFeeValidator(currentFrequency);
        }
      }
      // Enable frequency when maid service is YES, set default to Once, and add validator
      if (frequencyControl) {
        // Only set to Once if current value is NA (to avoid overwriting user input)
        const currentFrequency = frequencyControl.value;
        if (currentFrequency === null || currentFrequency === undefined || currentFrequency === Frequency.NA) {
          frequencyControl.setValue(Frequency.OneTime, { emitEvent: false });
        }
        frequencyControl.enable({ emitEvent: false });
        // Frequency must not be NA when MaidService is Yes - it's required
        frequencyControl.setValidators([
          Validators.required,
          (control: AbstractControl): ValidationErrors | null => {
            const value = control.value;
            if (value === null || value === undefined || value === Frequency.NA) {
              return { mustNotBeNA: true };
            }
            return null;
          }
        ]);
        frequencyControl.updateValueAndValidity({ emitEvent: false });
        // Update maidServiceFee validators based on the new frequency value
        this.updateMaidServiceFeeValidator(frequencyControl.value);
      }
    }
  }

  updateDepositFromOfficeConfiguration(): void {
    if (!this.selectedOfficeConfiguration) return;
    
    const depositControl = this.form.get('deposit');
    const depositType = this.form.get('depositType')?.value;
    
    if (depositControl && depositType === DepositType.Deposit) {
      // Only update if depositType is Deposit (when deposit is editable)
      const defaultDeposit = this.selectedOfficeConfiguration.defaultDeposit !== null && this.selectedOfficeConfiguration.defaultDeposit !== undefined 
        ? this.selectedOfficeConfiguration.defaultDeposit.toFixed(2) 
        : '0.00';
      depositControl.setValue(defaultDeposit, { emitEvent: false });
    }
  }  

  updatePetsFieldStates(hasPets: boolean): void {
    const petFeeControl = this.form.get('petFee');
    const numberOfPetsControl = this.form.get('numberOfPets');
    const petDescriptionControl = this.form.get('petDescription');
    
    if (hasPets === false) {
      if (petFeeControl) {
        petFeeControl.disable({ emitEvent: false });
        petFeeControl.clearValidators();
        petFeeControl.updateValueAndValidity({ emitEvent: false });
      }
      if (numberOfPetsControl) {
        numberOfPetsControl.disable({ emitEvent: false });
        numberOfPetsControl.clearValidators();
        numberOfPetsControl.updateValueAndValidity({ emitEvent: false });
      }
      if (petDescriptionControl) {
        petDescriptionControl.disable({ emitEvent: false });
        petDescriptionControl.clearValidators();
        petDescriptionControl.updateValueAndValidity({ emitEvent: false });
        }
      } else {
      if (petFeeControl) {
        petFeeControl.enable({ emitEvent: false });
        petFeeControl.setValidators([Validators.required]);
        petFeeControl.updateValueAndValidity({ emitEvent: false });
      }
      if (numberOfPetsControl) {
        numberOfPetsControl.enable({ emitEvent: false });
        numberOfPetsControl.setValidators([Validators.required]);
        numberOfPetsControl.updateValueAndValidity({ emitEvent: false });
      }
      if (petDescriptionControl) {
        petDescriptionControl.enable({ emitEvent: false });
        petDescriptionControl.setValidators([Validators.required]);
        petDescriptionControl.updateValueAndValidity({ emitEvent: false });
      }
    }
  }
  
  updateExtraFeeFieldStates(extraFee: number, extraFee2: number): void {
    const extraFeeNameControl = this.form.get('extraFeeName');
    const extraFee2Control = this.form.get('extraFee2');
    const extraFee2NameControl = this.form.get('extraFee2Name');
    
    if (extraFee === 0 || isNaN(extraFee)) {
      if (extraFeeNameControl) {
        extraFeeNameControl.disable({ emitEvent: false });
        extraFeeNameControl.clearValidators();
        extraFeeNameControl.updateValueAndValidity({ emitEvent: false });
      }
      if (extraFee2Control) {
        extraFee2Control.disable({ emitEvent: false });
      }
      if (extraFee2NameControl) {
        extraFee2NameControl.disable({ emitEvent: false });
        extraFee2NameControl.clearValidators();
        extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
      }
    } else {
      if (extraFeeNameControl) {
        extraFeeNameControl.enable({ emitEvent: false });
        extraFeeNameControl.setValidators([Validators.required]);
        extraFeeNameControl.updateValueAndValidity({ emitEvent: false });
      }
      if (extraFee2Control) {
        extraFee2Control.enable({ emitEvent: false });
      }
      if (extraFee2 > 0 && !isNaN(extraFee2)) {
        if (extraFee2NameControl) {
          extraFee2NameControl.enable({ emitEvent: false });
          extraFee2NameControl.setValidators([Validators.required]);
          extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
        }
      } else {
        if (extraFee2NameControl) {
          extraFee2NameControl.disable({ emitEvent: false });
          extraFee2NameControl.clearValidators();
          extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
        }
      }
    }
  }

   updateAvailableReservationStatuses(reservationTypeId: number | null): void {
    const allStatuses = [
      { value: ReservationStatus.PreBooking, label: 'Pre-Booking' },
      { value: ReservationStatus.Confirmed, label: 'Confirmed' },
      { value: ReservationStatus.CheckedIn, label: 'Checked In' },
      { value: ReservationStatus.GaveNotice, label: 'Gave Notice' },
      { value: ReservationStatus.FirstRightRefusal, label: 'First Right of Refusal' },
      { value: ReservationStatus.Maintenance, label: 'Maintenance' },
      { value: ReservationStatus.OwnerBlocked, label: 'Owner Blocked' }
    ];

    if (reservationTypeId === ReservationType.Owner) {
      // For Owner type: show only Owner Blocked and Maintenance (in that order - Owner Blocked first)
      this.availableReservationStatuses = [
        { value: ReservationStatus.OwnerBlocked, label: 'Owner Blocked' },
        { value: ReservationStatus.Maintenance, label: 'Maintenance' }
      ];
    } else {
      // For all other types: show everything EXCEPT Maintenance and Owner Blocked
      this.availableReservationStatuses = allStatuses.filter(status => 
        status.value !== ReservationStatus.Maintenance && 
        status.value !== ReservationStatus.OwnerBlocked
      );
    }
  }
  //#endregion

  //#region Data Load Methods
  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1)).subscribe({
      next: (organization: OrganizationResponse) => {
        this.organization = organization;
        // Update deposit default if form exists and deposit is 0.00
        if (this.form) {
          const depositControl = this.form.get('deposit');
          if (depositControl && depositControl.value === '0.00') {
            const defaultDeposit = this.getDefaultDeposit();
            depositControl.setValue(defaultDeposit, { emitEvent: false });
          }
        }
      },
      error: (err: HttpErrorResponse) => {
        // Organization is handled globally, just handle gracefully
      }
    });
  }
  
  loadContacts(): void {
    this.contactService.getAllContacts().pipe(take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
        // Initialize filtered contacts based on current client type
        const currentClientType = this.form?.get('reservationTypeId')?.value;
        if (currentClientType !== null && currentClientType !== undefined) {
          this.filterContactsByClientType(currentClientType);
        }
      },
      error: (err: HttpErrorResponse) => {
        // Contacts are handled globally, just handle gracefully
        this.contacts = [];
        this.filteredContacts = [];
      }
    });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => { this.removeLoadItem('agents'); })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.agents = agents;
      },
      error: (err: HttpErrorResponse) => {
        this.agents = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load agents. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('agents');
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getProperties().pipe(take(1), finalize(() => { this.removeLoadItem('properties'); })).subscribe({
      next: (properties: PropertyResponse[]) => {
         this.properties = properties;
         // Initialize filtered properties (show all properties)
         this.filteredProperties = properties;
      },
      error: (err: HttpErrorResponse) => {
        this.properties = [];
        this.filteredProperties = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load properties. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('properties');
      }
    });
  }

  loadCompanies(): void {
    this.companyService.getCompanies().pipe(take(1), finalize(() => { this.removeLoadItem('companies'); })).subscribe({
      next: (companies: CompanyResponse[]) => {
        this.companies = companies;
      },
      error: (err: HttpErrorResponse) => {
        this.companies = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load companies. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('companies');
      }
    });
  }

  loadOffice(officeId: number): void {
    this.officeService.getOfficeById(officeId).pipe(take(1)).subscribe({
      next: (office: OfficeResponse) => {
        this.selectedOffice = office;
      },
      error: (err: HttpErrorResponse) => {
        this.selectedOffice = null;
      }
    });
  }

  loadOfficeConfiguration(officeId: number): void {
    this.officeConfigurationService.getOfficeConfigurationByOfficeId(officeId).pipe(take(1)).subscribe({
      next: (config: OfficeConfigurationResponse) => {
        this.selectedOfficeConfiguration = config;
        // Update deposit with office configuration's defaultDeposit
        this.updateDepositFromOfficeConfiguration();
      },
      error: (err: HttpErrorResponse) => {
        // 404 means no configuration exists for this office, which is fine
        this.selectedOfficeConfiguration = null;
      }
    });
  }
  //#endregion

  //#region Validator Update Methods
  updateTenantNameValidator(reservationTypeId: number | null): void {
    const tenantNameControl = this.form?.get('tenantName');
    if (tenantNameControl) {
      // Tenant Name is always enabled and required
        tenantNameControl.setValidators([Validators.required]);
      tenantNameControl.updateValueAndValidity();
    }
  }

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
      control.enable();
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  updateMaidServiceFeeValidator(frequencyId: number | null): void {
    const maidServiceFeeControl = this.form?.get('maidServiceFee');
    if (maidServiceFeeControl) {
      // Maid Service Fee is required and must be greater than 0 if Frequency is selected and not NA
      if (frequencyId !== null && frequencyId !== undefined && frequencyId !== Frequency.NA) {
        maidServiceFeeControl.setValidators([
          Validators.required,
          (control: AbstractControl): ValidationErrors | null => {
            const value = control.value;
            if (value === null || value === undefined || value === '') {
              return { required: true };
            }
            const numValue = parseFloat(value.toString().replace(/[^0-9.]/g, ''));
            if (isNaN(numValue) || numValue === 0) {
              return { mustBeGreaterThanZero: true };
            }
            return null;
          }
        ]);
      } else {
        maidServiceFeeControl.clearValidators();
      }
      maidServiceFeeControl.updateValueAndValidity();
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
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(
      take(1),
      catchError(() => of([] as ReservationResponse[]))
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
  //#endregion

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }
  //#endregion
}
