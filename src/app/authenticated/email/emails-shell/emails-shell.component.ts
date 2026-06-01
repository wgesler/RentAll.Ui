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
  @ViewChild('emailsTabList') emailsTabList?: EmailListComponent;
  @ViewChild('alertsTabList') alertsTabList?: AlertListComponent;

  selectedTabIndex = 0;
  selectedAlertId: string | null = null;
  selectedAlertResponse: AlertResponse | null = null;
  selectedOfficeId: number | null = null;
  selectedPropertyId: string | null = null;
  selectedReservationId: string | null = null;
  selectedReservationSummary: ReservationCodeResponse | null = null;

  startDate: Date | null = null;
  endDate: Date | null = null;
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
    this.setDefaultDateRange();
    this.syncEmailSearchDateRange();
    this.syncAlertSearchDateRange();
  }

  //#region Emails-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();

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
    this.reloadActiveTabList();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    this.selectedPropertyId = value == null || value === '' ? null : String(value);
    this.refreshReservationOptions();
    this.reloadActiveTabList();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.selectedReservationSummary = this.reservations.find(r => r.reservationId === this.selectedReservationId) || null;
    this.selectedPropertyId = this.selectedReservationSummary?.propertyId ?? this.selectedPropertyId;
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

  get selectedEmailTypeId(): number | null {
    return this.emailsTabList?.selectedEmailTypeId ?? null;
  }

  onEmailTypeDropdownChange(value: string | number | null): void {
    this.emailsTabList?.onEmailTypeDropdownChange(value);
  }

  onDateRangeChange(): void {
    this.normalizeDateRangeValues();
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
    let officeIdToUse = this.selectedOfficeId;
    if (officeIdToUse != null && !this.offices.some(o => o.officeId === officeIdToUse)) {
      officeIdToUse = null;
    }
    if (this.offices.length === 1) {
      officeIdToUse = this.offices[0].officeId;
    }
    this.selectedOfficeId = officeIdToUse;
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 0) {
      this.selectedOfficeId = officeId;
      return;
    }
    this.showOfficeDropdown = this.offices.length > 1;
    if (this.offices.length === 1) {
      this.selectedOfficeId = this.offices[0].officeId;
      return;
    }
    const resolved = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.selectedOfficeId = resolved != null && this.offices.some(o => o.officeId === resolved) ? resolved : null;
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
    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
      this.syncEmailSearchDateRange();
      this.syncAlertSearchDateRange();
    }
  }

  normalizeDateRangeValues(): void {
    if (!this.startDate && !this.endDate) {
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
