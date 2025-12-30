import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, filter } from 'rxjs';
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
import { CompanyService } from '../../company/services/company.service';
import { CompanyResponse } from '../../company/models/company.model';
import { EntityType } from '../../contact/models/contact-type';
import { ReservationType, ReservationStatus, BillingType, Frequency, ReservationNotice, DepositType } from '../models/reservation-enum';
import { CheckinTimes, CheckoutTimes } from '../../property/models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationLeaseComponent } from '../reservation-lease/reservation-lease.component';
import { ReservationLeaseInformationComponent } from '../reservation-lease-information/reservation-lease-information.component';

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, ReservationLeaseComponent, ReservationLeaseInformationComponent],
  templateUrl: './reservation.component.html',
  styleUrl: './reservation.component.scss'
})

export class ReservationComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  reservationId: string;
  reservation: ReservationResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  propertyPanelOpen: boolean = true;
  billingPanelOpen: boolean = false;
  contacts: ContactResponse[] = [];
  filteredContacts: ContactResponse[] = [];
  agents: AgentResponse[] = [];
  properties: PropertyResponse[] = [];
  companies: CompanyResponse[] = [];
  selectedProperty: PropertyResponse | null = null;
  selectedContact: ContactResponse | null = null;
  selectedCompanyName: string = '';
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
  ReservationType = ReservationType; // Expose enum to template

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
    private authService: AuthService,
    private formatterService: FormatterService,
    private utilityService: UtilityService
  ) {
    this.itemsToLoad.push('reservation');
  }

  ngOnInit(): void {
    this.initializeEnums();
    this.loadContacts();
    this.loadAgents();
    this.loadProperties();
    this.loadCompanies();
    
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.reservationId = paramMap.get('id');
        this.isAddMode = this.reservationId === 'new';
        
        // Set accordion panel states based on mode
        if (this.isAddMode) {
          // Add mode: property open, billing closed
          this.propertyPanelOpen = true;
          this.billingPanelOpen = false;
          this.removeLoadItem('reservation');
          this.buildForm();
        } else {
          // Edit mode: property open, billing closed
          this.propertyPanelOpen = true;
          this.billingPanelOpen = false;
          this.getReservation();
        }
      }
    });
    if (!this.isAddMode) {
      this.buildForm();
    }
  }

  getReservation(): void {
    this.reservationService.getReservationByGuid(this.reservationId).pipe(
      take(1), finalize(() => { this.removeLoadItem('reservation'); }) ).subscribe({
      next: (response: ReservationResponse) => {
        this.reservation = response;
        this.buildForm();
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
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const reservationRequest: ReservationRequest = {
      organizationId: user?.organizationId || '',
      propertyId: formValue.propertyId,
      agentId: formValue.agentId || null,
      contactId: formValue.contactId,
      reservationTypeId: formValue.reservationTypeId !== null && formValue.reservationTypeId !== undefined ? Number(formValue.reservationTypeId) : ReservationType.Private,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      reservationNoticeId: formValue.reservationNoticeId || null,
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
        this.isLoadError = true;
        if (err.status !== 400) {
          const failMessage = this.isAddMode ? 'Create reservation request has failed. ' : 'Update reservation request has failed. ';
          this.toastr.error(failMessage + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Form methods
  buildForm(): void {
    this.form = this.fb.group({
      reservationCode: new FormControl({ value: '', disabled: true }), // Read-only, only shown in Edit Mode
      propertyCode: new FormControl({ value: '', disabled: true }), // Read-only
      propertyId: new FormControl('', [Validators.required]),
      propertyAddress: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      agentId: new FormControl(null, [Validators.required]),
      tenantName: new FormControl({ value: '', disabled: true }), // No validators - will be added when enabled
      contactId: new FormControl({ value: '', disabled: true }), // No validators - will be added when enabled
      entityCompanyName: new FormControl({ value: '', disabled: true }), // Display Company name if EntityTypeId is Company
      reservationTypeId: new FormControl(null, [Validators.required]),
      reservationStatusId: new FormControl(null, [Validators.required]),
      reservationNoticeId: new FormControl(null),
      isActive: new FormControl(true),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl<number>(CheckinTimes.NA),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.NA),
      billingTypeId: new FormControl(BillingType.Monthly, [Validators.required]),
      billingRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(1, [Validators.required]),
      pets: new FormControl(false),
      petFee: new FormControl<string>('0.00'),
      numberOfPets: new FormControl(0),
      petDescription: new FormControl(''),
      maidService: new FormControl(false),
      phone: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      email: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      depositType: new FormControl(DepositType.FlatFee),
      deposit: new FormControl<string>('0.00'),
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

    this.form.get('propertyId')?.valueChanges.subscribe(propertyId => {
      if (propertyId) {
        this.selectedProperty = this.properties.find(p => p.propertyId === propertyId) || null;
        const propertyAddress = this.selectedProperty 
          ? `${this.selectedProperty.address1}${this.selectedProperty.suite ? ' ' + this.selectedProperty.suite : ''}`.trim()
          : '';
        const propertyCode = this.selectedProperty?.propertyCode || '';
        
        // Pre-load property values into form fields
        const patchValues: any = {
          propertyCode: propertyCode,
          propertyAddress: propertyAddress
        };
        
        if (this.selectedProperty) {
          // Default Billing Type to Monthly and fill Billing Rate with Monthly Rate
          patchValues.billingTypeId = BillingType.Monthly;
          if (this.selectedProperty.monthlyRate !== null && this.selectedProperty.monthlyRate !== undefined) {
            patchValues.billingRate = this.selectedProperty.monthlyRate.toFixed(2);
          } else {
            patchValues.billingRate = '0.00';
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
          
          // Note: Deposit is handled by updateDepositValidator based on DepositType
          // When FlatFee is selected, it defaults to 3000.00
          // When IncludedInRent is selected, it's set to 0.00 and disabled
          
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
      } else {
        this.selectedProperty = null;
        this.form.patchValue({ propertyCode: '', propertyAddress: '' }, { emitEvent: false });
      }
    });

    this.form.get('arrivalDate')?.valueChanges.subscribe(arrivalDate => {
      if (arrivalDate && arrivalDate instanceof Date) {
        this.departureDateStartAt = new Date(arrivalDate);
      } else if (arrivalDate) {
        this.departureDateStartAt = new Date(arrivalDate);
      } else {
        this.departureDateStartAt = null;
      }
    });

    // contactId starts disabled - will be enabled when reservationTypeId is selected

    // Handle contact selection and update entity names
    this.form.get('contactId')?.valueChanges.subscribe(contactId => {
      if (contactId) {
        const contact = this.filteredContacts.find(c => c.contactId === contactId) || 
                        this.contacts.find(c => c.contactId === contactId);
        if (contact) {
          this.selectedContact = contact;
          this.updateContactFields(contact);
          this.updateEntityNames(contact);
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

    // Filter contacts based on client type
    this.form.get('reservationTypeId')?.valueChanges.subscribe(reservationTypeId => {
      const selectedReservationType = reservationTypeId;
      
      // Filter contacts based on reservation type
      this.filterContactsByClientType(selectedReservationType);
      this.updateTenantNameValidator(selectedReservationType);
      
      // Enable contactId field when a reservation type is selected
      if (selectedReservationType !== null && selectedReservationType !== undefined) {
        this.enableFieldWithValidation('contactId', [Validators.required]);
      } else {
        this.disableFieldWithValidation('contactId');
      }
      
      // ONLY clear Tenant Name, Contact Name, Contact Phone, and Contact Email when type changes
      // Everything else should remain as is
      this.form.patchValue({ 
        tenantName: '',
        contactId: '',
        phone: '',
        email: '',
        entityCompanyName: ''
      }, { emitEvent: false });
      
      // Clear selected contact reference and entity names
      this.selectedContact = null;
      this.selectedCompanyName = '';
    });

    // Update Maid Service Fee required validator based on Frequency selection
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
    
    // Initialize maidServiceFee validator based on initial frequencyId value
    this.updateMaidServiceFeeValidator(this.form.get('frequencyId')?.value);

    // Update Deposit field disabled/required based on DepositType
    this.form.get('depositType')?.valueChanges.subscribe(depositType => {
      this.updateDepositValidator(depositType);
    });
    
    // Also validate when deposit value changes
    this.form.get('deposit')?.valueChanges.subscribe(() => {
      const depositType = this.form.get('depositType')?.value;
      this.updateDepositValidator(depositType);
    });
    
    // Initialize deposit field state based on initial depositType value
    const initialDepositType = this.form.get('depositType')?.value;
    this.updateDepositValidator(initialDepositType);

    // Update Pet Fee, Number of Pets, and Pet Description disabled state based on Pets selection
    this.form.get('pets')?.valueChanges.subscribe(hasPets => {
      const petFeeControl = this.form.get('petFee');
      const numberOfPetsControl = this.form.get('numberOfPets');
      const petDescriptionControl = this.form.get('petDescription');
      
      if (hasPets === false) {
        // Disable pet-related fields when pets is NO and reset values
        if (petFeeControl) {
          petFeeControl.setValue('0.00', { emitEvent: false });
          petFeeControl.disable({ emitEvent: false });
        }
        if (numberOfPetsControl) {
          numberOfPetsControl.setValue(0, { emitEvent: false });
          numberOfPetsControl.disable({ emitEvent: false });
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
        }
        if (numberOfPetsControl) {
          // Only set to 1 if current value is 0 (to avoid overwriting user input)
          const currentValue = numberOfPetsControl.value;
          if (!currentValue || currentValue === 0) {
            numberOfPetsControl.setValue(1, { emitEvent: false });
          }
          numberOfPetsControl.enable({ emitEvent: false });
        }
        if (petDescriptionControl) {
          petDescriptionControl.enable({ emitEvent: false });
          petDescriptionControl.setValidators([Validators.required]);
          petDescriptionControl.updateValueAndValidity({ emitEvent: false });
        }
      }
    });

    // Update Maid Service Fee and Frequency disabled state based on MaidService selection
    this.form.get('maidService')?.valueChanges.subscribe(hasMaidService => {
      this.updateMaidServiceFields(hasMaidService);
    });

    // Also validate frequency when it changes
    this.form.get('frequencyId')?.valueChanges.subscribe(() => {
      const hasMaidService = this.form.get('maidService')?.value;
      this.updateMaidServiceFields(hasMaidService);
    });

    // Initialize pets and maidService field states
    const initialPets = this.form.get('pets')?.value;
    const petFeeControlInit = this.form.get('petFee');
    const numberOfPetsControlInit = this.form.get('numberOfPets');
    const petDescriptionControlInit = this.form.get('petDescription');
    
    if (initialPets === false) {
      // Set values to defaults when pets is NO
      if (petFeeControlInit) {
        petFeeControlInit.setValue('0.00', { emitEvent: false });
        petFeeControlInit.disable({ emitEvent: false });
      }
      if (numberOfPetsControlInit) {
        numberOfPetsControlInit.setValue(0, { emitEvent: false });
        numberOfPetsControlInit.disable({ emitEvent: false });
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
      }
      if (numberOfPetsControlInit) {
        // Default to 1 if not already set
        const currentValue = numberOfPetsControlInit.value;
        if (!currentValue || currentValue === 0) {
          numberOfPetsControlInit.setValue(1, { emitEvent: false });
        }
        numberOfPetsControlInit.enable({ emitEvent: false });
      }
      if (petDescriptionControlInit) {
        petDescriptionControlInit.enable({ emitEvent: false });
        petDescriptionControlInit.setValidators([Validators.required]);
        petDescriptionControlInit.updateValueAndValidity({ emitEvent: false });
      }
    }

    // Initialize maidService field states
    const initialMaidService = this.form.get('maidService')?.value;
    this.updateMaidServiceFields(initialMaidService);

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

  populateForm(): void {
    if (this.reservation && this.form) {
      const isActiveValue = typeof this.reservation.isActive === 'number' 
        ? this.reservation.isActive === 1 
        : Boolean(this.reservation.isActive);
      
      const selectedProp = this.properties.find(p => p.propertyId === this.reservation.propertyId);
      const propertyAddress = selectedProp 
        ? `${selectedProp.address1}${selectedProp.suite ? ' ' + selectedProp.suite : ''}`.trim()
        : '';
      const propertyCode = selectedProp?.propertyCode || '';
      
      // Load contacts first to populate phone/email
      this.contactService.getContacts().pipe(take(1)).subscribe({
        next: (allContacts: ContactResponse[]) => {
          this.contacts = allContacts;
          const reservationTypeId = this.reservation.reservationTypeId ?? ReservationType.Private;
          const contactId = this.reservation.contactId;
          
          // Enable contactId if reservationTypeId is set
          if (reservationTypeId !== null && reservationTypeId !== undefined) {
            this.enableFieldWithValidation('contactId', [Validators.required]);
          }
          
          // Update available reservation statuses based on reservation type
          this.updateAvailableReservationStatuses(reservationTypeId);
          
          // Filter contacts based on client type first, then populate form
          this.filterContactsByClientType(reservationTypeId, () => {
            const contact = this.filteredContacts.find(c => c.contactId === contactId) || allContacts.find(c => c.contactId === contactId);
            
            // Phone and email remain disabled (read-only) - values are set via updateContactFields
            // Only enable tenantName if Reservation Type is NOT Maintenance and NOT Owner
            if (contactId) {
              if ( reservationTypeId !== ReservationType.Owner) {
                this.enableFieldWithValidation('tenantName', [Validators.required]);
                // Update validator when enabling - tenantName is required when editable
                this.updateTenantNameValidator(reservationTypeId);
              }
              
              // Update entity names if contact has entityId
              if (contact) {
                this.updateEntityNames(contact);
              }
            }
            
            // Update tenantName validator based on reservation type
            this.updateTenantNameValidator(reservationTypeId);
            
            // Enable/disable readonly fields based on reservation type
            if (reservationTypeId === ReservationType.Owner) {
              // Make billing and fee fields readonly for Owner type - clear validators
              this.disableFieldWithValidation('checkInTimeId');
              this.disableFieldWithValidation('checkOutTimeId');
              this.disableFieldWithValidation('billingTypeId');
              this.disableFieldWithValidation('billingRate');
              this.disableFieldWithValidation('deposit');
              this.disableFieldWithValidation('departureFee');
              this.disableFieldWithValidation('petFee');
              this.disableFieldWithValidation('numberOfPets');
              this.disableFieldWithValidation('petDescription');
              this.disableFieldWithValidation('maidServiceFee');
              this.disableFieldWithValidation('frequencyId');
              this.disableFieldWithValidation('extraFee');
              this.disableFieldWithValidation('extraFeeName');
              this.disableFieldWithValidation('extraFee2');
              this.disableFieldWithValidation('extraFee2Name');
              this.disableFieldWithValidation('taxes');
            } else {
              // Enable all fields for non-Owner types - restore validators
              this.enableFieldWithValidation('checkInTimeId');
              this.enableFieldWithValidation('checkOutTimeId');
              this.enableFieldWithValidation('billingTypeId', [Validators.required]);
              this.enableFieldWithValidation('billingRate', [Validators.required]);
              // Use updateDepositValidator to set correct validators based on depositType
              const currentDepositType = this.form.get('depositType')?.value;
              this.updateDepositValidator(currentDepositType);
              this.enableFieldWithValidation('departureFee', [Validators.required]);
              
              // Enable petFee, numberOfPets, and petDescription, but disable if pets is NO
              this.enableFieldWithValidation('petFee');
              this.enableFieldWithValidation('numberOfPets');
              this.enableFieldWithValidation('petDescription');
              const currentPets = this.form.get('pets')?.value;
              if (currentPets === false) {
                const petFeeControl = this.form.get('petFee');
                const numberOfPetsControl = this.form.get('numberOfPets');
                const petDescriptionControl = this.form.get('petDescription');
                if (petFeeControl) {
                  petFeeControl.setValue('0.00', { emitEvent: false });
                  petFeeControl.disable({ emitEvent: false });
                }
                if (numberOfPetsControl) {
                  numberOfPetsControl.setValue(0, { emitEvent: false });
                  numberOfPetsControl.disable({ emitEvent: false });
                }
                if (petDescriptionControl) {
                  petDescriptionControl.setValue('', { emitEvent: false });
                  petDescriptionControl.disable({ emitEvent: false });
                  petDescriptionControl.clearValidators();
                  petDescriptionControl.updateValueAndValidity({ emitEvent: false });
                }
              } else {
                // Set defaults when pets is YES
                const petFeeControl = this.form.get('petFee');
                const numberOfPetsControl = this.form.get('numberOfPets');
                const petDescriptionControl = this.form.get('petDescription');
                if (petFeeControl && this.selectedProperty && this.selectedProperty.petFee !== null && this.selectedProperty.petFee !== undefined) {
                  petFeeControl.setValue(this.selectedProperty.petFee.toFixed(2), { emitEvent: false });
                }
                if (numberOfPetsControl) {
                  const currentValue = numberOfPetsControl.value;
                  if (!currentValue || currentValue === 0) {
                    numberOfPetsControl.setValue(1, { emitEvent: false });
                  }
                }
                if (petDescriptionControl) {
                  petDescriptionControl.setValidators([Validators.required]);
                  petDescriptionControl.updateValueAndValidity({ emitEvent: false });
                }
              }
              
              // Use updateMaidServiceFields to set correct validators based on maidService
              this.enableFieldWithValidation('maidServiceFee');
              const currentMaidService = this.form.get('maidService')?.value;
              this.updateMaidServiceFields(currentMaidService);
              
              this.enableFieldWithValidation('extraFee');
              
              // Enable extraFeeName, extraFee2, extraFee2Name but check if they should be disabled
              this.enableFieldWithValidation('extraFeeName');
              this.enableFieldWithValidation('extraFee2');
              this.enableFieldWithValidation('extraFee2Name');
              
              // Check current extraFee value and disable related fields if needed
              const currentExtraFee = this.form.get('extraFee')?.value;
              const currentExtraFeeNum = currentExtraFee ? parseFloat(currentExtraFee.toString()) : 0;
              if (currentExtraFeeNum === 0 || isNaN(currentExtraFeeNum)) {
                const extraFeeNameControl = this.form.get('extraFeeName');
                const extraFee2Control = this.form.get('extraFee2');
                const extraFee2NameControl = this.form.get('extraFee2Name');
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
                // extraFee > 0, so extraFeeName should be required
                const extraFeeNameControl = this.form.get('extraFeeName');
                if (extraFeeNameControl) {
                  extraFeeNameControl.setValidators([Validators.required]);
                  extraFeeNameControl.updateValueAndValidity({ emitEvent: false });
                }
                // Check extraFee2 value
                const currentExtraFee2 = this.form.get('extraFee2')?.value;
                const currentExtraFee2Num = currentExtraFee2 ? parseFloat(currentExtraFee2.toString()) : 0;
                const extraFee2NameControl = this.form.get('extraFee2Name');
                if (extraFee2NameControl) {
                  if (currentExtraFee2Num > 0 && !isNaN(currentExtraFee2Num)) {
                    extraFee2NameControl.setValidators([Validators.required]);
                    extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
                  } else {
                    extraFee2NameControl.clearValidators();
                    extraFee2NameControl.updateValueAndValidity({ emitEvent: false });
                  }
                }
              }
              
              this.enableFieldWithValidation('taxes');
            }
            
            // Use saved reservation status (no auto-selection)
            const reservationStatus = this.reservation.reservationStatusId ?? ReservationStatus.PreBooking;
            
            // Determine tenantName value
            // If Reservation Type is Private, External, or Owner and contact exists, use contact name; otherwise use saved value
            let tenantNameValue = this.reservation.tenantName || '';
            if ((reservationTypeId === ReservationType.Private || reservationTypeId === ReservationType.Owner) && contact) {
              const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
              if (contactName) {
                tenantNameValue = contactName;
              }
            }
            
            // Determine numberOfPeople value
            // If Reservation Type is Owner, set to 0; otherwise use saved value
            let numberOfPeopleValue = this.reservation.numberOfPeople === 0 ? 1 : this.reservation.numberOfPeople;
            if (reservationTypeId === ReservationType.Owner) {
              numberOfPeopleValue = 0;
            }
            
            this.form.patchValue({
              reservationCode: this.reservation?.reservationCode || '',
              propertyCode: propertyCode,
              propertyId: this.reservation.propertyId,
              propertyAddress: propertyAddress,
              agentId: this.reservation.agentId || null,
              tenantName: tenantNameValue,
              contactId: contactId,
              reservationTypeId: reservationTypeId,
              reservationStatusId: reservationStatus,
              reservationNoticeId: this.reservation.reservationNoticeId || null,
              isActive: isActiveValue,
              arrivalDate: this.reservation.arrivalDate ? new Date(this.reservation.arrivalDate) : null,
              departureDate: this.reservation.departureDate ? new Date(this.reservation.departureDate) : null,
              checkInTimeId: this.utilityService.normalizeCheckInTimeId(this.reservation.checkInTimeId),
              checkOutTimeId: this.utilityService.normalizeCheckOutTimeId(this.reservation.checkOutTimeId),
              billingTypeId: this.reservation.billingTypeId ?? BillingType.Monthly,
              billingRate: (this.reservation.billingRate ?? 0).toFixed(2),
              numberOfPeople: numberOfPeopleValue,
              depositType: DepositType.FlatFee,
              deposit: this.reservation.deposit ? this.reservation.deposit.toFixed(2) : '0.00',
              departureFee: (this.reservation.departureFee ?? 0).toFixed(2),
              maidServiceFee: (this.reservation.maidServiceFee ?? 0).toFixed(2),
              frequencyId: this.reservation.frequencyId ?? Frequency.NA,
              // Set maidService based on frequencyId - if frequencyId is not NA, then MaidService is Yes
              maidService: (this.reservation.frequencyId ?? Frequency.NA) !== Frequency.NA,
              petFee: (this.reservation.petFee ?? 0).toFixed(2),
              numberOfPets: this.reservation.hasPets ? (this.reservation.numberOfPets ?? 1) : 0,
              petDescription: this.reservation.petDescription || '',
              extraFee: (this.reservation.extraFee ?? 0).toFixed(2),
              extraFeeName: this.reservation.extraFeeName || '',
              extraFee2: (this.reservation.extraFee2 ?? 0).toFixed(2),
              extraFee2Name: this.reservation.extraFee2Name || '',
              taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes,
              notes: this.reservation.notes || '',
              pets: this.reservation.hasPets ?? false,
              phone: this.formatterService.phoneNumber(contact?.phone) || '',
              email: contact?.email || ''
            }, { emitEvent: false });
            
            // Update disabled state based on loaded depositType (default to FlatFee)
            // Use the updateDepositValidator method to set correct validators
            const loadedDepositType = DepositType.FlatFee;
            this.updateDepositValidator(loadedDepositType);

            // Update pets and maidService field states after loading
            const loadedPets = this.reservation.hasPets ?? false;
            const petFeeControlAfterLoad = this.form.get('petFee');
            const numberOfPetsControlAfterLoad = this.form.get('numberOfPets');
            const petDescriptionControlAfterLoad = this.form.get('petDescription');
            
            if (loadedPets === false) {
              // Set values to defaults when pets is NO
              if (petFeeControlAfterLoad) {
                petFeeControlAfterLoad.setValue('0.00', { emitEvent: false });
                petFeeControlAfterLoad.disable({ emitEvent: false });
              }
              if (numberOfPetsControlAfterLoad) {
                numberOfPetsControlAfterLoad.setValue(0, { emitEvent: false });
                numberOfPetsControlAfterLoad.disable({ emitEvent: false });
              }
              if (petDescriptionControlAfterLoad) {
                petDescriptionControlAfterLoad.setValue('', { emitEvent: false });
                petDescriptionControlAfterLoad.disable({ emitEvent: false });
                petDescriptionControlAfterLoad.clearValidators();
                petDescriptionControlAfterLoad.updateValueAndValidity({ emitEvent: false });
              }
            } else {
              // Ensure defaults are set when pets is YES
              if (petFeeControlAfterLoad) {
                // Only set from property if not already loaded from reservation
                const currentPetFee = parseFloat(petFeeControlAfterLoad.value || '0');
                if (currentPetFee === 0 && this.selectedProperty && this.selectedProperty.petFee !== null && this.selectedProperty.petFee !== undefined) {
                  petFeeControlAfterLoad.setValue(this.selectedProperty.petFee.toFixed(2), { emitEvent: false });
                }
                petFeeControlAfterLoad.enable({ emitEvent: false });
              }
              if (numberOfPetsControlAfterLoad) {
                // Only default to 1 if not already set (loaded value should override)
                const currentValue = numberOfPetsControlAfterLoad.value;
                if (!currentValue || currentValue === 0) {
                  numberOfPetsControlAfterLoad.setValue(1, { emitEvent: false });
                }
                numberOfPetsControlAfterLoad.enable({ emitEvent: false });
              }
              if (petDescriptionControlAfterLoad) {
                petDescriptionControlAfterLoad.enable({ emitEvent: false });
                petDescriptionControlAfterLoad.setValidators([Validators.required]);
                petDescriptionControlAfterLoad.updateValueAndValidity({ emitEvent: false });
              }
            }

            // Update maidService fields state after loading
            // Determine MaidService from frequencyId - if frequencyId is not NA, then MaidService is Yes
            const loadedFrequencyId = this.reservation.frequencyId ?? Frequency.NA;
            const loadedMaidService = loadedFrequencyId !== Frequency.NA;
            this.updateMaidServiceFields(loadedMaidService);
            
            // If MaidService is Yes but maidServiceFee is 0, set it from property
            if (loadedMaidService) {
              const maidServiceFeeControl = this.form.get('maidServiceFee');
              if (maidServiceFeeControl) {
                const currentMaidServiceFee = parseFloat(maidServiceFeeControl.value || '0');
                if (currentMaidServiceFee === 0 && this.selectedProperty && this.selectedProperty.maidServiceFee !== null && this.selectedProperty.maidServiceFee !== undefined) {
                  maidServiceFeeControl.setValue(this.selectedProperty.maidServiceFee.toFixed(2), { emitEvent: false });
                }
              }
              // If frequencyId is NA (shouldn't happen if loadedMaidService is true, but handle it), set to Once
              const frequencyControl = this.form.get('frequencyId');
              if (frequencyControl && (frequencyControl.value === null || frequencyControl.value === undefined || frequencyControl.value === Frequency.NA)) {
                frequencyControl.setValue(Frequency.OneTime, { emitEvent: false });
              }
            }

            // Update Extra Fee field states after loading
            const loadedExtraFee = this.reservation.extraFee ?? 0;
            const extraFeeNameControlAfterLoad = this.form.get('extraFeeName');
            const extraFee2ControlAfterLoad = this.form.get('extraFee2');
            const extraFee2NameControlAfterLoad = this.form.get('extraFee2Name');
            
            if (loadedExtraFee === 0) {
              if (extraFeeNameControlAfterLoad) {
                extraFeeNameControlAfterLoad.disable({ emitEvent: false });
                extraFeeNameControlAfterLoad.clearValidators();
                extraFeeNameControlAfterLoad.updateValueAndValidity({ emitEvent: false });
              }
              if (extraFee2ControlAfterLoad) {
                extraFee2ControlAfterLoad.disable({ emitEvent: false });
              }
              if (extraFee2NameControlAfterLoad) {
                extraFee2NameControlAfterLoad.disable({ emitEvent: false });
                extraFee2NameControlAfterLoad.clearValidators();
                extraFee2NameControlAfterLoad.updateValueAndValidity({ emitEvent: false });
              }
            } else {
              if (extraFeeNameControlAfterLoad) {
                extraFeeNameControlAfterLoad.enable({ emitEvent: false });
                extraFeeNameControlAfterLoad.setValidators([Validators.required]);
                extraFeeNameControlAfterLoad.updateValueAndValidity({ emitEvent: false });
              }
              if (extraFee2ControlAfterLoad) {
                extraFee2ControlAfterLoad.enable({ emitEvent: false });
              }
              // Check extraFee2 value
              const loadedExtraFee2 = this.reservation.extraFee2 ?? 0;
              if (extraFee2NameControlAfterLoad) {
                if (loadedExtraFee2 > 0) {
                  extraFee2NameControlAfterLoad.enable({ emitEvent: false });
                  extraFee2NameControlAfterLoad.setValidators([Validators.required]);
                } else {
                  extraFee2NameControlAfterLoad.disable({ emitEvent: false });
                  extraFee2NameControlAfterLoad.clearValidators();
                }
                extraFee2NameControlAfterLoad.updateValueAndValidity({ emitEvent: false });
              }
            }
            
            if (contact) {
              this.selectedContact = contact;
              this.updateContactFields(contact);
              this.updateEntityNames(contact);
            } else if (contactId) {
              // If contactId is set but contact not found, try to get from filteredContacts
              const foundContact = this.filteredContacts.find(c => c.contactId === contactId);
              if (foundContact) {
                this.selectedContact = foundContact;
                this.updateContactFields(foundContact);
                this.updateEntityNames(foundContact);
              }
            }
          });
        },
        error: (err) => {
          console.error('Error loading contacts for populate:', err);
        }
      });

      if (this.reservation.propertyId) {
        this.selectedProperty = this.properties.find(p => p.propertyId === this.reservation.propertyId) || null;
      }
    }
  }

  // Dynamic Form Adjustment Methods
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
        error: (err) => {
          console.error('Error loading tenant contacts:', err);
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
        error: (err) => {
          console.error('Error loading company contacts:', err);
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
        error: (err) => {
          console.error('Error loading owner contacts:', err);
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
        this.form.patchValue({ 
          entityCompanyName: company.name
        }, { emitEvent: false });
      } else {
        this.selectedCompanyName = '';
        this.form.patchValue({ entityCompanyName: '' }, { emitEvent: false });
      }
    } else {
      this.selectedCompanyName = '';
      this.form.patchValue({ 
        entityCompanyName: ''
      }, { emitEvent: false });
    }
  }

  updateDepositValidator(depositType: number | null): void {
    const depositControl = this.form?.get('deposit');
    if (depositControl) {
      if (depositType === DepositType.FlatFee) {
        // Set deposit to 3000 as default when FlatFee is selected (only if current value is 0)
        const currentDeposit = parseFloat(depositControl.value || '0');
        if (currentDeposit === 0) {
          depositControl.setValue('3000.00', { emitEvent: false });
        }
        // Make deposit required, editable, and must be greater than 0
        depositControl.enable({ emitEvent: false });
        depositControl.setValidators([
          Validators.required,
          (control: AbstractControl): ValidationErrors | null => {
            const value = control.value;
            if (value === null || value === undefined || value === '') {
              return { required: true };
            }
            const numValue = parseFloat(value.toString().replace(/[^0-9.]/g, ''));
            if (isNaN(numValue) || numValue <= 0) {
              return { mustBeGreaterThanZero: true };
            }
            return null;
          }
        ]);
        depositControl.updateValueAndValidity({ emitEvent: false });
      } else if (depositType === DepositType.IncludedInRent) {
        // Set deposit to 0 and make it disabled (greyed out and read-only)
        depositControl.setValue('0.00', { emitEvent: false });
        depositControl.disable({ emitEvent: false });
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
      }
      // Enable frequency when maid service is YES, set default to Once, and add validator
      if (frequencyControl) {
        // Only set to Once if current value is NA (to avoid overwriting user input)
        const currentFrequency = frequencyControl.value;
        if (currentFrequency === null || currentFrequency === undefined || currentFrequency === Frequency.NA) {
          frequencyControl.setValue(Frequency.OneTime, { emitEvent: false });
        }
        frequencyControl.enable({ emitEvent: false });
        // Frequency must not be NA when MaidService is Yes
        frequencyControl.setValidators([
          (control: AbstractControl): ValidationErrors | null => {
            const value = control.value;
            if (value === null || value === undefined || value === Frequency.NA) {
              return { mustNotBeNA: true };
            }
            return null;
          }
        ]);
        frequencyControl.updateValueAndValidity({ emitEvent: false });
      }
    }
  }

  // Supporting Data Loads
  loadContacts(): void {
    this.contactService.getContacts().pipe(take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
        // Initialize filtered contacts based on current client type
        const currentClientType = this.form?.get('reservationTypeId')?.value;
        if (currentClientType !== null && currentClientType !== undefined) {
          this.filterContactsByClientType(currentClientType);
        }
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation Component - Error loading contacts:', err);
        this.contacts = [];
        this.filteredContacts = [];
      }
    });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1)).subscribe({
      next: (agents: AgentResponse[]) => {
        this.agents = agents;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation Component - Error loading agents:', err);
        this.agents = [];
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getProperties().pipe(take(1)).subscribe({
      next: (properties: PropertyResponse[]) => {
         this.properties = properties;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation Component - Error loading properties:', err);
        this.properties = [];
      }
    });
  }

  loadCompanies(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) return;

    this.companyService.getCompanies().pipe(take(1)).subscribe({
      next: (companies: CompanyResponse[]) => {
        this.companies = (companies || []).filter(c => c.organizationId === orgId && c.isActive);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation Component - Error loading companies:', err);
        this.companies = [];
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
      { value: ReservationNotice.ThirtyDays, label: '30 Days' },
      { value: ReservationNotice.FourteenDays, label: '14 Days' }
    ];

    this.availableDepositTypes = [
      { value: DepositType.FlatFee, label: 'Flat Fee' },
      { value: DepositType.IncludedInRent, label: 'Included in Rent' }
    ];
  }

  // Validator Update Methods
  updateTenantNameValidator(reservationTypeId: number | null): void {
    const tenantNameControl = this.form?.get('tenantName');
    if (tenantNameControl) {
      // Tenant Name is only required when it is editable (enabled)
      // If disabled (Maintenance or Owner types), it's not required
      if (tenantNameControl.enabled) {
        tenantNameControl.setValidators([Validators.required]);
      } else {
        tenantNameControl.clearValidators();
      }
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
      // For Owner type: show only Owner Blocked and Maintenance (in that order)
      this.availableReservationStatuses = allStatuses.filter(status => 
        status.value === ReservationStatus.OwnerBlocked || 
        status.value === ReservationStatus.Maintenance
      ).sort((a, b) => {
        // Ensure OwnerBlocked appears first, then Maintenance
        if (a.value === ReservationStatus.OwnerBlocked) return -1;
        if (b.value === ReservationStatus.OwnerBlocked) return 1;
        return 0;
      });
    } else if (reservationTypeId === ReservationType.Private || 
               reservationTypeId === ReservationType.Corporate ) {
      // For Private, Corporate, Government, or External: show all EXCEPT Maintenance and Owner Blocked
      this.availableReservationStatuses = allStatuses.filter(status => 
        status.value !== ReservationStatus.Maintenance && 
        status.value !== ReservationStatus.OwnerBlocked
      );
    } else {
      // For other types or no type selected: show all statuses
      this.availableReservationStatuses = allStatuses;
    }

    // If current status is not in the available list, reset to empty (show "Select Status")
    const currentStatus = this.form?.get('reservationStatusId')?.value;
    if (currentStatus !== null && currentStatus !== undefined && currentStatus !== '') {
      const isValidStatus = this.availableReservationStatuses.some(status => status.value === currentStatus);
      if (!isValidStatus) {
        // Reset to empty to show "Select Status" placeholder
        this.form?.patchValue({ reservationStatusId: null }, { emitEvent: false });
      }
    }
  }

  // Format Methods
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

  // Phone helpers
  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  // Utility methods
  back(): void {
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }
  
  removeLoadItem(itemToRemove: string): void {
    if (this.itemsToLoad) {
      this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
    }
  }
}
