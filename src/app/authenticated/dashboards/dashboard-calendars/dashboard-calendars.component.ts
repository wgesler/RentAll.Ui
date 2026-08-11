import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { UtilityService } from '../../../services/utility.service';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ServiceType } from '../../shared/models/mixed-enums';
import { MaintenanceListDisplay } from '../../shared/models/mixed-models';
import {
  DashboardCalendarEventKind,
  DashboardCalendarFocus,
  DashboardCompanyDataService,
  DashboardCompanyDataSnapshot,
  emptyDashboardCompanyDataSnapshot
} from '../services/dashboard-company-data.service';

type ScheduleDotType = 'blue' | 'purple' | 'green' | 'pink';
type ScheduleCalendarCell = { day: number | null; dateKey: string | null; isToday: boolean; isWeekend: boolean };
type ScheduleCalendarMonth = { title: string; cells: ScheduleCalendarCell[] };
type CalendarDayEvent = {
  propertyCode: string;
  reservationCode: string;
  contactName: string;
  eventLabel: string;
  eventKind: DashboardCalendarEventKind;
  targetTabIndex: number;
  propertyId: string | null;
  reservationId: string | null;
  maintenanceId: string | null;
  dateKey: string;
};

@Component({
  standalone: true,
  selector: 'app-dashboard-calendars',
  templateUrl: './dashboard-calendars.component.html',
  styleUrl: './dashboard-calendars.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardCalendarsComponent implements OnInit, OnDestroy {
  @Input() showCalendarsSection = true;
  @Input() showMaidServiceTable = true;

  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private utilityService = inject(UtilityService);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  maidDisplayRows: MaintenanceListDisplay[] = [];

  scheduleCalendarWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  scheduleCalendarMonths: ScheduleCalendarMonth[] = [];
  scheduledDayKeys = new Set<string>();
  arrivalDayKeys = new Set<string>();
  departureDayKeys = new Set<string>();
  scheduleDotTypeByDayKey = new Map<string, Set<ScheduleDotType>>();
  selectedScheduleCalendarDayKey: string | null = null;
  selectedDayEvents: CalendarDayEvent[] = [];
  selectedDayLabel = '';
  dayEventsPerPage = 4;

  //#region Dashboard-Calendars
  ngOnInit(): void {
    // Calendars render immediately; markers fill in when company snapshot becomes ready.
    this.refreshScheduleCalendars();
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      try {
        this.refreshScheduleCalendars();
        this.syncMaidDisplayRows();
      } finally {
        this.markViewForCheck();
      }
    });
    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncMaidDisplayRows();
      this.markViewForCheck();
      if (this.showMaidServiceTable && this.companyDataService.calendarFocus?.tabIndex === 6) {
        this.companyDataService.scrollDashboardActiveRowIntoView();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  get maintenanceColumns(): ColumnSet {
    return this.snapshot.maidMaintenanceColumns;
  }

  get selectedDayEventPages(): CalendarDayEvent[][] {
    const pages: CalendarDayEvent[][] = [];
    for (let i = 0; i < this.selectedDayEvents.length; i += this.dayEventsPerPage) {
      pages.push(this.selectedDayEvents.slice(i, i + this.dayEventsPerPage));
    }
    return pages;
  }

  refreshScheduleCalendars(): void {
    const keys = new Set<string>();
    const dotTypeByDayKey = new Map<string, Set<ScheduleDotType>>();
    const rows = this.getCalendarSourceRows();
    for (const row of rows) {
      for (const dayEntry of this.getScheduleDayEntriesForRow(row)) {
        keys.add(dayEntry.dayKey);
        this.assignScheduleDotType(dotTypeByDayKey, dayEntry.dayKey, dayEntry.type);
      }
    }
    this.arrivalDayKeys = this.buildTurnoverDayKeys(
      (this.snapshot.reservationTurnoverArrivalRows || []).map(row => row.arrivalDateDisplay)
    );
    this.departureDayKeys = this.buildTurnoverDayKeys(
      (this.snapshot.reservationTurnoverDepartureRows || []).map(row => row.departureDateDisplay)
    );
    // Arrival/departure use cell shading (not dots).
    for (const dayKey of this.arrivalDayKeys) {
      keys.add(dayKey);
    }
    for (const dayKey of this.departureDayKeys) {
      keys.add(dayKey);
    }
    this.scheduledDayKeys = keys;
    this.scheduleDotTypeByDayKey = dotTypeByDayKey;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const titleFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
    // Current month + next month.
    this.scheduleCalendarMonths = [0, 1].map(offset => {
      const anchor = new Date(year, month + offset, 1);
      return {
        title: titleFmt.format(anchor),
        cells: this.buildScheduleCalendarMonthCells(anchor)
      };
    });

    if (this.selectedScheduleCalendarDayKey) {
      this.applySelectedDay(this.selectedScheduleCalendarDayKey);
    } else {
      this.selectToday();
    }
  }

  buildTurnoverDayKeys(displayDates: Array<string | null | undefined>): Set<string> {
    const keys = new Set<string>();
    for (const displayDate of displayDates) {
      if (displayDate == null || String(displayDate).trim() === '') {
        continue;
      }
      const parsed = this.utilityService.parseDateOnlyStringToDate(String(displayDate));
      if (!parsed) {
        continue;
      }
      const dayKey = this.utilityService.formatDateOnlyForApi(parsed);
      if (dayKey) {
        keys.add(dayKey);
      }
    }
    return keys;
  }

  isArrivalDay(dateKey: string | null): boolean {
    return !!dateKey && this.arrivalDayKeys.has(dateKey);
  }

  isDepartureDay(dateKey: string | null): boolean {
    return !!dateKey && this.departureDayKeys.has(dateKey);
  }

  getCalendarSourceRows(): MaintenanceListDisplay[] {
    return [
      ...(this.snapshot.arrivalMaintenanceDisplay || []),
      ...(this.snapshot.departureMaintenanceDisplay || []),
      ...(this.snapshot.comingOnlineMaintenanceDisplay || []),
      ...(this.snapshot.goingOfflineMaintenanceDisplay || []),
      ...(this.snapshot.maidMaintenanceDisplay || []),
      ...(this.snapshot.occupiedMaintenanceDisplay || []),
      ...(this.snapshot.vacantMaintenanceDisplay || []),
      ...(this.snapshot.offlineStatusMaintenanceDisplay || [])
    ];
  }

  buildScheduleCalendarMonthCells(monthAnchor: Date): ScheduleCalendarCell[] {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const monthLastDay = new Date(year, month + 1, 0).getDate();
    const startPadding = firstDay.getDay();
    const todayKey = this.utilityService.formatDateOnlyForApi(new Date());
    const cells: ScheduleCalendarCell[] = [];
    const pushCell = (day: number | null, dateKey: string | null): void => {
      const weekDayColumn = cells.length % 7;
      cells.push({
        day,
        dateKey,
        isToday: !!dateKey && dateKey === todayKey,
        isWeekend: weekDayColumn === 0 || weekDayColumn === 6
      });
    };

    for (let i = 0; i < startPadding; i++) {
      pushCell(null, null);
    }
    for (let day = 1; day <= monthLastDay; day++) {
      const date = new Date(year, month, day);
      pushCell(day, this.utilityService.formatDateOnlyForApi(date));
    }
    while (cells.length % 7 !== 0) {
      pushCell(null, null);
    }
    return cells;
  }

  getScheduleDayEntriesForRow(row: MaintenanceListDisplay): { dayKey: string; type: ScheduleDotType }[] {
    const candidates: { value: string | null | undefined; type: ScheduleDotType }[] = [
      { value: row.cleaningDate, type: row.eventType === ServiceType.MaidService ? 'pink' : 'blue' },
      { value: row.carpetDate, type: 'green' },
      { value: row.inspectingDate, type: 'purple' }
    ];
    const entries = new Map<string, ScheduleDotType>();
    for (const candidate of candidates) {
      if (candidate.value == null || String(candidate.value).trim() === '') {
        continue;
      }
      const parsed = this.utilityService.parseDateOnlyStringToDate(String(candidate.value));
      if (!parsed) {
        continue;
      }
      const dayKey = this.utilityService.formatDateOnlyForApi(parsed);
      if (dayKey) {
        entries.set(dayKey, candidate.type);
      }
    }
    return Array.from(entries.entries()).map(([dayKey, type]) => ({ dayKey, type }));
  }

  assignScheduleDotType(dotTypeByDayKey: Map<string, Set<ScheduleDotType>>, dayKey: string, type: ScheduleDotType): void {
    const existing = dotTypeByDayKey.get(dayKey);
    if (!existing) {
      dotTypeByDayKey.set(dayKey, new Set([type]));
      return;
    }
    existing.add(type);
  }

  hasScheduleDot(dateKey: string | null): boolean {
    if (!dateKey) {
      return false;
    }
    const types = this.scheduleDotTypeByDayKey.get(dateKey);
    return !!types && types.size > 0;
  }

  getScheduleDotClass(dateKey: string | null): string {
    if (!dateKey) {
      return 'dot-blue';
    }
    const types = this.scheduleDotTypeByDayKey.get(dateKey);
    if (!types || types.size === 0) {
      return 'dot-blue';
    }
    if (types.size === 1) {
      return `dot-${Array.from(types)[0]}`;
    }
    return 'dot-mixed';
  }

  getScheduleDotStyle(dateKey: string | null): Record<string, string> | null {
    if (!dateKey) {
      return null;
    }
    const types = this.scheduleDotTypeByDayKey.get(dateKey);
    if (!types || types.size <= 1) {
      return null;
    }
    const colorByType: Record<ScheduleDotType, string> = {
      green: '#22c55e',
      blue: '#3b82f6',
      purple: '#8b5cf6',
      pink: '#ec4899'
    };
    const orderedTypes: ScheduleDotType[] = ['green', 'blue', 'purple', 'pink'];
    const activeColors = orderedTypes.filter(type => types.has(type)).map(type => colorByType[type]);
    if (activeColors.length <= 1) {
      return null;
    }
    const slice = 360 / activeColors.length;
    const gradientStops = activeColors.map((color, index) => {
      const start = Math.round(index * slice);
      const end = Math.round((index + 1) * slice);
      return `${color} ${start}deg ${end}deg`;
    });
    return {
      background: `conic-gradient(from 210deg, ${gradientStops.join(', ')})`,
      boxShadow: '0 1px 2px rgba(30, 41, 59, 0.35)'
    };
  }

  onScheduleCalendarDayClick(dateKey: string | null): void {
    if (!dateKey) {
      return;
    }
    this.applySelectedDay(dateKey);
    // Day with events → associated tab; highlight by date only (not every occurrence of that reservation).
    const firstEvent = this.selectedDayEvents[0] ?? null;
    if (firstEvent) {
      this.companyDataService.setCalendarFocus({
        tabIndex: firstEvent.targetTabIndex,
        eventKind: firstEvent.eventKind,
        propertyId: null,
        reservationId: null,
        maintenanceId: null,
        dateKey
      });
    } else {
      this.companyDataService.clearCalendarFocus();
    }
    this.syncMaidDisplayRows();
    this.markViewForCheck();
  }

  onDayEventClick(item: CalendarDayEvent): void {
    const focus: DashboardCalendarFocus = {
      tabIndex: item.targetTabIndex,
      eventKind: item.eventKind,
      propertyId: item.propertyId,
      reservationId: item.reservationId,
      maintenanceId: item.maintenanceId,
      dateKey: item.dateKey
    };
    this.companyDataService.setCalendarFocus(focus);
  }

  selectToday(): void {
    const todayKey = this.utilityService.formatDateOnlyForApi(new Date());
    if (todayKey) {
      this.applySelectedDay(todayKey);
    }
  }

  applySelectedDay(dateKey: string): void {
    this.selectedScheduleCalendarDayKey = dateKey;
    this.selectedDayEvents = this.buildSelectedDayEvents(dateKey);
    this.selectedDayLabel = this.formatSelectedDayLabel(dateKey);
  }

  formatSelectedDayLabel(dateKey: string): string {
    const parsed = this.utilityService.parseDateOnlyStringToDate(dateKey);
    if (!parsed) {
      return dateKey;
    }
    return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  buildSelectedDayEvents(dateKey: string): CalendarDayEvent[] {
    const events: CalendarDayEvent[] = [];

    for (const row of this.snapshot.reservationTurnoverArrivalRows || []) {
      if (this.toDayKey(row.arrivalDateDisplay) !== dateKey) {
        continue;
      }
      events.push({
        propertyCode: row.propertyCode || '—',
        reservationCode: row.reservationCode || '—',
        contactName: row.contactName || row.tenantName || '—',
        eventLabel: 'Arrival',
        eventKind: 'arrival',
        targetTabIndex: 0,
        propertyId: row.propertyId || null,
        reservationId: row.reservationId || null,
        maintenanceId: null,
        dateKey
      });
    }

    for (const row of this.snapshot.reservationTurnoverDepartureRows || []) {
      if (this.toDayKey(row.departureDateDisplay) !== dateKey) {
        continue;
      }
      events.push({
        propertyCode: row.propertyCode || '—',
        reservationCode: row.reservationCode || '—',
        contactName: row.contactName || row.tenantName || '—',
        eventLabel: 'Departure',
        eventKind: 'departure',
        targetTabIndex: 1,
        propertyId: row.propertyId || null,
        reservationId: row.reservationId || null,
        maintenanceId: null,
        dateKey
      });
    }

    const maintenanceSources: { rows: MaintenanceListDisplay[]; tabIndex: number }[] = [
      { rows: this.snapshot.arrivalMaintenanceDisplay || [], tabIndex: 0 },
      { rows: this.snapshot.departureMaintenanceDisplay || [], tabIndex: 1 },
      { rows: this.snapshot.comingOnlineMaintenanceDisplay || [], tabIndex: 2 },
      { rows: this.snapshot.goingOfflineMaintenanceDisplay || [], tabIndex: 3 },
      { rows: this.snapshot.offlineStatusMaintenanceDisplay || [], tabIndex: 3 },
      { rows: this.snapshot.occupiedMaintenanceDisplay || [], tabIndex: 4 },
      { rows: this.snapshot.vacantMaintenanceDisplay || [], tabIndex: 5 },
      { rows: this.snapshot.maidMaintenanceDisplay || [], tabIndex: 6 }
    ];

    for (const source of maintenanceSources) {
      for (const row of source.rows) {
        const propertyCode = String(row.propertyCode || '').trim() || '—';
        const propertyId = row.propertyId || null;
        const reservationId = row.reservationId || null;
        const maintenanceId = row.maintenanceId || null;
        if (this.toDayKey(row.cleaningDate) === dateKey) {
          const isMaid = row.eventType === ServiceType.MaidService;
          const reservationCode = this.resolveReservationCode(row);
          const contactName = isMaid
            ? (String(row.contactName || '').trim() || '—')
            : (String(row.cleaner?.value || '').trim() || '—');
          events.push({
            propertyCode,
            reservationCode,
            contactName,
            eventLabel: isMaid ? 'Maid Service' : 'Cleaning',
            eventKind: isMaid ? 'maid' : 'cleaning',
            targetTabIndex: isMaid ? 6 : source.tabIndex,
            propertyId,
            reservationId,
            maintenanceId,
            dateKey
          });
        }
        if (this.toDayKey(row.carpetDate) === dateKey) {
          events.push({
            propertyCode,
            reservationCode: this.resolveReservationCode(row),
            contactName: String(row.contactName || '').trim() || '—',
            eventLabel: 'Carpet',
            eventKind: 'carpet',
            targetTabIndex: source.tabIndex,
            propertyId,
            reservationId,
            maintenanceId,
            dateKey
          });
        }
        if (this.toDayKey(row.inspectingDate) === dateKey) {
          events.push({
            propertyCode,
            reservationCode: this.resolveReservationCode(row),
            contactName: String(row.contactName || '').trim() || '—',
            eventLabel: 'Inspection',
            eventKind: 'inspection',
            targetTabIndex: source.tabIndex,
            propertyId,
            reservationId,
            maintenanceId,
            dateKey
          });
        }
      }
    }

    return events;
  }

  toDayKey(value: string | null | undefined): string | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }
    const parsed = this.utilityService.parseDateOnlyStringToDate(String(value));
    if (!parsed) {
      return null;
    }
    return this.utilityService.formatDateOnlyForApi(parsed);
  }

  resolveReservationCode(row: MaintenanceListDisplay): string {
    const direct = String(row.reservationCode || '').trim();
    if (direct) {
      return direct;
    }
    const reservationId = String(row.reservationId || '').trim();
    if (!reservationId) {
      return '—';
    }
    const turnoverRows = [
      ...(this.snapshot.reservationTurnoverArrivalRows || []),
      ...(this.snapshot.reservationTurnoverDepartureRows || [])
    ];
    const match = turnoverRows.find(r => String(r.reservationId || '').trim() === reservationId);
    const fromTurnover = String(match?.reservationCode || '').trim();
    return fromTurnover || '—';
  }

  syncMaidDisplayRows(): void {
    const focus = this.companyDataService.calendarFocus;
    const selectedDate = this.selectedScheduleCalendarDayKey;
    const source = this.snapshot.maidMaintenanceDisplay || [];
    this.maidDisplayRows = source.map(row => {
      const rowDateKey = this.toDayKey(row.eventDate) || this.toDayKey(row.cleaningDate);
      const focusActive = focus?.tabIndex === 6
        && this.companyDataService.matchesCalendarFocus(row, focus, rowDateKey);
      const dayActive = !focus && !!selectedDate && rowDateKey === selectedDate;
      return {
        ...row,
        rowActive: focusActive || dayActive
      };
    });
  }

  onMaintenanceDropdownChange(event: MaintenanceListDisplay): void {
    this.companyDataService.onMaintenanceDropdownChange(event);
  }

  onMaintenanceInlineDateChange(event: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    this.companyDataService.onMaintenanceInlineDateChange(event);
  }
  //#endregion

  //#region Navigate From Calendar
  goToContact(event: MaintenanceListDisplay): void {
    if (event?.owner1Id) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Contact, [event.owner1Id])],
        { queryParams: { returnUrl: this.router.url } }
      );
    }
  }

  goToPropertyMaintenance(event: MaintenanceListDisplay): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=1`);
    }
  }

  goToInspection(event: MaintenanceListDisplay): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
    }
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
