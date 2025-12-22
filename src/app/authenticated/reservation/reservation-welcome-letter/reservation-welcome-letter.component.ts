import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute } from '@angular/router';
import { ReservationService } from '../services/reservation.service';
import { PropertyService } from '../../property/services/property.service';
import { ReservationResponse } from '../models/reservation-model';
import { PropertyResponse } from '../../property/models/property.model';
import { CheckinTimes, CheckoutTimes } from '../../property/models/property-enums';
import { HttpErrorResponse } from '@angular/common/http';
import { take } from 'rxjs';
import { FormatterService } from '../../../services/formatter-service';

@Component({
  selector: 'app-reservation-welcome-letter',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reservation-welcome-letter.component.html',
  styleUrl: './reservation-welcome-letter.component.scss'
})

export class ReservationWelcomeLetterComponent implements OnInit {
  @Input() reservationId: string | null = null;
  
  reservation: ReservationResponse | null = null;
  property: PropertyResponse | null = null;
  letterContent: string = '';
  isLoading: boolean = true;

  constructor(
    private route: ActivatedRoute,
    private reservationService: ReservationService,
    private propertyService: PropertyService,
    private formatterService: FormatterService
  ) {}

  ngOnInit(): void {
    // Get reservationId from route if not provided as input
    if (!this.reservationId) {
      this.route.parent?.paramMap.subscribe(params => {
        this.reservationId = params.get('id');
        if (this.reservationId && this.reservationId !== 'new') {
          this.loadData();
        } else {
          this.isLoading = false;
        }
      });
    } else if (this.reservationId && this.reservationId !== 'new') {
      this.loadData();
    } else {
      this.isLoading = false;
    }
  }

