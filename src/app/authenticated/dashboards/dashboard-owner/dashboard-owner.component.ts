import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { BehaviorSubject, Subject, catchError, finalize, forkJoin, map, of, switchMap, take, takeUntil, tap } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { getBillingType, ReservationStatus } from '../../reservations/models/reservation-enum';
import { ReservationHistoryRateRow } from '../../reservations/models/reservation-history-rate-row.model';
import { ReservationPaymentResponse } from '../../reservations/models/reservation-payment.model';
import { ReservationListDisplay } from '../../reservations/models/reservation-model';
import { ReservationBoardComponent } from '../../reservations/reservation-board/reservation-board.component';
import { ReservationHistoryDisplayService } from '../../reservations/services/reservation-history-display.service';
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
  styleUrl: './dashboard-owner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dashboard-titlebar-only]': 'titleBarOnly'
  }
})
export class DashboardOwnerComponent implements OnInit, OnDestroy {
  @Input() titleBarOnly = false;

  private authService = inject(AuthService);
  private userService = inject(UserService);
  private reservationService = inject(ReservationService);
  private reservationHistoryDisplayService = inject(ReservationHistoryDisplayService);
  private formatterService = inject(FormatterService);
  private mappingService = inject(MappingService);
  private propertyService = inject(PropertyService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);

  user: JwtUser | null = null;
  ownerContactId: string | null = null;
  profilePictureUrl: string | null = null;

  allProperties: PropertyListResponse[] = [];
  allReservations: ReservationListDisplay[] = [];
  ownerPropertyReservations: ReservationListDisplay[] = [];
  ownerPropertiesTableData: Array<Record<string, unknown>> = [];
  ownerCurrentReservationsTableData: Array<Record<string, unknown>> = [];
  ownerHistoricalReservationsTableData: ReservationHistoryRateRow[] = [];
  paymentsByReservationId = new Map<string, ReservationPaymentResponse[]>();
  rentedCount: number = 0;
  vacantCount: number = 0;
  currentReservationCount: number = 0;
  upcomingReservationCount: number = 0;
  todayDate: string = '';

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser', 'properties', 'reservations']));
  destroy$ = new Subject<void>();

  ownerPropertiesDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '15ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    shortAddress: { displayAs: 'Address', maxWidth: '20ch' },
    bedrooms: { displayAs: 'Beds', maxWidth: '10ch', alignment: 'center' },
    bathrooms: { displayAs: 'Baths', maxWidth: '10ch', alignment: 'center' },
    accommodates: { displayAs: 'Accom', maxWidth: '12ch', alignment: 'center' },
    monthlyRate: { displayAs: 'Montly Target', maxWidth: '15ch', alignment: 'center' },
    dailyRate: { displayAs: 'Daily Target', maxWidth: '15ch', alignment: 'center' },
  };

  ownerReservationsDisplayedColumns: ColumnSet = {
    office: { displayAs: 'Office', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    arrivalDate: { displayAs: 'Arrival', maxWidth: '15ch', alignment: 'center' },
    departureDate: { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    billingType: { displayAs: 'Billing Type', maxWidth: '15ch', alignment: 'center' },
    billingRate: { displayAs: 'Billing Rate', maxWidth: '15ch', alignment: 'center' }
  };

  ownerHistoricalReservationsDisplayedColumns: ColumnSet = {
    office: { displayAs: 'Office', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    arrivalDate: { displayAs: 'Arrival', maxWidth: '15ch', alignment: 'center' },
    departureDate: { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' },
    rateStart: { displayAs: 'Rate Start', maxWidth: '20ch', alignment: 'center' },
    rateEnd: { displayAs: 'Rate End', maxWidth: '20ch', alignment: 'center' },
    rate: { displayAs: 'Rate', maxWidth: '12ch', alignment: 'right' }
  };


  //#region Owner Dashboard
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.user = this.authService.getUser();
    this.setTodayDate();
    this.loadCurrentUser(this.user.userId);
  }
  //#endregion
  
  //#region Data Loading Methods
  loadCurrentUser(userId: string): void {
    this.userService.getUserByGuid(userId).pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser'))).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
        this.ownerContactId = userResponse.contactId ? String(userResponse.contactId).trim() : null;
        if (!this.ownerContactId) {
          this.resetOwnerDashboardData();
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
        } else {
          this.loadProperties();
          this.loadReservations();
        }
        this.markViewForCheck();
      },
      error: () => {
        this.profilePictureUrl = null;
        this.ownerContactId = null;
        this.resetOwnerDashboardData();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
        this.markViewForCheck();
      }
    });
  }

  loadProperties(): void {
    const ownerContactId = this.ownerContactId?.trim();
    if (!ownerContactId) {
      this.allProperties = [];
      this.ownerPropertiesTableData = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties');
      this.refreshOwnerReservationData();
      return;
    }

    this.propertyService.getPropertiesByOwner(ownerContactId).pipe( take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: (properties) => {
        this.allProperties = (properties || []).filter(p => p.isActive);
        this.ownerPropertiesTableData = this.allProperties.map(property => ({
          ...property,
          monthlyRate: this.formatCurrencyValue(property.monthlyRate),
          dailyRate: this.formatCurrencyValue(property.dailyRate)
        }));
        this.refreshOwnerReservationData();
        this.markViewForCheck();
      },
      error: () => {
        this.allProperties = [];
        this.ownerPropertiesTableData = [];
        this.refreshOwnerReservationData();
        this.markViewForCheck();
      }
    });
  }

  loadReservations(): void {
    const ownerContactId = this.ownerContactId?.trim();
    if (!ownerContactId) {
      this.allReservations = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
      this.refreshOwnerReservationData();
      return;
    }

    this.reservationService.getReservationsByOwner(ownerContactId).pipe(
      take(1),
      switchMap(reservations => {
        this.allReservations = this.mappingService.mapReservationList(reservations || []);
        const reservationIds = this.allReservations
          .map(reservation => String(reservation.reservationId || '').trim())
          .filter(id => !!id);

        if (reservationIds.length === 0) {
          this.paymentsByReservationId.clear();
          return of(void 0);
        }

        return forkJoin(
          reservationIds.map(reservationId =>
            this.reservationService.getReservationPayments(reservationId).pipe(
              catchError(() => of([] as ReservationPaymentResponse[]))
            )
          )
        ).pipe(
          tap(paymentArrays => {
            this.paymentsByReservationId.clear();
            reservationIds.forEach((reservationId, index) => {
              this.paymentsByReservationId.set(reservationId, paymentArrays[index] || []);
            });
          }),
          map(() => void 0)
        );
      }),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'))
    ).subscribe({
      next: () => {
        this.refreshOwnerReservationData();
        this.markViewForCheck();
      },
      error: () => {
        this.allReservations = [];
        this.paymentsByReservationId.clear();
        this.refreshOwnerReservationData();
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  applyUserProfilePicture(userResponse: UserResponse): void {
    if (userResponse.fileDetails?.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
    } else {
      this.profilePictureUrl = userResponse.profilePath || null;
    }
  }

  resetOwnerDashboardData(): void {
    this.allProperties = [];
    this.allReservations = [];
    this.ownerPropertiesTableData = [];
    this.ownerPropertyReservations = [];
    this.ownerCurrentReservationsTableData = [];
    this.ownerHistoricalReservationsTableData = [];
    this.paymentsByReservationId.clear();
    this.rentedCount = 0;
    this.vacantCount = 0;
    this.currentReservationCount = 0;
    this.upcomingReservationCount = 0;
  }

  refreshOwnerReservationData(): void {
    this.ownerPropertyReservations = this.allReservations.map(reservation => ({
      ...reservation,
      billingType: getBillingType(reservation.billingTypeId ?? undefined)
    }));
    const reservationsForDisplay = this.ownerPropertyReservations.map(reservation => ({
      ...reservation,
      billingType: this.shouldMaskBillingFields(reservation.reservationStatusId) ? '--' : getBillingType(reservation.billingTypeId ?? undefined),
      billingRate: this.shouldMaskBillingFields(reservation.reservationStatusId) ? '--' : this.formatCurrencyValue(reservation.billingRate)
    }));
    this.ownerCurrentReservationsTableData = reservationsForDisplay.filter(reservation => !this.isHistoricalReservation(reservation.departureDate));

    const historicalReservations = this.ownerPropertyReservations.filter(
      reservation => this.isHistoricalReservation(reservation.departureDate)
    );
    this.ownerHistoricalReservationsTableData = this.reservationHistoryDisplayService
      .buildRateHistoryRows(historicalReservations, this.paymentsByReservationId)
      .map(row => ({
        ...row,
        office: row.officeName || row.office || '',
        rate: this.shouldMaskBillingFields(row.reservationStatusId) ? '--' : row.rate
      }));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rentedPropertyIds = new Set<string>();
    let currentReservations = 0;
    let upcomingReservations = 0;

    this.ownerPropertyReservations.forEach(reservation => {
      if (!reservation.isActive) {
        return;
      }

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
    
  formatCurrencyValue(value: number | null | undefined): string {
    return this.formatterService.currencyUsd(Number(value) || 0);
  }

  shouldMaskBillingFields(reservationStatusId: number | null | undefined): boolean {
    return Number(reservationStatusId) > ReservationStatus.FirstRightRefusal;
  }

  isHistoricalReservation(departureDateValue: unknown): boolean {
    if (!departureDateValue) {
      return false;
    }
    const departureDate = this.utilityService.parseCalendarDateInput(departureDateValue as string);
    if (!departureDate) {
      return false;
    }
    departureDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return departureDate.getTime() < today.getTime();
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
