import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MonthlyCommissionDisplay } from '../models/dashboard-model';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-commissions',
  templateUrl: './dashboard-commissions.component.html',
  styleUrl: './dashboard-commissions.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardCommissionsComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  commissionRows: MonthlyCommissionDisplay[] = [];

  //#region Dashboard-Commissions
  ngOnInit(): void {
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.commissionRows = snapshot.monthlyCommissionRows || [];
      this.cdr.markForCheck();
    });
  }
  //#endregion

  //#region Utility Methods
  get commissionColumns(): ColumnSet {
    return this.snapshot.monthlyCommissionColumns || {};
  }

  get titleLabel(): string {
    const agentCode = (this.snapshot.currentUserAgentCode || '').trim();
    if (agentCode && agentCode.toUpperCase() !== 'ALL') {
      return `Monthly Commissions - ${agentCode}`;
    }
    return 'Monthly Commissions';
  }

  get showMissingAgentMessage(): boolean {
    return !this.snapshot.isAdmin && !this.snapshot.currentUserAgentId;
  }

  goToReservation(event: MonthlyCommissionDisplay): void {
    if (!event?.reservationId) {
      if (event?.propertyId) {
        this.goToProperty(event);
      }
      return;
    }
    const url = RouterUrl.replaceTokens(RouterUrl.Reservation, [event.reservationId]);
    const queryParams: Record<string, string> = {};
    if (event.propertyId) {
      queryParams['propertyId'] = event.propertyId;
    }
    this.router.navigate(['/' + url], { queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined });
  }

  goToProperty(event: { propertyId: string }): void {
    if (event?.propertyId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
    }
  }

  goToContact(event: MonthlyCommissionDisplay): void {
    if (event?.contactId) {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId])],
        { queryParams: { returnUrl: this.router.url } }
      );
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
