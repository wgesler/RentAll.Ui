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
import { AgentService } from '../../agent/services/agent.service';
import { AgentResponse } from '../../agent/models/agent.model';
import { CompanyService } from '../../company/services/company.service';
import { CompanyResponse } from '../../company/models/company.model';
import { ReservationType, ReservationStatus, BillingType, Frequency, ReservationNotice } from '../models/reservation-enum';
import { CheckinTimes, CheckoutTimes } from '../../property/models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { ReservationWelcomeLetterComponent } from '../reservation-welcome-letter/reservation-welcome-letter.component';
import { ReservationLeaseComponent } from '../reservation-lease/reservation-lease.component';

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, ReservationWelcomeLetterComponent, ReservationLeaseComponent],
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
  contacts: ContactResponse[] = [];
  filteredContacts: ContactResponse[] = [];
  agents: AgentResponse[] = [];
  properties: PropertyResponse[] = [];
  companies: CompanyResponse[] = [];
  selectedProperty: PropertyResponse | null = null;
  selectedContact: ContactResponse | null = null;
  departureDateStartAt: Date | null = null;
  availableClientTypes: { value: number, label: string }[] = [];
  availableReservationStatuses: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];
  availableBillingTypes: { value: number, label: string }[] = [];
  availableFrequencies: { value: number, label: string }[] = [];
  availableReservationNotices: { value: number, label: string }[] = [];
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
    private formatterService: FormatterService
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
        if (this.isAddMode) {
          this.removeLoadItem('reservation');
          this.buildForm();
        } else {
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
      take(1),
      finalize(() => { this.removeLoadItem('reservation'); })
    ).subscribe({
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
      reservationTypeId: formValue.reservationTypeId ?? ReservationType.Private,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      reservationNoticeId: formValue.reservationNoticeId || null,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 1,
      hasPets: formValue.pets ?? false,
      tenantName: formValue.tenantName || '',
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : new Date().toISOString(),
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : new Date().toISOString(),
      checkInTimeId: formValue.checkInTimeId ?? CheckinTimes.NA,
      checkOutTimeId: formValue.checkOutTimeId ?? CheckoutTimes.NA,
      billingTypeId: formValue.billingTypeId ?? BillingType.Monthly,
      billingRate: formValue.billingRate ? parseFloat(formValue.billingRate.toString()) : 0,
      deposit: formValue.deposit ? parseFloat(formValue.deposit.toString()) : null,
      departureFee: formValue.departureFee ? parseFloat(formValue.departureFee.toString()) : 0,
      maidServiceFee: formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0,
      frequencyId: formValue.frequencyId ?? Frequency.NA,
      petFee: formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0,
      extraFee: formValue.extraFee ? parseFloat(formValue.extraFee.toString()) : 0,
      extraFeeName: formValue.extraFeeName || '',
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
      notes: formValue.notes !== null && formValue.notes !== undefined ? String(formValue.notes) : '',
      isActive: formValue.isActive ?? true
    };

    if (!this.isAddMode) {
      reservationRequest.reservationId = this.reservationId;
      reservationRequest.organizationId = this.reservation?.organizationId || user?.organizationId || '';
    }

    const save$ = this.isAddMode
      ? this.reservationService.createReservation(reservationRequest)
      : this.reservationService.updateReservation(this.reservationId, reservationRequest);

    save$.pipe(
      take(1),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
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
      propertyId: new FormControl('', [Validators.required]),
      propertyAddress: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      agentId: new FormControl(null, [Validators.required]),
      tenantName: new FormControl({ value: '', disabled: true }), // No validators - will be added when enabled
      contactId: new FormControl({ value: '', disabled: true }), // No validators - will be added when enabled
      companyId: new FormControl(null),
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
      hasPets: new FormControl(false),
      phone: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      email: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      deposit: new FormControl<string>('0.00'),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00'),
      frequencyId: new FormControl(Frequency.NA),
      petFee: new FormControl<string>('0.00'),
      extraFee: new FormControl<string>('0.00'),
      extraFeeName: new FormControl(''),
      taxes: new FormControl(null),
      notes: new FormControl('')
    });

    this.form.get('propertyId')?.valueChanges.subscribe(propertyId => {
      if (propertyId) {
        this.selectedProperty = this.properties.find(p => p.propertyId === propertyId) || null;
        const propertyAddress = this.selectedProperty 
          ? `${this.selectedProperty.address1}${this.selectedProperty.suite ? ' ' + this.selectedProperty.suite : ''}`.trim()
          : '';
        
        // Pre-load property values into form fields
        const patchValues: any = {
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
          
          // Pre-load pet fee
          if (this.selectedProperty.petFee !== null && this.selectedProperty.petFee !== undefined) {
            patchValues.petFee = this.selectedProperty.petFee.toFixed(2);
          }
          
          // Pre-load maid service fee
          if (this.selectedProperty.maidServiceFee !== null && this.selectedProperty.maidServiceFee !== undefined) {
            patchValues.maidServiceFee = this.selectedProperty.maidServiceFee.toFixed(2);
          }
          
          // Pre-load deposit (default to 0 if not available on property)
          patchValues.deposit = '0.00';
          
          // Pre-load taxes (default to null if not available on property)
          patchValues.taxes = null;
          
          // Pre-load check-in time from property (ensure it's a number for dropdown selection)
          const checkInTime = this.selectedProperty.checkInTimeId;
          patchValues.checkInTimeId = (checkInTime !== null && checkInTime !== undefined) 
            ? Number(checkInTime) 
            : CheckinTimes.FourPM;
          
          // Pre-load check-out time from property (ensure it's a number for dropdown selection)
          const checkOutTime = this.selectedProperty.checkOutTimeId;
          patchValues.checkOutTimeId = (checkOutTime !== null && checkOutTime !== undefined) 
            ? Number(checkOutTime) 
            : CheckoutTimes.ElevenAM;
          
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
        this.form.patchValue({ propertyAddress: '' }, { emitEvent: false });
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
        email: ''
      }, { emitEvent: false });
      
      // Clear selected contact reference
      this.selectedContact = null;
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

    // Auto-fill phone and email when client is selected
    this.form.get('contactId')?.valueChanges.subscribe(contactId => {
      if (contactId) {
        const contact = this.filteredContacts.find(c => c.contactId === contactId) || this.contacts.find(c => c.contactId === contactId);
        if (contact) {
          this.selectedContact = contact;
          const reservationTypeId = this.form.get('reservationTypeId')?.value;
          // Enable and populate phone and email when contact is selected
          this.form.get('phone')?.enable();
          this.form.get('email')?.enable();
          // Only enable tenantName if Reservation Type is NOT Maintenance and NOT Owner
          if (reservationTypeId !== ReservationType.Owner) {
            this.form.get('tenantName')?.enable();
            // Update validator when enabling - tenantName is required when editable
            this.updateTenantNameValidator(reservationTypeId);
          }
          
          // Build contact name
          const contactName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
          
          // Prepare patch values
          const patchValues: any = {
            phone: this.formatterService.phoneNumber(contact.phone) || '',
            email: contact.email || ''
          };
          
          // If Reservation Type is Private, or Owner, populate tenantName with contact name
          if ((reservationTypeId === ReservationType.Private || 
               reservationTypeId === ReservationType.Owner) && contactName) {
            patchValues.tenantName = contactName;
          }
          
          this.form.patchValue(patchValues, { emitEvent: false });
        }
      } else {
        this.selectedContact = null;
        // Disable and clear tenantName, phone, and email when no contact is selected - clear validators
        this.disableFieldWithValidation('tenantName');
        this.disableFieldWithValidation('phone');
        this.disableFieldWithValidation('email');
        this.form.patchValue({
          phone: '',
          email: ''
        }, { emitEvent: false });
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
            
            // Enable phone and email when contact is found
            // Only enable tenantName if Reservation Type is NOT Maintenance and NOT Owner
            if (contactId) {
              if ( reservationTypeId !== ReservationType.Owner) {
                this.enableFieldWithValidation('tenantName', [Validators.required]);
                // Update validator when enabling - tenantName is required when editable
                this.updateTenantNameValidator(reservationTypeId);
              }
              this.enableFieldWithValidation('phone');
              this.enableFieldWithValidation('email');
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
              this.disableFieldWithValidation('maidServiceFee');
              this.disableFieldWithValidation('frequencyId');
              this.disableFieldWithValidation('extraFee');
              this.disableFieldWithValidation('extraFeeName');
              this.disableFieldWithValidation('taxes');
            } else {
              // Enable all fields for non-Owner types - restore validators
              this.enableFieldWithValidation('checkInTimeId');
              this.enableFieldWithValidation('checkOutTimeId');
              this.enableFieldWithValidation('billingTypeId', [Validators.required]);
              this.enableFieldWithValidation('billingRate', [Validators.required]);
              this.enableFieldWithValidation('deposit');
              this.enableFieldWithValidation('departureFee', [Validators.required]);
              this.enableFieldWithValidation('petFee');
              this.enableFieldWithValidation('maidServiceFee');
              this.enableFieldWithValidation('frequencyId');
              this.enableFieldWithValidation('extraFee');
              this.enableFieldWithValidation('extraFeeName');
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
              checkInTimeId: Number(this.reservation.checkInTimeId ?? CheckinTimes.NA),
              checkOutTimeId: Number(this.reservation.checkOutTimeId ?? CheckoutTimes.NA),
              billingTypeId: this.reservation.billingTypeId ?? BillingType.Monthly,
              billingRate: (this.reservation.billingRate ?? 0).toFixed(2),
              numberOfPeople: numberOfPeopleValue,
              deposit: this.reservation.deposit ? this.reservation.deposit.toFixed(2) : '0.00',
              departureFee: (this.reservation.departureFee ?? 0).toFixed(2),
              maidServiceFee: (this.reservation.maidServiceFee ?? 0).toFixed(2),
              frequencyId: this.reservation.frequencyId ?? Frequency.NA,
              petFee: (this.reservation.petFee ?? 0).toFixed(2),
              extraFee: (this.reservation.extraFee ?? 0).toFixed(2),
              extraFeeName: this.reservation.extraFeeName || '',
              taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes,
              notes: this.reservation.notes || '',
              hasPets: this.reservation.hasPets ?? false,
              phone: this.formatterService.phoneNumber(contact?.phone) || '',
              email: contact?.email || ''
            }, { emitEvent: false });
            
            if (contact) {
              this.selectedContact = contact;
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
      // Get companies
      this.contactService.getAllOwnerContacts().pipe(take(1)).subscribe({
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
    } else {
      this.filteredContacts = [];
      if (callback) callback();
    }
  }

  // Supporting data loads
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
        console.log('Properties loaded:', properties);
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

    this.checkInTimes = [
      { value: CheckinTimes.NA, label: 'N/A' },
      { value: CheckinTimes.TwelvePM, label: '12:00 PM' },
      { value: CheckinTimes.OnePM, label: '1:00 PM' },
      { value: CheckinTimes.TwoPM, label: '2:00 PM' },
      { value: CheckinTimes.ThreePM, label: '3:00 PM' },
      { value: CheckinTimes.FourPM, label: '4:00 PM' },
      { value: CheckinTimes.FivePM, label: '5:00 PM' }
    ];

    this.checkOutTimes = [
      { value: CheckoutTimes.NA, label: 'N/A' },
      { value: CheckoutTimes.EightAM, label: '8:00 AM' },
      { value: CheckoutTimes.NineAM, label: '9:00 AM' },
      { value: CheckoutTimes.TenAM, label: '10:00 AM' },
      { value: CheckoutTimes.ElevenAM, label: '11:00 AM' },
      { value: CheckoutTimes.TwelvePM, label: '12:00 PM' },
      { value: CheckoutTimes.OnePM, label: '1:00 PM' }
    ];

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
      { value: ReservationNotice.FifteenDays, label: '15 Days' }
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
    const control = this.form.get(fieldName);
    if (control && control.value !== null && control.value !== '') {
      const value = parseFloat(control.value.toString().replace(/[^0-9.]/g, ''));
      if (!isNaN(value)) {
        const formatted = value.toFixed(2);
        control.setValue(formatted, { emitEvent: false });
      } else {
        control.setValue('0.00', { emitEvent: false });
      }
    } else {
      control?.setValue('0.00', { emitEvent: false });
    }
  }

  onDecimalInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9.]/g, '');
    
    // Allow only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
    
    this.form.get(fieldName)?.setValue(input.value, { emitEvent: false });
  }

  onIntegerInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.form.get(fieldName)?.setValue(value, { emitEvent: false });
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
      this.form.get('phone')?.setValue(formatted, { emitEvent: false });
    }
  }

  // Utility methods
  back(): void {
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }
  
  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}
