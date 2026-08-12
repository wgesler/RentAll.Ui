import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UtilityService } from '../../../services/utility.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import {
  DashboardPropertyTurnoverRow,
  MaintenanceListDisplay,
  PropertyInProcessDisplay,
  PropertyVacancyDisplay,
  ReservationTurnoverEventDisplay
} from '../../shared/models/mixed-models';
import { MonthlyCommissionDisplay } from '../models/dashboard-model';

export type DashboardOfficeOption = {
  officeId: number;
  name: string;
};

export type DashboardCompanyDataSnapshot = {
  isReady: boolean;
  todayArriveDepartCount: number;
  tomorrowArriveDepartCount: number;
  onlineOfflineTodayCount: number;
  onlineOfflineTomorrowCount: number;
  rentedCount: number;
  vacantCount: number;
  offices: DashboardOfficeOption[];
  selectedOfficeId: number | null;
  showOfficeDropdown: boolean;
  canViewCommissions: boolean;
  canViewAllCommissions: boolean;
  isAdmin: boolean;
  currentUserAgentId: string | null;
  currentUserAgentCode: string | null;
  monthlyCommissionRows: MonthlyCommissionDisplay[];
  reservationTurnoverArrivalRows: ReservationTurnoverEventDisplay[];
  reservationTurnoverDepartureRows: ReservationTurnoverEventDisplay[];
  onlinePropertyRows: DashboardPropertyTurnoverRow[];
  /** Coming-online / going-offline date-window rows (calendar + Online tab). */
  offlinePropertyRows: DashboardPropertyTurnoverRow[];
  arrivalMaintenanceDisplay: MaintenanceListDisplay[];
  departureMaintenanceDisplay: MaintenanceListDisplay[];
  comingOnlineMaintenanceDisplay: MaintenanceListDisplay[];
  goingOfflineMaintenanceDisplay: MaintenanceListDisplay[];
  maidMaintenanceDisplay: MaintenanceListDisplay[];
  vacantPropertyRows: PropertyVacancyDisplay[];
  vacantMaintenanceDisplay: MaintenanceListDisplay[];
  occupiedPropertyRows: PropertyInProcessDisplay[];
  occupiedMaintenanceDisplay: MaintenanceListDisplay[];
  /** Properties with status Offline (Offline inventory tab). */
  offlineStatusPropertyRows: PropertyInProcessDisplay[];
  offlineStatusMaintenanceDisplay: MaintenanceListDisplay[];
  reservationTurnoverArrivalColumns: ColumnSet;
  reservationTurnoverDepartureColumns: ColumnSet;
  propertyOnlineColumns: ColumnSet;
  propertyOfflineColumns: ColumnSet;
  arrivalMaintenanceColumns: ColumnSet;
  departureMaintenanceColumns: ColumnSet;
  comingOnlineMaintenanceColumns: ColumnSet;
  goingOfflineMaintenanceColumns: ColumnSet;
  maidMaintenanceColumns: ColumnSet;
  vacantPropertyColumns: ColumnSet;
  vacantMaintenanceColumns: ColumnSet;
  occupiedPropertyColumns: ColumnSet;
  occupiedMaintenanceColumns: ColumnSet;
  offlineStatusPropertyColumns: ColumnSet;
  offlineStatusMaintenanceColumns: ColumnSet;
  monthlyCommissionColumns: ColumnSet;
};

const emptyColumns: ColumnSet = {};

export const emptyDashboardCompanyDataSnapshot: DashboardCompanyDataSnapshot = {
  isReady: false,
  todayArriveDepartCount: 0,
  tomorrowArriveDepartCount: 0,
  onlineOfflineTodayCount: 0,
  onlineOfflineTomorrowCount: 0,
  rentedCount: 0,
  vacantCount: 0,
  offices: [],
  selectedOfficeId: null,
  showOfficeDropdown: false,
  canViewCommissions: false,
  canViewAllCommissions: false,
  isAdmin: false,
  currentUserAgentId: null,
  currentUserAgentCode: null,
  monthlyCommissionRows: [],
  reservationTurnoverArrivalRows: [],
  reservationTurnoverDepartureRows: [],
  onlinePropertyRows: [],
  offlinePropertyRows: [],
  arrivalMaintenanceDisplay: [],
  departureMaintenanceDisplay: [],
  comingOnlineMaintenanceDisplay: [],
  goingOfflineMaintenanceDisplay: [],
  maidMaintenanceDisplay: [],
  vacantPropertyRows: [],
  vacantMaintenanceDisplay: [],
  occupiedPropertyRows: [],
  occupiedMaintenanceDisplay: [],
  offlineStatusPropertyRows: [],
  offlineStatusMaintenanceDisplay: [],
  reservationTurnoverArrivalColumns: emptyColumns,
  reservationTurnoverDepartureColumns: emptyColumns,
  propertyOnlineColumns: emptyColumns,
  propertyOfflineColumns: emptyColumns,
  arrivalMaintenanceColumns: emptyColumns,
  departureMaintenanceColumns: emptyColumns,
  comingOnlineMaintenanceColumns: emptyColumns,
  goingOfflineMaintenanceColumns: emptyColumns,
  maidMaintenanceColumns: emptyColumns,
  vacantPropertyColumns: emptyColumns,
  vacantMaintenanceColumns: emptyColumns,
  occupiedPropertyColumns: emptyColumns,
  occupiedMaintenanceColumns: emptyColumns,
  offlineStatusPropertyColumns: emptyColumns,
  offlineStatusMaintenanceColumns: emptyColumns,
  monthlyCommissionColumns: emptyColumns
};

