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
import { ReservationListDisplay, ReservationListResponse, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { UserResponse } from '../../users/models/user.model';
import { PropertyMaintenance, PropertyVacancyDisplay, ReservationPropertyMaintenance } from '../models/mixed-models';
import { ServiceType, getServiceType } from '../models/mixed-enums';
@Directive()
export class PropertyMaintenanceBase implements OnInit, OnDestroy {
  protected itemsToLoad$!: BehaviorSubject<Set<string>>;

  user: JwtUser | null = null;
  globalOfficeSubscription?: Subscription;

  // Should not be used by derived classes. 
  private reservationList: ReservationListDisplay[] = [];
  private activeReservationList: ReservationListDisplay[] = [];
  private propertyList: PropertyListResponse[] = [];
  private maintenanceList: MaintenanceListResponse[] = [];
  private maintenanceByPropertyId = new Map<string, MaintenanceListResponse>();
  private propertyMaintenanceList: PropertyMaintenance[] = [];
  private reservationPropertyMaintenanceList: ReservationPropertyMaintenance[] = [];

  // Used by Derived classes
  filteredPropertyMaintenanceList: PropertyMaintenance[] = [];
  filteredReservationPropertyMaintenanceList: ReservationPropertyMaintenance[] = [];
  offlineProperties: PropertyMaintenance[] = [];
  onlineProperties: PropertyMaintenance[] = [];
  arrivalReservations: ReservationPropertyMaintenance[] = [];
  departureReservations: ReservationPropertyMaintenance[] = [];
  cleaningReservations: ReservationPropertyMaintenance[] = [];

  todayArriveDepartCount = 0;
  tomorrowArriveDepartCount = 0;

  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  housekeepingUsers: UserResponse[] = [];
  carpetUsers: UserResponse[] = [];
  inspectorUsers: UserResponse[] = [];
  organizationId = '';
  preferredOfficeId: number | null = null;
  todayAtMidnight: Date = new Date();
  fifteenDaysAtMidnight: Date = new Date();
  nextTwoMonthsAtMidnight: Date = new Date();
  tomorrowAtMidnight: Date = new Date();
  todayCalendarDate: string | null = null;
  tomorrowCalendarDate: string | null = null;
  todayDayOrdinal = 0;
  tomorrowDayOrdinal = 0;
  isServiceError = false;

  rentedCount = 0;
  vacantCount = 0;
  propertiesByVacancy: PropertyVacancyDisplay[] = [];

  constructor(
    protected authService: AuthService,
    protected reservationService: ReservationService,
    protected mixedMappingService: MixedMappingService,
    protected mappingService: MappingService,
    protected propertyService: PropertyService,
    protected maintenanceService: MaintenanceService,
    protected utilityService: UtilityService,
    protected officeService: OfficeService,
    protected globalSelectionService: GlobalSelectionService
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
    this.loadReservationPropertyMaintenance();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      this.resolveOfficeScope(officeId);
      if (this.itemsToLoad$.value.size === 0) {
        this.recomputeBackendData();
      }
    });
  }

  ngOnDestroy(): void {
    this.globalOfficeSubscription?.unsubscribe();
  }
  //#endregion

  //#region Main Data Setup
  protected getMaintenanceListResponseForPropertyId(propertyId: string, propertyIdAlt?: string): MaintenanceListResponse | null {
    const lookupId = propertyId || propertyIdAlt || '';
    if (!lookupId) {
      return null;
    }
    return this.maintenanceByPropertyId.get(lookupId) ?? null;
  }

  protected recomputeBackendData(userId: string | null = null): void {
    this.loadReservationPropertyMaintenance();
    this.filteredPropertyMaintenanceList = this.filterPropertyMaintenanceListForSelectedOffice();
    this.filteredReservationPropertyMaintenanceList = this.filterReservationPropertyMaintenanceListForSelectedOffice();

    const assigneeUserId = this.utilityService.normalizeIdOrNull(userId);
    this.offlineProperties = this.getPropertiesGoingOffline(assigneeUserId);
    this.onlineProperties = this.getPropertiesComingOnline(assigneeUserId);
    this.arrivalReservations = this.getReservationsWithArrivals(assigneeUserId);
    this.departureReservations = this.getReservationsWithDepartures(assigneeUserId);
    this.cleaningReservations = this.getReservationsWithCleanings(assigneeUserId);

    this.todayArriveDepartCount = this.getArrivalsDeparturesForToday();
    this.tomorrowArriveDepartCount = this.getArrivalsDeparturesForTomorrow();

    this.recomputeVacantPropertyStats();

    this.onAfterRecomputeBackendData(assigneeUserId);
  }

  protected onAfterRecomputeBackendData(assigneeUserId: string | null): void {
    void assigneeUserId;
  }

  protected applyReservationListMappingsFromServer(displayRows: ReservationListDisplay[]): void {
    this.reservationList = displayRows;
    this.activeReservationList = this.reservationList.filter(r => r.isActive === true);
  }

  protected upsertReservationInCachedLists(reservation: ReservationResponse): void {
    const source = reservation as unknown as ReservationListResponse;
    const mappedRows = this.mappingService.mapReservationList([source]);
    const displayRows = this.mixedMappingService.mapReservationListDisplayWithProviderFields([source], mappedRows);
    const next = displayRows[0];
    if (!next) {
      return;
    }
    const reservationId = this.utilityService.normalizeId(next.reservationId);
    const existingIndex = this.reservationList.findIndex(row => this.utilityService.normalizeId(row.reservationId) === reservationId);
    if (existingIndex >= 0) {
      this.reservationList[existingIndex] = next;
    } else {
      this.reservationList.push(next);
    }
    this.activeReservationList = this.reservationList.filter(r => r.isActive === true);
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

  protected resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  protected onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
  }

   loadActiveReservations(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'activeReservations'); })).subscribe({
      next: (response: ReservationListResponse[]) => {
        const mappedRows = this.mappingService.mapReservationList(response);
        this.applyReservationListMappingsFromServer(
          this.mixedMappingService.mapReservationListDisplayWithProviderFields(response, mappedRows)
        );
      },
      error: () => {
        this.reservationList = [];
        this.activeReservationList = [];
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
            this.rebuildMaintenanceByPropertyIdMap();
            this.loadReservationPropertyMaintenance();
          },
          error: () => {
            this.isServiceError = true;
            this.propertyList = [];
            this.maintenanceList = [];
            this.propertyMaintenanceList = [];
            this.filteredPropertyMaintenanceList = [];
            this.filteredReservationPropertyMaintenanceList = [];
            this.rebuildMaintenanceByPropertyIdMap();
          }
        });
  }

   loadReservationPropertyMaintenance(): void {
    this.reservationPropertyMaintenanceList = this.mixedMappingService.mapReservationPropertyMaintenance(
      this.activeReservationList, this.propertyList, this.maintenanceList);
  }

   rebuildMaintenanceByPropertyIdMap(): void {
    this.maintenanceByPropertyId = new Map();
    for (const row of this.maintenanceList) {
      if (row?.propertyId) {
        this.maintenanceByPropertyId.set(row.propertyId, row);
      }
    }
  }
  //#endregion

  //#region Getting/Filtering Methods
   filterPropertyMaintenanceListForSelectedOffice(): PropertyMaintenance[] {
    const officeId = this.selectedOffice?.officeId;
    if (officeId == null) {
      return [...this.propertyMaintenanceList];
    }
    return this.propertyMaintenanceList.filter(pm => pm.officeId === officeId);
  }

   filterReservationPropertyMaintenanceListForSelectedOffice(): ReservationPropertyMaintenance[] {
    const officeId = this.selectedOffice?.officeId;
    if (officeId == null) {
      return [...this.reservationPropertyMaintenanceList];
    }
    return this.reservationPropertyMaintenanceList.filter(rpm => rpm.officeId === officeId);
  }

   getPropertiesGoingOffline(userId: string | null = null): PropertyMaintenance[] {
    const bounds = this.getInclusiveNextFifteenDayOrdinalBounds();
    if (!bounds) {
      return [];
    }
    const { lo, hi } = bounds;
    const result: PropertyMaintenance[] = [];
    for (const pm of this.filteredPropertyMaintenanceList) {
      const untilOrdinal = pm.availableUntilOrdinal;
      const inWindow = untilOrdinal !== null && untilOrdinal >= lo && untilOrdinal <= hi;
      const assigneeOk = userId === null
        || pm.offCleanerUserId === userId
        || pm.offCarpetUserId === userId
        || pm.offInspectorUserId === userId;
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
    for (const pm of this.filteredPropertyMaintenanceList) {
      const fromOrdinal = pm.availableFromOrdinal;
      if (fromOrdinal !== null && fromOrdinal >= lo && fromOrdinal <= hi
        && (userId === null
          || pm.onCleanerUserId === userId
          || pm.onCarpetUserId === userId
          || pm.onInspectorUserId === userId)
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
    for (const rpm of this.filteredReservationPropertyMaintenanceList) {
      const arrivalOrdinal = rpm.arrivalDateOrdinal;
      const inLo = arrivalOrdinal !== null && arrivalOrdinal >= lo;
      const inHi = arrivalOrdinal !== null && arrivalOrdinal <= hi;
      const assigneeOk = userId === null
        || rpm.aCleanerUserId === userId
        || rpm.aCarpetUserId === userId
        || rpm.aInspectorUserId === userId;
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
    for (const rpm of this.filteredReservationPropertyMaintenanceList) {
      const departureOrdinal = rpm.departureDateOrdinal;
      if (departureOrdinal !== null && departureOrdinal >= lo && departureOrdinal <= hi
        && (userId === null
          || rpm.dCleanerUserId === userId
          || rpm.dCarpetUserId === userId
          || rpm.dInspectorUserId === userId)
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

  protected getReservationsWithCleanings(userId: string | null = null): ReservationPropertyMaintenance[] {
    const bounds = this.getInclusiveNextTwoMonthsOrdinalBounds();
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
    for (const row of this.filteredReservationPropertyMaintenanceList) {
      const frequencyId = Number(row.frequencyId);
      const safeFreq = Number.isFinite(frequencyId) ? frequencyId : 0;
      const cleaningOccurrences = buildMaidCleaningOccurrencesUpToHi(row.maidStartDate, safeFreq, hi);
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
        if (userId !== null
          && row.maidUserId !== userId
          && row.aCleanerUserId !== userId
          && row.dCleanerUserId !== userId
        ) {
          continue;
        }
        result.push({
          ...row,
          eventType: ServiceType.MaidService,
          eventTypeDisplay: getServiceType(ServiceType.MaidService),
          eventDate: occ.api,
          eventDateSortTime: occ.ordinal
        });
      }
    }
    return result;
  }

  protected getHousekeepingUsersForScope(officeId: number): UserResponse[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    if (scopedOfficeId === 0 || officeId === 0) {
      return this.housekeepingUsers;
    }
    return this.housekeepingUsers.filter(user => (user.officeAccess || []).includes(scopedOfficeId));
  }

  protected getInspectorUsersForScope(officeId: number): UserResponse[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    if (scopedOfficeId === 0 || officeId === 0) {
      return this.inspectorUsers;
    }
    return this.inspectorUsers.filter(user => (user.officeAccess || []).includes(scopedOfficeId));
  }

  protected getCarpetUsersForScope(officeId: number): UserResponse[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    if (scopedOfficeId === 0 || officeId === 0) {
      return this.carpetUsers;
    }
    return this.carpetUsers.filter(user => (user.officeAccess || []).includes(scopedOfficeId));
  }

  protected getServiceProviders(): { userId: string; displayName: string }[] {
    const scopedOfficeId = this.selectedOffice?.officeId ?? 0;
    const combined = [
      ...this.getHousekeepingUsersForScope(scopedOfficeId),
      ...this.getInspectorUsersForScope(scopedOfficeId),
      ...this.getCarpetUsersForScope(scopedOfficeId)
    ];
    const byUserId = new Map<string, string>();
    for (const user of combined) {
      const userId = (user.userId ?? '').trim();
      if (!userId) {
        continue;
      }
      const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || userId;
      if (!byUserId.has(userId)) {
        byUserId.set(userId, displayName);
      }
    }
    return Array.from(byUserId.entries())
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  }

  protected refreshCleaningReservations(userId: string | null = null): ReservationPropertyMaintenance[] {
    this.loadReservationPropertyMaintenance();
    this.filteredReservationPropertyMaintenanceList = this.filterReservationPropertyMaintenanceListForSelectedOffice();
    this.cleaningReservations = this.getReservationsWithCleanings(this.utilityService.normalizeIdOrNull(userId));
    return this.cleaningReservations;
  }

   recomputeVacantPropertyStats(): void {
    if (this.propertyList.length === 0) {
      this.rentedCount = 0;
      this.vacantCount = 0;
      this.propertiesByVacancy = [];
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const propertiesForScope = !this.selectedOffice
      ? this.propertyList
      : this.propertyList.filter(p => p.officeId === this.selectedOffice!.officeId);
    const reservationsForScope = !this.selectedOffice
      ? this.reservationList
      : this.reservationList.filter(r => r.officeId === this.selectedOffice!.officeId);

    const propertyIdsWithCurrentStay = new Set<string>();
    reservationsForScope.forEach(reservation => {
      if (!reservation.isActive || !reservation.propertyId) {
        return;
      }
      const arrivalDate = this.utilityService.parseDateOnlyStringToDate(reservation.arrivalDate);
      const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
      if (!arrivalDate || !departureDate) {
        return;
      }
      if (today.getTime() >= arrivalDate.getTime() && today.getTime() <= departureDate.getTime()) {
        propertyIdsWithCurrentStay.add(reservation.propertyId);
      }
    });

    const latestPastDepartureByProperty = new Map<string, Date>();
    reservationsForScope.forEach(reservation => {
      if (!reservation.propertyId) {
        return;
      }
      const departureDate = this.utilityService.parseDateOnlyStringToDate(reservation.departureDate);
      if (!departureDate || departureDate.getTime() > today.getTime()) {
        return;
      }
      const existingLatestDeparture = latestPastDepartureByProperty.get(reservation.propertyId);
      if (!existingLatestDeparture || departureDate.getTime() > existingLatestDeparture.getTime()) {
        latestPastDepartureByProperty.set(reservation.propertyId, departureDate);
      }
    });

    this.propertiesByVacancy = propertiesForScope
      .filter(property => !propertyIdsWithCurrentStay.has(property.propertyId))
      .map(property => {
        const latestPastDeparture = latestPastDepartureByProperty.get(property.propertyId);
        const vacancyDays = latestPastDeparture
          ? Math.max(Math.floor((today.getTime() - latestPastDeparture.getTime()) / (1000 * 60 * 60 * 24)), 0)
          : null;
        const vacancyDaysDisplay: string | number = vacancyDays === null ? 'Never rented' : vacancyDays;
        const lastDepartureDate = this.mappingService.mapVacantPropertyLastDepartureDate(latestPastDeparture ?? null);

        return {
          ...property,
          bedroomId1: this.mappingService.readPropertyListBedroomTypeId(property, 1),
          bedroomId2: this.mappingService.readPropertyListBedroomTypeId(property, 2),
          bedroomId3: this.mappingService.readPropertyListBedroomTypeId(property, 3),
          bedroomId4: this.mappingService.readPropertyListBedroomTypeId(property, 4),
          vacancyDays,
          vacancyDaysDisplay,
          lastDepartureDate
        };
      })
      .sort((a, b) => {
        const aDays = a.vacancyDays;
        const bDays = b.vacancyDays;

        if (aDays === null && bDays === null) {
          return (a.propertyCode || '').localeCompare(b.propertyCode || '');
        }
        if (aDays === null) {
          return -1;
        }
        if (bDays === null) {
          return 1;
        }
        return bDays - aDays;
      });

    this.rentedCount = propertyIdsWithCurrentStay.size;
    this.vacantCount = this.propertiesByVacancy.length;
  }

   getInclusiveNextFifteenDayOrdinalBounds(): { lo: number; hi: number } | null {
    const hi = this.utilityService.parseCalendarDateToOrdinal(this.utilityService.formatDateOnlyForApi(this.fifteenDaysAtMidnight));
    if (hi === null) {
      return null;
    }
    return { lo: this.todayDayOrdinal, hi };
  }

   getInclusiveNextTwoMonthsOrdinalBounds(): { lo: number; hi: number } | null {
    const hi = this.utilityService.parseCalendarDateToOrdinal(this.utilityService.formatDateOnlyForApi(this.nextTwoMonthsAtMidnight));
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

    const twoMonthsAhead = new Date(today);
    twoMonthsAhead.setMonth(twoMonthsAhead.getMonth() + 2);
    twoMonthsAhead.setHours(0, 0, 0, 0);
    this.nextTwoMonthsAtMidnight = twoMonthsAhead;
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
  protected getArrivalsDeparturesForToday(): number {
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

  protected getArrivalsDeparturesForTomorrow(): number {
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

  protected getOnlineOfflineTodayCount(): number {
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

  protected getOnlineOfflineTomorrowCount(): number {
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
