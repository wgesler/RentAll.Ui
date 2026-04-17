import { HttpErrorResponse } from '@angular/common/http';
import { Directive, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Subscription, finalize, map, skip, switchMap, take } from 'rxjs';
import { JwtUser } from '../../../public/login/models/jwt';
import { AuthService } from '../../../services/auth.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { MaintenanceListResponse } from '../../maintenance/models/maintenance.model';
import { MaintenanceService } from '../../maintenance/services/maintenance.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { Frequency } from '../../reservations/models/reservation-enum';
import { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { PropertyMaintenance, ReservationPropertyMaintenance } from '../models/mixed-models';
import { ServiceType, getServiceType } from '../models/mixed-enums';
@Directive()
export class PropertyMaintenanceBase implements OnInit, OnDestroy {
  protected itemsToLoad$!: BehaviorSubject<Set<string>>;

  user: JwtUser | null = null;
  globalOfficeSubscription?: Subscription;

  reservationList: ReservationListDisplay[] = [];
  propertyList: PropertyListResponse[] = [];
  maintenanceList: MaintenanceListResponse[] = [];
  propertyMaintenanceList: PropertyMaintenance[] = [];
  reservationPropertyMaintenanceList: ReservationPropertyMaintenance[] = [];

  offlineProperties: PropertyMaintenance[] = [];
  onlineProperties: PropertyMaintenance[] = [];
  arrivalReservations: ReservationPropertyMaintenance[] = [];
  departureReservations: ReservationPropertyMaintenance[] = [];
  cleaningReservations: ReservationPropertyMaintenance[] = [];

  todayArriveDepartCount = 0;
  tomorrowArriveDepartCount = 0;

  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  organizationId = '';
  preferredOfficeId: number | null = null;
  todayAtMidnight: Date = new Date();
  fifteenDaysAtMidnight: Date = new Date();
  tomorrowAtMidnight: Date = new Date();
  todayCalendarDate: string | null = null;
  tomorrowCalendarDate: string | null = null;
  todayDayOrdinal = 0;
  tomorrowDayOrdinal = 0;
  isServiceError = false;

  constructor(
    protected authService: AuthService,
    private reservationService: ReservationService,
    protected mixedMappingService: MixedMappingService,
    protected mappingService: MappingService,
    private propertyService: PropertyService,
    private maintenanceService: MaintenanceService,
    protected utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService
  ) { }

  //#region Property-Maintenance Base
  ngOnInit(): void {
    this.initializeDateBoundaries();
    this.cacheTodayCalendar();
    this.cacheTomorrowCalendar();

    this.user = this.authService.getUser();
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.user?.defaultOfficeId ?? null;

    this.loadOffices();
    this.loadActiveReservations();
    this.loadPropertyMaintenance();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      this.resolveOfficeScope(officeId);
      if (this.itemsToLoad$.value.size === 0) {
        this.recomputeDashboardData();
      }
    });
  }

  ngOnDestroy(): void {
    this.globalOfficeSubscription?.unsubscribe();
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1), switchMap(() => {
      this.offices = this.officeService.getAllOfficesValue() || [];
      return this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: null, requireExplicitOfficeUnset: false }).pipe(take(1));
    }), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: uiState => {
        this.resolveOfficeScope(uiState.selectedOfficeId);
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(this.globalSelectionService.getSelectedOfficeIdValue());
      }
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  loadActiveReservations(): void {
    this.reservationService.getActiveReservationList().pipe(take(1), finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'activeReservations');})).subscribe({
      next: (response: ReservationListResponse[]) => {
        this.reservationList = this.mappingService.mapReservationList(response);
      },
      error: () => {
        this.reservationList = [];
      }
    });
  }

  loadPropertyMaintenance(): void {
    this.isServiceError = false;
    this.propertyService.getActivePropertyList().pipe(take(1),
      switchMap(properties => this.maintenanceService.getMaintenanceList().pipe(take(1),
      map(maintenanceList => ({properties, maintenanceList, propertyMaintenanceList: this.mixedMappingService.mapPropertyMaintenenace(properties, maintenanceList)})))),
        finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyMaintenanceList');})).subscribe({
          next: mapped => {
            this.propertyList = mapped.properties;
            this.maintenanceList = mapped.maintenanceList;
            this.propertyMaintenanceList = mapped.propertyMaintenanceList;
          },
          error: (_err: HttpErrorResponse) => {
            this.isServiceError = true;
            this.propertyList = [];
            this.maintenanceList = [];
            this.propertyMaintenanceList = [];
          }
        });
  }
  //#endregion

  //#region Main Data Setup
  recomputeDashboardData(userId: string | null = null): void {
    this.reservationPropertyMaintenanceList = this.mixedMappingService.mapReservationPropertyMaintenance(
      this.reservationList, this.propertyList, this.maintenanceList);

    const assigneeUserId = this.utilityService.normalizeIdOrNull(userId);
    this.offlineProperties = this.getPropertiesGoingOffline(assigneeUserId);
    this.onlineProperties = this.getPropertiesComingOnline(assigneeUserId);
    this.arrivalReservations = this.getReservationsWithArrivals(assigneeUserId);
    this.departureReservations = this.getReservationsWithDepartures(assigneeUserId);
    this.cleaningReservations = this.getReservationsWithCleanings(assigneeUserId);

    this.todayArriveDepartCount = this.getArrivalsDeparturesForToday();
    this.tomorrowArriveDepartCount = this.getArrivalsDeparturesForTomorrow();

    this.onAfterRecomputeDashboardData(assigneeUserId);
  }

  protected onAfterRecomputeDashboardData(assigneeUserId: string | null): void {
  }

  getPropertiesGoingOffline(userId: string | null = null): PropertyMaintenance[] {
    const bounds = this.getInclusiveNextFifteenDayOrdinalBounds();
    if (!bounds) {
      return [];
    }
    const { lo, hi } = bounds;
    const result: PropertyMaintenance[] = [];
    for (const pm of this.propertyMaintenanceList) {
      const untilOrdinal = pm.availableUntilOrdinal;
      const inWindow = untilOrdinal !== null && untilOrdinal >= lo && untilOrdinal <= hi;
      const assigneeOk = userId === null
        || pm.cleanerUserId === userId
        || pm.carpetUserId === userId
        || pm.inspectorUserId === userId;
      if (inWindow && assigneeOk) {
        result.push({
          ...pm,
          eventType: ServiceType.Offline,
          eventTypeDisplay: getServiceType(ServiceType.Offline),
          eventDate: pm.availableUntil,
          eventDateSortTime: untilOrdinal
        });
      }
    }
    return result;
  }

  getPropertiesComingOnline(userId: string | null = null): PropertyMaintenance[] {
    const bounds = this.getInclusiveNextFifteenDayOrdinalBounds();
    if (!bounds) {
      return [];
    }
    const { lo, hi } = bounds;
    const result: PropertyMaintenance[] = [];
    for (const pm of this.propertyMaintenanceList) {
      const fromOrdinal = pm.availableFromOrdinal;
      if (fromOrdinal !== null && fromOrdinal >= lo && fromOrdinal <= hi
        && (userId === null
          || pm.cleanerUserId === userId
          || pm.carpetUserId === userId
          || pm.inspectorUserId === userId)
      ) {
        result.push({
          ...pm,
          eventType: ServiceType.Online,
          eventTypeDisplay: getServiceType(ServiceType.Online),
          eventDate: pm.availableFrom,
          eventDateSortTime: fromOrdinal
        });
      }
    }
    return result;
  }

  getReservationsWithArrivals(userId: string | null = null): ReservationPropertyMaintenance[] {
    const bounds = this.getInclusiveNextFifteenDayOrdinalBounds();
    if (!bounds) {
      return [];
    }
    const { lo, hi } = bounds;
    const result: ReservationPropertyMaintenance[] = [];
    for (const rpm of this.reservationPropertyMaintenanceList) {
      const arrivalOrdinal = rpm.arrivalDateOrdinal;
      const inLo = arrivalOrdinal !== null && arrivalOrdinal >= lo;
      const inHi = arrivalOrdinal !== null && arrivalOrdinal <= hi;
      const assigneeOk = userId === null
        || rpm.cleanerUserId === userId
        || rpm.carpetUserId === userId
        || rpm.inspectorUserId === userId;
      if (inLo && inHi && assigneeOk) {
        result.push({
          ...rpm,
          eventType: ServiceType.Arrival,
          eventTypeDisplay: getServiceType(ServiceType.Arrival),
          eventDate: rpm.arrivalDate,
          eventDateSortTime: arrivalOrdinal
        });
      }
    }
    return result;
  }

  getReservationsWithDepartures(userId: string | null = null): ReservationPropertyMaintenance[] {
    const bounds = this.getInclusiveNextFifteenDayOrdinalBounds();
    if (!bounds) {
      return [];
    }
    const { lo, hi } = bounds;
    const result: ReservationPropertyMaintenance[] = [];
    for (const rpm of this.reservationPropertyMaintenanceList) {
      const departureOrdinal = rpm.departureDateOrdinal;
      if (departureOrdinal !== null && departureOrdinal >= lo && departureOrdinal <= hi
        && (userId === null
          || rpm.cleanerUserId === userId
          || rpm.carpetUserId === userId
          || rpm.inspectorUserId === userId)
      ) {
        result.push({
          ...rpm,
          eventType: ServiceType.Departure,
          eventTypeDisplay: getServiceType(ServiceType.Departure),
          eventDate: rpm.departureDate,
          eventDateSortTime: departureOrdinal
        });
      }
    }
    return result;
  }

  getReservationsWithCleanings(userId: string | null = null): ReservationPropertyMaintenance[] {
    const bounds = this.getInclusiveNextFifteenDayOrdinalBounds();
    if (!bounds) {
      return [];
    }
    const { lo, hi } = bounds;
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const calendarDaysBetween = (earlier: Date, later: Date) => {
      const e = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
      const l = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
      return Math.round((l - e) / 86400000);
    };
    const advanceMaidClean = (d: Date, frequencyId: number): Date => {
      const n = startOfDay(d);
      switch (frequencyId) {
        case Frequency.Weekly:
          n.setDate(n.getDate() + 7);
          return n;
        case Frequency.EOW:
          n.setDate(n.getDate() + 14);
          return n;
        case Frequency.Monthly:
          n.setMonth(n.getMonth() + 1);
          return n;
        case Frequency.Quarterly:
          n.setMonth(n.getMonth() + 3);
          return n;
        case Frequency.BiAnnually:
          n.setMonth(n.getMonth() + 6);
          return n;
        case Frequency.Annually:
          n.setFullYear(n.getFullYear() + 1);
          return n;
        default:
          n.setDate(n.getDate() + 7);
          return n;
      }
    };

    const buildMaidCleaningOccurrencesUpToHi = (
      maidStartDate: string | null | undefined,
      frequencyId: number,
      hiOrdinal: number
    ): { api: string; ordinal: number }[] => {
      if (maidStartDate == null || String(maidStartDate).trim() === '') {
        return [];
      }
      if (frequencyId === Frequency.NA) {
        return [];
      }
      const allowedRecurring = new Set<number>([
        Frequency.Weekly,
        Frequency.EOW,
        Frequency.Monthly,
        Frequency.Quarterly,
        Frequency.BiAnnually,
        Frequency.Annually
      ]);
      if (frequencyId !== Frequency.OneTime && !allowedRecurring.has(frequencyId)) {
        return [];
      }
      const start = this.utilityService.parseDateOnlyStringToDate(maidStartDate);
      if (!start) {
        return [];
      }
      let cursor = startOfDay(start);
      const out: { api: string; ordinal: number }[] = [];
      if (frequencyId === Frequency.OneTime) {
        const api = this.utilityService.formatDateOnlyForApi(cursor);
        const ord = this.utilityService.parseCalendarDateToOrdinal(api);
        if (api && ord !== null) {
          out.push({ api, ordinal: ord });
        }
        return out;
      }
      let guard = 0;
      while (guard < 600) {
        const api = this.utilityService.formatDateOnlyForApi(cursor);
        const ord = this.utilityService.parseCalendarDateToOrdinal(api);
        if (!api || ord === null) {
          break;
        }
        if (ord > hiOrdinal) {
          break;
        }
        out.push({ api, ordinal: ord });
        cursor = advanceMaidClean(cursor, frequencyId);
        guard++;
      }
      return out;
    };

    const result: ReservationPropertyMaintenance[] = [];
    for (const row of this.reservationPropertyMaintenanceList) {
      const frequencyId = Number(row.frequencyId);
      const safeFreq = Number.isFinite(frequencyId) ? frequencyId : 0;
      const cleaningOccurrences = buildMaidCleaningOccurrencesUpToHi(row.maidStartDate, safeFreq, hi);
      let chosen: { api: string; ordinal: number } | null = null;
      for (const occ of cleaningOccurrences) {
        if (occ.ordinal < lo || occ.ordinal > hi) {
          continue;
        }
        const departureDay = this.utilityService.parseDateOnlyStringToDate(row.departureDate);
        const cleanDay = this.utilityService.parseDateOnlyStringToDate(occ.api);
        if (!departureDay || !cleanDay) {
          continue;
        }
        if (calendarDaysBetween(cleanDay, startOfDay(departureDay)) < 7) {
          continue;
        }
        if (userId !== null && row.maidUserId !== userId && row.cleanerUserId !== userId) {
          continue;
        }
        chosen = occ;
        break;
      }
      if (!chosen) {
        continue;
      }
      result.push({
        ...row,
        eventType: ServiceType.Scheduled,
        eventTypeDisplay: getServiceType(ServiceType.Scheduled),
        eventDate: chosen.api,
        eventDateSortTime: chosen.ordinal
      });
    }
    return result;
  }

  getInclusiveNextFifteenDayOrdinalBounds(): { lo: number; hi: number } | null {
    const hi = this.utilityService.parseCalendarDateToOrdinal(this.utilityService.formatDateOnlyForApi(this.fifteenDaysAtMidnight));
    if (hi === null) {
      return null;
    }
    return { lo: this.todayDayOrdinal, hi };
  }
  //#endregion

  //#region Titlebar Methods
  initializeDateBoundaries(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.todayAtMidnight = today;
    const fifteen = new Date(today);
    fifteen.setDate(fifteen.getDate() + 15);
    fifteen.setHours(0, 0, 0, 0);
    this.fifteenDaysAtMidnight = fifteen;
  }

  cacheTodayCalendar(): void {
    this.todayCalendarDate = this.utilityService.formatDateOnlyForApi(this.todayAtMidnight);
    this.todayDayOrdinal = this.utilityService.parseCalendarDateToOrdinal(this.todayCalendarDate)!;
  }

  cacheTomorrowCalendar(): void {
    this.tomorrowAtMidnight = new Date(this.todayAtMidnight);
    this.tomorrowAtMidnight.setDate(this.tomorrowAtMidnight.getDate() + 1);
    this.tomorrowAtMidnight.setHours(0, 0, 0, 0);
    this.tomorrowCalendarDate = this.utilityService.formatDateOnlyForApi(this.tomorrowAtMidnight);
    this.tomorrowDayOrdinal = this.utilityService.parseCalendarDateToOrdinal(this.tomorrowCalendarDate)!;
  }
  //#endregion

  //#region Get Today/Tomorrow Methods
  getArrivalsDeparturesForToday(): number {
    const ids = new Set<string>();
    for (const r of this.arrivalReservations) {
      if (r.arrivalDateOrdinal === this.todayDayOrdinal) {
        ids.add(r.reservationId);
      }
    }
    for (const r of this.departureReservations) {
      if (r.departureDateOrdinal === this.todayDayOrdinal) {
        ids.add(r.reservationId);
      }
    }
    return ids.size;
  }

  getArrivalsDeparturesForTomorrow(): number {
    const ids = new Set<string>();
    for (const r of this.arrivalReservations) {
      if (r.arrivalDateOrdinal === this.tomorrowDayOrdinal) {
        ids.add(r.reservationId);
      }
    }
    for (const r of this.departureReservations) {
      if (r.departureDateOrdinal === this.tomorrowDayOrdinal) {
        ids.add(r.reservationId);
      }
    }
    return ids.size;
  }

  getOnlineOfflineTodayCount(): number {
    const ids = new Set<string>();
    for (const p of this.offlineProperties) {
      if (p.availableUntilOrdinal === this.todayDayOrdinal) {
        ids.add(p.propertyId);
      }
    }
    for (const p of this.onlineProperties) {
      if (p.availableFromOrdinal === this.todayDayOrdinal) {
        ids.add(p.propertyId);
      }
    }
    return ids.size;
  }

  getOnlineOfflineTomorrowCount(): number {
    const ids = new Set<string>();
    for (const p of this.offlineProperties) {
      if (p.availableUntilOrdinal === this.tomorrowDayOrdinal) {
        ids.add(p.propertyId);
      }
    }
    for (const p of this.onlineProperties) {
      if (p.availableFromOrdinal === this.tomorrowDayOrdinal) {
        ids.add(p.propertyId);
      }
    }
    return ids.size;
  }
  //#endregion
}
