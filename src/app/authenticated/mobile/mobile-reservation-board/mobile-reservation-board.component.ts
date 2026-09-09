import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import type { CalendarDateString } from '../../../services/utility.service';
import { ColorService } from '../../organizations/services/color.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { BoardProperty, CalendarDay } from '../../reservations/models/reservation-board-model';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';

@Component({
  standalone: true,
  selector: 'app-mobile-reservation-board',
  imports: [MaterialModule, FormsModule],
  templateUrl: './mobile-reservation-board.component.html',
  styleUrl: './mobile-reservation-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileReservationBoardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private colorService = inject(ColorService);
  private globalSelectionService = inject(GlobalSelectionService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  filteredPropertyIds: Set<string> | null = null;
  selectedOfficeId: number | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  calendarDays: CalendarDay[] = [];
  monthGroups: { monthName: string; days: number }[] = [];
  properties: BoardProperty[] = [];
  propertyRows: PropertyListResponse[] = [];
  reservations: ReservationListResponse[] = [];
  reservationsByProperty = new Map<string, ReservationListResponse[]>();
  colorMap = new Map<number, string>();
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['colors', 'properties', 'reservations']));
  destroy$ = new Subject<void>();

  //#region Mobile-Reservation-Board
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.selectedOfficeId = officeId;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(() => {
      if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
        return;
      }
      this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
      this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
      this.loadProperties();
      this.loadReservations();
    });
    this.syncBoardQueryParams();
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncBoardQueryParams();
      this.generateCalendarDays();
      this.applyBoard();
      this.markViewForCheck();
    });
    this.generateCalendarDays();
    this.loadColors();
    this.loadProperties();
    this.loadReservations();
  }

  syncBoardQueryParams(): void {
    const propertyIdsRaw = String(this.route.snapshot.queryParamMap.get('propertyIds') || '').trim();
    if (propertyIdsRaw) {
      this.filteredPropertyIds = new Set(
        propertyIdsRaw.split(',').map(propertyId => propertyId.trim()).filter(propertyId => propertyId.length > 0)
      );
    } else {
      this.filteredPropertyIds = null;
    }

    const parsedStart = this.utilityService.parseDateOnlyStringToDate(this.route.snapshot.queryParamMap.get('startDate'));
    const parsedEnd = this.utilityService.parseDateOnlyStringToDate(this.route.snapshot.queryParamMap.get('endDate'));
    if (parsedStart) {
      parsedStart.setHours(0, 0, 0, 0);
      this.startDate = parsedStart;
    }
    if (parsedEnd) {
      parsedEnd.setHours(0, 0, 0, 0);
      this.endDate = parsedEnd;
    }
    if (!parsedStart && !parsedEnd) {
      this.setDefaultDateRange();
    } else if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }
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
    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }
    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }
    this.generateCalendarDays();
    this.markViewForCheck();
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

  generateCalendarDays(): void {
    this.calendarDays = this.mappingService.mapMobileBoardCalendarDays(this.startDate, this.endDate);
    this.monthGroups = this.mappingService.mapMobileBoardMonthGroups(this.calendarDays);
  }

  applyBoard(): void {
    this.properties = this.mappingService.mapPropertiesToBoardProperties(this.propertyRows, this.reservations);
    this.reservationsByProperty = this.mappingService.mapMobileBoardReservationsByProperty(this.reservations);
    this.markViewForCheck();
  }

  getCellDisplay(property: BoardProperty, day: CalendarDay): { color: string; text: string; textColor: string } {
    const reservation = this.mappingService.getMobileBoardReservationForDate(this.reservationsByProperty.get(property.propertyId) || [], day.date);
    return this.mappingService.mapMobileBoardCellDisplay(reservation, day.date, this.colorMap, this.startDate);
  }

  getPropertyCodeClass(property: BoardProperty): string {
    return this.mappingService.mapMobileBoardPropertyCodeClass(property.noticeStatusId);
  }

  isCellClickable(property: BoardProperty, day: CalendarDay): boolean {
    const reservation = this.mappingService.getMobileBoardReservationForDate(this.reservationsByProperty.get(property.propertyId) || [], day.date);
    const reservationId = String(reservation?.reservationId || '').trim();
    return !reservationId || !reservationId.startsWith('extcal:');
  }

  onReservationCellClick(property: BoardProperty, day: CalendarDay): void {
    const reservation = this.mappingService.getMobileBoardReservationForDate(this.reservationsByProperty.get(property.propertyId) || [], day.date);
    const reservationId = String(reservation?.reservationId || '').trim();
    if (reservationId && !reservationId.startsWith('extcal:')) {
      this.router.navigate(['/mobile', 'reservations', reservationId], { queryParams: { returnTo: 'board' } });
      return;
    }
    if (reservationId.startsWith('extcal:')) {
      return;
    }
    this.navigateToNewReservation(property, day);
  }

  navigateToNewReservation(property: BoardProperty, day: CalendarDay): void {
    const selectedDate = new Date(day.date);
    selectedDate.setHours(0, 0, 0, 0);
    const queryParams: Record<string, string> = {
      returnTo: 'board',
      propertyId: property.propertyId,
      officeId: String(property.officeId ?? 0),
      startDate: this.formatBoardStartDate(selectedDate)
    };
    this.router.navigate(['/mobile', 'reservations', 'new'], { queryParams });
  }

  formatBoardStartDate(date: Date): CalendarDateString {
    return this.utilityService.formatDateOnlyForApi(date) ?? this.utilityService.todayAsCalendarDateString();
  }

  onPropertyCodeClick(property: BoardProperty, event: Event): void {
    event.stopPropagation();
    const propertyId = String(property.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    this.router.navigate(['/mobile', 'properties', propertyId], { queryParams: { returnTo: 'board' } });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Data Loading Methods
  loadColors(): void {
    this.colorService.getColors().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'colors'))).subscribe({
      next: colors => {
        this.colorMap = this.mappingService.createColorMap(colors || []);
        this.markViewForCheck();
      },
      error: () => {
        this.colorMap = new Map();
        this.markViewForCheck();
      }
    });
  }

  loadProperties(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.propertyRows = [];
      this.applyBoard();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      return;
    }
    this.propertyService.getPropertiesBySelectionCriteria(userId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: properties => {
        this.propertyRows = (properties || []).filter(property => property.isActive !== false && this.mappingService.matchesMobileOfficeScope(property.officeId, this.selectedOfficeId));
        if (this.filteredPropertyIds?.size) {
          this.propertyRows = this.propertyRows.filter(property => this.filteredPropertyIds!.has(String(property.propertyId || '').trim()));
        }
        this.applyBoard();
      },
      error: () => {
        this.propertyRows = [];
        this.applyBoard();
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'))).subscribe({
      next: reservations => {
        this.reservations = this.mappingService.normalizeReservationListResponses(reservations || []).filter(reservation => reservation.isActive !== false && this.mappingService.matchesMobileOfficeScope(reservation.officeId, this.selectedOfficeId));
        this.applyBoard();
      },
      error: () => {
        this.reservations = [];
        this.applyBoard();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
