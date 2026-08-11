import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListDisplay, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

type ArrivalTurnoverRow = ReservationTurnoverEventDisplay & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: ArrivalTurnoverRow) => void;
};

@Component({
  standalone: true,
  selector: 'app-dashboard-arrivals',
  templateUrl: './dashboard-arrivals.component.html',
  styleUrl: './dashboard-arrivals.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardArrivalsComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  turnoverDisplayRows: ArrivalTurnoverRow[] = [];
  orphanMaintenanceRows: MaintenanceListDisplay[] = [];
  expandedReservationKeys = new Set<string>();
  isAllExpanded = false;

  //#region Dashboard-Arrivals
  ngOnInit(): void {
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.rebuildTurnoverDisplayRows();
      this.markViewForCheck();
    });
    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(focus => {
      if (focus?.tabIndex !== 0) {
        return;
      }
      this.rebuildTurnoverDisplayRows();
      this.markViewForCheck();
      this.companyDataService.scrollDashboardActiveRowIntoView();
    });
  }
  //#endregion

  //#region Toggle Rows
  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    this.expandedReservationKeys.clear();
    if (expanded) {
      for (const row of this.turnoverDisplayRows) {
        const key = (row.expand || '').trim();
        if (key) {
          this.expandedReservationKeys.add(key);
        }
      }
    }
    this.rebuildTurnoverDisplayRows();
    this.markViewForCheck();
  }

  updateIsAllExpanded(): void {
    const keys = this.turnoverDisplayRows.map(row => (row.expand || '').trim()).filter(key => key !== '');
    this.isAllExpanded = keys.length > 0 && keys.every(key => this.expandedReservationKeys.has(key));
  }
  //#endregion

  //#region Form Response
  get checklistColumns(): ColumnSet {
    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.snapshot.reservationTurnoverArrivalColumns
    };
  }

  get maintenanceColumns(): ColumnSet {
    const cols = this.snapshot.arrivalMaintenanceColumns || {};
    return {
      ...cols,
      // Keep Code and Arrival Date compact and adjacent.
      propertyCode: { ...(cols['propertyCode'] || {}), maxWidth: '12ch', wrap: false },
      eventDate: { ...(cols['eventDate'] || {}), maxWidth: '12ch', wrap: false }
    };
  }

  rebuildTurnoverDisplayRows(): void {
    const maintenanceByReservation = new Map<string, MaintenanceListDisplay[]>();
    const maintenanceByProperty = new Map<string, MaintenanceListDisplay[]>();
    const usedMaintenance = new Set<MaintenanceListDisplay>();

    for (const row of this.snapshot.arrivalMaintenanceDisplay || []) {
      const reservationKey = this.normalizeKey(row.reservationId);
      const propertyKey = this.normalizeKey(row.propertyId);
      if (reservationKey) {
        const list = maintenanceByReservation.get(reservationKey) || [];
        list.push(row);
        maintenanceByReservation.set(reservationKey, list);
      }
      if (propertyKey) {
        const list = maintenanceByProperty.get(propertyKey) || [];
        list.push(row);
        maintenanceByProperty.set(propertyKey, list);
      }
    }

    this.turnoverDisplayRows = (this.snapshot.reservationTurnoverArrivalRows || []).map(row => {
      const reservationKey = this.normalizeKey(row.reservationId);
      const propertyKey = this.normalizeKey(row.propertyId);
      let children = reservationKey
        ? (maintenanceByReservation.get(reservationKey) || []).filter(child => !usedMaintenance.has(child))
        : [];
      if (children.length === 0 && propertyKey) {
        children = (maintenanceByProperty.get(propertyKey) || []).filter(child => !usedMaintenance.has(child));
      }
      // One nested line per property/reservation (ledger-style).
      const singleChild = children.slice(0, 1);
      for (const child of singleChild) {
        usedMaintenance.add(child);
      }
      // Mark any extra matches as used so they don't appear as orphans either.
      for (const child of children.slice(1)) {
        usedMaintenance.add(child);
      }
      const expandKey = reservationKey || propertyKey || this.normalizeKey(row.propertyCode) || this.normalizeKey(row.reservationCode);
      const focus = this.companyDataService.calendarFocus;
      const focusOnTab = focus?.tabIndex === 0 ? focus : null;
      const childDate = (child: MaintenanceListDisplay) =>
        this.companyDataService.calendarFocusDateForRow(focusOnTab, child, child.eventDate);
      // Check all linked maintenance rows (not only the displayed nested line).
      const childMatches = children.some(child =>
        this.companyDataService.matchesCalendarFocus(child, focusOnTab, childDate(child))
      );
      // Arrival parent date for arrival focus; cleaning/carpet/inspection highlight via childMatches.
      const parentMatches = (focusOnTab?.eventKind === 'arrival' || this.companyDataService.isDayScopeCalendarFocus(focusOnTab))
        && this.companyDataService.matchesCalendarFocus(row, focusOnTab, row.arrivalDateDisplay);
      return {
        ...row,
        rowActive: !!focusOnTab && (parentMatches || childMatches),
        expand: expandKey,
        expanded: expandKey !== '' && this.expandedReservationKeys.has(expandKey),
        maintenanceRows: singleChild.map(child => ({
          ...child,
          // Keep nested line unhighlighted; parent row carries the calendar highlight.
          rowActive: false
        })),
        expandClick: (event: Event, item: ArrivalTurnoverRow) => {
          event.stopPropagation();
          const key = (item.expand || '').trim();
          if (!key) {
            return;
          }
          if (this.expandedReservationKeys.has(key)) {
            this.expandedReservationKeys.delete(key);
          } else {
            this.expandedReservationKeys.add(key);
          }
          this.rebuildTurnoverDisplayRows();
          this.markViewForCheck();
        }
      };
    });

    const focus = this.companyDataService.calendarFocus?.tabIndex === 0 ? this.companyDataService.calendarFocus : null;
    this.orphanMaintenanceRows = (this.snapshot.arrivalMaintenanceDisplay || [])
      .filter(row => !usedMaintenance.has(row))
      .map(row => ({
        ...row,
        rowActive: !!focus && this.companyDataService.matchesCalendarFocus(
          row,
          focus,
          this.companyDataService.calendarFocusDateForRow(focus, row, row.eventDate)
        )
      }));
    this.updateIsAllExpanded();
  }

  normalizeKey(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase();
  }

  onChecklistRowNavigate(row: ReservationTurnoverEventDisplay): void {
    if (row.reservationId?.trim()) {
      this.router.navigate([RouterUrl.replaceTokens(RouterUrl.Reservation, [row.reservationId])], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (row.propertyId?.trim()) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [row.propertyId]));
    }
  }

  onChecklistCheckboxChange(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationCheckboxChange(row, 'arrival');
  }

  onChecklistDropdownChange(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationDropdownChange(row, 'arrival');
  }

  onChecklistCheckAll(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationCheckAllTracking(row, 'arrival');
  }

  onChecklistClearTracking(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationClearTracking(row, 'arrival');
  }

  onChecklistContactNavigate(row: ReservationTurnoverEventDisplay): void {
    if (!row.contactId?.trim()) {
      return;
    }
    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.Contact, [row.contactId])],
      { queryParams: { returnUrl: this.router.url } }
    );
  }

  onMaintenanceDropdownChange(event: MaintenanceListDisplay): void {
    this.companyDataService.onMaintenanceDropdownChange(event);
  }

  onMaintenanceInlineDateChange(event: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    this.companyDataService.onMaintenanceInlineDateChange(event);
  }
  //#endregion

  //#region Navigate From Calendar
  goToProperty(event: { propertyId: string }): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
    }
  }

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
