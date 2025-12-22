import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { FormBuilder, FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PropertyService } from '../services/property.service';
import { ReservationService } from '../../reservation/services/reservation.service';
import { PropertyResponse } from '../models/property.model';
import { ReservationResponse } from '../../reservation/models/reservation-model';
import { PropertyLetterRequest, PropertyLetterResponse } from '../models/property-letter.model';
import { CheckinTimes, CheckoutTimes } from '../models/property-enums';
import { AuthService } from '../../../services/auth.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-property-welcome-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './property-welcome-letter.component.html',
  styleUrl: './property-welcome-letter.component.scss'
})
export class PropertyWelcomeLetterComponent implements OnInit {
  @Input() propertyId: string | null = null;
  
  property: PropertyResponse | null = null;
  reservations: ReservationResponse[] = [];
  filteredReservations: ReservationResponse[] = [];
  isLoading: boolean = true;
  isSubmitting: boolean = false;
  form: FormGroup;
  
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];

  constructor(
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    this.initializeTimeOptions();
    this.form = this.buildForm();
    this.setupReservationChangeHandler();
  }

  ngOnInit(): void {
    if (this.propertyId) {
      this.loadPropertyData();
    } else {
      this.isLoading = false;
    }
  }

  initializeTimeOptions(): void {
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

  buildForm(): FormGroup {
    return this.fb.group({
      propertyCode: new FormControl({ value: '', disabled: true }),
      reservationId: new FormControl(null),
      tenantName: new FormControl('', [Validators.required]),
      buildingName: new FormControl(''),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl(CheckinTimes.FourPM, [Validators.required]),
      checkOutTimeId: new FormControl(CheckoutTimes.ElevenAM, [Validators.required]),
      arrivalInstructions: new FormControl('', [Validators.required]),
      compmunityAddress: new FormControl(''),
      apartmentAddress: new FormControl('', [Validators.required]),
      size: new FormControl(1, [Validators.required]),
      suite: new FormControl('', [Validators.required]),
      access: new FormControl('', [Validators.required]),
      mailbox: new FormControl('', [Validators.required]),
      package: new FormControl('', [Validators.required]),
      PparkingInformation: new FormControl('', [Validators.required]),
      amenaties: new FormControl('', [Validators.required]),
      Laundry: new FormControl('', [Validators.required]),
      trashLocation: new FormControl('', [Validators.required]),
      providedFurnishings: new FormControl('', [Validators.required]),
      housekeeping: new FormControl(''),
      televisionSouce: new FormControl('', [Validators.required]),
      internetService: new FormControl('', [Validators.required]),
      internetNetwork: new FormControl(''),
      internetPasword: new FormControl(''),
      keyReturn: new FormControl('', [Validators.required]),
      supportContact: new FormControl('', [Validators.required]),
      emergencyContact: new FormControl('', [Validators.required]),
      emergencyContactNumber: new FormControl('', [Validators.required]),
      additionalNotes: new FormControl('')
    });
  }

  loadPropertyData(): void {
    if (!this.propertyId) return;

    this.propertyService.getProperties().pipe(take(1)).subscribe({
      next: (properties: PropertyResponse[]) => {
        this.property = properties.find(p => p.propertyId === this.propertyId) || null;
        if (this.property) {
          this.form.patchValue({ propertyCode: this.property.propertyCode });
        }
        this.loadReservations();
      },
      error: (err) => {
        console.error('Error loading property:', err);
        this.isLoading = false;
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservations().pipe(take(1)).subscribe({
      next: (reservations: ReservationResponse[]) => {
        this.reservations = reservations;
        // Filter reservations for this property
        if (this.propertyId) {
          this.filteredReservations = reservations.filter(r => r.propertyId === this.propertyId);
        } else {
          this.filteredReservations = [];
        }
        this.isLoading = false;
        this.populateFormFromProperty();
      },
      error: (err) => {
        console.error('Error loading reservations:', err);
        this.isLoading = false;
        this.populateFormFromProperty();
      }
    });
  }

  setupReservationChangeHandler(): void {
    this.form.get('reservationId')?.valueChanges.subscribe(reservationId => {
      if (reservationId) {
        const reservation = this.filteredReservations.find(r => r.reservationId === reservationId);
        if (reservation) {
          this.populateFormFromReservation(reservation);
        }
      }
    });
  }

  populateFormFromReservation(reservation: ReservationResponse): void {
    const formValues: any = {
      tenantName: reservation.tenantName || reservation.contactName || '',
      arrivalDate: reservation.arrivalDate ? new Date(reservation.arrivalDate) : null,
      departureDate: reservation.departureDate ? new Date(reservation.departureDate) : null,
      checkInTimeId: reservation.checkInTimeId ?? CheckinTimes.FourPM,
      checkOutTimeId: reservation.checkOutTimeId ?? CheckoutTimes.ElevenAM
    };

    this.form.patchValue(formValues, { emitEvent: false });
  }

  populateFormFromProperty(): void {
    if (!this.property) return;

    const formValues: any = {
      buildingName: this.property.buildingCode || '',
      compmunityAddress: this.getFullPropertyAddress(),
      apartmentAddress: this.getApartmentAddress(),
      size: this.property.bedrooms || 1,
      suite: this.property.suite || '',
      mailbox: this.property.mailbox || '',
      PparkingInformation: this.property.parkingNotes || '',
      Laundry: this.property.washerDryer ? 'Washer and dryer in unit' : '',
      trashLocation: 'Located on the unit floor',
      providedFurnishings: this.property.unfurnished ? 'Unfurnished' : 'Furniture & Housewares',
      televisionSouce: this.property.cable ? 'Cable' : '',
      internetService: this.property.fastInternet ? 'High-Speed Wireless' : '',
      internetNetwork: this.property.amenities || '',
      supportContact: this.property.phone || '',
      checkInTimeId: this.property.checkInTimeId ?? CheckinTimes.FourPM,
      checkOutTimeId: this.property.checkOutTimeId ?? CheckoutTimes.ElevenAM
    };

    // Set default values for required fields if empty
    formValues.arrivalInstructions = formValues.arrivalInstructions || 'Temporarily find parking along the street. Go inside the front door.';
    formValues.access = formValues.access || '1 Unit Key, 1 Mail Key, 1 FOB';
    formValues.package = formValues.package || 'Delivered to Luxor One lockers or mailroom.';
    formValues.amenaties = formValues.amenaties || 'Use FOB to access: Fitness Center, The Zone, 9th Floor Lounge, Café Lounge, Two Pools, Two Hot Tubs, Fire Pit, Grill Terrace, and Zen Garden.';
    formValues.keyReturn = formValues.keyReturn || 'Leave all keys and access cards/FOBs on the kitchen counter and lock yourself out of the unit.';
    formValues.supportContact = formValues.supportContact || '720-457-7559';
    formValues.emergencyContact = formValues.emergencyContact || 'AvenueWest (After Hours)';
    formValues.emergencyContactNumber = formValues.emergencyContactNumber || '800-928-1592';

    this.form.patchValue(formValues);
  }

  getFullPropertyAddress(): string {
    if (!this.property) return '';
    const addressParts = [
      this.property.address1,
      this.property.address2,
      this.property.suite
    ].filter(p => p);
    const address = addressParts.join(' ');
    const cityState = `${this.property.city}, ${this.property.state}`;
    return [address, cityState].filter(p => p).join(' ');
  }

  getApartmentAddress(): string {
    if (!this.property) return '';
    const addressParts = [
      this.property.address1,
      this.property.address2,
      this.property.suite ? `#${this.property.suite}` : ''
    ].filter(p => p);
    const address = addressParts.join(' ');
    const cityState = `${this.property.city}, ${this.property.state}`;
    return [address, cityState].filter(p => p).join(' ');
  }

  saveWelcomeLetter(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.propertyId) {
      console.error('No property ID available');
      return;
    }

    this.isSubmitting = true;

    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();

    const propertyLetterRequest: PropertyLetterRequest = {
      propertyId: this.propertyId,
      organizationId: user?.organizationId || this.property?.organizationId || '',
      tenantName: formValue.tenantName,
      buildingName: formValue.buildingName || undefined,
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : new Date().toISOString(),
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : new Date().toISOString(),
      checkInTimeId: formValue.checkInTimeId ?? CheckinTimes.FourPM,
      checkOutTimeId: formValue.checkOutTimeId ?? CheckoutTimes.ElevenAM,
      arrivalInstructions: formValue.arrivalInstructions || '',
      compmunityAddress: formValue.compmunityAddress || undefined,
      apartmentAddress: formValue.apartmentAddress || '',
      size: formValue.size ? Number(formValue.size) : 1,
      suite: formValue.suite || '',
      access: formValue.access || '',
      mailbox: formValue.mailbox || '',
      package: formValue.package || '',
      PparkingInformation: formValue.PparkingInformation || '',
      amenaties: formValue.amenaties || '',
      Laundry: formValue.Laundry || '',
      trashLocation: formValue.trashLocation || '',
      providedFurnishings: formValue.providedFurnishings || '',
      housekeeping: formValue.housekeeping || '',
      televisionSouce: formValue.televisionSouce || '',
      internetService: formValue.internetService || '',
      internetNetwork: formValue.internetNetwork || '',
      internetPasword: formValue.internetPasword || '',
      keyReturn: formValue.keyReturn || '',
      supportContact: formValue.supportContact || '',
      emergencyContact: formValue.emergencyContact || '',
      emergencyContactNumber: formValue.emergencyContactNumber || '',
      additionalNotes: formValue.additionalNotes || ''
    };

    // TODO: Call service to save property letter
    // this.propertyLetterService.savePropertyLetter(propertyLetterRequest).subscribe(...)
    
    console.log('Property Letter Request:', propertyLetterRequest);
    this.isSubmitting = false;
    
    // For now, just log the request. You'll need to implement the service call.
  }
}
