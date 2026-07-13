import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { skip, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { getStringQueryParam } from '../../shared/query-param.utils';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { AlertComponent } from '../alert/alert.component';
import { EmailListComponent } from '../email-list/email-list.component';
import { AlertListComponent } from '../alert-list/alert-list.component';
import { AlertResponse } from '../models/alert.model';

@Component({
  standalone: true,
  selector: 'app-emails-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TitleBarSelectComponent,
    EmailListComponent,
    AlertListComponent,
    AlertComponent
  ],
  templateUrl: './emails-shell.component.html',
  styleUrl: './emails-shell.component.scss'
})
export class EmailsShellComponent implements OnInit, OnDestroy {
  private readonly clearPinsEventName = 'rentall-clear-pins';
  private readonly pinnedDateRangeStorageKeyPrefix = 'rentall-emails-shell-pinned-dates';

  @ViewChild('emailsTabList') emailsTabList?: EmailListComponent;
  @ViewChild('alertsTabList') alertsTabList?: AlertListComponent;

  selectedTabIndex = 0;
  selectedAlertId: string | null = null;
  selectedAlertResponse: AlertResponse | null = null;
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  selectedEmailTypeId: number | null = null;
  selectedReservationSummary: ReservationCodeResponse | null = null;

  startDate: Date | null = null;
  endDate: Date | null = null;
  dateRangePinned = false;
  emailSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
  alertSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };

  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;
  properties: PropertyCodeResponse[] = [];
  availableProperties: SearchableSelectOption[] = [];
  reservations: ReservationCodeResponse[] = [];
  availableReservations: SearchableSelectOption[] = [];

  organizationId = '';
  destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private propertyService: PropertyService,
    private reservationService: ReservationService
  ) {
    // Before child lists bind @Input date range — ngOnInit is too late (first search can omit dates).
    this.applyPinnedDateRangeFromStorage();
    this.syncEmailSearchDateRange();
    this.syncAlertSearchDateRange();
  }

  //#region Emails-Shell
  ngOnInit(): void {
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangePinned,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      this.applyQueryParamState(queryParams);
      const tab = String(queryParams['tab'] || '').trim().toLowerCase();
      const nextIndex = tab === 'alerts' ? 1 : 0;
      if (this.selectedTabIndex !== nextIndex) {
        this.selectedTabIndex = nextIndex;
        if (nextIndex !== 1) {
          this.selectedAlertId = null;
          this.selectedAlertResponse = null;
        }
        this.reloadActiveTabList();
      }
    });

    this.loadOffices();
    this.loadPropertyCodes();
    this.loadReservationCodes();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
      this.refreshPropertyOptions();
      this.refreshReservationOptions();
      queueMicrotask(() => {
        this.emailsTabList?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
        this.alertsTabList?.onTitleBarOfficeIdUpdate(this.selectedOfficeId);
      });
      this.reloadActiveTabList();
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.refreshPropertyOptions();
    this.refreshReservationOptions();
    this.persistPinnedTopBarIfActive();
    this.reloadActiveTabList();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    this.selectedPropertyId = value == null || value === '' ? null : String(value);
    this.refreshReservationOptions();
    this.persistPinnedTopBarIfActive();
    this.reloadActiveTabList();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.selectedReservationSummary = this.reservations.find(r => r.reservationId === this.selectedReservationId) || null;
    this.selectedPropertyId = this.selectedReservationSummary?.propertyId ?? this.selectedPropertyId;
    this.persistPinnedTopBarIfActive();
    this.reloadActiveTabList();
  }

  onTabIndexChange(nextTabIndex: number): void {
    this.selectedTabIndex = nextTabIndex;
    if (nextTabIndex !== 1) {
      this.selectedAlertId = null;
      this.selectedAlertResponse = null;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: nextTabIndex === 1 ? 'alerts' : null },
      queryParamsHandling: 'merge'
    });
    this.reloadActiveTabList();
  }

  onAlertEdit(alertId: string): void {
    this.selectedAlertId = alertId;
  }

  onAlertSelected(alert: AlertResponse | null): void {
    this.selectedAlertResponse = alert;
  }

  onAlertBack(): void {
    this.selectedTabIndex = 1;
    this.selectedAlertId = null;
    this.selectedAlertResponse = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'alerts' },
      queryParamsHandling: 'merge'
    });
    this.alertsTabList?.reload();
  }

  onAlertSaved(): void {
    this.selectedTabIndex = 1;
    this.selectedAlertId = null;
    this.selectedAlertResponse = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'alerts' },
      queryParamsHandling: 'merge'
    });
    this.alertsTabList?.reload();
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get reservationOptions(): SearchableSelectOption[] {
    return this.availableReservations;
  }

  get emailTypeOptions(): SearchableSelectOption[] {
    return (this.emailsTabList?.emailTypeOptions || []).map(option => ({
      value: option.value,
      label: option.label
    }));
  }

  onEmailTypeDropdownChange(value: string | number | null): void {
    this.selectedEmailTypeId = value == null || value === '' ? null : Number(value);
    this.emailsTabList?.onEmailTypeDropdownChange(value);
    this.persistPinnedTopBarIfActive();
    this.reloadActiveTabList();
  }

  private persistPinnedTopBarIfActive(): void {
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
  }

  onDateRangeChange(): void {
    this.normalizeDateRangeValues();
    this.persistPinnedTopBarIfActive();
    this.syncEmailSearchDateRange();
    this.syncAlertSearchDateRange();
    this.reloadActiveTabList();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
  }

  get propertyOptions(): SearchableSelectOption[] {
    return this.availableProperties;
  }

  get selectedPropertyCode(): string {
    const selectedProperty = this.properties.find(property => property.propertyId === this.selectedPropertyId) || null;
    if (selectedProperty?.propertyCode) {
      return selectedProperty.propertyCode;
    }
    return this.selectedReservationSummary?.propertyCode || 'Code';
  }

  get shellIcon(): string {
    if (this.selectedTabIndex === 1) {
      return 'notifications';
    }
    return 'mail';
  }

  get shellTitle(): string {
    if (this.selectedTabIndex === 1) {
      if (this.selectedAlertId === 'new') {
        return 'Add Alert';
      }
      if (this.selectedAlertId) {
        return 'Edit Alert';
      }
      return 'Alerts';
    }
    return 'Emails';
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.applyShellOfficeScope();
          this.refreshPropertyOptions();
          this.refreshReservationOptions();
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.selectedOfficeId = null;
        this.refreshPropertyOptions();
        this.refreshReservationOptions();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.getPropertyCodes().pipe(take(1)).subscribe({
      next: properties => {
        this.properties = properties || [];
        this.refreshPropertyOptions();
      },
      error: () => {
        this.properties = [];
        this.availableProperties = [];
        this.selectedPropertyId = null;
      }
    });
  }

  loadReservationCodes(): void {
    this.reservationService.getReservationCodes().pipe(take(1)).subscribe({
      next: reservations => {
        this.reservations = reservations || [];
        this.refreshReservationOptions();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
        this.selectedReservationId = null;
        this.selectedReservationSummary = null;
      }
    });
  }
  //#endregion

  //#region Utility Methods
  applyShellOfficeScope(): void {
    this.showOfficeDropdown = this.offices.length > 1;
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangePinned,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices
    });
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    this.showOfficeDropdown = this.offices.length > 1;
    this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangePinned,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    });
  }

  refreshReservationOptions(): void {
    const officeFilteredReservations = this.selectedOfficeId == null
      ? this.reservations
      : this.reservations.filter(reservation => reservation.officeId === this.selectedOfficeId);
    const filteredReservations = this.selectedPropertyId == null
      ? officeFilteredReservations
      : officeFilteredReservations.filter(reservation => reservation.propertyId === this.selectedPropertyId);
    this.availableReservations = filteredReservations.map(reservation => ({
      value: reservation.reservationId,
      label: this.utilityService.getReservationDropdownLabel(reservation, null)
    }));

    if (this.selectedReservationId && !filteredReservations.some(reservation => reservation.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
    }
    this.selectedReservationSummary = this.reservations.find(r => r.reservationId === this.selectedReservationId) || null;
  }

  refreshPropertyOptions(): void {
    const filteredProperties = this.selectedOfficeId == null
      ? this.properties
      : this.properties.filter(property => property.officeId === this.selectedOfficeId);
    this.availableProperties = filteredProperties.map(property => ({
      value: property.propertyId,
      label: property.propertyCode
    }));
    if (this.selectedPropertyId && !filteredProperties.some(property => property.propertyId === this.selectedPropertyId)) {
      this.selectedPropertyId = null;
    }
  }

  reloadActiveTabList(): void {
    if (this.selectedTabIndex === 0) {
      this.emailsTabList?.reload();
      return;
    }
    if (this.selectedTabIndex === 1) {
      this.alertsTabList?.reload();
    }
  }

  setDefaultDateRange(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    this.endDate = end;
    this.startDate = start;
  }

  syncEmailSearchDateRange(): void {
    this.emailSearchDateRange = {
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  syncAlertSearchDateRange(): void {
    this.alertSearchDateRange = {
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  applyQueryParamState(params: Record<string, unknown>): void {
    const startDateParam = getStringQueryParam(params, 'startDate');
    const endDateParam = getStringQueryParam(params, 'endDate');
    if (startDateParam || endDateParam) {
      this.startDate = this.utilityService.parseDateOnlyStringToDate(startDateParam);
      this.endDate = this.utilityService.parseDateOnlyStringToDate(endDateParam);
      this.normalizeDateRangeValues();
      this.syncEmailSearchDateRange();
      this.syncAlertSearchDateRange();
      return;
    }
    if (!this.startDate && !this.endDate && !this.dateRangePinned) {
      this.setDefaultDateRange();
      this.syncEmailSearchDateRange();
      this.syncAlertSearchDateRange();
    }
  }

  normalizeDateRangeValues(): void {
    if (!this.startDate && !this.endDate && !this.dateRangePinned) {
      this.setDefaultDateRange();
      return;
    }
    if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }

    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }
  }

  buildShellQueryParams(overrides: Record<string, string | null> = {}): Record<string, string | null> {
    return {
      tab: this.selectedTabIndex === 1 ? 'alerts' : null,
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate),
      ...overrides
    };
  }

  //#region Pinned Date Range
  toggleDateRangePin(): void {
    this.dateRangePinned = !this.dateRangePinned;
    if (this.dateRangePinned) {
      this.onDateRangeChange();
      this.persistPinnedDateRange();
      return;
    }
    this.clearPinnedDateRangeStorage();
    this.setDefaultDateRange();
    this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
    this.selectedEmailTypeId = null;
    this.refreshPropertyOptions();
    this.refreshReservationOptions();
    this.onDateRangeChange();
  }

  applyPinnedDateRangeFromStorage(): void {
    const stored = this.readPinnedDateRangeFromStorage();
    if (stored?.enabled && stored.startDate && stored.endDate) {
      const start = this.utilityService.parseCalendarDateInput(stored.startDate);
      const end = this.utilityService.parseCalendarDateInput(stored.endDate);
      if (start && end) {
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        this.dateRangePinned = true;
        this.startDate = start;
        this.endDate = end;
        this.selectedOfficeId = stored.officeId ?? null;
        this.selectedPropertyId = stored.propertyId ?? null;
        this.selectedReservationId = stored.reservationId ?? null;
        this.selectedEmailTypeId = stored.emailTypeId ?? null;
        return;
      }
      this.clearPinnedDateRangeStorage();
    }

    this.dateRangePinned = false;
    this.setDefaultDateRange();
  }

  persistPinnedDateRange(): void {
    if (!this.dateRangePinned || !this.startDate || !this.endDate) {
      return;
    }

    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    if (!startDate || !endDate) {
      return;
    }

    localStorage.setItem(this.getPinnedDateRangeStorageKey(), JSON.stringify({
      enabled: true,
      startDate,
      endDate,
      officeId: this.selectedOfficeId,
      propertyId: this.selectedPropertyId,
      reservationId: this.selectedReservationId,
      emailTypeId: this.selectedEmailTypeId
    }));
  }

  readPinnedDateRangeFromStorage(): { enabled: boolean; startDate: string; endDate: string; officeId: number | null; propertyId: string | null; reservationId: string | null; emailTypeId: number | null } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(this.getPinnedDateRangeStorageKey());
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean; startDate?: string; endDate?: string; officeId?: number | null; propertyId?: string | null; reservationId?: string | null; emailTypeId?: number | null };
      if (parsed?.enabled !== true || !parsed.startDate || !parsed.endDate) {
        return null;
      }
      const officeId = parsed.officeId == null || parsed.officeId === undefined ? null : Number(parsed.officeId);
      const emailTypeId = parsed.emailTypeId == null || parsed.emailTypeId === undefined ? null : Number(parsed.emailTypeId);
      return {
        enabled: true,
        startDate: String(parsed.startDate),
        endDate: String(parsed.endDate),
        officeId: Number.isFinite(officeId) && officeId > 0 ? officeId : null,
        propertyId: parsed.propertyId == null || parsed.propertyId === '' ? null : String(parsed.propertyId),
        reservationId: parsed.reservationId == null || parsed.reservationId === '' ? null : String(parsed.reservationId),
        emailTypeId: Number.isFinite(emailTypeId) && emailTypeId > 0 ? emailTypeId : null
      };
    } catch {
      return null;
    }
  }

  clearPinnedDateRangeStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getPinnedDateRangeStorageKey());
  }

  getPinnedDateRangeStorageKey(): string {
    const userKey = this.authService.getUser()?.userId?.trim() || 'anonymous';
    return `${this.pinnedDateRangeStorageKeyPrefix}-${userKey}`;
  }

  onClearPins = (): void => {
    if (!this.dateRangePinned) {
      return;
    }
    this.dateRangePinned = false;
    this.clearPinnedDateRangeStorage();
    this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
    this.refreshPropertyOptions();
    this.refreshReservationOptions();
  };
  //#endregion

  ngOnDestroy(): void {
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
