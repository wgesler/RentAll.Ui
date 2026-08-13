import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { getPropertyStatus, PropertyLeaseType } from '../../properties/models/property-enums';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import {
  DashboardPropertyTurnoverRow,
  MaintenanceListDisplay,
  PropertyInProcessDisplay
} from '../../shared/models/mixed-models';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';
import { DashboardNavigationService } from '../services/dashboard-navigation.service';

type OfflineTabRow = PropertyInProcessDisplay & {
  availableUntilDisplay: string;
  expand: string;
  expanded: boolean;
  maintenanceRows: MaintenanceListDisplay[];
  expandClick: (event: Event, item: OfflineTabRow) => void;
};

type OfflineLeaseTypeSection = {
  leaseTypeId: PropertyLeaseType;
  title: string;
  rows: OfflineTabRow[];
};

const OFFLINE_LEASE_TYPE_SECTIONS: ReadonlyArray<{ leaseTypeId: PropertyLeaseType; title: string }> = [
  { leaseTypeId: PropertyLeaseType.PropertyManagement, title: 'Property Management' },
  { leaseTypeId: PropertyLeaseType.ThirdParty, title: '3rd Party' },
  { leaseTypeId: PropertyLeaseType.Direct, title: 'Direct' }
];

@Component({
  standalone: true,
  selector: 'app-dashboard-offline',
  templateUrl: './dashboard-offline.component.html',
  styleUrl: './dashboard-offline.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardOfflineComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private dashboardNavigation = inject(DashboardNavigationService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  leaseTypeSections: OfflineLeaseTypeSection[] = [];
  orphanMaintenanceRows: MaintenanceListDisplay[] = [];
  expandedPropertyKeys = new Set<string>();

  //#region Dashboard-Offline
  ngOnInit(): void {
    this.dashboardNavigation.setTabIndex(3);
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.rebuildTurnoverDisplayRows();
      this.markViewForCheck();
    });
    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(focus => {
      if (focus?.tabIndex !== 3) {
        return;
      }
      this.rebuildTurnoverDisplayRows();
      this.markViewForCheck();
      this.companyDataService.scrollDashboardActiveRowIntoView();
    });
  }
  //#endregion

  //#region Form Response Methods
  get checklistColumns(): ColumnSet {
    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.snapshot.offlineStatusPropertyColumns
    };
  }

  getChecklistColumns(leaseTypeId: PropertyLeaseType): ColumnSet {
    return {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...(this.snapshot.offlineStatusPropertyColumnsByLeaseType?.[leaseTypeId] ?? this.snapshot.offlineStatusPropertyColumns)
    };
  }

  get maintenanceColumns(): ColumnSet {
    const cols = this.snapshot.offlineStatusMaintenanceColumns || this.snapshot.goingOfflineMaintenanceColumns || {};
    return {
      ...cols,
      propertyCode: { ...(cols['propertyCode'] || {}), maxWidth: '12ch', wrap: false },
      eventDate: { ...(cols['eventDate'] || {}), maxWidth: '12ch', wrap: false }
    };
  }

  /** Status=Offline inventory + coming-offline in the current/next month window (deduped). */
  buildOfflineParentRows(): Array<PropertyInProcessDisplay & { availableUntilDisplay: string }> {
    const byPropertyId = new Map<string, PropertyInProcessDisplay & { availableUntilDisplay: string }>();

    for (const row of this.snapshot.offlineStatusPropertyRows || []) {
      const key = this.normalizeKey(row.propertyId);
      if (!key) {
        continue;
      }
      byPropertyId.set(key, {
        ...row,
        availableUntilDisplay: String((row as { availableUntilDisplay?: string }).availableUntilDisplay || row.availableUntil || '—')
      });
    }

    for (const row of this.snapshot.offlinePropertyRows || []) {
      const key = this.normalizeKey(row.propertyId);
      if (!key) {
        continue;
      }
      const existing = byPropertyId.get(key);
      const offlineDate = String(row.availableUntil || '').trim() || '—';
      if (existing) {
        byPropertyId.set(key, {
          ...existing,
          availableUntilDisplay: offlineDate !== '—' ? offlineDate : existing.availableUntilDisplay
        });
        continue;
      }
      byPropertyId.set(key, this.mapGoingOfflineRowToTabRow(row));
    }

    return Array.from(byPropertyId.values()).sort((a, b) => {
      const aDate = a.availableUntilDisplay || '';
      const bDate = b.availableUntilDisplay || '';
      if (aDate === '—' && bDate !== '—') {
        return 1;
      }
      if (bDate === '—' && aDate !== '—') {
        return -1;
      }
      const byDate = aDate.localeCompare(bDate);
      if (byDate !== 0) {
        return byDate;
      }
      return (a.propertyCode || '').localeCompare(b.propertyCode || '', undefined, { sensitivity: 'base' });
    });
  }

  mapGoingOfflineRowToTabRow(row: DashboardPropertyTurnoverRow): PropertyInProcessDisplay & { availableUntilDisplay: string } {
    return {
      ...(row as unknown as PropertyInProcessDisplay),
      propertyStatusDisplay: getPropertyStatus(row.propertyStatusId) || '—',
      availableUntilDisplay: String(row.availableUntil || '').trim() || '—'
    };
  }

  rebuildTurnoverDisplayRows(): void {
    const maintenanceByProperty = new Map<string, MaintenanceListDisplay[]>();
    const usedMaintenance = new Set<MaintenanceListDisplay>();
    const maintenanceRows = [
      ...(this.snapshot.offlineStatusMaintenanceDisplay || []),
      ...(this.snapshot.goingOfflineMaintenanceDisplay || [])
    ];

    for (const row of maintenanceRows) {
      const propertyKey = this.normalizeKey(row.propertyId);
      if (!propertyKey) {
        continue;
      }
      const list = maintenanceByProperty.get(propertyKey) || [];
      if (!list.some(existing => this.normalizeKey(existing.maintenanceId) === this.normalizeKey(row.maintenanceId)
        && this.normalizeKey(existing.reservationId) === this.normalizeKey(row.reservationId)
        && String(existing.eventDate || '') === String(row.eventDate || ''))) {
        list.push(row);
      }
      maintenanceByProperty.set(propertyKey, list);
    }

    const turnoverDisplayRows = this.buildOfflineParentRows().map(row => {
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
      const focusOnTab = focus?.tabIndex === 3 ? focus : null;
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
        expandClick: (event: Event, item: OfflineTabRow) => {
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

    this.leaseTypeSections = OFFLINE_LEASE_TYPE_SECTIONS.map(section => ({
      ...section,
      rows: turnoverDisplayRows.filter(row => Number(row.propertyLeaseTypeId) === section.leaseTypeId)
    }));

    const focus = this.companyDataService.calendarFocus?.tabIndex === 3 ? this.companyDataService.calendarFocus : null;
    this.orphanMaintenanceRows = maintenanceRows
      .filter(row => !usedMaintenance.has(row))
      .map(row => ({
        ...row,
        rowActive: !!focus && this.companyDataService.matchesCalendarFocus(
          row,
          focus,
          this.companyDataService.calendarFocusDateForRow(focus, row, row.eventDate)
        )
      }));
  }

  toggleExpandAllForSection(section: OfflineLeaseTypeSection, expanded: boolean): void {
    if (expanded) {
      for (const row of section.rows) {
        const key = (row.expand || '').trim();
        if (key) {
          this.expandedPropertyKeys.add(key);
        }
      }
    } else {
      for (const row of section.rows) {
        const key = (row.expand || '').trim();
        if (key) {
          this.expandedPropertyKeys.delete(key);
        }
      }
    }
    this.rebuildTurnoverDisplayRows();
    this.markViewForCheck();
  }

  isAllExpandedForSection(section: OfflineLeaseTypeSection): boolean {
    const keys = section.rows.map(row => (row.expand || '').trim()).filter(key => key !== '');
    return keys.length > 0 && keys.every(key => this.expandedPropertyKeys.has(key));
  }

  normalizeKey(value: string | null | undefined): string {
    return String(value || '').trim().toLowerCase();
  }

  onChecklistCheckboxChange(row: PropertyInProcessDisplay): void {
    this.companyDataService.onPropertyCheckboxChange(row, 'offline');
  }

  onChecklistDropdownChange(row: PropertyInProcessDisplay): void {
    this.companyDataService.onPropertyDropdownChange(row, 'offline');
  }

  onChecklistCheckAll(row: PropertyInProcessDisplay): void {
    this.companyDataService.onPropertyCheckAllTracking(row, 'offline');
  }

  onChecklistClearTracking(row: PropertyInProcessDisplay): void {
    this.companyDataService.onPropertyClearTracking(row, 'offline');
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
    this.dashboardNavigation.goToProperty(this.router, event?.propertyId);
  }

  goToContact(event: MaintenanceListDisplay | PropertyInProcessDisplay): void {
    const leaseTypeId = Number((event as PropertyInProcessDisplay).propertyLeaseTypeId);
    const isVendorLeaseType = leaseTypeId === PropertyLeaseType.Direct || leaseTypeId === PropertyLeaseType.ThirdParty;
    const contactId = isVendorLeaseType
      ? String((event as PropertyInProcessDisplay).vendorId || event.owner1Id || '').trim()
      : String(event.owner1Id || '').trim();
    if (contactId) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Contact, [contactId])],
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
