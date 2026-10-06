import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceItemListResponse } from '../../maintenance/models/maintenance-item.model';
import { MaintenanceItemsService } from '../../maintenance/services/maintenance-items.service';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';
import { DashboardNavigationService } from '../services/dashboard-navigation.service';

type DashboardMaintenancePropertyRow = {
  propertyId: string;
  propertyCode: string;
  name: string;
  lastServiced: string;
  months: string;
  notes: string;
  needsMaintenance: true;
  needsMaintenanceState: 'red' | 'yellow';
};

@Component({
  standalone: true,
  selector: 'app-dashboard-maintenance',
  templateUrl: './dashboard-maintenance.component.html',
  styleUrl: './dashboard-maintenance.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardMaintenanceComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private maintenanceItemsService = inject(MaintenanceItemsService);
  private utilityService = inject(UtilityService);
  private formatterService = inject(FormatterService);
  private router = inject(Router);
  private dashboardNavigation = inject(DashboardNavigationService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  items: MaintenanceItemListResponse[] = [];
  rows: DashboardMaintenancePropertyRow[] = [];
  isLoading = true;
  loadFailed = false;

  readonly columns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    name: { displayAs: 'Name', maxWidth: '30ch', wrap: false },
    lastServiced: { displayAs: 'Last Serviced', maxWidth: '16ch', alignment: 'center', headerAlignment: 'center', wrap: false },
    months: { displayAs: 'Months', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', wrap: false },
    needsMaintenance: { displayAs: 'Status', isCheckbox: true, maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
    notes: { displayAs: 'Notes', wrap: true }
  };

  //#region Dashboard-Maintenance
  ngOnInit(): void {
    this.dashboardNavigation.setTabIndex(6);
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.rebuildRows();
      this.markViewForCheck();
    });
    this.maintenanceItemsService.getMaintenanceItems().pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.items = items || [];
        this.isLoading = false;
        this.loadFailed = false;
        this.rebuildRows();
        this.markViewForCheck();
      },
      error: () => {
        this.items = [];
        this.isLoading = false;
        this.loadFailed = true;
        this.rebuildRows();
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  rebuildRows(): void {
    const officeId = this.snapshot.selectedOfficeId;
    const rows: DashboardMaintenancePropertyRow[] = [];

    for (const item of this.items) {
      if (officeId != null && item.officeId !== officeId) {
        continue;
      }
      const status = this.getServiceStatus(item);
      if (status !== 'red' && status !== 'yellow') {
        continue;
      }
      const propertyId = String(item.propertyId || '').trim();
      if (!propertyId) {
        continue;
      }
      rows.push({
        propertyId,
        propertyCode: (item.propertyCode || '').trim(),
        name: (item.name || '').trim(),
        lastServiced: this.formatterService.formatDateString(item.lastServicedOn),
        months: item.monthsBetweenService == null ? '' : String(item.monthsBetweenService),
        notes: (item.notes || '').trim(),
        needsMaintenance: true,
        needsMaintenanceState: status
      });
    }

    this.rows = rows.sort((left, right) => {
      if (left.needsMaintenanceState !== right.needsMaintenanceState) {
        return left.needsMaintenanceState === 'red' ? -1 : 1;
      }
      const byProperty = left.propertyCode.localeCompare(right.propertyCode, undefined, { numeric: true });
      if (byProperty !== 0) {
        return byProperty;
      }
      return left.name.localeCompare(right.name);
    });
  }

  getServiceStatus(item: MaintenanceItemListResponse): 'red' | 'yellow' | 'green' | null {
    const lastServiced = this.utilityService.parseDateOnlyStringToDate(item.lastServicedOn);
    const months = Number(item.monthsBetweenService);
    if (!lastServiced || !Number.isFinite(months) || months <= 0) {
      return null;
    }
    const due = this.startOfDay(this.addMonths(lastServiced, months));
    const today = this.startOfDay(new Date());
    if (due < today) {
      return 'red';
    }
    if (due <= this.startOfDay(this.addMonths(today, 1))) {
      return 'yellow';
    }
    return 'green';
  }
  //#endregion

  //#region Navigate From Calendar
  goToProperty(event: { propertyId: string }): void {
    const propertyId = (event?.propertyId || '').trim();
    if (!propertyId) {
      return;
    }
    void this.router.navigate([RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId])], {
      queryParams: { tab: 1, returnUrl: this.dashboardNavigation.getDashboardReturnUrl() }
    });
  }
  //#endregion

  //#region Utility Methods
  addMonths(date: Date, months: number): Date {
    const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(date.getDate(), lastDay));
    return result;
  }

  startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
