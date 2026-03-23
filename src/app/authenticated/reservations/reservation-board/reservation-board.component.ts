import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BehaviorSubject, Observable, Subject, distinctUntilChanged, filter, finalize, map, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { ColorResponse } from '../../organizations/models/color.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { ColorService } from '../../organizations/services/color.service';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertySelectionResponse } from '../../properties/models/property-selection.model';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertySelectionFilterService } from '../../properties/services/property-selection-filter.service';
import { PropertyService } from '../../properties/services/property.service';
import { BoardProperty, CalendarDay } from '../models/reservation-board-model';
import { ReservationStatus } from '../models/reservation-enum';
import { ReservationListResponse } from '../models/reservation-model';
import { ReservationService } from '../services/reservation.service';
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
  colors: ColorResponse[] = [];
  colorMap: Map<number, string> = new Map(); // Maps reservationStatusId to color hex
  displayTextCache = new Map<string, string>();

  startDate: Date = null;
  endDate: Date = null;
  officeScopeResolved = false;
  selectedOfficeId: number | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors', 'reservations', 'properties', 'contacts', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  propertiesFiltered = false;
  private isLoadingReservations = false;
  private lastLoadedOfficeId: number | null | undefined = undefined;

  constructor(
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private colorService: ColorService,
    private router: Router,
    private authService: AuthService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private officeService: OfficeService,
    private propertySelectionFilterService: PropertySelectionFilterService
  ) { }

  //#region Reservation-Board
  ngOnInit(): void {
    this.setDefaultDateRange();
    this.generateCalendarDays();
    this.loadContacts();
    this.loadColors();
    this.initializeOfficeScope();

    // Reload when user changes working office (skip(1) = ignore initial emission, so we don't load twice on init)
    this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1), distinctUntilChanged(), takeUntil(this.destroy$)).subscribe({
      next: officeId => {
        if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
          return;
        }
        this.resolveOfficeScope(officeId);
        this.loadReservations();
      }
    });

    this.propertySelectionFilterService.propertiesFiltered$.pipe(takeUntil(this.destroy$)).subscribe({
      next: value => {
        this.propertiesFiltered = value;
      }
    });
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
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    // We limit properties when an owner is logged in to display on their dashboard
    const scopedOwnerId = (this.ownerUserId || '').trim();
    const properties$ = scopedOwnerId
      ? this.propertyService.getPropertiesByOwner(scopedOwnerId)
      : this.propertyService.getPropertiesBySelectionCritera(this.authService.getUser()?.userId || '');

    properties$.pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties: PropertyListResponse[]) => {
        const workingOfficeId = this.selectedOfficeId;
        const filtered = workingOfficeId == null
          ? (properties || [])
          : (properties || []).filter(p => p.officeId === workingOfficeId);
        this.properties = this.mappingService.mapPropertiesToBoardProperties(filtered, this.reservations);
      },
      error: () => {
        this.properties = [];
      }
    });
  }

  loadReservations(force: boolean = false): void {
    if (!this.officeScopeResolved || this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
      return;
    }
    const currentOfficeId = this.selectedOfficeId ?? null;
    if (!force) {
      if (this.isLoadingReservations) {
        return;
      }
      if (this.lastLoadedOfficeId === currentOfficeId) {
        return;
      }
    }
    this.isLoadingReservations = true;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.reservationService.getReservationList().pipe(
      take(1),
      finalize(() => {
        this.isLoadingReservations = false;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
      })
    ).subscribe({
      next: (reservations: ReservationListResponse[]) => {
        const workingOfficeId = this.selectedOfficeId;
        this.reservations = reservations.filter(r =>
          r.isActive && (workingOfficeId == null || r.officeId === workingOfficeId)
        );
        this.lastLoadedOfficeId = workingOfficeId ?? null;
        this.displayTextCache.clear();
        this.loadProperties();
      },
      error: () => {
        this.reservations = [];
        this.lastLoadedOfficeId = currentOfficeId;
        this.loadProperties();
      }
    });
  }

  initializeOfficeScope(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1)).subscribe({
          next: offices => {
            const activeOffices = (offices || []).filter(office => office.isActive);
            const preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
            const resolvedOfficeId = this.globalOfficeSelectionService.syncWithAvailableOffices(activeOffices, preferredOfficeId);
            this.resolveOfficeScope(resolvedOfficeId);
            this.loadReservations(true);
          },
          error: () => {
            this.resolveOfficeScope(this.globalOfficeSelectionService.getSelectedOfficeIdValue());
            this.loadReservations(true);
          }
        });
      },
      error: () => {
        this.resolveOfficeScope(this.globalOfficeSelectionService.getSelectedOfficeIdValue());
        this.loadReservations(true);
      }
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
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
    this.displayTextCache.clear();
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

    // If multiple reservations overlap on the same date, prioritize most recent arrival date.
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

  /**
   * Single month: EOM/SOM/available per user formula.
   * EOM = last day of month - 1 (or -2 if last day is Departure).
   * SOM = 1 if first day visible and not arrival; 3 if day 1 is Arrival; arrival+2 if arrival in middle; or board first day if partial month.
   * Available = EOM - SOM (number of character slots from SOM through EOM).
   * Rules: name length <= available -> center with equal blanks; name length > available -> last character at EOM, print backwards.
   */
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

    // EOM: last day of month we may use. Never use the last day; if last day is Departure, EOM = last day - 2.
    const isDepartureOnLastDay = depDate && depDate.getFullYear() === year && depDate.getMonth() === month && depDate.getDate() === lastDayOfMonth;
    const EOM = isDepartureOnLastDay ? lastDayOfMonth - 2 : lastDayOfMonth - 1;

    // SOM: When arrival is in this month, use arrival+2 first (so arrival day shows A). Else if partial first month use board first day. Else if day 1 is Arrival then 3, else 1.
    const isFirstMonthOnBoard = this.startDate && this.startDate.getFullYear() === year && this.startDate.getMonth() === month;
    const firstDayVisible = this.startDate?.getDate() ?? 1;
    const isPartialFirstMonth = isFirstMonthOnBoard && firstDayVisible > 1;
    const isArrivalInThisMonth = arrDate && arrDate.getFullYear() === year && arrDate.getMonth() === month;
    const arrivalDay = isArrivalInThisMonth ? arrDate!.getDate() : 0;

    let SOM: number;
    if (isArrivalInThisMonth && arrivalDay === 1) {
      SOM = 3;
    } else if (isArrivalInThisMonth && arrivalDay > 1) {
      SOM = arrivalDay + 2;
    } else if (isPartialFirstMonth) {
      SOM = firstDayVisible;
    } else {
      SOM = 1;
    }

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

  getCharactersForReservation(fullName: string, availableSpaces: number): string {
    const normalizedName = (fullName || '').toUpperCase();
    if (availableSpaces <= 0) {
      return '';
    }

    if (!normalizedName) {
      return ' '.repeat(availableSpaces);
    }

    if (normalizedName.length > availableSpaces) {
      // Last character at end of span, work backward (use last availableSpaces chars)
      return normalizedName.slice(-availableSpaces);
    }

    const availableForBlanks = availableSpaces - normalizedName.length;
    const leadingBlanks = Math.floor(availableForBlanks / 2);
    const trailingBlanks = availableForBlanks - leadingBlanks;
    return ' '.repeat(leadingBlanks) + normalizedName + ' '.repeat(trailingBlanks);
  }

  /**
   * Use two-month span only when we have two consecutive PARTIAL months (month before departure + departure month).
   * First month partial = board starts in that month after day 1, or arrival is in that month.
   * Second month partial = departure is before the last day of the month.
   * If either month is full, treat each month independently (single-month logic per month).
   */
  shouldCenterAcrossReservation(arrival: Date, departure: Date): boolean {
    const startMonthIndex = arrival.getFullYear() * 12 + arrival.getMonth();
    const endMonthIndex = departure.getFullYear() * 12 + departure.getMonth();
    if (endMonthIndex - startMonthIndex < 1) {
      return false;
    }

    const y2 = departure.getFullYear();
    const m2 = departure.getMonth();
    const y1 = m2 === 0 ? y2 - 1 : y2;
    const m1 = m2 === 0 ? 11 : m2 - 1;
    const lastDay2 = new Date(y2, m2 + 1, 0).getDate();
    const depDay = departure.getDate();

    const firstMonthPartial = (this.startDate &&
      this.startDate.getFullYear() === y1 &&
      this.startDate.getMonth() === m1 &&
      (this.startDate.getDate() ?? 1) > 1) ||
      (arrival.getFullYear() === y1 && arrival.getMonth() === m1);
    const secondMonthPartial = depDay < lastDay2;

    return firstMonthPartial && secondMonthPartial;
  }

  /**
   * Two consecutive partial months = last two months of the reservation (month before departure + departure month).
   * First month can be partial because the board starts mid-month (viewable space); second because reservation ends mid-month.
   * SOM (month 1): board first day if board starts in that month; else arrival+2 if arrival in that month; else 1.
   * EOM (month 2) = Departure - 2. EOM1 = last day of month 1 - 1.
   */
  getTwoMonthSpanAvailable(arrival: Date, departure: Date): { totalAvailable: number; getCharIndex: (d: Date) => number } {
    const y2 = departure.getFullYear();
    const m2 = departure.getMonth();
    // First month of the span = month before departure
    const y1 = m2 === 0 ? y2 - 1 : y2;
    const m1 = m2 === 0 ? 11 : m2 - 1;

    const lastDay1 = new Date(y1, m1 + 1, 0).getDate();
    const lastDay2 = new Date(y2, m2 + 1, 0).getDate();
    const depDay = departure.getDate();

    // SOM for first month: when arrival is in this month, use arrival+2 so we skip arrival day (show A) and the day after; else if board starts here (partial view), use board first day; else 1
    const isBoardFirstMonth = this.startDate &&
      this.startDate.getFullYear() === y1 &&
      this.startDate.getMonth() === m1 &&
      (this.startDate.getDate() ?? 1) > 1;
    const firstDayVisible = this.startDate?.getDate() ?? 1;
    const arrivalInFirstMonth = arrival.getFullYear() === y1 && arrival.getMonth() === m1;

    let SOM: number;
    if (arrivalInFirstMonth) {
      SOM = arrival.getDate() + 2;
    } else if (isBoardFirstMonth) {
      SOM = firstDayVisible;
    } else {
      SOM = 1;
    }

    // When spanning 2 partial months, the last day of the first month gets a character (not blank)
    const EOM1 = lastDay1;
    // Second month: full month (departure on last day) -> EOM2 = last day - 1; partial -> EOM2 = depDay - 2
    const isFullSecondMonth = depDay === lastDay2;
    const EOM2 = isFullSecondMonth ? lastDay2 - 1 : Math.max(0, depDay - 2);

    const available1 = Math.max(0, EOM1 - SOM + 1);
    const available2 = EOM2;
    const totalAvailable = available1 + available2;

    const getCharIndex = (d: Date): number => {
      const yd = d.getFullYear();
      const md = d.getMonth();
      const day = d.getDate();
      if (yd === y1 && md === m1) {
        if (day >= SOM && day <= EOM1) return day - SOM;
        return -1;
      }
      if (yd === y2 && md === m2) {
        if (day >= 1 && day <= EOM2) return available1 + (day - 1);
        return -1;
      }
      return -1;
    };

    return { totalAvailable, getCharIndex };
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

    // Arrival day always shows A and departure day always shows D, regardless of status (including OwnerBlocked and Maintenance)
    if (compareDate.getTime() === arrival.getTime()) {
      return 'A';
    }
    if (compareDate.getTime() === departure.getTime()) {
      return 'D';
    }

    const cacheKey = `${reservation.reservationId}-${compareDate.getTime()}`;
    const cached = this.displayTextCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    let result: string;

    // For OwnerBlocked status, show "O" instead of "R"
    if (reservation.reservationStatusId === ReservationStatus.OwnerBlocked) {
      result = 'O';
    } else if (reservation.reservationStatusId === ReservationStatus.Maintenance) {
      result = 'M';
    } else if (reservation.reservationStatusId === ReservationStatus.PreBooking ||
        reservation.reservationStatusId === ReservationStatus.Confirmed ||
        reservation.reservationStatusId === ReservationStatus.CheckedIn ||
        reservation.reservationStatusId === ReservationStatus.GaveNotice ||
        reservation.reservationStatusId === ReservationStatus.FirstRightRefusal) {
      const contact = reservation.contactId ? this.contacts.find(c => c.contactId === reservation.contactId) ?? null : null;
      const fullName = this.utilityService.getReservationDisplayName(reservation, contact).toUpperCase();
      const reservationDays = Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      if (reservationDays > 0 && this.shouldCenterAcrossReservation(arrival, departure)) {
        if (compareDate.getTime() === arrival.getTime()) {
          result = 'A';
        } else if (compareDate.getTime() === departure.getTime()) {
          result = 'D';
        } else {
          const { totalAvailable, getCharIndex } = this.getTwoMonthSpanAvailable(arrival, departure);
          const reservationChars = this.getCharactersForReservation(fullName, totalAvailable);
          const idx = getCharIndex(compareDate);
          if (idx >= 0 && idx < reservationChars.length) {
            result = reservationChars[idx];
          } else {
            result = ' ';
          }
        }
      } else {
        if (compareDate.getTime() === arrival.getTime()) {
          result = 'A';
        } else if (compareDate.getTime() === departure.getTime()) {
          result = 'D';
        } else {
          const monthChars = this.getCharactersForMonth(fullName, date, arrival, departure);
          const day = date.getDate();
          result = monthChars[day - 1] ?? ' ';
        }
      }
    } else {
      if (compareDate.getTime() === arrival.getTime()) {
        result = 'A';
      } else if (compareDate.getTime() === departure.getTime()) {
        result = 'D';
      } else {
        result = 'R';
      }
    }

    this.displayTextCache.set(cacheKey, result);
    return result;
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
      this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'reservation-board' } });
      return;
    }

    this.propertyService.getPropertySelection(userId).pipe(take(1)).subscribe({
      next: (selection: PropertySelectionResponse) => {
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'reservation-board', selection } });
      },
      error: () => {
        // Still allow navigation even if selection load fails
        this.router.navigateByUrl(RouterUrl.ReservationBoardSelection, { state: { source: 'reservation-board' } });
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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
