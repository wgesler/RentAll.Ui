import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { FormsModule } from '@angular/forms';
import { PropertyService } from '../../property/services/property.service';
import { PropertyResponse } from '../../property/models/property.model';
import { take, finalize, filter, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { BoardProperty, CalendarDay } from '../models/reservation-board-model';
import { ReservationService } from '../services/reservation.service';
import { ReservationResponse } from '../models/reservation-model';
import { ReservationStatus } from '../models/reservation-enum';
import { RouterUrl } from '../../../app.routes';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { ColorService } from '../../organization-configuration/color/services/color.service';
import { ColorResponse } from '../../organization-configuration/color/models/color.model';
import { AuthService } from '../../../services/auth.service';
import { PropertySelectionResponse } from '../../property/models/property-selection.model';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { HttpErrorResponse } from '@angular/common/http';
import { MappingService } from '../../../services/mapping.service';



@Component({
  selector: 'app-reservation-board',
  standalone: true,
  imports: [CommonModule, MaterialModule, RouterLink, FormsModule],
  templateUrl: './reservation-board.component.html',
  styleUrl: './reservation-board.component.scss'
})
export class ReservationBoardComponent implements OnInit, OnDestroy {
  properties: BoardProperty[] = [];
  calendarDays: CalendarDay[] = [];
  reservations: ReservationResponse[] = [];
  contacts: ContactResponse[] = [];
  contactsSubscription?: Subscription;
  contactMap: Map<string, ContactResponse> = new Map();
  colors: ColorResponse[] = [];
  colorMap: Map<number, string> = new Map(); // Maps reservationStatusId to color hex

  startDate: Date = null;
  endDate: Date = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors', 'reservations', 'properties']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private colorService: ColorService,
    private router: Router,
    private authService: AuthService,
    private toastr: ToastrService,
    private mappingService: MappingService
  ) { }

  ngOnInit(): void {
    this.setDefaultDateRange();
    this.generateCalendarDays();
    this.loadContacts();
    this.loadColors();
    this.loadReservations(); 
  }

  setDefaultDateRange(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const end = new Date(today);
    end.setMonth(end.getMonth() + 6);
    end.setHours(0, 0, 0, 0);

    this.startDate = today;
    this.endDate = end;
  }

  onDateRangeChange(): void {
    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
    } else if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setMonth(end.getMonth() + 6);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    // Normalize times
    if (this.startDate) this.startDate.setHours(0, 0, 0, 0);
    if (this.endDate) this.endDate.setHours(0, 0, 0, 0);

    // Ensure start <= end (swap if needed)
    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }

    this.generateCalendarDays();
  }

  //#region Data Loading Methods
  loadContacts(): void {
    // Wait for contacts to be loaded initially, then subscribe to changes for updates
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactsSubscription = this.contactService.getAllContacts().subscribe(contacts => {
        this.contacts = contacts || [];
        this.contactMap = this.mappingService.createContactMap(this.contacts);
      });
    });
  }

  loadColors(): void {
    this.colorService.getColors().pipe(take(1), finalize(() => { this.removeLoadItem('colors'); })).subscribe({
      next: (colors: ColorResponse[]) => {
        this.colors = colors;
        this.colorMap = this.mappingService.createColorMap(colors);
      },
      error: (err: HttpErrorResponse) => {
        this.colors = [];
        this.colorMap = new Map();
        if (err.status !== 400) {
          this.toastr.error('Could not load colors. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  loadProperties(): void {
    const userId = this.authService.getUser()?.userId || '';

    this.propertyService.getPropertiesBySelectionCritera(userId).pipe(take(1), finalize(() => { this.removeLoadItem('properties'); })).subscribe({
      next: (properties: PropertyResponse[]) => {
        this.properties = this.mappingService.mapPropertiesToBoardProperties(properties, this.reservations);
      },
      error: (err: HttpErrorResponse) => {
        this.properties = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load properties. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  
  loadReservations(): void {
    this.reservationService.getReservations().pipe(take(1), finalize(() => { this.removeLoadItem('reservations'); })).subscribe({
      next: (reservations: ReservationResponse[]) => {
        this.reservations = reservations.filter(r => r.isActive);
        // Load properties after reservations are loaded so we can use reservation monthly rates
        this.loadProperties();
      },
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load reservations. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.loadProperties();
      }
    });
  }
  //#endregion

  //#region Board Supporting Methods
  generateCalendarDays(): void {
    const days: CalendarDay[] = [];
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    const start = this.startDate ? new Date(this.startDate) : new Date();
    const end = this.endDate ? new Date(this.endDate) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    let currentDate = new Date(start);
    let lastMonth = -1;

    // Inclusive range
    while (currentDate.getTime() <= end.getTime()) {
      const date = new Date(currentDate);
      const dayOfWeek = dayNames[date.getDay()];
      const dayNumber = date.getDate();
      const monthIndex = date.getMonth();
      const monthName = monthNames[monthIndex];
      const isFirstOfMonth = monthIndex !== lastMonth;

      days.push({
        date: date,
        dayOfWeek: dayOfWeek,
        dayNumber: dayNumber,
        monthName: monthName,
        isFirstOfMonth: isFirstOfMonth
      });

      lastMonth = monthIndex;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.calendarDays = days;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  getMonthGroups(): { monthName: string; days: number }[] {
    const groups: { monthName: string; days: number }[] = [];
    let currentMonth = '';
    let dayCount = 0;

    for (const day of this.calendarDays) {
      if (day.monthName !== currentMonth) {
        if (currentMonth) {
          groups.push({ monthName: currentMonth, days: dayCount });
        }
        currentMonth = day.monthName;
        dayCount = 1;
      } else {
        dayCount++;
      }
    }

    if (currentMonth) {
      groups.push({ monthName: currentMonth, days: dayCount });
    }

    return groups;
  }

  getReservationForPropertyAndDate(propertyId: string, date: Date): ReservationResponse | null {
    const matchingReservations = this.reservations.filter(r => {
      if (r.propertyId !== propertyId || !r.arrivalDate || !r.departureDate) {
        return false;
      }
      const arrival = new Date(r.arrivalDate);
      const departure = new Date(r.departureDate);
      // Reset time to compare dates only
      arrival.setHours(0, 0, 0, 0);
      departure.setHours(0, 0, 0, 0);
      const compareDate = new Date(date);
      compareDate.setHours(0, 0, 0, 0);
      return compareDate >= arrival && compareDate <= departure;
    });

    if (matchingReservations.length === 0) {
      return null;
    }

    // If multiple reservations overlap on the same date, prioritize:
    // 1. Active/current reservations (those that include today or later)
    // 2. Most recent arrival date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sort by arrival date descending (most recent first)
    matchingReservations.sort((a, b) => {
      if (!a.arrivalDate || !b.arrivalDate) return 0;
      const dateA = new Date(a.arrivalDate);
      const dateB = new Date(b.arrivalDate);
      dateA.setHours(0, 0, 0, 0);
      dateB.setHours(0, 0, 0, 0);
      return dateB.getTime() - dateA.getTime();
    });

    return matchingReservations[0];
  }

  getReservationStatusClass(reservation: ReservationResponse | null, date: Date): string {
    if (!reservation) {
      return '';
    }

    // Check if it's arrival or departure day first
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    
    const arrival = new Date(reservation.arrivalDate);
    arrival.setHours(0, 0, 0, 0);
    const departure = new Date(reservation.departureDate);
    departure.setHours(0, 0, 0, 0);

    if (compareDate.getTime() === arrival.getTime()) {
      return 'reservation-arrival';
    }
    
    if (compareDate.getTime() === departure.getTime()) {
      return 'reservation-departure';
    }
    return '';
  }

  getReservationColor(reservation: ReservationResponse | null, date: Date): string | null {
    if (!reservation) {
      return null;
    }

    // Check if it's arrival or departure day - use blue for these
    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    
    const arrival = new Date(reservation.arrivalDate);
    arrival.setHours(0, 0, 0, 0);
    const departure = new Date(reservation.departureDate);
    departure.setHours(0, 0, 0, 0);

    if (compareDate.getTime() === arrival.getTime() || compareDate.getTime() === departure.getTime()) {
      return '#3b82f6'; // Blue for arrival/departure
    }
    
    // Get color from API based on reservation status
    const color = this.colorMap.get(reservation.reservationStatusId);
    return color || null;
  }

  getTextColor(backgroundColor: string | null): string {
    if (!backgroundColor) {
      return '';
    }
    
    // Convert hex to RGB
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Calculate brightness using relative luminance formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // Return white for dark backgrounds, black for light backgrounds
    return brightness > 128 ? '#000000' : '#ffffff';
  }

  getReservationDisplayText(reservation: ReservationResponse | null, date: Date): string {
    if (!reservation) {
      return '';
    }

    const compareDate = new Date(date);
    compareDate.setHours(0, 0, 0, 0);
    
    const arrival = new Date(reservation.arrivalDate);
    arrival.setHours(0, 0, 0, 0);
    const departure = new Date(reservation.departureDate);
    departure.setHours(0, 0, 0, 0);

    if (compareDate.getTime() === arrival.getTime()) {
      return 'A';
    }
    
    if (compareDate.getTime() === departure.getTime()) {
      return 'D';
    }
    
    // For OwnerBlocked status, show "O" instead of "R"
    if (reservation.reservationStatusId === ReservationStatus.OwnerBlocked) {
      return 'O';
    }
    
    // For Maintenance status, show "M" instead of "R"
    if (reservation.reservationStatusId === ReservationStatus.Maintenance) {
      return 'M';
    }
    
    // For PreBooking, Confirmed/CheckedIn, GaveNotice, FirstRightRefusal
    // Show letters of the tenant/contact name cycling through consecutive boxes
    // Colors come from API via getReservationColor()
    if (reservation.reservationStatusId === ReservationStatus.PreBooking ||
        reservation.reservationStatusId === ReservationStatus.Confirmed ||
        reservation.reservationStatusId === ReservationStatus.CheckedIn ||
        reservation.reservationStatusId === ReservationStatus.GaveNotice ||
        reservation.reservationStatusId === ReservationStatus.FirstRightRefusal) {
      
      const contact = this.contactMap.get(reservation.contactId);
      if (contact) {
        // Get full name (firstName + lastName), keep spaces, convert to uppercase
        const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim().toUpperCase();
        
        if (fullName.length > 0) {
          // Calculate which day of the reservation this is
          // Day 0 = arrival (shows 'A'), so day 1 = first day after arrival shows first character
          const arrival = new Date(reservation.arrivalDate);
          arrival.setHours(0, 0, 0, 0);
          const daysFromArrival = Math.floor((compareDate.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
          
          // Skip arrival day (shows 'A'), so subtract 1 to get the character index
          const charIndex = daysFromArrival - 1;
          
          // Only show characters if within the name length, otherwise leave blank
          if (charIndex >= 0 && charIndex < fullName.length) {
            return fullName.charAt(charIndex);
          }
          // If beyond the name length, return empty string to leave blank
          return '';
        }
      }
    }
    
    return 'R';
  }

  //#region Navigation Methods
  getPropertyRoute(propertyId: string): string {
    return '/' + RouterUrl.replaceTokens(RouterUrl.Property, [propertyId]);
  }

  getReservationRoute(reservationId: string): string {
    return '/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
  }

  navigateToReservation(reservationId: string): void {
    this.router.navigate(['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])]);
  }

  goToBoardSelection(): void {
    const userId = this.authService.getUser()?.userId || '';
    if (!userId) {
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection);
      return;
    }

    this.propertyService.getPropertySelection(userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { selection } });
      },
      error: () => {
        // Still allow navigation even if selection load fails
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection);
      }
    });
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
    this.contactsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
