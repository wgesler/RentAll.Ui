import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { ColorResponse } from '../../organizations/models/color.model';
import { ColorService } from '../../organizations/services/color.service';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { BoardProperty, CalendarDay } from '../models/reservation-board-model';
import { ReservationStatus, ReservationType } from '../models/reservation-enum';
import { ReservationListResponse } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';
import { EntityType } from '../../contacts/models/contact-enum';



@Component({
    standalone: true,
    selector: 'app-reservation-board',
    imports: [CommonModule, MaterialModule, RouterLink, FormsModule],
    templateUrl: './reservation-board.component.html',
    styleUrl: './reservation-board.component.scss'
})
export class ReservationBoardComponent implements OnInit, OnDestroy {
  @Input() ownerUserId: string | null = null;
  @Input() readOnly: boolean = false;

  properties: BoardProperty[] = [];
  calendarDays: CalendarDay[] = [];
  reservations: ReservationListResponse[] = [];
  contacts: ContactResponse[] = [];
  contactMap: Map<string, ContactResponse> = new Map();
  colors: ColorResponse[] = [];
  colorMap: Map<number, string> = new Map(); // Maps reservationStatusId to color hex

  startDate: Date = null;
  endDate: Date = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors', 'reservations', 'properties', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private colorService: ColorService,
    private router: Router,
    private authService: AuthService,
    private toastr: ToastrService,
    private mappingService: MappingService,
    private utilityService: UtilityService
  ) { }

  //#region Reservation-Board
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
  //#endregion
  
  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe(contacts => {
        this.contacts = contacts || [];
       });
    });
  }

  loadColors(): void {
    this.colorService.getColors().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors'); })).subscribe({
      next: (colors: ColorResponse[]) => {
        this.colors = colors;
        this.colorMap = this.mappingService.createColorMap(colors);
      },
      error: () => {
        this.colors = [];
        this.colorMap = new Map();
      }
    });
  }

  loadProperties(): void {
    const scopedOwnerId = (this.ownerUserId || '').trim();
    const properties$ = scopedOwnerId
      ? this.propertyService.getPropertiesByOwner(scopedOwnerId)
      : this.propertyService.getPropertiesBySelectionCritera(this.authService.getUser()?.userId || '');

    properties$.pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties: PropertyListResponse[]) => {
        this.properties = this.mappingService.mapPropertiesToBoardProperties(properties || [], this.reservations);
      },
      error: () => {
        this.properties = [];
      }
    });
  }
  
  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations: ReservationListResponse[]) => {
        this.reservations = reservations.filter(r => r.isActive);
        // Load properties after reservations are loaded so we can use reservation monthly rates
        this.loadProperties();
      },
      error: () => {
        this.reservations = [];
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

  parseDateOnly(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    // Parse YYYY-MM-DD as a local date to avoid timezone shifts.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      const parsed = new Date(year, month, day);
      parsed.setHours(0, 0, 0, 0);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    const fallback = new Date(value);
    fallback.setHours(0, 0, 0, 0);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  isDateBlockedByAvailability(property: BoardProperty, date: Date): boolean {
    if (!property) {
      return false;
    }

    const compareDate = this.parseDateOnly(date);
    if (!compareDate) {
      return false;
    }

    const availableFromDate = this.parseDateOnly(property.availableFrom);
    if (availableFromDate && compareDate.getTime() < availableFromDate.getTime()) {
      return true;
    }

    const availableUntilDate = this.parseDateOnly(property.availableUntil);
    if (availableUntilDate && compareDate.getTime() > availableUntilDate.getTime()) {
      return true;
    }

    return false;
  }

  getReservationForPropertyAndDate(propertyId: string, date: Date): ReservationListResponse | null {
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

  getReservationStatusClass(reservation: ReservationListResponse | null, date: Date): string {
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

  getReservationColor(reservation: ReservationListResponse | null, date: Date): string | null {
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
      return this.colorMap.get(ReservationStatus.ArrivalDeparture) || null;
    }
    
    // Get color from API based on reservation status
    const color = this.colorMap.get(reservation.reservationStatusId);
    return color || null;
  }

  getBlockedAvailabilityColor(): string | null {
    return this.colorMap.get(ReservationStatus.Offline) || null;
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

  getCharactersForMonth(fullName: string, date: Date, arrivalDate?: Date | null, departureDate?: Date | null): string {
    const requestedDate = new Date(date);
    const year = requestedDate.getFullYear();
    const month = requestedDate.getMonth();
    const month1Based = month + 1;
    const lastDayOfMonth = new Date(year, month1Based, 0).getDate();

    const normalizedName = (fullName || '').toUpperCase();
    if (!normalizedName) {
      return ' '.repeat(lastDayOfMonth);
    }

    const arrDate = arrivalDate ? new Date(arrivalDate) : null;
    const depDate = departureDate ? new Date(departureDate) : null;
    arrDate?.setHours(0, 0, 0, 0);
    depDate?.setHours(0, 0, 0, 0);

    // EOM: last day of month we may use. Never use the last day; if that day is Departure, don't use the last 2 days.
    const isDepartureOnLastDay = depDate &&
      depDate.getFullYear() === year &&
      depDate.getMonth() === month &&
      depDate.getDate() === lastDayOfMonth;
    const EOM = isDepartureOnLastDay ? lastDayOfMonth - 2 : lastDayOfMonth - 1;

    // SOM: first day of month we may use. If day 1 isn't visible (partial first month), use board's first day. If arrival is in this month, skip arrival day and the next (SOM = arrivalDay + 2).
    const isFirstMonthOnBoard = this.startDate &&
      this.startDate.getFullYear() === year &&
      this.startDate.getMonth() === month;
    const firstDayVisible = this.startDate?.getDate() ?? 1;
    const isPartialFirstMonth = isFirstMonthOnBoard && firstDayVisible > 1;
    const isArrivalInThisMonth = arrDate &&
      arrDate.getFullYear() === year &&
      arrDate.getMonth() === month;

    let SOM: number;
    if (isPartialFirstMonth) {
      SOM = firstDayVisible;
    } else if (isArrivalInThisMonth) {
      SOM = (arrDate!.getDate()) + 2; // skip arrival day and the day after
    } else {
      SOM = 1;
    }

    // Available character slots from day SOM through day EOM (inclusive)
    const availableSpaces = Math.max(0, EOM - SOM + 1);

    let content: string;
    if (availableSpaces === 0) {
      content = '';
    } else if (normalizedName.length <= availableSpaces) {
      // Rule 1: equal blanks on front/back (standard centering)
      const availableForBlanks = availableSpaces - normalizedName.length;
      const leadingBlanks = Math.floor(availableForBlanks / 2);
      const trailingBlanks = availableForBlanks - leadingBlanks;
      content = ' '.repeat(leadingBlanks) + normalizedName + ' '.repeat(trailingBlanks);
    } else {
      // Rule 2: start at EOM and print name backwards (use last availableSpaces characters)
      content = normalizedName.slice(-availableSpaces);
    }

    // Build full month string: spaces before SOM, content in SOM..EOM, spaces after EOM
    const prefix = ' '.repeat(SOM - 1);
    const suffix = ' '.repeat(lastDayOfMonth - EOM);
    return prefix + content + suffix;
  }

  getCharactersForReservation(fullName: string, reservationDays: number): string {
    const normalizedName = (fullName || '').toUpperCase();
    if (reservationDays <= 0) {
      return '';
    }

    if (!normalizedName) {
      return ' '.repeat(reservationDays);
    }

    if (normalizedName.length >= reservationDays) {
      return normalizedName.slice(0, reservationDays);
    }

    const availableForBlanks = reservationDays - normalizedName.length;
    const leadingBlanks = Math.floor(availableForBlanks / 2);
    const trailingBlanks = availableForBlanks - leadingBlanks;
    return ' '.repeat(leadingBlanks) + normalizedName + ' '.repeat(trailingBlanks);
  }

  shouldCenterAcrossReservation(arrival: Date, departure: Date): boolean {
    const startMonthIndex = arrival.getFullYear() * 12 + arrival.getMonth();
    const endMonthIndex = departure.getFullYear() * 12 + departure.getMonth();
    const consecutiveMonths = endMonthIndex - startMonthIndex === 1;

    if (!consecutiveMonths) {
      return false;
    }

    const startsMidMonth = arrival.getDate() > 1;
    const endMonthLastDay = new Date(departure.getFullYear(), departure.getMonth() + 1, 0).getDate();
    const endsMidMonth = departure.getDate() < endMonthLastDay;

    return startsMidMonth && endsMidMonth;
  }

  getReservationDisplayText(reservation: ReservationListResponse | null, date: Date): string {
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
    
    if (reservation.reservationStatusId === ReservationStatus.PreBooking ||
        reservation.reservationStatusId === ReservationStatus.Confirmed ||
        reservation.reservationStatusId === ReservationStatus.CheckedIn ||
        reservation.reservationStatusId === ReservationStatus.GaveNotice ||
        reservation.reservationStatusId === ReservationStatus.FirstRightRefusal) {
      const fullName = this.getBoardDisplayName(reservation).toUpperCase();
      const reservationDays = Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (reservationDays > 0 && this.shouldCenterAcrossReservation(arrival, departure)) {
        const reservationChars = this.getCharactersForReservation(fullName, reservationDays);
        const dayOffset = Math.floor((compareDate.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
        if (dayOffset >= 0 && dayOffset < reservationChars.length) {
          return reservationChars[dayOffset];
        }
        return ' ';
      }

      const monthChars = this.getCharactersForMonth(fullName, date, arrival, departure);
      const day = date.getDate();
      return monthChars[day - 1];
    }
    
    return 'R';
  }

  getBoardDisplayName(reservation: ReservationListResponse): string {
    const contact = reservation.contactId ? this.contacts.find(c => c.contactId === reservation.contactId) ?? null : null;
    const shortCompanyName = contact?.displayName || this.utilityService.getCompanyDisplayToken(contact?.companyName ?? reservation.companyName);
    const contacName = reservation.contactName ?? contact.firstName + ' ' + contact.lastName;

    if (reservation.reservationTypeId === ReservationType.Corporate) {
      return [shortCompanyName, reservation.tenantName].filter(Boolean).join(' ');
    }

    return [shortCompanyName, contacName].filter(Boolean).join(' ');

  }
  //#endregion

  //#region Navigation Methods
  getPropertyRoute(propertyId: string): string {
    return '/' + RouterUrl.replaceTokens(RouterUrl.Property, [propertyId]);
  }

  getReservationRoute(reservationId: string): string {
    return '/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
  }

  navigateToReservation(reservationId: string): void {
    if (this.readOnly) {
      return;
    }
    this.router.navigate(['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])]);
  }

  navigateToNewReservation(propertyId: string, date: Date): void {
    if (this.readOnly) {
      return;
    }
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    this.router.navigate(
      ['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, ['new'])],
      {
        queryParams: {
          propertyId,
          startDate: selectedDate.toISOString().split('T')[0]
        }
      }
    );
  }

  goToBoardSelection(): void {
    if (this.readOnly) {
      return;
    }
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

  onReservationCellClick(reservationId: string): void {
    if (this.readOnly) {
      return;
    }
    this.navigateToReservation(reservationId);
  }

  onEmptyCellClick(propertyId: string, date: Date): void {
    if (this.readOnly) {
      return;
    }
    this.navigateToNewReservation(propertyId, date);
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
