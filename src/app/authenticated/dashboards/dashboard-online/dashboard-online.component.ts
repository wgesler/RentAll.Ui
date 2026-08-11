import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DashboardPropertyTurnoverRow, MaintenanceListDisplay } from '../../shared/models/mixed-models';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

type OnlineTurnoverRow = DashboardPropertyTurnoverRow & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: OnlineTurnoverRow) => void;
};

@Component({
  standalone: true,
  selector: 'app-dashboard-online',
  templateUrl: './dashboard-online.component.html',
  styleUrl: './dashboard-online.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardOnlineComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  turnoverDisplayRows: OnlineTurnoverRow[] = [];
  orphanMaintenanceRows: MaintenanceListDisplay[] = [];
  expandedPropertyKeys = new Set<string>();
  isAllExpanded = false;

  //#region Dashboard-Online
  ngOnInit(): void {
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.rebuildTurnoverDisplayRows();
      this.markViewForCheck();
    });
    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(focus => {
      if (focus?.tabIndex !== 2) {
        return;
      }
      this.rebuildTurnoverDisplayRows();
      this.markViewForCheck();
      this.companyDataService.scrollDashboardActiveRowIntoView();
    });
  }
  //#endregion

  //#region Utility Methods
  get checklistColumns(): ColumnSet {
    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.snapshot.propertyOnlineColumns
    };
  }

  get maintenanceColumns(): ColumnSet {
    const cols = this.snapshot.comingOnlineMaintenanceColumns || {};
    return {
      ...cols,
      propertyCode: { ...(cols['propertyCode'] || {}), maxWidth: '12ch', wrap: false },
      eventDate: { ...(cols['eventDate'] || {}), maxWidth: '12ch', wrap: false }
    };
  }

  rebuildTurnoverDisplayRows(): void {
    const maintenanceByProperty = new Map<string, MaintenanceListDisplay[]>();
    const usedMaintenance = new Set<MaintenanceListDisplay>();

    for (const row of this.snapshot.comingOnlineMaintenanceDisplay || []) {
      const propertyKey = this.normalizeKey(row.propertyId);
      if (!propertyKey) {
        continue;
      }
      const list = maintenanceByProperty.get(propertyKey) || [];
      list.push(row);
      maintenanceByProperty.set(propertyKey, list);
    }

    this.turnoverDisplayRows = (this.snapshot.onlinePropertyRows || []).map(row => {
      const propertyKey = this.normalizeKey(row.propertyId);
      const children = propertyKey
        ? (maintenanceByProperty.get(propertyKey) || []).filter(child => !usedMaintenance.has(child))
        : [];
      const singleChild = children.slice(0, 1);
      for (const child of children) {
        usedMaintenance.add(child);
      }
      const expandKey = propertyKey || this.normalizeKey(row.propertyCode);
      const focus = this.companyDataService.calendarFocus;
      const focusOnTab = focus?.tabIndex === 2 ? focus : null;
      const childDate = (child: MaintenanceListDisplay) =>
        this.companyDataService.calendarFocusDateForRow(focusOnTab, child, child.eventDate);
      const childMatches = children.some(child =>
        this.companyDataService.matchesCalendarFocus(child, focusOnTab, childDate(child))
      );
      return {
        ...row,
        // Online calendar events are cleaning/carpet/inspection — highlight parent via nested match.
        rowActive: !!focusOnTab && childMatches,
        expand: expandKey,
        expanded: expandKey !== '' && this.expandedPropertyKeys.has(expandKey),
        maintenanceRows: singleChild.map(child => ({
          ...child,
          rowActive: false
        })),
        expandClick: (event: Event, item: OnlineTurnoverRow) => {
          event.stopPropagation();
          const key = (item.expand || '').trim();
          if (!key) {
            return;
          }
          if (this.expandedPropertyKeys.has(key)) {
            this.expandedPropertyKeys.delete(key);
          } else {
            this.expandedPropertyKeys.add(key);
          }
          this.rebuildTurnoverDisplayRows();
          this.markViewForCheck();
        }
      };
    });

    const focus = this.companyDataService.calendarFocus?.tabIndex === 2 ? this.companyDataService.calendarFocus : null;
    this.orphanMaintenanceRows = (this.snapshot.comingOnlineMaintenanceDisplay || [])
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

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    this.expandedPropertyKeys.clear();
    if (expanded) {
      for (const row of this.turnoverDisplayRows) {
        const key = (row.expand || '').trim();
        if (key) {
          this.expandedPropertyKeys.add(key);
        }
      }
    }
    this.rebuildTurnoverDisplayRows();
    this.markViewForCheck();
  }

  updateIsAllExpanded(): void {
    const keys = this.turnoverDisplayRows.map(row => (row.expand || '').trim()).filter(key => key !== '');
    this.isAllExpanded = keys.length > 0 && keys.every(key => this.expandedPropertyKeys.has(key));
  }

  normalizeKey(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase();
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
