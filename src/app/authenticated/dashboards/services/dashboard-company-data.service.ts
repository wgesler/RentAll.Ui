import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DashboardPropertyTurnoverRow, MaintenanceListDisplay, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';

export type DashboardCompanyDataSnapshot = {
  isReady: boolean;
  todayArriveDepartCount: number;
  tomorrowArriveDepartCount: number;
  onlineOfflineTodayCount: number;
  onlineOfflineTomorrowCount: number;
  rentedCount: number;
  vacantCount: number;
  reservationTurnoverArrivalRows: ReservationTurnoverEventDisplay[];
  reservationTurnoverDepartureRows: ReservationTurnoverEventDisplay[];
  onlinePropertyRows: DashboardPropertyTurnoverRow[];
  offlinePropertyRows: DashboardPropertyTurnoverRow[];
  arrivalMaintenanceDisplay: MaintenanceListDisplay[];
  departureMaintenanceDisplay: MaintenanceListDisplay[];
  comingOnlineMaintenanceDisplay: MaintenanceListDisplay[];
  goingOfflineMaintenanceDisplay: MaintenanceListDisplay[];
  maidMaintenanceDisplay: MaintenanceListDisplay[];
  reservationTurnoverArrivalColumns: ColumnSet;
  reservationTurnoverDepartureColumns: ColumnSet;
  propertyOnlineColumns: ColumnSet;
  propertyOfflineColumns: ColumnSet;
  arrivalMaintenanceColumns: ColumnSet;
  departureMaintenanceColumns: ColumnSet;
  comingOnlineMaintenanceColumns: ColumnSet;
  goingOfflineMaintenanceColumns: ColumnSet;
  maidMaintenanceColumns: ColumnSet;
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
  reservationTurnoverArrivalRows: [],
  reservationTurnoverDepartureRows: [],
  onlinePropertyRows: [],
  offlinePropertyRows: [],
  arrivalMaintenanceDisplay: [],
  departureMaintenanceDisplay: [],
  comingOnlineMaintenanceDisplay: [],
  goingOfflineMaintenanceDisplay: [],
  maidMaintenanceDisplay: [],
  reservationTurnoverArrivalColumns: emptyColumns,
  reservationTurnoverDepartureColumns: emptyColumns,
  propertyOnlineColumns: emptyColumns,
  propertyOfflineColumns: emptyColumns,
  arrivalMaintenanceColumns: emptyColumns,
  departureMaintenanceColumns: emptyColumns,
  comingOnlineMaintenanceColumns: emptyColumns,
  goingOfflineMaintenanceColumns: emptyColumns,
  maidMaintenanceColumns: emptyColumns
};

export type DashboardCompanyTrackerHandlers = {
  onReservationCheckboxChange?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onReservationDropdownChange?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onReservationCheckAllTracking?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onReservationClearTracking?: (row: ReservationTurnoverEventDisplay, sourceContext: 'arrival' | 'departure') => void;
  onMaintenanceDropdownChange?: (row: MaintenanceListDisplay) => void;
  onMaintenanceInlineDateChange?: (row: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }) => void;
};

@Injectable({ providedIn: 'root' })
export class DashboardCompanyDataService {
  private readonly snapshotSubject = new BehaviorSubject<DashboardCompanyDataSnapshot>(emptyDashboardCompanyDataSnapshot);
  readonly snapshot$ = this.snapshotSubject.asObservable();
  private trackerHandlers: DashboardCompanyTrackerHandlers = {};

  get snapshot(): DashboardCompanyDataSnapshot {
    return this.snapshotSubject.value;
  }

  publish(snapshot: DashboardCompanyDataSnapshot): void {
    this.snapshotSubject.next(snapshot);
  }

  patchSnapshot(partial: Partial<DashboardCompanyDataSnapshot>): void {
    this.snapshotSubject.next({ ...this.snapshotSubject.value, ...partial });
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

  onMaintenanceDropdownChange(row: MaintenanceListDisplay): void {
    this.trackerHandlers.onMaintenanceDropdownChange?.(row);
  }

  onMaintenanceInlineDateChange(row: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    this.trackerHandlers.onMaintenanceInlineDateChange?.(row);
  }

  reset(): void {
    this.trackerHandlers = {};
    this.snapshotSubject.next(emptyDashboardCompanyDataSnapshot);
  }
}
