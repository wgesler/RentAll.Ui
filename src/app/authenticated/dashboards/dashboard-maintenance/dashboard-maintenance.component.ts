import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceItemListResponse, MaintenanceItemRequest } from '../../maintenance/models/maintenance-item.model';
import { MaintenanceItemsService } from '../../maintenance/services/maintenance-items.service';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';
import { DashboardNavigationService } from '../services/dashboard-navigation.service';

type DashboardMaintenancePropertyRow = {
  maintenanceItemId: number;
  propertyId: string;
  propertyCode: string;
  name: string;
  lastServiced: string;
  months: string;
  dateDue: string;
  dateDueSortKey: string;
  notes: string;
  needsMaintenance: true;
  needsMaintenanceState: 'red' | 'yellow' | 'green';
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
  private toastr = inject(ToastrService);
  private destroy$ = new Subject<void>();
  private pendingMonthsById = new Map<number, number>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  items: MaintenanceItemListResponse[] = [];
  rows: DashboardMaintenancePropertyRow[] = [];
  isLoading = true;
  loadFailed = false;
  includeGreen = false;

  readonly columns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    name: { displayAs: 'Name', maxWidth: '30ch', wrap: false },
    lastServiced: { displayAs: 'Last Serviced', maxWidth: '16ch', alignment: 'center', headerAlignment: 'center', wrap: false },
    months: { displayAs: 'Months', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', wrap: false, editableType: 'text', suppressRowClick: true },
    dateDue: { displayAs: 'Date Due', maxWidth: '14ch', alignment: 'center', headerAlignment: 'center', wrap: false },
    needsMaintenance: { displayAs: 'Status', isCheckbox: true, maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
    notes: { displayAs: 'Notes', wrap: true }
  };

  //#region Dashboard-Maintenance
  ngOnInit(): void {
    this.includeGreen = this.dashboardNavigation.getMaintenanceIncludeGreen();
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
      const due = this.getDueDate(item);
      const status = this.getServiceStatus(due);
      if (due == null || status == null || (!this.includeGreen && status === 'green')) {
        continue;
      }
      const propertyId = String(item.propertyId || '').trim();
      if (!propertyId) {
        continue;
      }
      const dateDueSortKey = this.toSortKey(due);
      rows.push({
        maintenanceItemId: item.maintenanceItemId,
        propertyId,
        propertyCode: (item.propertyCode || '').trim(),
        name: (item.name || '').trim(),
        lastServiced: this.formatterService.formatDateString(item.lastServicedOn),
        months: item.monthsBetweenService == null ? '' : String(item.monthsBetweenService),
        dateDue: this.formatterService.formatDateString(dateDueSortKey),
        dateDueSortKey,
        notes: (item.notes || '').trim(),
        needsMaintenance: true,
        needsMaintenanceState: status
      });
    }

    this.rows = rows.sort((left, right) => {
      const byDue = left.dateDueSortKey.localeCompare(right.dateDueSortKey);
      if (byDue !== 0) {
        return byDue;
      }
      const byProperty = left.propertyCode.localeCompare(right.propertyCode, undefined, { numeric: true });
      if (byProperty !== 0) {
        return byProperty;
      }
      return left.name.localeCompare(right.name);
    });
  }

  onMonthsInlineChange(row: DashboardMaintenancePropertyRow & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    if (row.__changedInlineColumn !== 'months') {
      return;
    }
    const source = this.items.find(item => item.maintenanceItemId === row.maintenanceItemId);
    if (!source) {
      return;
    }
    const digits = String(row.__inlineValue ?? '').replace(/\D/g, '');
    const months = digits === '' ? null : Number(digits);
    if (months == null || !Number.isFinite(months) || months <= 0) {
      row.months = String(source.monthsBetweenService ?? '');
      this.markViewForCheck();
      return;
    }
    if (months === Number(source.monthsBetweenService)) {
      row.months = String(months);
      this.markViewForCheck();
      return;
    }
    const lastServicedOn = this.utilityService.coerceCalendarDateStringFromApi(source.lastServicedOn);
    if (!lastServicedOn) {
      row.months = String(source.monthsBetweenService ?? '');
      this.markViewForCheck();
      return;
    }
    const request: MaintenanceItemRequest = {
      maintenanceItemId: source.maintenanceItemId,
      propertyId: source.propertyId,
      name: source.name,
      notes: source.notes ?? null,
      monthsBetweenService: months,
      lastServicedOn
    };
    this.pendingMonthsById.set(source.maintenanceItemId, months);
    this.maintenanceItemsService.updateMaintenanceItem(request).pipe(take(1)).subscribe({
      next: () => {
        if (this.pendingMonthsById.get(source.maintenanceItemId) !== months) {
          return;
        }
        this.pendingMonthsById.delete(source.maintenanceItemId);
        source.monthsBetweenService = months;
        this.maintenanceItemsService.notifyItemUpdated(source);
        if (this.destroy$.closed) {
          return;
        }
        this.rebuildRows();
        this.markViewForCheck();
      },
      error: () => {
        if (this.pendingMonthsById.get(source.maintenanceItemId) === months) {
          this.pendingMonthsById.delete(source.maintenanceItemId);
        }
        if (this.destroy$.closed) {
          return;
        }
        row.months = String(source.monthsBetweenService ?? '');
        this.toastr.error('Maintenance item could not be saved.');
        this.markViewForCheck();
      }
    });
  }

  onIncludeGreenChange(checked: boolean): void {
    this.includeGreen = checked;
    this.dashboardNavigation.setMaintenanceIncludeGreen(checked);
    this.rebuildRows();
    this.markViewForCheck();
  }

  getDueDate(item: MaintenanceItemListResponse): Date | null {
    const lastServiced = this.utilityService.parseDateOnlyStringToDate(item.lastServicedOn);
    const months = Number(item.monthsBetweenService);
    if (!lastServiced || !Number.isFinite(months) || months <= 0) {
      return null;
    }
    return this.startOfDay(this.addMonths(lastServiced, months));
  }

  getServiceStatus(due: Date | null): 'red' | 'yellow' | 'green' | null {
    if (!due) {
      return null;
    }
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
    this.dashboardNavigation.markMaintenanceIncludeGreenForReturn();
    void this.router.navigate([RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId])], {
      queryParams: { tab: 1, returnUrl: this.dashboardNavigation.getDashboardReturnUrl() }
    });
  }
  //#endregion

  //#region Utility Methods
  toSortKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

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
