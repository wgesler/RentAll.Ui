import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { MaintenanceService } from '../../maintenance/services/maintenance.service';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationService } from '../../reservations/services/reservation.service';
import { ReservationListDisplay } from '../../reservations/models/reservation-model';
import { UserService } from '../../users/services/user.service';
import { UserResponse } from '../../users/models/user.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { PropertyMaintenanceBase } from '../../shared/base-classes/property-maintenance.base';
import { ReservationPropertyMaintenance } from '../../shared/models/mixed-models';
import { ServiceType, getServiceType } from '../../shared/models/mixed-enums';
import { FormatterService } from '../../../services/formatter-service';
import { RouterUrl } from '../../../app.routes';

@Component({
  standalone: true,
  selector: 'app-dashboard-service',
  imports: [MaterialModule, DataTableComponent],
  templateUrl: './dashboard-service.component.html',
  styleUrl: './dashboard-service.component.scss'
})
export class DashboardServiceComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  todayDate = '';
  tomorrowDate = '';
  userId?: string | null;
  profilePictureUrl?: string | null = null;
  userSubscription?: Subscription;
  initLoadCompleteSubscription?: Subscription;
  expandedSections = { schedule: true, scheduledCleanings: true, scheduledCarpetCleanings: true, scheduledInspections: true };

  serviceDashboardReservationRows: ReservationListDisplay[] = [];
  serviceDashboardUserPropertyIds = new Set<string>();
  scheduledCleaningsDisplay: ReservationPropertyMaintenance[] = [];
  scheduledCarpetCleaningsDisplay: ReservationPropertyMaintenance[] = [];
  scheduledInspectionsDisplay: ReservationPropertyMaintenance[] = [];

  readonly scheduleCalendarWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
  scheduleCalendarCurrentTitle = '';
  scheduleCalendarNextTitle = '';
  scheduleCalendarCurrentCells: { day: number | null; dateKey: string | null; isToday: boolean; isWeekend: boolean; }[] = [];
  scheduleCalendarNextCells: { day: number | null; dateKey: string | null; isToday: boolean; isWeekend: boolean; }[] = [];
  scheduledDayKeys = new Set<string>();
  scheduleDotTypeByDayKey = new Map<string, 'blue' | 'green' | 'pink' | 'mixed'>();
  selectedScheduleCalendarDayKey: string | null = null;

  override itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser', 'offices', 'activeReservations', 'propertyMaintenanceList']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(s => s.size > 0));

  readonly scheduledCleaningColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '25ch', wrap: false },
    'eventTypeDisplay': { displayAs: 'Event Type', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'departureDateDisplay': { displayAs: 'Event Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'cleaningDateDisplay': { displayAs: 'Cleaning Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'hasPets': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'bedrooms': { displayAs: 'Beds', maxWidth: '10ch', alignment: 'center' },
    'bathrooms': { displayAs: 'Baths', maxWidth: '10ch', alignment: 'center' },
    'squareFeet': { displayAs: 'Sq Ft', maxWidth: '10ch', alignment: 'center' },
    'bed1Text': { displayAs: 'Bed1', maxWidth: '10ch', alignment: 'center' },
    'bed2Text': { displayAs: 'Bed2', maxWidth: '10ch', alignment: 'center' },
    'bed3Text': { displayAs: 'Bed3', maxWidth: '10ch', alignment: 'center' },
    'bed4Text': { displayAs: 'Bed4', maxWidth: '10ch', alignment: 'center' },
    'maintenanceNotes': { displayAs: 'Notes', maxWidth: '24ch', wrap: false }
  };

  readonly scheduledCarpetCleaningColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '25ch', wrap: false },
    'eventTypeDisplay': { displayAs: 'Event Type', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'departureDateDisplay': { displayAs: 'Event Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'carpetDateDisplay': { displayAs: 'Carpet Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'hasPets': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'bedrooms': { displayAs: 'Beds', maxWidth: '10ch', alignment: 'center' },
    'bathrooms': { displayAs: 'Baths', maxWidth: '10ch', alignment: 'center' },
    'squareFeet': { displayAs: 'Sq Ft', maxWidth: '10ch', alignment: 'center' },
    'bed1Text': { displayAs: 'Bed1', maxWidth: '10ch', alignment: 'center' },
    'bed2Text': { displayAs: 'Bed2', maxWidth: '10ch', alignment: 'center' },
    'bed3Text': { displayAs: 'Bed3', maxWidth: '10ch', alignment: 'center' },
    'bed4Text': { displayAs: 'Bed4', maxWidth: '10ch', alignment: 'center' },
    'maintenanceNotes': { displayAs: 'Notes', maxWidth: '24ch', wrap: false }
  };

  readonly scheduledInspectionColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'shortAddress': { displayAs: 'Address', maxWidth: '25ch', wrap: false },
    'eventTypeDisplay': { displayAs: 'Event Type', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'departureDateDisplay': { displayAs: 'Event Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'inspectingDateDisplay': { displayAs: 'Inspection Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    'hasPets': { displayAs: 'Pets', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    'bedrooms': { displayAs: 'Beds', maxWidth: '10ch', alignment: 'center' },
    'bathrooms': { displayAs: 'Baths', maxWidth: '10ch', alignment: 'center' },
    'squareFeet': { displayAs: 'Sq Ft', maxWidth: '10ch', alignment: 'center' },
    'bed1Text': { displayAs: 'Bed1', maxWidth: '10ch', alignment: 'center' },
    'bed2Text': { displayAs: 'Bed2', maxWidth: '10ch', alignment: 'center' },
    'bed3Text': { displayAs: 'Bed3', maxWidth: '10ch', alignment: 'center' },
    'bed4Text': { displayAs: 'Bed4', maxWidth: '10ch', alignment: 'center' },
    'maintenanceNotes': { displayAs: 'Notes', maxWidth: '24ch', wrap: false }
  };

  constructor(
    authService: AuthService,
    private userService: UserService,
    reservationService: ReservationService,
    mixedMappingService: MixedMappingService,
    mappingService: MappingService,
    propertyService: PropertyService,
    maintenanceService: MaintenanceService,
    utilityService: UtilityService,
    officeService: OfficeService,
    globalSelectionService: GlobalSelectionService,
    private formatterService: FormatterService,
    private router: Router
  ) {
    super(authService, reservationService, mixedMappingService, mappingService, propertyService, maintenanceService, utilityService, officeService, globalSelectionService);
  }

  //#region Dashboard-Service
  override ngOnInit(): void {
    this.setTodayDate();
    this.userId = this.authService.getUser()?.userId?.trim();
    this.loadCurrentUser(this.userId);

    this.initLoadCompleteSubscription = this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1)).subscribe(() => {
      this.recomputeBackendData(this.userId);
    });

    super.ngOnInit();
  }
  //#endregion

  //#region Main Data Setup
  protected override onAfterRecomputeBackendData(userAssignedId: string | null): void {
    const cleaningRows: ReservationPropertyMaintenance[] = [];
    const carpetRows: ReservationPropertyMaintenance[] = [];
    const inspectionRows: ReservationPropertyMaintenance[] = [];

    const toEventDisplayRow = (row: ReservationPropertyMaintenance, eventType: ServiceType): ReservationPropertyMaintenance =>
      this.mixedMappingService.mapReservationPropertyMaintenanceDashboardServiceScheduleRow({
        ...row,
        eventType,
        eventTypeDisplay: getServiceType(eventType),
        departureDateDisplay: this.formatterService.formatDateString(row.eventDate ?? undefined) || row.departureDateDisplay || ''
      });

    const canAssignCleaning = (row: ReservationPropertyMaintenance): boolean =>
      userAssignedId === null
      || row.maidUserId === userAssignedId
      || row.aCleanerUserId === userAssignedId
      || row.dCleanerUserId === userAssignedId
      || row.onCleanerUserId === userAssignedId
      || row.offCleanerUserId === userAssignedId;
    const canAssignCarpet = (row: ReservationPropertyMaintenance): boolean =>
      userAssignedId === null
      || row.aCarpetUserId === userAssignedId
      || row.dCarpetUserId === userAssignedId
      || row.onCarpetUserId === userAssignedId
      || row.offCarpetUserId === userAssignedId;
    const canAssignInspection = (row: ReservationPropertyMaintenance): boolean =>
      userAssignedId === null
      || row.aInspectorUserId === userAssignedId
      || row.dInspectorUserId === userAssignedId
      || row.onInspectorUserId === userAssignedId
      || row.offInspectorUserId === userAssignedId;

    for (const row of this.arrivalReservations) {
      if (canAssignCleaning(row)) {
        cleaningRows.push(toEventDisplayRow(row, ServiceType.Arrival));
      }
      if (canAssignCarpet(row)) {
        carpetRows.push(toEventDisplayRow(row, ServiceType.Arrival));
      }
      if (canAssignInspection(row)) {
        inspectionRows.push(toEventDisplayRow(row, ServiceType.Arrival));
      }
    }

    for (const row of this.departureReservations) {
      if (canAssignCleaning(row)) {
        cleaningRows.push(toEventDisplayRow(row, ServiceType.Departure));
      }
      if (canAssignCarpet(row)) {
        carpetRows.push(toEventDisplayRow(row, ServiceType.Departure));
      }
      if (canAssignInspection(row)) {
        inspectionRows.push(toEventDisplayRow(row, ServiceType.Departure));
      }
    }

    for (const row of this.cleaningReservations) {
      if (canAssignCleaning(row)) {
        cleaningRows.push(toEventDisplayRow(row, ServiceType.MaidService));
      }
    }
 
    for (const row of this.onlineProperties) {
      const eventRow = this.mixedMappingService.mapReservationPropertyMaintenanceDashboardServiceScheduleRow(
        this.mixedMappingService.mapPropertyMaintenanceToDashboardServiceScheduleRow(row)
      );
      if (canAssignCleaning(eventRow)) {
        cleaningRows.push(toEventDisplayRow(eventRow, ServiceType.Online));
      }
      if (canAssignCarpet(eventRow)) {
        carpetRows.push(toEventDisplayRow(eventRow, ServiceType.Online));
      }
      if (canAssignInspection(eventRow)) {
        inspectionRows.push(toEventDisplayRow(eventRow, ServiceType.Online));
      }
    }

    for (const row of this.offlineProperties) {
      const eventRow = this.mixedMappingService.mapReservationPropertyMaintenanceDashboardServiceScheduleRow(
        this.mixedMappingService.mapPropertyMaintenanceToDashboardServiceScheduleRow(row)
      );
      if (canAssignCleaning(eventRow)) {
        cleaningRows.push(toEventDisplayRow(eventRow, ServiceType.Offline));
      }
      if (canAssignCarpet(eventRow)) {
        carpetRows.push(toEventDisplayRow(eventRow, ServiceType.Offline));
      }
      if (canAssignInspection(eventRow)) {
        inspectionRows.push(toEventDisplayRow(eventRow, ServiceType.Offline));
      }
    }

    const sortByEvent = (a: ReservationPropertyMaintenance, b: ReservationPropertyMaintenance): number =>
      Number(a.eventDateSortTime ?? Number.MAX_SAFE_INTEGER) - Number(b.eventDateSortTime ?? Number.MAX_SAFE_INTEGER);

    this.scheduledCleaningsDisplay = cleaningRows.sort(sortByEvent);
    this.scheduledCarpetCleaningsDisplay = carpetRows.sort(sortByEvent);
    this.scheduledInspectionsDisplay = inspectionRows.sort(sortByEvent);
  
    this.selectedScheduleCalendarDayKey = null;
    this.refreshScheduleCalendars();
  }

  //#endregion

  //#region Calendar Methods
  refreshScheduleCalendars(): void {
    const keys = new Set<string>();
    const dotTypeByDayKey = new Map<string, 'blue' | 'green' | 'pink' | 'mixed'>();
    const addKey = (value: string | null | undefined) => {
      const dayKey = this.toScheduleDayKey(value);
      if (dayKey) {
        keys.add(dayKey);
      }
      return dayKey;
    };
    this.scheduledCleaningsDisplay.forEach(row => this.assignScheduleDotType(dotTypeByDayKey, addKey(this.getCleaningDateDisplayForScheduleRow(row)), 'blue'));
    this.scheduledCarpetCleaningsDisplay.forEach(row => this.assignScheduleDotType(dotTypeByDayKey, addKey(this.getCarpetDateDisplayForScheduleRow(row)), 'green'));
    this.scheduledInspectionsDisplay.forEach(row => this.assignScheduleDotType(dotTypeByDayKey, addKey(this.getInspectionDateDisplayForScheduleRow(row)), 'pink'));
    this.scheduledDayKeys = keys;
    this.scheduleDotTypeByDayKey = dotTypeByDayKey;
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    this.scheduleCalendarCurrentCells = this.buildScheduleCalendarMonthCells(curMonthStart);
    this.scheduleCalendarNextCells = this.buildScheduleCalendarMonthCells(nextMonthStart);
    this.scheduleCalendarCurrentTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(curMonthStart);
    this.scheduleCalendarNextTitle = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(nextMonthStart);
    this.syncScheduleRowHighlight();
  }

  buildScheduleCalendarMonthCells(monthAnchor: Date): { day: number | null; dateKey: string | null; isToday: boolean; isWeekend: boolean; }[] {
    const y = monthAnchor.getFullYear();
    const m = monthAnchor.getMonth();
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const startPad = first.getDay();
    const todayKey = this.utilityService.formatDateOnlyForApi(new Date());
    const cells: { day: number | null; dateKey: string | null; isToday: boolean; isWeekend: boolean; }[] = [];
    const pushCell = (day: number | null, dateKey: string | null) => {
      const col = cells.length % 7;
      cells.push({day, dateKey, isToday: !! dateKey && dateKey === todayKey, isWeekend: col === 0 || col === 6 });
    };

    for (let i = 0; i < startPad; i++) {
      pushCell(null, null);
    }

    for (let d = 1; d <= lastDay; d++) {
      const dt = new Date(y, m, d);
      pushCell(d, this.utilityService.formatDateOnlyForApi(dt));
    }

    while (cells.length % 7 !== 0) {
      pushCell(null, null);
    }
    return cells;
  }

  toScheduleDayKey(value: string | null | undefined): string | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }
    const parsed = this.utilityService.parseDateOnlyStringToDate(String(value));
    if (!parsed) {
      return null;
    }
    return this.utilityService.formatDateOnlyForApi(parsed);
  }

  assignScheduleDotType(
    dotTypeByDayKey: Map<string, 'blue' | 'green' | 'pink' | 'mixed'>,
    dayKey: string | null,
    type: 'blue' | 'green' | 'pink'
  ): void {
    if (!dayKey) {
      return;
    }
    const existing = dotTypeByDayKey.get(dayKey);
    if (!existing) {
      dotTypeByDayKey.set(dayKey, type);
      return;
    }
    if (existing !== type) {
      dotTypeByDayKey.set(dayKey, 'mixed');
    }
  }

  getScheduleDotClass(dateKey: string | null): string {
    if (!dateKey) {
      return 'dot-blue';
    }
    const type = this.scheduleDotTypeByDayKey.get(dateKey) ?? 'blue';
    return type === 'mixed' ? 'dot-mixed' : `dot-${type}`;
  }

  getCleaningDateDisplayForScheduleRow(row: ReservationPropertyMaintenance): string {
    switch (row.eventType) {
      case ServiceType.Arrival:
        return row.acleaningDateDisplay || '';
      case ServiceType.Departure:
        return row.dCleaningDateDisplay || '';
      case ServiceType.Online:
        return row.onCleaningDateDisplay || '';
      case ServiceType.Offline:
        return row.offCleaningDateDisplay || '';
      case ServiceType.MaidService:
        return row.maidStartDateDisplay || '';
      default:
        return '';
    }
  }

  getCarpetDateDisplayForScheduleRow(row: ReservationPropertyMaintenance): string {
    switch (row.eventType) {
      case ServiceType.Arrival:
        return row.aCarpetDateDisplay || '';
      case ServiceType.Departure:
        return row.dCarpetDateDisplay || '';
      case ServiceType.Online:
        return row.onCarpetDateDisplay || '';
      case ServiceType.Offline:
        return row.offCarpetDateDisplay || '';
      default:
        return '';
    }
  }

  getInspectionDateDisplayForScheduleRow(row: ReservationPropertyMaintenance): string {
    switch (row.eventType) {
      case ServiceType.Arrival:
        return row.aInspectingDateDisplay || '';
      case ServiceType.Departure:
        return row.dInspectingDateDisplay || '';
      case ServiceType.Online:
        return row.onInspectingDateDisplay || '';
      case ServiceType.Offline:
        return row.offInspectingDateDisplay || '';
      default:
        return '';
    }
  }

  onScheduleCalendarDayClick(dateKey: string | null): void {
    if (!dateKey) {
      return;
    }
    if (this.selectedScheduleCalendarDayKey === dateKey) {
      this.selectedScheduleCalendarDayKey = null;
    } else {
      this.selectedScheduleCalendarDayKey = dateKey;
    }
    this.syncScheduleRowHighlight();
  }

  syncScheduleRowHighlight(): void {
    const sel = this.selectedScheduleCalendarDayKey;
    const apply = (rows: ReservationPropertyMaintenance[], getDate: (row: ReservationPropertyMaintenance) => string | null | undefined) => {
      for (const row of rows) {
        row.rowActive = !!sel && this.toScheduleDayKey(getDate(row)) === sel;
      }
    };
    apply(this.scheduledCleaningsDisplay, row => this.getCleaningDateDisplayForScheduleRow(row));
    apply(this.scheduledCarpetCleaningsDisplay, row => this.getCarpetDateDisplayForScheduleRow(row));
    apply(this.scheduledInspectionsDisplay, row => this.getInspectionDateDisplayForScheduleRow(row));
    this.scheduledCleaningsDisplay = [...this.scheduledCleaningsDisplay];
    this.scheduledCarpetCleaningsDisplay = [...this.scheduledCarpetCleaningsDisplay];
    this.scheduledInspectionsDisplay = [...this.scheduledInspectionsDisplay];
  }
  //#endregion

  //#region Titlebar Methods
  setTodayDate(): void {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    this.todayDate = new Date().toLocaleDateString('en-US', options);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.tomorrowDate = tomorrow.toLocaleDateString('en-US', options);
  }

  getFullName(): string {
    if (!this.user) {
      return '';
    }
    return `${this.user.firstName} ${this.user.lastName}`.trim();
  }

  applyUserProfilePicture(userResponse: UserResponse): void {
    if (userResponse.fileDetails?.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
      return;
    }
    this.profilePictureUrl = userResponse.profilePath || null;
  }

  loadCurrentUser(userId: string | undefined): void {
    if (!userId?.trim()) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser');
      return;
    }

    this.userSubscription = this.userService.getUserByGuid(userId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'currentUser');
    })).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
      },
      error: () => {
        this.profilePictureUrl = null;
      }
    });
  }

  goToMaintenanceInspection(event: ReservationPropertyMaintenance): void {
    if (!event?.propertyId?.trim()) {
      return;
    }
    this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
  }
  //#endregion

  //#region Utility Methods
  override ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.initLoadCompleteSubscription?.unsubscribe();
    super.ngOnDestroy();
  }
  //#endregion
}
