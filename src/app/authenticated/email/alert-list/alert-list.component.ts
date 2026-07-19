import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { skip, BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { AlertGetRequest, AlertListDisplay, AlertRequest, AlertResponse } from '../models/alert.model';
import { AlertService } from '../services/alert.service';

@Component({
  selector: 'app-alert-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, TitleBarSelectComponent, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './alert-list.component.html',
  styleUrl: './alert-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AlertListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() hideHeader = false;
  @Input() hideFilters = false;
  @Input() source: 'property' | 'reservation' | 'alerts' | null = null;
  @Input() propertyId?: string | null;
  @Input() propertyCode: string | null = null;
  @Input() organizationId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() reservationId: string | null = null;
  @Input() alertSearchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() reservations: ReservationCodeResponse[] = [];
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
  @Output() alertEdit = new EventEmitter<string>();
  @Output() alertSelected = new EventEmitter<AlertResponse | null>();
  private alertService = inject(AlertService);
  private router = inject(Router);
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private reservationService = inject(ReservationService);
  private utilityService = inject(UtilityService);
  private authService = inject(AuthService);
  private contactService = inject(ContactService);
  private toastr = inject(ToastrService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);

  alerts: AlertListDisplay[] = [];
  allAlerts: AlertListDisplay[] = [];
  alertsById = new Map<string, AlertResponse>();
  isPageReady = false;
  isServiceError = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['alerts']));
  showInactive = false;

  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  availableReservations: { value: ReservationCodeResponse; label: string }[] = [];
  selectedReservationId: string | null = null;
  showOfficeDropdown = false;
  destroy$ = new Subject<void>();
  contacts: ContactResponse[] = [];

  /** Standalone /alerts route: dates owned here; emails-shell passes alertSearchDateRange instead. */
  standaloneStartDate: Date | null = null;
  standaloneEndDate: Date | null = null;
  standaloneAlertSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };

  alertsDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    subject: { displayAs: 'Subject', maxWidth: '20ch' },
    toEmail: { displayAs: 'To Email', maxWidth: '24ch' },
    startDate: { displayAs: 'Start Date', maxWidth: '15ch', alignment: 'center' },
    nextAlertDate: { displayAs: 'Next Alert', maxWidth: '15ch', alignment: 'center' },
    frequencyLabel: { displayAs: 'Frequency', maxWidth: '20ch', alignment: 'center' },
    lastNotifiedDate: { displayAs: 'Last Notified', maxWidth: '15ch', alignment: 'center' },
    createdOn: { displayAs: 'Created', maxWidth: '15ch', alignment: 'center' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  constructor() {
    this.initStandaloneAlertDateRange();
  }

  //#region Alert-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.organizationId = this.organizationId || this.authService.getUser()?.organizationId?.trim() || null;
    if (!this.source) {
      this.source = 'alerts';
    }
    if (this.officeId !== null && this.officeId !== undefined) {
      this.selectedOfficeId = this.officeId;
    } else if (this.source === 'alerts') {
      this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
    }
    if (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') {
      this.selectedReservationId = this.reservationId;
    }

    this.loadContacts();
    this.loadOffices();
    if (this.source !== 'alerts') {
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
        if (this.offices.length > 0 && (this.officeId === null || this.officeId === undefined)) {
          this.resolveOfficeScope(officeId, true);
        }
        this.markViewForCheck();
      });
    }
    this.loadReservations();
    this.loadAlerts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservations'] && !changes['reservations'].firstChange) {
      this.applyReservationCodes();
      this.filterReservations();
      this.applyFilters();
    }
    if (changes['officeId']) {
      this.onTitleBarOfficeIdUpdate(changes['officeId'].currentValue);
    }
    if (changes['reservationId']) {
      this.selectedReservationId = changes['reservationId'].currentValue;
      if (this.usesServerSearchCriteria()) {
        this.refreshAlertsForCurrentScope();
        return;
      }
      this.applyFilters();
    }
    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      if (this.usesServerSearchCriteria()) {
        this.refreshAlertsForCurrentScope();
        return;
      }
      this.applyFilters();
    }

    if (this.source === 'alerts' && changes['alertSearchDateRange']) {
      const range = changes['alertSearchDateRange'].currentValue as { startDate: string | null; endDate: string | null } | null;
      if (range?.startDate && range?.endDate) {
        this.refreshAlertsForCurrentScope();
      }
    }
  }

  addAlert(): void {
    if (this.hideHeader) {
      this.alertEdit.emit('new');
      this.alertSelected.emit(null);
      return;
    }
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Alert, ['new']));
  }

  editAlert(alert: AlertListDisplay): void {
    if (this.hideHeader) {
      this.alertEdit.emit(alert.alertId);
      this.alertSelected.emit(this.alertsById.get(alert.alertId) || null);
      return;
    }
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Alert, [alert.alertId]));
  }

  deleteAlert(alert: AlertListDisplay): void {
    this.alertService.deleteAlert(alert.alertId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Alert deleted successfully', CommonMessage.Success);
        this.allAlerts = this.allAlerts.filter(item => item.alertId !== alert.alertId);
        this.alertsById.delete(alert.alertId);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => {
      this.markViewForCheck();
    })).subscribe({
      next: () => {
        this.contacts = this.contactService.getAllContactsValue() || [];
        this.filterReservations();
        this.markViewForCheck();
      },
      error: () => {
        this.contacts = [];
        this.markViewForCheck();
      }
    });
  }

  loadOffices(): void {
    if (this.source === 'alerts') {
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId || '').pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.allAlerts = this.mappingService.mapAlertOfficeNames(this.allAlerts, this.offices);
          this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, useGlobalSelection: true }).pipe(take(1)).subscribe({
            next: uiState => {
              this.showOfficeDropdown = uiState.showOfficeDropdown;
              this.resolveOfficeScope(uiState.selectedOfficeId, this.officeId === null || this.officeId === undefined);
              this.markViewForCheck();
            }
          });
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.resolveOfficeScope(null, false);
        this.markViewForCheck();
      }
    });
  }

  loadReservations(): void {
    this.reservationService.ensureReservationCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.reservationService.getAllReservationCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: reservations => {
            this.reservations = reservations || [];
            this.applyReservationCodes();
            this.filterReservations();
            this.applyFilters();
            this.markViewForCheck();
          },
          error: () => {
            this.reservations = [];
            this.availableReservations = [];
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
        this.markViewForCheck();
      }
    });
  }

  loadAlerts(): void {
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'alerts');
    this.alertService.getAlerts().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'alerts');
      this.markViewForCheck();
    })).subscribe({
      next: alerts => {
        const alertResponses = alerts || [];
        this.alertsById = new Map(alertResponses.map(alert => [alert.alertId, alert]));
        this.allAlerts = this.mappingService.mapAlertListDisplays(alertResponses);
        this.allAlerts = this.mappingService.mapAlertOfficeNames(this.allAlerts, this.offices);
        this.applyReservationCodes();
        this.applyFilters();
        this.isServiceError = false;
        this.markViewForCheck();
      },
      error: () => {
        this.allAlerts = [];
        this.alerts = [];
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  refreshAlertsForCurrentScope(): void {
    const range = this.getEffectiveAlertSearchDateRange();
    if (!range?.startDate || !range?.endDate) {
      return;
    }

    const officeIds = this.resolveOfficeIdsForSearch();
    if (officeIds.length === 0) {
      this.allAlerts = [];
      this.alerts = [];
      this.alertsById = new Map();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'alerts');
      this.markViewForCheck();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'alerts');
    this.alertService.searchAlerts(this.buildAlertSearchRequest(officeIds)).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'alerts');
      this.markViewForCheck();
    })).subscribe({
      next: alerts => {
        const alertResponses = alerts || [];
        this.alertsById = new Map(alertResponses.map(alert => [alert.alertId, alert]));
        this.allAlerts = this.mappingService.mapAlertListDisplays(alertResponses);
        this.allAlerts = this.mappingService.mapAlertOfficeNames(this.allAlerts, this.offices);
        this.applyReservationCodes();
        this.applyFilters();
        this.isServiceError = false;
        this.markViewForCheck();
      },
      error: () => {
        this.allAlerts = [];
        this.alerts = [];
        this.alertsById = new Map();
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onTitleBarOfficeIdUpdate(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.filterReservations();
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }
    this.applyFilters();
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.officeIdChange.emit(this.selectedOfficeId);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }
    this.applyFilters();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.reservationIdChange.emit(this.selectedReservationId);
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }
    this.applyFilters();
  }

  onStandaloneDateRangeChange(): void {
    this.normalizeStandaloneDateRangeValues();
    this.syncStandaloneAlertSearchDateRange();
    this.refreshAlertsForCurrentScope();
  }
  //#endregion

  //#region Filter Methods
  filterReservations(): void {
    if (this.source !== 'alerts' && this.source !== 'property' && this.source !== 'reservation') {
      this.availableReservations = [];
      return;
    }
    const officeFiltered = this.selectedOfficeId == null
      ? [...this.reservations]
      : this.reservations.filter(r => r.officeId === this.selectedOfficeId);
    const propertyFiltered = (this.source === 'property' || this.source === 'reservation') && this.propertyId
      ? officeFiltered.filter(r => r.propertyId === this.propertyId)
      : officeFiltered;
    this.availableReservations = propertyFiltered.map(reservation => ({
      value: reservation,
      label: this.utilityService.getReservationDropdownLabel(
        reservation,
        this.contacts.find(contact => contact.contactId === reservation.contactId) || null
      )
    }));
    if (this.selectedReservationId && !propertyFiltered.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }
  }
  
  applyFilters(): void {
    let filtered = [...this.allAlerts];
    filtered = this.showInactive
      ? filtered.filter(alert => alert.isActive === false)
      : filtered.filter(alert => alert.isActive === true);
    const serverSearch = this.usesServerSearchCriteria();
    if (!serverSearch) {
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        filtered = filtered.filter(alert => alert.officeId === String(this.selectedOfficeId));
      }
      if (this.selectedReservationId) {
        filtered = filtered.filter(alert => alert.reservationId === this.selectedReservationId);
      }
      if ((this.source === 'property' || this.source === 'reservation') && this.propertyId) {
        filtered = filtered.filter(alert => alert.propertyId === this.propertyId);
      }
    }
    this.alerts = filtered;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }
    this.applyFilters();
  }
   //#endregion

  //#region Search Methods
  get officeOptions(): { value: number; label: string }[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get reservationOptions(): { value: string; label: string }[] {
    return this.availableReservations.map(item => ({
      value: item.value.reservationId,
      label: item.label
    }));
  }

  applyReservationCodes(): void {
    if (!this.allAlerts.length || !this.reservations.length) {
      return;
    }
    const reservationCodeById = new Map<string, string>(
      this.reservations.map(reservation => [reservation.reservationId, reservation.reservationCode || ''])
    );
    this.allAlerts = this.allAlerts.map(alert => ({
      ...alert,
      reservationCode: alert.reservationCode || (alert.reservationId ? (reservationCodeById.get(alert.reservationId) || '') : '')
    }));
  }

  reload(): void {
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }
    this.loadAlerts();
  }

  onAlertCheckboxChange(event: AlertListDisplay): void {
    const changedCheckboxColumn = (event as unknown as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }
    const previousValue = (event as unknown as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as unknown as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyAlertIsActiveValue(event.alertId, nextValue);
    this.alertService.getAlertByGuid(event.alertId).pipe(take(1)).subscribe({
      next: alert => {
        const request: AlertRequest = {
          alertId: alert.alertId,
          organizationId: alert.organizationId,
          officeId: alert.officeId,
          propertyId: alert.propertyId ?? null,
          reservationId: alert.reservationId ?? null,
          ticketId: alert.ticketId ?? null,
          fromRecipient: alert.fromRecipient,
          toRecipients: alert.toRecipients || [],
          ccRecipients: alert.ccRecipients || [],
          bccRecipients: alert.bccRecipients || [],
          subject: alert.subject,
          plainTextContent: alert.plainTextContent,
          emailTypeId: alert.emailTypeId,
          startDate: alert.startDate,
          daysBeforeDeparture: alert.daysBeforeDeparture ?? null,
          frequencyId: alert.frequencyId,
          isActive: nextValue
        };
        this.alertService.updateAlert(request).pipe(take(1)).subscribe({
          next: updatedAlert => {
            this.alertsById.set(updatedAlert.alertId, updatedAlert);
            this.applyAlertIsActiveValue(updatedAlert.alertId, updatedAlert.isActive === true);
            this.applyFilters();
            this.toastr.success('Alert updated successfully', CommonMessage.Success);
            this.markViewForCheck();
          },
          error: () => {
            this.applyAlertIsActiveValue(event.alertId, previousValue);
            this.applyFilters();
            this.toastr.error('Failed to update alert', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.applyAlertIsActiveValue(event.alertId, previousValue);
        this.applyFilters();
        this.toastr.error('Failed to load alert for update', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  applyAlertIsActiveValue(alertId: string, isActive: boolean): void {
    const nextValue = !!isActive;
    this.allAlerts = this.allAlerts.map(alert =>
      alert.alertId === alertId
        ? { ...alert, isActive: nextValue }
        : alert
    );
    this.alerts = this.alerts.map(alert =>
      alert.alertId === alertId
        ? { ...alert, isActive: nextValue }
        : alert
    );
    const alertResponse = this.alertsById.get(alertId);
    if (alertResponse) {
      this.alertsById.set(alertId, { ...alertResponse, isActive: nextValue });
    }
  }

  applyAlertsRouteOfficeScope(): void {
    this.showOfficeDropdown = this.offices.length > 1;
    let officeIdToUse = this.selectedOfficeId;
    if (officeIdToUse != null && !this.offices.some(o => o.officeId === officeIdToUse)) {
      officeIdToUse = null;
    }
    if (this.offices.length === 1) {
      officeIdToUse = this.offices[0].officeId;
    }
    this.resolveOfficeScope(officeIdToUse, false);
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOfficeId = this.offices.length > 0
      ? this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null
      : officeId ?? null;
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOfficeId);
    }
    this.filterReservations();
    if (this.usesServerSearchCriteria()) {
      this.refreshAlertsForCurrentScope();
      return;
    }
    this.applyFilters();
  }

  getEffectiveAlertSearchDateRange(): { startDate: string | null; endDate: string | null } | null {
    if (this.alertSearchDateRange?.startDate && this.alertSearchDateRange?.endDate) {
      return this.alertSearchDateRange;
    }
    if (!this.hideHeader && this.source === 'alerts'
      && this.standaloneAlertSearchDateRange?.startDate && this.standaloneAlertSearchDateRange?.endDate) {
      return this.standaloneAlertSearchDateRange;
    }
    return null;
  }

  usesServerSearchCriteria(): boolean {
    const range = this.getEffectiveAlertSearchDateRange();
    return this.source === 'alerts' && !!(range?.startDate && range?.endDate);
  }

  resolveOfficeIdsForSearch(): number[] {
    const scopedOfficeId = this.officeId ?? this.selectedOfficeId;
    if (scopedOfficeId != null) {
      return [scopedOfficeId];
    }
    const fromOffices = (this.offices || []).map(office => office.officeId).filter(id => id > 0);
    if (fromOffices.length > 0) {
      return fromOffices;
    }
    return [...new Set((this.reservations || []).map(reservation => reservation.officeId).filter(id => id > 0))];
  }

  buildAlertSearchRequest(officeIds: number[]): AlertGetRequest {
    const reservationId = this.reservationId || this.selectedReservationId || null;
    const range = this.getEffectiveAlertSearchDateRange();
    return {
      officeIds,
      propertyId: this.propertyId ?? null,
      reservationId,
      isActive: !this.showInactive,
      startDate: range?.startDate ?? null,
      endDate: range?.endDate ?? null
    };
  }

  initStandaloneAlertDateRange(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    this.standaloneStartDate = start;
    this.standaloneEndDate = end;
    this.syncStandaloneAlertSearchDateRange();
  }

  syncStandaloneAlertSearchDateRange(): void {
    this.standaloneAlertSearchDateRange = {
      startDate: this.utilityService.formatDateOnlyForApi(this.standaloneStartDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.standaloneEndDate)
    };
  }

  normalizeStandaloneDateRangeValues(): void {
    if (!this.standaloneStartDate && !this.standaloneEndDate) {
      this.initStandaloneAlertDateRange();
      return;
    }
    if (this.standaloneStartDate && !this.standaloneEndDate) {
      const end = new Date(this.standaloneStartDate);
      end.setHours(0, 0, 0, 0);
      this.standaloneEndDate = end;
    } else if (!this.standaloneStartDate && this.standaloneEndDate) {
      const start = new Date(this.standaloneEndDate);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      this.standaloneStartDate = start;
    }

    if (this.standaloneStartDate) {
      this.standaloneStartDate.setHours(0, 0, 0, 0);
    }
    if (this.standaloneEndDate) {
      this.standaloneEndDate.setHours(0, 0, 0, 0);
    }

    if (this.standaloneStartDate && this.standaloneEndDate
      && this.standaloneStartDate.getTime() > this.standaloneEndDate.getTime()) {
      const tmp = this.standaloneStartDate;
      this.standaloneStartDate = this.standaloneEndDate;
      this.standaloneEndDate = tmp;
    }
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
