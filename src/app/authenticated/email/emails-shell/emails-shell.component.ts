import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { skip, Subscription, take } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
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
  selectedReservationSummary: ReservationListResponse | null = null;

  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;
  properties: PropertyListResponse[] = [];
  availableProperties: SearchableSelectOption[] = [];
  reservations: ReservationListResponse[] = [];
  availableReservations: SearchableSelectOption[] = [];

  organizationId = '';
  preferredOfficeId: number | null = null;
  globalOfficeSubscription?: Subscription;
  queryParamsSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private utilityService: UtilityService
  ) {}

  //#region Emails-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;

    this.queryParamsSubscription = this.route.queryParams.subscribe(queryParams => {
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
    this.loadProperties();
    this.loadReservations();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.showOfficeDropdown) {
        this.selectedOfficeId = officeId;
        this.refreshPropertyOptions();
        this.refreshReservationOptions();
        this.reloadActiveTabList();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
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
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.loadProperties();
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: null, useGlobalSelection: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.selectedOfficeId = uiState.selectedOfficeId;
            this.refreshPropertyOptions();
            this.refreshReservationOptions();
          }
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

  loadProperties(): void {
    const officeIds = this.officeService.getAllOfficesValue().map(office => office.officeId);
    this.propertyService.getActivePropertyList().pipe(take(1)).subscribe({
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

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
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

  ngOnDestroy(): void {
    this.globalOfficeSubscription?.unsubscribe();
    this.queryParamsSubscription?.unsubscribe();
  }
  //#endregion
}
