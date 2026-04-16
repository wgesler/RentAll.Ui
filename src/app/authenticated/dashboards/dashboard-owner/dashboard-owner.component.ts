import { Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, finalize, map, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationBoardComponent } from '../../reservations/reservation-board/reservation-board.component';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-owner',
  imports: [MaterialModule, DataTableComponent, ReservationBoardComponent],
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
  currentReservationCount: number = 0;
  upcomingReservationCount: number = 0;
  isLoadingProperties: boolean = false;
  isLoadingReservations: boolean = false;
  todayDate: string = '';
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  ownerPropertiesDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '15ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '20ch' },
    bedrooms: { displayAs: 'Beds', maxWidth: '10ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', maxWidth: '10ch', alignment: 'center' },
    accomodates: { displayAs: 'Accom', maxWidth: '12ch', alignment: 'center' },
    monthlyRate: { displayAs: 'Monthly', maxWidth: '15ch', alignment: 'center' },
  };

  ownerReservationsDisplayedColumns: ColumnSet = {
    office: { displayAs: 'Office', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    arrivalDate: { displayAs: 'Arrival', maxWidth: '15ch', alignment: 'center' },
    departureDate: { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    monthlyRate: { displayAs: 'Monthly', maxWidth: '15ch', alignment: 'center' }
  };

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private reservationService: ReservationService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private utilityService: UtilityService
  ) {}

  //#region Owner Dashboard
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.setTodayDate();
    if (!this.user?.userId) {
      return;
    }
    this.loadCurrentUser(this.user.userId);
    this.loadReservations();
    this.loadProperties();
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
  //#endregion
  
  //#region Data Loading Methods
  loadCurrentUser(userId: string): void {
    this.userSubscription = this.userService.getUserByGuid(userId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser'); })).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
      },
      error: () => {
        this.profilePictureUrl = null;
      }
    });
  }

  applyUserProfilePicture(userResponse: UserResponse): void {
    if (userResponse.fileDetails?.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
    } else {
      this.profilePictureUrl = userResponse.profilePath || null;
    }
  }

  loadProperties(): void {
    const userId = this.user?.userId;
    if (!userId) {
      this.allProperties = [];
      this.ownerPropertyReservations = [];
      this.rentedCount = 0;
      this.vacantCount = 0;
      this.currentReservationCount = 0;
      this.upcomingReservationCount = 0;
      return;
    }

    this.isLoadingProperties = true;
    this.propertyService.getPropertiesByOwner(userId).pipe(take(1)).subscribe({
      next: (response: PropertyListResponse[]) => {
        this.allProperties = (response || []).filter(p => p.isActive);
        this.refreshOwnerReservationData();
        this.isLoadingProperties = false;
      },
      error: () => {
        this.allProperties = [];
        this.ownerPropertyReservations = [];
        this.rentedCount = 0;
        this.vacantCount = 0;
        this.currentReservationCount = 0;
        this.upcomingReservationCount = 0;
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
      error: () => {
        this.allReservations = [];
        this.ownerPropertyReservations = [];
        this.rentedCount = 0;
        this.vacantCount = this.allProperties.length;
        this.currentReservationCount = 0;
        this.upcomingReservationCount = 0;
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
    let currentReservations = 0;
    let upcomingReservations = 0;

    this.ownerPropertyReservations.forEach(reservation => {
      if (!reservation.arrivalDate || !reservation.departureDate) {
        return;
      }

      const arrivalDate = this.utilityService.parseCalendarDateInput(reservation.arrivalDate);
      const departureDate = this.utilityService.parseCalendarDateInput(reservation.departureDate);
      if (!arrivalDate || !departureDate) {
        return;
      }
      arrivalDate.setHours(0, 0, 0, 0);
      departureDate.setHours(0, 0, 0, 0);

      if (today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime()) {
        rentedPropertyIds.add(reservation.propertyId);
        currentReservations++;
      } else if (arrivalDate.getTime() > today.getTime()) {
        upcomingReservations++;
      }
    });

    this.rentedCount = rentedPropertyIds.size;
    this.vacantCount = Math.max(this.allProperties.length - this.rentedCount, 0);
    this.currentReservationCount = currentReservations;
    this.upcomingReservationCount = upcomingReservations;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
  }
  //#endregion
}
