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
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { AgentService } from '../../agent/services/agent.service';
import { AgentResponse } from '../../agent/models/agent.model';
import { ClientType, ReservationStatus, BillingType, Frequency } from '../models/reservation-enum';
import { CheckinTimes, CheckoutTimes } from '../../property/models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';

@Component({
  selector: 'app-reservation',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
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
  selectedProperty: PropertyResponse | null = null;
  selectedContact: ContactResponse | null = null;
  departureDateStartAt: Date | null = null;
  availableClientTypes: { value: number, label: string }[] = [];
  availableReservationStatuses: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];
  availableBillingTypes: { value: number, label: string }[] = [];
  availableFrequencies: { value: number, label: string }[] = [];

  constructor(
    public reservationService: ReservationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private agentService: AgentService,
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
      tenantName: formValue.tenantName || '',
      clientId: formValue.clientId,
      clientTypeId: formValue.clientTypeId ?? ClientType.Private,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : new Date().toISOString(),
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : new Date().toISOString(),
      checkInTimeId: formValue.checkInTimeId ?? CheckinTimes.NA,
      checkOutTimeId: formValue.checkOutTimeId ?? CheckoutTimes.NA,
      billingTypeId: formValue.billingTypeId ?? BillingType.Monthly,
      billingRate: formValue.billingRate ? parseFloat(formValue.billingRate.toString()) : 0,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 1,
      deposit: formValue.deposit ? parseFloat(formValue.deposit.toString()) : null,
      checkoutFee: formValue.checkoutFee ? parseFloat(formValue.checkoutFee.toString()) : 0,
      maidServiceFee: formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0,
      frequencyId: formValue.frequencyId ?? Frequency.OneTime,
      petFee: formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0,
      extraFee: formValue.extraFee ? parseFloat(formValue.extraFee.toString()) : 0,
      extraFeeName: formValue.extraFeeName || '',
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
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
      propertyAddress: new FormControl({ value: '', disabled: true }),
      agentId: new FormControl(null),
      tenantName: new FormControl('', [Validators.required]),
      clientId: new FormControl({ value: '', disabled: true }, [Validators.required]),
      clientTypeId: new FormControl(null, [Validators.required]),
      reservationStatusId: new FormControl(ReservationStatus.PreBooking, [Validators.required]),
      isActive: new FormControl(true),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl<number>(CheckinTimes.NA),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.NA),
      billingTypeId: new FormControl(BillingType.Monthly, [Validators.required]),
      billingRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(1, [Validators.required]),
      phone: new FormControl(''),
      email: new FormControl(''),
      deposit: new FormControl<string>('0.00'),
      checkoutFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00', [Validators.required]),
      frequencyId: new FormControl(Frequency.OneTime, [Validators.required]),
      petFee: new FormControl<string>('0.00', [Validators.required]),
      extraFee: new FormControl<string>('0.00'),
      extraFeeName: new FormControl(''),
      taxes: new FormControl(null)
    });

    this.form.get('propertyId')?.valueChanges.subscribe(propertyId => {
      if (propertyId) {
        this.selectedProperty = this.properties.find(p => p.propertyId === propertyId) || null;
        const propertyAddress = this.selectedProperty 
          ? `${this.selectedProperty.address1}${this.selectedProperty.suite ? ' ' + this.selectedProperty.suite : ''}`.trim()
          : '';
        this.form.patchValue({ propertyAddress: propertyAddress }, { emitEvent: false });
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

    // clientId starts disabled - will be enabled when clientTypeId is selected

    // Filter contacts based on client type
    this.form.get('clientTypeId')?.valueChanges.subscribe(clientTypeId => {
      this.filterContactsByClientType(clientTypeId);
      // Clear client selection when type changes
      this.form.patchValue({ clientId: '', phone: '', email: '' }, { emitEvent: false });
      this.selectedContact = null;
      // Enable/disable clientId based on whether type is selected
      if (clientTypeId !== null && clientTypeId !== undefined) {
        this.form.get('clientId')?.enable();
      } else {
        this.form.get('clientId')?.disable();
      }
    });

    // Auto-fill phone and email when client is selected
    this.form.get('clientId')?.valueChanges.subscribe(clientId => {
      if (clientId) {
        const contact = this.filteredContacts.find(c => c.contactId === clientId) || this.contacts.find(c => c.contactId === clientId);
        if (contact) {
          this.selectedContact = contact;
          this.form.patchValue({
            phone: this.formatterService.phoneNumber(contact.phone) || '',
            email: contact.email || ''
          }, { emitEvent: false });
        }
      } else {
        this.selectedContact = null;
        this.form.patchValue({
          phone: '',
          email: ''
        }, { emitEvent: false });
      }
    });
  }

  filterContactsByClientType(clientTypeId: number | null, callback?: () => void): void {
    if (clientTypeId === null || clientTypeId === undefined) {
      this.filteredContacts = [];
      if (callback) callback();
      return;
    }

    if (clientTypeId === ClientType.Private || clientTypeId === ClientType.External) {
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
    } else if (clientTypeId === ClientType.Corporate || clientTypeId === ClientType.Government) {
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
    } else {
      this.filteredContacts = [];
      if (callback) callback();
    }
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
          const clientTypeId = this.reservation.clientTypeId ?? ClientType.Private;
          const clientId = this.reservation.clientId;
          
          // Enable clientId if clientTypeId is set
          if (clientTypeId !== null && clientTypeId !== undefined) {
            this.form.get('clientId')?.enable();
          }
          
          // Filter contacts based on client type first, then populate form
          this.filterContactsByClientType(clientTypeId, () => {
            const contact = this.filteredContacts.find(c => c.contactId === clientId) || allContacts.find(c => c.contactId === clientId);
            
            this.form.patchValue({
              propertyId: this.reservation.propertyId,
              propertyAddress: propertyAddress,
              agentId: this.reservation.agentId || null,
              tenantName: this.reservation.tenantName || '',
              clientId: clientId,
              clientTypeId: clientTypeId,
              reservationStatusId: this.reservation.reservationStatusId ?? ReservationStatus.PreBooking,
              isActive: isActiveValue,
              arrivalDate: this.reservation.arrivalDate ? new Date(this.reservation.arrivalDate) : null,
              departureDate: this.reservation.departureDate ? new Date(this.reservation.departureDate) : null,
              checkInTimeId: Number(this.reservation.checkInTimeId ?? CheckinTimes.NA),
              checkOutTimeId: Number(this.reservation.checkOutTimeId ?? CheckoutTimes.NA),
              billingTypeId: this.reservation.billingTypeId ?? BillingType.Monthly,
              billingRate: (this.reservation.billingRate ?? 0).toFixed(2),
              numberOfPeople: this.reservation.numberOfPeople === 0 ? 1 : this.reservation.numberOfPeople,
              deposit: this.reservation.deposit ? this.reservation.deposit.toFixed(2) : '0.00',
              checkoutFee: (this.reservation.checkoutFee ?? 0).toFixed(2),
              maidServiceFee: (this.reservation.maidServiceFee ?? 0).toFixed(2),
              frequencyId: this.reservation.frequencyId ?? Frequency.OneTime,
              petFee: (this.reservation.petFee ?? 0).toFixed(2),
              extraFee: (this.reservation.extraFee ?? 0).toFixed(2),
              extraFeeName: this.reservation.extraFeeName || '',
              taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes,
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


  // Supporting data loads
  loadContacts(): void {
    this.contactService.getContacts().pipe(take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
        // Initialize filtered contacts based on current client type
        const currentClientType = this.form?.get('clientTypeId')?.value;
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

  initializeEnums(): void {
    this.availableClientTypes = [
      { value: ClientType.Private, label: 'Private' },
      { value: ClientType.Corporate, label: 'Corporate' },
      { value: ClientType.Government, label: 'Government' },
      { value: ClientType.External, label: 'External' }
    ];

    this.availableReservationStatuses = [
      { value: ReservationStatus.PreBooking, label: 'Pre-Booking' },
      { value: ReservationStatus.Confirmed, label: 'Confirmed' },
      { value: ReservationStatus.CheckedIn, label: 'Checked In' },
      { value: ReservationStatus.GaveNotice, label: 'Gave Notice' },
      { value: ReservationStatus.FirstRightRefusal, label: 'First Right of Refusal' },
      { value: ReservationStatus.Maintenance, label: 'Maintenance' },
      { value: ReservationStatus.OwnerBlocked, label: 'Owner Blocked' }
      
    ];

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
      { value: Frequency.OneTime, label: 'One Time' },
      { value: Frequency.Weekly, label: 'Weekly' },
      { value: Frequency.BiWeekly, label: 'Bi-Weekly' },
      { value: Frequency.Monthly, label: 'Monthly' }
    ];
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

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

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
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

  back(): void {
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }
}