export type DashboardPropertyTrackerRow = {
  propertyId: string;
  officeId: number;
  propertyLeaseTypeId: number;
};

export type DashboardCompanyTrackerHandlers = {
  onReservationCheckboxChange?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onReservationDropdownChange?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onReservationCheckAllTracking?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onReservationClearTracking?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onPropertyCheckboxChange?: (row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline') => void;
  onPropertyDropdownChange?: (row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline') => void;
  onPropertyCheckAllTracking?: (row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline') => void;
  onPropertyClearTracking?: (row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline') => void;
  onMaintenanceDropdownChange?: (row: MaintenanceListDisplay) => void;
  onMaintenanceInlineDateChange?: (row: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }) => void;
};

export type DashboardCalendarEventKind = 'arrival' | 'departure' | 'cleaning' | 'carpet' | 'inspection' | 'maid';

/** Focus target when a calendar day-detail event is clicked (tab + row highlight). */
export type DashboardCalendarFocus = {
  tabIndex: number;
  eventKind: DashboardCalendarEventKind;
  propertyId: string | null;
  reservationId: string | null;
  maintenanceId: string | null;
  dateKey: string | null;
};

@Injectable({ providedIn: 'root' })
export class DashboardCompanyDataService {
  private readonly utilityService = inject(UtilityService);
  private readonly snapshotSubject = new BehaviorSubject<DashboardCompanyDataSnapshot>(emptyDashboardCompanyDataSnapshot);
  readonly snapshot$ = this.snapshotSubject.asObservable();
  /** Page-local office filter for the company dashboard (does not write global Working Office). */
  private readonly pageOfficeIdSubject = new BehaviorSubject<number | null | undefined>(undefined);
  readonly pageOfficeId$ = this.pageOfficeIdSubject.asObservable();
  private readonly calendarFocusSubject = new BehaviorSubject<DashboardCalendarFocus | null>(null);
  readonly calendarFocus$ = this.calendarFocusSubject.asObservable();
  private trackerHandlers: DashboardCompanyTrackerHandlers = {};

  get snapshot(): DashboardCompanyDataSnapshot {
    return this.snapshotSubject.value;
  }

  get pageOfficeId(): number | null | undefined {
    return this.pageOfficeIdSubject.value;
  }

  get calendarFocus(): DashboardCalendarFocus | null {
    return this.calendarFocusSubject.value;
  }

  setCalendarFocus(focus: DashboardCalendarFocus | null): void {
    this.calendarFocusSubject.next(focus);
  }

  clearCalendarFocus(): void {
    this.calendarFocusSubject.next(null);
  }

  normalizeDashboardKey(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase();
  }

  /** Normalize display/API dates to yyyy-MM-dd for calendar focus comparisons. */
  toFocusDateKey(value: string | null | undefined): string | null {
    if (value == null || String(value).trim() === '') {
      return null;
    }
    const parsed = this.utilityService.parseDateOnlyStringToDate(String(value));
    if (!parsed) {
      return null;
    }
    return this.utilityService.formatDateOnlyForApi(parsed);
  }

  /** True when focus came from a calendar day click (no specific event entity). */
  isDayScopeCalendarFocus(focus: DashboardCalendarFocus | null): boolean {
    if (!focus?.dateKey) {
      return false;
    }
    return !this.normalizeDashboardKey(focus.maintenanceId)
      && !this.normalizeDashboardKey(focus.reservationId)
      && !this.normalizeDashboardKey(focus.propertyId);
  }

  /**
   * Date on a maintenance/turnover row that corresponds to the focused calendar event.
   * Day-scope: any cleaning/carpet/inspection/event date on that day (green carpet dot must
   * still highlight even if the day's "first" event kind was departure).
   * Event-scope: cleaning → cleaningDate, inspection → inspectingDate, etc.
   */
  calendarFocusDateForRow(
    focus: DashboardCalendarFocus | null,
    row: {
      eventDate?: string | null;
      cleaningDate?: string | null;
      carpetDate?: string | null;
      inspectingDate?: string | null;
    },
    fallbackDate?: string | null
  ): string | null {
    if (!focus) {
      return fallbackDate ?? null;
    }

    const focusDateKey = this.toFocusDateKey(focus.dateKey);
    if (this.isDayScopeCalendarFocus(focus) && focusDateKey) {
      const candidates = [
        row.cleaningDate,
        row.carpetDate,
        row.inspectingDate,
        row.eventDate,
        fallbackDate
      ];
      for (const candidate of candidates) {
        if (this.toFocusDateKey(candidate) === focusDateKey) {
          return candidate ?? null;
        }
      }
      return null;
    }

    switch (focus.eventKind) {
      case 'cleaning':
      case 'maid':
        return row.cleaningDate || null;
      case 'carpet':
        return row.carpetDate || null;
      case 'inspection':
        return row.inspectingDate || null;
      case 'arrival':
      case 'departure':
        return (fallbackDate ?? row.eventDate) || null;
      default:
        return row.eventDate || row.cleaningDate || row.carpetDate || row.inspectingDate || fallbackDate || null;
    }
  }

  /**
   * @param rowDateValue Optional calendar day for the row (display or API). When focus.dateKey is set and
   * this is provided, the row must fall on that day — prevents maid/recurring rows from all matching
   * the same reservation/maintenance id across other dates.
   */
  matchesCalendarFocus(
    row: { propertyId?: string | null; reservationId?: string | null; maintenanceId?: string | null },
    focus: DashboardCalendarFocus | null,
    rowDateValue?: string | null
  ): boolean {
    if (!focus) {
      return false;
    }

    const focusDateKey = this.toFocusDateKey(focus.dateKey) || String(focus.dateKey || '').trim();
    if (focusDateKey && rowDateValue !== undefined) {
      const normalizedRowDate = this.toFocusDateKey(rowDateValue);
      if (!normalizedRowDate || normalizedRowDate !== focusDateKey) {
        return false;
      }
    }

    const focusMaintenanceId = this.normalizeDashboardKey(focus.maintenanceId);
    const rowMaintenanceId = this.normalizeDashboardKey(row.maintenanceId);
    if (focusMaintenanceId) {
      return !!rowMaintenanceId && rowMaintenanceId === focusMaintenanceId;
    }
    const focusReservationId = this.normalizeDashboardKey(focus.reservationId);
    const rowReservationId = this.normalizeDashboardKey(row.reservationId);
    if (focusReservationId) {
      return !!rowReservationId && rowReservationId === focusReservationId;
    }
    const focusPropertyId = this.normalizeDashboardKey(focus.propertyId);
    const rowPropertyId = this.normalizeDashboardKey(row.propertyId);
    if (focusPropertyId) {
      return !!rowPropertyId && rowPropertyId === focusPropertyId;
    }

    // Day selection (no entity ids): date match above is sufficient when rowDateValue was provided.
    return !!focusDateKey && rowDateValue !== undefined;
  }

  scrollDashboardActiveRowIntoView(): void {
    requestAnimationFrame(() => {
      setTimeout(() => {
        document
          .querySelector('.shell-tabs .datatable-row-active')
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    });
  }

  publish(snapshot: DashboardCompanyDataSnapshot): void {
    this.snapshotSubject.next(snapshot);
  }

  patchSnapshot(partial: Partial<DashboardCompanyDataSnapshot>): void {
    this.snapshotSubject.next({ ...this.snapshotSubject.value, ...partial });
  }

  setPageOfficeId(officeId: number | null): void {
    this.pageOfficeIdSubject.next(officeId);
  }

  setTrackerHandlers(handlers: DashboardCompanyTrackerHandlers): void {
    this.trackerHandlers = handlers;
  }

  onReservationCheckboxChange(row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    this.trackerHandlers.onReservationCheckboxChange?.(row, sourceContext);
  }

  onReservationDropdownChange(row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    this.trackerHandlers.onReservationDropdownChange?.(row, sourceContext);
  }

  onReservationCheckAllTracking(row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    this.trackerHandlers.onReservationCheckAllTracking?.(row, sourceContext);
  }

  onReservationClearTracking(row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure'): void {
    this.trackerHandlers.onReservationClearTracking?.(row, sourceContext);
  }

  onPropertyCheckboxChange(row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline'): void {
    this.trackerHandlers.onPropertyCheckboxChange?.(row, sourceContext);
  }

  onPropertyDropdownChange(row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline'): void {
    this.trackerHandlers.onPropertyDropdownChange?.(row, sourceContext);
  }

  onPropertyCheckAllTracking(row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline'): void {
    this.trackerHandlers.onPropertyCheckAllTracking?.(row, sourceContext);
  }

  onPropertyClearTracking(row: DashboardPropertyTrackerRow, sourceContext: 'online' | 'offline'): void {
    this.trackerHandlers.onPropertyClearTracking?.(row, sourceContext);
  }

  onMaintenanceDropdownChange(row: MaintenanceListDisplay): void {
    this.trackerHandlers.onMaintenanceDropdownChange?.(row);
  }

  onMaintenanceInlineDateChange(row: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    this.trackerHandlers.onMaintenanceInlineDateChange?.(row);
  }

  reset(): void {
    this.trackerHandlers = {};
    this.pageOfficeIdSubject.next(undefined);
    this.calendarFocusSubject.next(null);
    this.snapshotSubject.next(emptyDashboardCompanyDataSnapshot);
  }
}
