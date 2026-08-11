import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { JwtUser } from '../../../public/login/models/jwt';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';
import { MonthlyCommissionDisplay, MonthlyCommissionTileRow } from '../models/dashboard-model';
import { DashboardCompanyDataService, DashboardOfficeOption } from '../services/dashboard-company-data.service';
import { DashboardArrivalsComponent } from '../dashboard-arrivals/dashboard-arrivals.component';
import { DashboardCalendarsComponent } from '../dashboard-calendars/dashboard-calendars.component';
import { DashboardCommissionsComponent } from '../dashboard-commissions/dashboard-commissions.component';
import { DashboardCompanyDataComponent } from '../dashboard-company-data/dashboard-company-data.component';
import { DashboardDeparturesComponent } from '../dashboard-departures/dashboard-departures.component';
import { DashboardInProcessComponent } from '../dashboard-in-process/dashboard-in-process.component';
import { DashboardOfflineComponent } from '../dashboard-offline/dashboard-offline.component';
import { DashboardOnlineComponent } from '../dashboard-online/dashboard-online.component';
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
    DashboardCommissionsComponent
  ]
})
export class DashboardShellComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private formatterService = inject(FormatterService);
  private companyDataService = inject(DashboardCompanyDataService);
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
      this.markViewForCheck();
    });

    this.companyDataService.calendarFocus$.pipe(takeUntil(this.destroy$)).subscribe(focus => {
      if (!focus) {
        return;
      }
      // Always apply so Material tab selection stays in sync with calendar focus.
      this.selectedTabIndex = focus.tabIndex;
      this.markViewForCheck();
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
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
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
