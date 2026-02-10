import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../users/services/user.service';
import { UserResponse } from '../users/models/user.model';
import { JwtUser } from '../../public/login/models/jwt';
import { Subscription, take } from 'rxjs';
import { ReservationService } from '../reservations/services/reservation.service';
import { ReservationListResponse, ReservationListDisplay } from '../reservations/models/reservation-model';
import { MappingService } from '../../services/mapping.service';
import { DataTableComponent } from '../shared/data-table/data-table.component';
import { ColumnSet } from '../shared/data-table/models/column-data';
import { Router } from '@angular/router';
import { RouterUrl } from '../../app.routes';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: JwtUser | null = null;
  profilePictureUrl: string | null = null;
  private userSubscription?: Subscription;

  // Reservation data
  allReservations: ReservationListDisplay[] = [];
  upcomingArrivals: ReservationListDisplay[] = [];
  upcomingDepartures: ReservationListDisplay[] = [];
  isLoadingReservations: boolean = false;
  
  // Today/Tomorrow data
  todayArrivals: ReservationListDisplay[] = [];
  todayDepartures: ReservationListDisplay[] = [];
  tomorrowArrivals: ReservationListDisplay[] = [];
  tomorrowDepartures: ReservationListDisplay[] = [];
  todayDate: string = '';

  reservationsDisplayedColumns: ColumnSet = {
    'office': { displayAs: 'Office', maxWidth: '20ch' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    'propertyCode': { displayAs: 'Property', maxWidth: '20ch', sortType: 'natural' },
    'agentCode': { displayAs: 'Agent', maxWidth: '15ch' },
    'contactName': { displayAs: 'Contact', maxWidth: '20ch' },
    'companyName': { displayAs: 'Company', maxWidth: '20ch' },
    'arrivalDate': { displayAs: 'Arrival', maxWidth: '20ch' },
    'departureDate': { displayAs: 'Departure', maxWidth: '20ch' },
  };

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private reservationService: ReservationService,
    private mappingService: MappingService,
    private router: Router
  ) { }

  ngOnInit(): void {
    // Get current user from auth service
    this.user = this.authService.getUser();
    
    // Set today's date
    this.setTodayDate();
    
    // Load user profile picture
    this.loadUserProfilePicture();
    
    // Load reservations
    this.loadReservations();
  }

  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
  }

  loadUserProfilePicture(): void {
    const currentUser = this.authService.getUser();
    if (!currentUser?.userId) {
      return;
    }
    
    this.userSubscription = this.userService.getUserByGuid(currentUser.userId).pipe(take(1)).subscribe({
      next: (userResponse: UserResponse) => {
        // Set profile picture URL from fileDetails or profilePath
        if (userResponse.fileDetails && userResponse.fileDetails.file) {
          // Construct data URL from fileDetails
          const contentType = userResponse.fileDetails.contentType || 'image/png';
          this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
        } else if (userResponse.profilePath) {
          this.profilePictureUrl = userResponse.profilePath;
        } else {
          this.profilePictureUrl = null;
        }
      },
      error: () => {
        // Silently fail - just don't show profile picture
        this.profilePictureUrl = null;
      }
    });
  }

  getFullName(): string {
    if (!this.user) {
      return '';
    }
    return `${this.user.firstName} ${this.user.lastName}`.trim();
  }

  loadReservations(): void {
    this.isLoadingReservations = true;
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (response: ReservationListResponse[]) => {
        this.allReservations = this.mappingService.mapReservationList(response);
        this.filterUpcomingReservations();
        this.isLoadingReservations = false;
      },
      error: (err: HttpErrorResponse) => {
        this.allReservations = [];
        this.upcomingArrivals = [];
        this.upcomingDepartures = [];
        this.isLoadingReservations = false;
      }
    });
  }

  setTodayDate(): void {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    this.todayDate = today.toLocaleDateString('en-US', options);
  }

  filterUpcomingReservations(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(today.getDate() + 15);
    fifteenDaysFromNow.setHours(23, 59, 59, 999);

    // Filter for today's arrivals
    this.todayArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === today.getTime();
    });

    // Filter for today's departures
    this.todayDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === today.getTime();
    });

    // Filter for tomorrow's arrivals
    this.tomorrowArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      return arrivalDate.getTime() === tomorrow.getTime();
    });

    // Filter for tomorrow's departures
    this.tomorrowDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      return departureDate.getTime() === tomorrow.getTime();
    });

    // Filter for upcoming arrivals (arrival date within next 15 days)
    this.upcomingArrivals = this.allReservations.filter(reservation => {
      if (!reservation.arrivalDate || !reservation.isActive) {
        return false;
      }
      
      const arrivalDate = new Date(reservation.arrivalDate);
      arrivalDate.setHours(0, 0, 0, 0);
      
      return arrivalDate.getTime() >= today.getTime() && 
             arrivalDate.getTime() <= fifteenDaysFromNow.getTime();
    });

    // Filter for upcoming departures (departure date within next 15 days)
    this.upcomingDepartures = this.allReservations.filter(reservation => {
      if (!reservation.departureDate || !reservation.isActive) {
        return false;
      }
      
      const departureDate = new Date(reservation.departureDate);
      departureDate.setHours(0, 0, 0, 0);
      
      return departureDate.getTime() >= today.getTime() && 
             departureDate.getTime() <= fifteenDaysFromNow.getTime();
    });
  }

  goToReservation(event: ReservationListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]);
    this.router.navigateByUrl(url);
  }

  goToContact(event: ReservationListDisplay): void {
    if (event.contactId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]));
    }
  }

  getTodayTotal(): number {
    return this.todayArrivals.length + this.todayDepartures.length;
  }

  getTomorrowTotal(): number {
    return this.tomorrowArrivals.length + this.tomorrowDepartures.length;
  }
}
