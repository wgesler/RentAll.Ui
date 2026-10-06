import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceItemListResponse } from '../../maintenance/models/maintenance-item.model';
import { MaintenanceItemsService } from '../../maintenance/services/maintenance-items.service';
import { JwtUser } from '../../../public/login/models/jwt';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { MonthlyCommissionDisplay, MonthlyCommissionTileRow } from '../models/dashboard-model';
import { DashboardCompanyDataService, DashboardOfficeOption } from '../services/dashboard-company-data.service';
import { DashboardNavigationService } from '../services/dashboard-navigation.service';
import { DashboardArrivalsComponent } from '../dashboard-arrivals/dashboard-arrivals.component';
import { DashboardCalendarsComponent } from '../dashboard-calendars/dashboard-calendars.component';
import { DashboardCommissionsComponent } from '../dashboard-commissions/dashboard-commissions.component';
import { DashboardSchedulesComponent } from '../dashboard-schedules/dashboard-schedules.component';
import { DashboardCompanyDataComponent } from '../dashboard-company-data/dashboard-company-data.component';
import { DashboardDeparturesComponent } from '../dashboard-departures/dashboard-departures.component';
import { DashboardInProcessComponent } from '../dashboard-in-process/dashboard-in-process.component';
import { DashboardOfflineComponent } from '../dashboard-offline/dashboard-offline.component';
import { DashboardOnlineComponent } from '../dashboard-online/dashboard-online.component';
import { DashboardMaintenanceComponent } from '../dashboard-maintenance/dashboard-maintenance.component';
import { DashboardVacantComponent } from '../dashboard-vacant/dashboard-vacant.component';

