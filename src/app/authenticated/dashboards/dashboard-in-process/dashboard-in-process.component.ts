import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListDisplay, PropertyInProcessDisplay } from '../../shared/models/mixed-models';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

type OccupiedTurnoverRow = PropertyInProcessDisplay & {
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: OccupiedTurnoverRow) => void;
};

@Component({
  standalone: true,
  selector: 'app-dashboard-in-process',
  templateUrl: './dashboard-in-process.component.html',
  styleUrl: './dashboard-in-process.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardInProcessComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  turnoverDisplayRows: OccupiedTurnoverRow[] = [];
  orphanMaintenanceRows: MaintenanceListDisplay[] = [];
  expandedPropertyKeys = new Set<string>();
  isAllExpanded = false;

  //#region Dashboard-Occupied
  ngOnInit(): void {
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.rebuildTurnoverDisplayRows();
      this.cdr.markForCheck();
    });
    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(focus => {
      if (focus?.tabIndex !== 4) {
        return;
      }
      this.rebuildTurnoverDisplayRows();
      this.cdr.markForCheck();
      this.companyDataService.scrollDashboardActiveRowIntoView();
    });
  }
  //#endregion

  //#region Utility Methods
  get checklistColumns(): ColumnSet {
    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.snapshot.occupiedPropertyColumns
    };
  }

  get maintenanceColumns(): ColumnSet {
    const cols = this.snapshot.occupiedMaintenanceColumns || {};
    return {
      ...cols,
      propertyCode: { ...(cols['propertyCode'] || {}), maxWidth: '12ch', wrap: false },
      eventDate: { ...(cols['eventDate'] || {}), maxWidth: '12ch', wrap: false }
    };
  }

  rebuildTurnoverDisplayRows(): void {
    const maintenanceByProperty = new Map<string, MaintenanceListDisplay[]>();
    const usedMaintenance = new Set<MaintenanceListDisplay>();

    for (const row of this.snapshot.occupiedMaintenanceDisplay || []) {
      const propertyKey = this.normalizeKey(row.propertyId);
      if (!propertyKey) {
        continue;
      }
      const list = maintenanceByProperty.get(propertyKey) || [];
      list.push(row);
      maintenanceByProperty.set(propertyKey, list);
    }

    this.turnoverDisplayRows = (this.snapshot.occupiedPropertyRows || []).map(row => {
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
      const focusOnTab = focus?.tabIndex === 4 ? focus : null;
      const childDate = (child: MaintenanceListDisplay) =>
        this.companyDataService.calendarFocusDateForRow(focusOnTab, child, child.eventDate);
      const childMatches = children.some(child =>
        this.companyDataService.matchesCalendarFocus(child, focusOnTab, childDate(child))
      );
      return {
        ...row,
        rowActive: !!focusOnTab && childMatches,
        expand: expandKey,
        expanded: expandKey !== '' && this.expandedPropertyKeys.has(expandKey),
        maintenanceRows: singleChild.map(child => ({
          ...child,
          rowActive: false
        })),
        expandClick: (event: Event, item: OccupiedTurnoverRow) => {
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
          this.cdr.markForCheck();
        }
      };
    });

    const focus = this.companyDataService.calendarFocus?.tabIndex === 4 ? this.companyDataService.calendarFocus : null;
    this.orphanMaintenanceRows = (this.snapshot.occupiedMaintenanceDisplay || [])
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
    this.cdr.markForCheck();
  }

  updateIsAllExpanded(): void {
    const keys = this.turnoverDisplayRows.map(row => (row.expand || '').trim()).filter(key => key !== '');
    this.isAllExpanded = keys.length > 0 && keys.every(key => this.expandedPropertyKeys.has(key));
  }

  normalizeKey(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase();
  }

  goToProperty(event: { propertyId: string }): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
    }
  }

  goToContact(event: MaintenanceListDisplay | PropertyInProcessDisplay): void {
    if (event?.owner1Id) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Contact, [event.owner1Id])],
        { queryParams: { returnUrl: this.router.url } }
      );
    }
  }

  goToPropertyMaintenance(event: { propertyId: string }): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=1`);
    }
  }

  goToInspection(event: MaintenanceListDisplay): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(`${RouterUrl.replaceTokens(RouterUrl.Maintenance, [event.propertyId])}?tab=0`);
    }
  }

  onMaintenanceDropdownChange(event: MaintenanceListDisplay): void {
    this.companyDataService.onMaintenanceDropdownChange(event);
  }

  onMaintenanceInlineDateChange(event: MaintenanceListDisplay & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    this.companyDataService.onMaintenanceInlineDateChange(event);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
