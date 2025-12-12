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
import { ClientType, ReservationStatus } from '../models/reservation-enum';
import { CheckinTimes, CheckoutTimes } from '../../property/models/property-enums';

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
  agents: AgentResponse[] = [];
  properties: PropertyResponse[] = [];
  selectedProperty: PropertyResponse | null = null;
  departureDateStartAt: Date | null = null;
  availableClientTypes: { value: number, label: string }[] = [];
  availableReservationStatuses: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];

  constructor(
    public reservationService: ReservationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private agentService: AgentService
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
    const reservationRequest: ReservationRequest = {
      ...formValue,
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : undefined,
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : undefined,
      monthlyRate: formValue.monthlyRate ? parseFloat(formValue.monthlyRate.toString()) : 0,
      dailyRate: formValue.dailyRate ? parseFloat(formValue.dailyRate.toString()) : 0,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 0,
      deposit: formValue.deposit ? parseFloat(formValue.deposit.toString()) : 0,
      departureFee: formValue.departureFee ? parseFloat(formValue.departureFee.toString()) : 0,
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
      checkInTimeId: formValue.checkInTimeId ?? CheckinTimes.NA,
      checkOutTimeId: formValue.checkOutTimeId ?? CheckoutTimes.NA,
      clientTypeId: formValue.clientTypeId ?? ClientType.Private,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      address1: '',
      address2: '',
      suite: '',
      city: '',
      state: '',
      zip: '',
      phone: ''
    };

    if (!this.isAddMode) {
      reservationRequest.reservationId = this.reservationId;
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
      agentId: new FormControl('', [Validators.required]),
      contactId: new FormControl('', [Validators.required]),
      clientTypeId: new FormControl(ClientType.Private, [Validators.required]),
      reservationStatusId: new FormControl(ReservationStatus.PreBooking, [Validators.required]),
      isActive: new FormControl(true),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl<number>(CheckinTimes.NA),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.NA),
      monthlyRate: new FormControl<string>('0.00', [Validators.required]),
      dailyRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(null, [Validators.required]),
      deposit: new FormControl<string>('0.00'),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
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
      
      this.form.patchValue({
        propertyId: this.reservation.propertyId,
        propertyAddress: propertyAddress,
        agentId: this.reservation.agentId,
        contactId: this.reservation.contactId,
        clientTypeId: this.reservation.clientTypeId ?? ClientType.Private,
        reservationStatusId: this.reservation.reservationStatusId ?? ReservationStatus.PreBooking,
        isActive: isActiveValue,
        arrivalDate: this.reservation.arrivalDate ? new Date(this.reservation.arrivalDate) : null,
        departureDate: this.reservation.departureDate ? new Date(this.reservation.departureDate) : null,
        checkInTimeId: Number(this.reservation.checkInTimeId ?? CheckinTimes.NA),
        checkOutTimeId: Number(this.reservation.checkOutTimeId ?? CheckoutTimes.NA),
        monthlyRate: (this.reservation.monthlyRate ?? 0).toFixed(2),
        dailyRate: (this.reservation.dailyRate ?? 0).toFixed(2),
        numberOfPeople: this.reservation.numberOfPeople === 0 ? null : this.reservation.numberOfPeople,
        deposit: (this.reservation.deposit ?? 0).toFixed(2),
        departureFee: (this.reservation.departureFee ?? 0).toFixed(2),
        taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes
      });

      if (this.reservation.propertyId) {
        this.selectedProperty = this.properties.find(p => p.propertyId === this.reservation.propertyId) || null;
      }
    }
  }


  // Supporting data loads
  loadContacts(): void {
    this.contactService.getAllTenantContacts().pipe(filter((contacts: ContactResponse[]) => contacts && contacts.length > 0), take(1)).subscribe({
      next: (contacts: ContactResponse[]) => {
        this.contacts = contacts;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Reservation Component - Error loading contacts:', err);
        this.contacts = [];
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

  back(): void {
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }
}
