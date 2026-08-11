import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DashboardPropertyTurnoverRow, MaintenanceListDisplay } from '../../shared/models/mixed-models';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-online-tab',
  templateUrl: './dashboard-online-tab.component.html',
  styleUrl: './dashboard-online-tab.component.scss',
  imports: [MaterialModule, DataTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardOnlineTabComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  expandedSections = { checklist: true, maintenance: true };

  //#region Dashboard-Online-Tab
  ngOnInit(): void {
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.cdr.markForCheck();
    });
  }
  //#endregion

  //#region Utility Methods
  get checklistRows(): DashboardPropertyTurnoverRow[] {
    return this.snapshot.onlinePropertyRows;
  }

  get checklistColumns(): ColumnSet {
    return this.snapshot.propertyOnlineColumns;
  }

  get maintenanceRows(): MaintenanceListDisplay[] {
    return this.snapshot.comingOnlineMaintenanceDisplay;
  }

  get maintenanceColumns(): ColumnSet {
    return this.snapshot.comingOnlineMaintenanceColumns;
  }

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