  loadData(): void {
    if (!this.reservationId || this.reservationId === 'new') {
      this.isLoading = false;
      return;
    }

    this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1)).subscribe({
      next: (reservation: ReservationResponse) => {
        this.reservation = reservation;
        // Load property data
        if (reservation.propertyId) {
          this.propertyService.getPropertyByGuid(reservation.propertyId).pipe(take(1)).subscribe({
            next: (property: PropertyResponse) => {
              this.property = property;
              this.generateLetter();
              this.isLoading = false;
            },
            error: (err: HttpErrorResponse) => {
              console.error('Error loading property:', err);
              this.generateLetter(); // Generate letter with just reservation data
              this.isLoading = false;
            }
          });
        } else {
          this.generateLetter();
          this.isLoading = false;
        }
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading reservation:', err);
        this.isLoading = false;
      }
    });
  }

  generateLetter(): void {
    if (!this.reservation) {
      this.letterContent = 'Please select a reservation to generate the welcome letter.';
      return;
    }

    // Build the letter with populated data
    this.letterContent = this.populateLetterTemplate();
  }

  populateLetterTemplate(): string {
    const r = this.reservation;
    const p = this.property;

    // Helper functions
    const formatDate = (dateStr: string): string => {
      if (!dateStr) return '';
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      } catch {
        return dateStr;
      }
    };

    const formatTime = (timeId: number, isCheckIn: boolean): string => {
      if (!timeId || timeId === 0) return '';
      if (isCheckIn) {
        const times: { [key: number]: string } = {
          [CheckinTimes.TwelvePM]: '12:00 pm',
          [CheckinTimes.OnePM]: '1:00 pm',
          [CheckinTimes.TwoPM]: '2:00 pm',
          [CheckinTimes.ThreePM]: '3:00 pm',
          [CheckinTimes.FourPM]: '4:00 pm',
          [CheckinTimes.FivePM]: '5:00 pm'
        };
        return times[timeId] || '';
      } else {
        const times: { [key: number]: string } = {
          [CheckoutTimes.EightAM]: '8:00 am',
          [CheckoutTimes.NineAM]: '9:00 am',
          [CheckoutTimes.TenAM]: '10:00 am',
          [CheckoutTimes.ElevenAM]: '11:00 am',
          [CheckoutTimes.TwelvePM]: '12:00 pm',
          [CheckoutTimes.OnePM]: '1:00 pm'
        };
        return times[timeId] || '';
      }
    };

    const getCommunityName = (): string => {
      // Try building name, then property code, then neighborhood
      if (p?.neighborhood) return p.neighborhood;
      if (r?.propertyCode) return r.propertyCode;
      return 'N/A';
    };

    const getFullAddress = (): string => {
      if (!p) return r?.propertyAddress || '';
      const parts = [p.address1];
      if (p.suite) parts.push(`#${p.suite}`);
      if (p.city) parts.push(p.city);
      if (p.state) parts.push(p.state);
      if (p.zip) parts.push(p.zip);
      return parts.join(', ');
    };

    const getApartmentAddress = (): string => {
      if (!p) return r?.propertyAddress || '';
      const parts = [p.address1];
      if (p.suite) parts.push(`#${p.suite}`);
      if (p.city) parts.push(p.city);
      if (p.state) parts.push(p.state);
      if (p.zip) parts.push(p.zip);
      return parts.join(', ');
    };

    const getBuilding = (): string => {
      // Could be building name from building lookup, or N/A
      return 'N/A';
    };

    const getSize = (): string => {
      if (!p) return 'N/A';
      return `${p.bedrooms}`;
    };

    const getUnitFloorLevel = (): string => {
      if (!p?.suite) return 'N/A';
      // Extract floor from suite if it's in the format like "3907" (39th floor)
      const match = p.suite.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= 10) {
          return Math.floor(num / 100).toString();
        }
      }
      return 'N/A';
    };

    const getAccess = (): string => {
      const access = [];
      if (p?.keypadAccess) {
        access.push('1 Unit key');
        if (p.masterKeyCode) access.push('1 Mail key');
        if (p.tenantKeyCode) access.push('1 FOB');
      } else {
        access.push('1 Unit key');
        if (p?.mailbox) access.push('1 Mail key');
        access.push('1 FOB');
      }
      return access.join(', ') || 'N/A';
    };

    const getParkingInfo = (): string => {
      if (!p?.parking || !p?.parkingNotes) return 'N/A';
      return p.parkingNotes;
    };

    const getAmenities = (): string => {
      if (!p) return 'N/A';
      const amenities = [];
      if (p.gym) amenities.push('Fitness Center');
      if (p.commonPool) amenities.push('Pool');
      if (p.jacuzzi) amenities.push('Hot Tub');
      if (p.deck || p.patio) amenities.push('Deck/Patio');
      // Add more as needed
      return amenities.length > 0 ? amenities.join(', ') : 'N/A';
    };

    const getLaundry = (): string => {
      return p?.washerDryer ? 'Washer and dryer in unit.' : 'N/A';
    };

    const getTrashLocation = (): string => {
      return p?.trashRemoval || 'The trash and recycling are located on the unit floor.';
    };

    const getFurnishings = (): string => {
      return p?.unfurnished ? 'Furniture & Housewares' : 'N/A';
    };

    const getTelevisionSource = (): string => {
      if (p?.cable) return 'Cable';
      if (p?.streaming) return 'Streaming';
      return 'N/A';
    };

    const getInternetService = (): string => {
      return p?.fastInternet ? 'High-Speed Internet - Wireless' : 'N/A';
    };

    // Build the letter template
    return `Arrival Information 
Guest: ${r.tenantName || r.contactName || ''}
Community: ${getCommunityName()}
Move In Information / Check In
Arrival Date: ${formatDate(r.arrivalDate)}
Check-In Time: ${formatTime(r.checkInTimeId, true) || '4:00 pm'}
Arrival Instructions: ${p?.notes || 'Temporarily find parking along the street. Go inside the front door. There is a silver call box. Select the top button which will say "Centennial Realty Advisors." A drop-down menu will appear and then you will select either "Desk, Courtesy" or "Security, Spire." If no one answers, then you can leave a callback number, and they will contact you within minutes. If someone answers right away, they will buzz you in and you need to go to the elevators and take them to the 9th floor where the front desk is. There you will need to tell the security desk what unit you are moving into and provide them with a picture ID. They will escort you to the unit and let you into the unit. Your key envelope will be on the kitchen counter.'}
Apartment Information
Community Address: ${getFullAddress()}
Your Apartment Address: ${getApartmentAddress()}
Building: ${getBuilding()}\t        Size: ${getSize()}                 Unit Floor level: ${getUnitFloorLevel()}
Access: ${getAccess()}
Phone Number: ${p?.phone || 'N/A'}
Mailbox: ${p?.mailbox ? `#${p.mailbox}, Located in mailbox banks on the 9th Floor. Turn right after exiting the elevators, across from the Concierge Desk.` : 'N/A'}
Packages: Delivered to Luxor One lockers or mailroom.
Parking Information: ${getParkingInfo()}
Amenities: ${getAmenities()}
Laundry: ${getLaundry()}
Trash Location: ${getTrashLocation()}
Provided Furnishings: ${getFurnishings()}
Housekeeping: 
Television Source: ${getTelevisionSource()}
Internet Service: ${getInternetService()}
Internet Network: Upstream5F18FB-5GHZ 	Password: 8A77095F18FB
Move Out Information
Departure Date: ${formatDate(r.departureDate)} (Written notice required)
Check-Out Time: ${formatTime(r.checkOutTimeId, false)}
Key Return: Please leave all keys and access cards/FOBs in the unit on the kitchen counter. Lock yourself out of the unit.
Service Support / Contacts
Concierge/Front Desk- 9th Floor:  720-457-7559 
Guest Service/Maintenance Email:  guestservice@avenuewest.com
AvenueWest (After Hours):  800-928-1592`;
  }
}

