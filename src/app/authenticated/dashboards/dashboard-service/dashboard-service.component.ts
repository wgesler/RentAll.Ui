import { Component, OnDestroy, OnInit } from '@angular/core';
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

@Component({
  standalone: true,
  selector: 'app-dashboard-service',
  imports: [MaterialModule, DataTableComponent],
  templateUrl: './dashboard-service.component.html',
  styleUrl: './dashboard-service.component.scss'
})
export class DashboardServiceComponent extends PropertyMaintenanceBase implements OnInit, OnDestroy {
  
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
  selectedScheduleCalendarDayKey: string | null = null;

  override itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['currentUser', 'offices', 'activeReservations', 'propertyMaintenanceList']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(s => s.size > 0));


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
    globalSelectionService: GlobalSelectionService
  ) {
    super(authService, reservationService, mixedMappingService, mappingService, propertyService, maintenanceService, utilityService, officeService, globalSelectionService);
  }

  //#region Dashboard-Service
  override ngOnInit(): void {
    this.setTodayDate();
    this.userId = this.authService.getUser()?.userId?.trim();
    this.loadCurrentUser(this.userId);

    this.initLoadCompleteSubscription = this.itemsToLoad$.pipe(filter(s => s.size === 0), take(1)).subscribe(() => {
      this.recomputeDashboardData(this.userId);
    });

    super.ngOnInit();
  }
  //#endregion

  //#region Main Data Setup
  protected override onAfterRecomputeDashboardData(userAssignedId: string | null): void {
    const baseRows = this.buildScheduledBoardBaseRows();
    this.buildScheduledCleaningsList(userAssignedId, baseRows);
    this.buildScheduledCarpetCleaningsList(userAssignedId, baseRows);
    this.buildScheduledInspectionsList(userAssignedId, baseRows);
    this.selectedScheduleCalendarDayKey = null;
    this.refreshScheduleCalendars();
  }

  buildScheduledCleaningsList(userAssignedId: string | null, baseRows: ReservationPropertyMaintenance[]): void {
    this.scheduledCleaningsDisplay = baseRows.filter(r =>
      userAssignedId === null || r.maidUserId === userAssignedId || r.cleanerUserId === userAssignedId
    );
  }

  buildScheduledCarpetCleaningsList(userAssignedId: string | null, baseRows: ReservationPropertyMaintenance[]): void {
    this.scheduledCarpetCleaningsDisplay = baseRows.filter(r =>
      userAssignedId === null || r.carpetUserId === userAssignedId
    );
  }

  buildScheduledInspectionsList(userAssignedId: string | null, baseRows: ReservationPropertyMaintenance[]): void {
    this.scheduledInspectionsDisplay = baseRows.filter(r =>
      userAssignedId === null || r.inspectorUserId === userAssignedId
    );
  }

  buildScheduledBoardBaseRows(): ReservationPropertyMaintenance[] {
    const office = this.selectedOffice;
    const combined: ReservationPropertyMaintenance[] = [
      ...this.offlineProperties.map(pm => this.mixedMappingService.mapPropertyMaintenanceToServiceDashboardScheduleRow(pm)),
      ...this.onlineProperties.map(pm => this.mixedMappingService.mapPropertyMaintenanceToServiceDashboardScheduleRow(pm)),
      ...this.departureReservations.map(r => this.mixedMappingService.mapReservationPropertyMaintenanceServiceDashboardScheduleRow(r)),
      ...this.cleaningReservations.map(r => this.mixedMappingService.mapReservationPropertyMaintenanceServiceDashboardScheduleRow(r))
    ];
    let rows = combined;
    if (office) {
      rows = rows.filter(r => r.officeId === office.officeId);
    }
    return [...rows].sort((a, b) => (a.eventDateSortTime ?? 0) - (b.eventDateSortTime ?? 0));
  }
  //#endregion

  //#region Calendar Methods
  refreshScheduleCalendars(): void {
    const keys = new Set<string>();
    const addKey = (r: ReservationPropertyMaintenance) => {
      const k = this.eventRowToScheduleDayKey(r);
      if (k) {
        keys.add(k);
      }
    };
    this.scheduledCleaningsDisplay.forEach(addKey);
    this.scheduledCarpetCleaningsDisplay.forEach(addKey);
    this.scheduledInspectionsDisplay.forEach(addKey);
    this.scheduledDayKeys = keys;
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

  eventRowToScheduleDayKey(row: ReservationPropertyMaintenance): string | null {
    const v = row.eventDate;
    if (v == null || String(v).trim() === '') {
      return null;
    }
    const parsed = this.utilityService.parseDateOnlyStringToDate(String(v));
    if (!parsed) {
      return String(v).trim();
    }
    return this.utilityService.formatDateOnlyForApi(parsed);
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
    const apply = (rows: ReservationPropertyMaintenance[]) => {
      for (const row of rows) {
        row.rowActive = !!sel && this.eventRowToScheduleDayKey(row) === sel;
      }
    };
    apply(this.scheduledCleaningsDisplay);
    apply(this.scheduledCarpetCleaningsDisplay);
    apply(this.scheduledInspectionsDisplay);
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
  //#endregion

  //#region Utility Methods
    override ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.initLoadCompleteSubscription?.unsubscribe();
    super.ngOnDestroy();
  }
  //#endregion
}
