import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListDisplay, ReservationTurnoverEventDisplay } from '../../shared/models/mixed-models';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-departures-tab',
  templateUrl: './dashboard-departures-tab.component.html',
  styleUrl: './dashboard-departures-tab.component.scss',
  imports: [MaterialModule, DataTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardDeparturesTabComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  expandedSections = { checklist: true, maintenance: true };

  //#region Dashboard-Departures-Tab
  ngOnInit(): void {
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.cdr.markForCheck();
    });
  }
  //#endregion

  //#region Utility Methods
  get checklistRows(): ReservationTurnoverEventDisplay[] {
    return this.snapshot.reservationTurnoverDepartureRows;
  }

  get checklistColumns(): ColumnSet {
    return this.snapshot.reservationTurnoverDepartureColumns;
  }

  get maintenanceRows(): MaintenanceListDisplay[] {
    return this.snapshot.departureMaintenanceDisplay;
  }

  get maintenanceColumns(): ColumnSet {
    return this.snapshot.departureMaintenanceColumns;
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
    this.companyDataService.onReservationCheckboxChange(row, 'departure');
  }

  onChecklistDropdownChange(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationDropdownChange(row, 'departure');
  }

  onChecklistCheckAll(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationCheckAllTracking(row, 'departure');
  }

  onChecklistClearTracking(row: ReservationTurnoverEventDisplay): void {
    this.companyDataService.onReservationClearTracking(row, 'departure');
  }

  goToProperty(event: { propertyId: string }): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
    }
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