@Component({
  standalone: true,
  selector: 'app-dashboard-shell',
  templateUrl: './dashboard-shell.component.html',
  styleUrl: './dashboard-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MaterialModule,
    TitleBarSelectComponent,
    DashboardCompanyDataComponent,
    DashboardArrivalsComponent,
    DashboardDeparturesComponent,
    DashboardOnlineComponent,
    DashboardOfflineComponent,
    DashboardCalendarsComponent,
    DashboardInProcessComponent,
    DashboardVacantComponent,
    DashboardMaintenanceComponent,
    DashboardSchedulesComponent,
    DashboardCommissionsComponent
  ]
})
export class DashboardShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private formatterService = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private maintenanceItemsService = inject(MaintenanceItemsService);
  private companyDataService = inject(DashboardCompanyDataService);
  private dashboardNavigation = inject(DashboardNavigationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  selectedTabIndex = 0;
  canViewCommissions = false;
  canViewAllCommissions = false;
  isPageReady = false;

  user: JwtUser | null = null;
  profilePictureUrl: string | null = null;
  todayDate = '';
  titleBarOffices: DashboardOfficeOption[] = [];
  titleBarSelectedOfficeId: number | null = null;
  titleBarShowOfficeDropdown = false;
  todayArriveDepartCount = 0;
  tomorrowArriveDepartCount = 0;
  onlineOfflineTodayCount = 0;
  onlineOfflineTomorrowCount = 0;
  rentedCount = 0;
  vacantCount = 0;
  maintenanceRedCount = 0;
  maintenanceYellowCount = 0;
  maintenanceCountsReady = false;
  maintenanceItems: MaintenanceItemListResponse[] = [];
  currentUserAgentCode: string | null = null;
  monthlyCommissions: MonthlyCommissionDisplay[] = [];
  showMonthlyCommissionAmount = false;
  showCommissionBreakdown = false;

  //#region Dashboard-Shell
  ngOnInit(): void {
    this.setTodayDate();
    this.user = this.authService.getUser();
    this.canViewCommissions = this.authService.canViewCommissions();
    this.canViewAllCommissions = this.authService.isInAccounting();
    this.loadCurrentUser(this.user?.userId ?? '');
    this.loadMaintenanceCounts();
    this.maintenanceItemsService.itemUpdated$.pipe(takeUntil(this.destroy$)).subscribe(updated => {
      const match = this.maintenanceItems.find(item => item.maintenanceItemId === updated.maintenanceItemId);
      if (!match) {
        return;
      }
      match.monthsBetweenService = updated.monthsBetweenService;
      this.rebuildMaintenanceCounts();
      this.markViewForCheck();
    });

    const tabParam = Number(this.route.snapshot.queryParamMap.get('tab'));
    if (Number.isFinite(tabParam)) {
      this.selectedTabIndex = this.clampTabIndex(tabParam);
      this.dashboardNavigation.setTabIndex(this.selectedTabIndex);
    } else {
      this.dashboardNavigation.setTabIndex(this.selectedTabIndex);
    }

    const keepIncludeGreen = this.dashboardNavigation.consumeMaintenanceIncludeGreenForReturn()
      && this.selectedTabIndex === 6;
    if (!keepIncludeGreen) {
      this.dashboardNavigation.resetMaintenanceIncludeGreen();
    }

    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.todayArriveDepartCount = snapshot.todayArriveDepartCount;
      this.tomorrowArriveDepartCount = snapshot.tomorrowArriveDepartCount;
      this.onlineOfflineTodayCount = snapshot.onlineOfflineTodayCount;
      this.onlineOfflineTomorrowCount = snapshot.onlineOfflineTomorrowCount;
      this.rentedCount = snapshot.rentedCount;
      this.vacantCount = snapshot.vacantCount;
      this.titleBarOffices = snapshot.offices || [];
      this.titleBarSelectedOfficeId = snapshot.selectedOfficeId ?? null;
      this.titleBarShowOfficeDropdown = snapshot.showOfficeDropdown === true;
      this.canViewCommissions = snapshot.canViewCommissions;
      this.canViewAllCommissions = snapshot.canViewAllCommissions;
      this.currentUserAgentCode = snapshot.currentUserAgentCode;
      this.monthlyCommissions = snapshot.monthlyCommissionRows || [];
      this.isPageReady = snapshot.isReady;
      this.rebuildMaintenanceCounts();
      this.markViewForCheck();
    });

    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(focus => {
      if (!focus) {
        return;
      }
      // Always apply so Material tab selection stays in sync with calendar focus.
      this.selectedTabIndex = this.clampTabIndex(focus.tabIndex);
      this.syncDashboardTabToUrl(this.selectedTabIndex);
      this.markViewForCheck();
    });
  }

  clampTabIndex(tabIndex: number): number {
    const maxTabIndex = this.canViewCommissions ? 9 : 8;
    return Math.max(0, Math.min(maxTabIndex, Math.floor(tabIndex)));
  }

  syncDashboardTabToUrl(tabIndex: number): void {
    const clamped = this.clampTabIndex(tabIndex);
    if (clamped !== 6) {
      this.dashboardNavigation.resetMaintenanceIncludeGreen();
    }
    this.selectedTabIndex = clamped;
    this.dashboardNavigation.setTabIndex(clamped);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: clamped },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.syncDashboardTabToUrl(tabIndex);
  }

  get titleBarOfficeOptions(): { value: number; label: string }[] {
    return (this.titleBarOffices || []).map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  onTitleBarOfficeChange(value: string | number | null): void {
    if (value == null || value === '') {
      this.companyDataService.setPageOfficeId(null);
      return;
    }
    const officeId = Number(value);
    this.companyDataService.setPageOfficeId(Number.isFinite(officeId) ? officeId : null);
  }

  get showCommissionsUi(): boolean {
    return this.canViewCommissions;
  }

  getOnlineOfflineTodayCount(): number {
    return this.onlineOfflineTodayCount;
  }

  getOnlineOfflineTomorrowCount(): number {
    return this.onlineOfflineTomorrowCount;
  }

  loadMaintenanceCounts(): void {
    this.maintenanceItemsService.getMaintenanceItems().pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.maintenanceItems = items || [];
        this.maintenanceCountsReady = true;
        this.rebuildMaintenanceCounts();
        this.markViewForCheck();
      },
      error: () => {
        this.maintenanceItems = [];
        this.maintenanceCountsReady = true;
        this.rebuildMaintenanceCounts();
        this.markViewForCheck();
      }
    });
  }

  rebuildMaintenanceCounts(): void {
    let red = 0;
    let yellow = 0;
    const officeId = this.titleBarSelectedOfficeId;
    for (const item of this.maintenanceItems) {
      if (officeId != null && item.officeId !== officeId) {
        continue;
      }
      const status = this.getMaintenanceServiceStatus(item);
      if (status === 'red') {
        red += 1;
      } else if (status === 'yellow') {
        yellow += 1;
      }
    }
    this.maintenanceRedCount = red;
    this.maintenanceYellowCount = yellow;
  }

  getMaintenanceServiceStatus(item: MaintenanceItemListResponse): 'red' | 'yellow' | 'green' | null {
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

  addMonths(date: Date, months: number): Date {
    const result = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(date.getDate(), lastDay));
    return result;
  }

  startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  //#endregion

  //#region Titlebar Methods
  setTodayDate(): void {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    this.todayDate = new Date().toLocaleDateString('en-US', options);
  }

  getFullName(): string {
    if (!this.user) {
      return '';
    }
    return `${this.user.firstName} ${this.user.lastName}`.trim();
  }

  applyUserProfilePicture(userResponse: UserResponse): void {
    if (userResponse.fileDetails?.file) {
      const contentType = userResponse.fileDetails.contentType || 'image/png';
      this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
      return;
    }
    this.profilePictureUrl = userResponse.profilePath || null;
  }

  loadCurrentUser(userId: string | undefined): void {
    if (!userId?.trim()) {
      this.markViewForCheck();
      return;
    }

    this.userService.getUserByGuid(userId).pipe(
      take(1),
      finalize(() => this.markViewForCheck())
    ).subscribe({
      next: (userResponse: UserResponse) => {
        this.applyUserProfilePicture(userResponse);
        const firstName = (userResponse.firstName || '').trim();
        const lastName = (userResponse.lastName || '').trim();
        if (this.user) {
          if (firstName) {
            this.user.firstName = firstName;
          }
          if (lastName) {
            this.user.lastName = lastName;
          }
        }
      },
      error: () => {
        this.profilePictureUrl = null;
      }
    });
  }

  @HostListener('document:mouseup')
  onDocumentMouseup(): void {
    setTimeout(() => {
      this.endCommissionPreview();
      this.markViewForCheck();
    });
  }

  @HostListener('document:touchend')
  onDocumentTouchend(): void {
    setTimeout(() => {
      this.endCommissionPreview();
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Commissions Titlebar
  getMonthlyCommissionTotal(): number {
    return this.monthlyCommissions.reduce((total, reservation) => total + (reservation.commission || 0), 0);
  }

  getCurrentMonthDisplay(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' });
  }

  getMonthlyCommissionTileRows(): MonthlyCommissionTileRow[] {
    const totalsByAgent = new Map<string, number>();
    this.monthlyCommissions.forEach(reservation => {
      const code = (reservation.agentCode || '').trim() || 'No Agent';
      totalsByAgent.set(code, (totalsByAgent.get(code) || 0) + (reservation.commission || 0));
    });

    return Array.from(totalsByAgent.entries())
      .map(([agentCode, amount]) => ({ agentCode, amount }))
      .sort((a, b) => a.agentCode.localeCompare(b.agentCode));
  }

  getCommissionAmountDisplay(amount: number): string {
    if (amount > 0 && !this.showMonthlyCommissionAmount) {
      return '$******';
    }
    return this.formatUsd(amount);
  }

  formatUsd(amount: number): string {
    return this.formatterService.currencyUsd(amount);
  }

  onCommissionPreviewMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (!this.showCommissionsUi || !this.canViewAllCommissions || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    event.preventDefault();
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  onCommissionPreviewTouchStart(event: TouchEvent): void {
    void event;
    if (!this.showCommissionsUi || !this.canViewAllCommissions || this.getMonthlyCommissionTotal() <= 0) {
      return;
    }
    this.showMonthlyCommissionAmount = true;
    this.showCommissionBreakdown = true;
  }

  endCommissionPreview(): void {
    this.showMonthlyCommissionAmount = false;
    this.showCommissionBreakdown = false;
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (!this.dashboardNavigation.isMaintenanceIncludeGreenMarkedForReturn()) {
      this.dashboardNavigation.resetMaintenanceIncludeGreen();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
