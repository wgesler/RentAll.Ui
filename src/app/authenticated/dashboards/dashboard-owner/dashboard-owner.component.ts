import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';

@Component({
  selector: 'app-dashboard-owner',
  imports: [MaterialModule, DataTableComponent],
  templateUrl: './dashboard-owner.component.html',
  styleUrl: './dashboard-owner.component.scss'
})
export class DashboardOwnerComponent implements OnInit, OnDestroy {
  user: JwtUser | null = null;
  profilePictureUrl: string | null = null;
  private userSubscription?: Subscription;

  allProperties: PropertyListResponse[] = [];
  allReservations: ReservationListDisplay[] = [];
  ownerPropertyReservations: ReservationListDisplay[] = [];
  rentedCount: number = 0;
  vacantCount: number = 0;
  isLoadingProperties: boolean = false;
  isLoadingReservations: boolean = false;
  todayDate: string = '';

  ownerPropertiesDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '30ch' },
    bedrooms: { displayAs: 'Beds', maxWidth: '10ch' },
    bathrooms: { displayAs: 'Baths', maxWidth: '10ch' },
    accomodates: { displayAs: 'Accom.', maxWidth: '12ch' },
    monthlyRate: { displayAs: 'Monthly', maxWidth: '15ch' },
    dailyRate: { displayAs: 'Daily', maxWidth: '12ch' }
  };

  ownerReservationsDisplayedColumns: ColumnSet = {
    office: { displayAs: 'Office', maxWidth: '20ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    contactName: { displayAs: 'Contact', maxWidth: '20ch' },
    companyName: { displayAs: 'Company', maxWidth: '20ch' },
    arrivalDate: { displayAs: 'Arrival', maxWidth: '20ch' },
    departureDate: { displayAs: 'Departure', maxWidth: '20ch' }
  };

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private reservationService: ReservationService,
    private mappingService: MappingService,
    private router: Router,
    private propertyService: PropertyService
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.setTodayDate();
    this.loadUserProfilePicture();
    this.loadReservations();
    this.loadProperties();
  }

  loadUserProfilePicture(): void {
    if (!this.user?.userId) {
      return;
    }

    this.userSubscription = this.userService.getUserByGuid(this.user.userId).pipe(take(1)).subscribe({
      next: (userResponse: UserResponse) => {
        if (userResponse.fileDetails?.file) {
          const contentType = userResponse.fileDetails.contentType || 'image/png';
          this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
        } else {
          this.profilePictureUrl = userResponse.profilePath || null;
        }
      },
      error: () => {
        this.profilePictureUrl = null;
      }
    });
  }

  loadProperties(): void {
    if (!this.user?.userId) {
      this.allProperties = [];
      this.ownerPropertyReservations = [];
      this.rentedCount = 0;
      this.vacantCount = 0;
      return;
    }

    this.isLoadingProperties = true;
    this.propertyService.getPropertiesByOwner(this.user.userId).pipe(take(1)).subscribe({
      next: (response: PropertyListResponse[]) => {
        this.allProperties = (response || []).filter(p => p.isActive);
        this.refreshOwnerReservationData();
        this.isLoadingProperties = false;
      },
      error: (_err: HttpErrorResponse) => {
        this.allProperties = [];
        this.ownerPropertyReservations = [];
        this.rentedCount = 0;
        this.vacantCount = 0;
        this.isLoadingProperties = false;
      }
    });
  }

  loadReservations(): void {
    this.isLoadingReservations = true;
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (response: ReservationListResponse[]) => {
        this.allReservations = this.mappingService.mapReservationList(response || []);
        this.refreshOwnerReservationData();
        this.isLoadingReservations = false;
      },
      error: (_err: HttpErrorResponse) => {
        this.allReservations = [];
        this.ownerPropertyReservations = [];
        this.rentedCount = 0;
        this.vacantCount = this.allProperties.length;
        this.isLoadingReservations = false;
      }
    });
  }

  refreshOwnerReservationData(): void {
    const ownerPropertyIds = new Set(this.allProperties.map(property => property.propertyId));

    this.ownerPropertyReservations = this.allReservations.filter(
      reservation => reservation.isActive && ownerPropertyIds.has(reservation.propertyId)
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rentedPropertyIds = new Set<string>();

    this.ownerPropertyReservations.forEach(reservation => {
      if (!reservation.arrivalDate || !reservation.departureDate) {
        return;
      }

      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);

      if (today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime()) {
        rentedPropertyIds.add(reservation.propertyId);
      }
    });

    this.rentedCount = rentedPropertyIds.size;
    this.vacantCount = Math.max(this.allProperties.length - this.rentedCount, 0);
  }

  getFullName(): string {
    return `${this.user?.firstName || ''} ${this.user?.lastName || ''}`.trim();
  }

  setTodayDate(): void {
    const today = new Date();
    this.todayDate = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  goToProperty(event: PropertyListResponse): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]);
    this.router.navigateByUrl(url);
  }

  goToReservation(event: ReservationListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]);
    this.router.navigateByUrl(url);
  }

  goToContact(event: ReservationListDisplay): void {
    if (event.contactId) {
      const url = RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]);
      this.router.navigateByUrl(url);
    }
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
  }
}
