import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
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
import { AlertListDisplay, AlertRequest, AlertResponse } from '../models/alert.model';
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
  @Input() reservations: ReservationCodeResponse[] = [];
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
  @Output() alertEdit = new EventEmitter<string>();
  @Output() alertSelected = new EventEmitter<AlertResponse | null>();

  alerts: AlertListDisplay[] = [];
  allAlerts: AlertListDisplay[] = [];
  alertsById = new Map<string, AlertResponse>();
  isPageReady = false;
  isServiceError = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['alerts', 'offices', 'contacts', 'officeScope', 'reservations']));
  showInactive = false;

  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  availableReservations: { value: ReservationCodeResponse; label: string }[] = [];
  selectedReservationId: string | null = null;
  showOfficeDropdown = false;
  officeScopeResolved = false;
  destroy$ = new Subject<void>();
  contacts: ContactResponse[] = [];

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
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  constructor(
    private alertService: AlertService,
    private router: Router,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private utilityService: UtilityService,
    private authService: AuthService,
    private contactService: ContactService,
    private toastr: ToastrService,
    private globalSelectionService: GlobalSelectionService,
    private cdr: ChangeDetectorRef
  ) {}

  private markViewForCheck(): void {
    this.cdr.markForCheck();
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
    if (this.reservations && this.reservations.length > 0) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
      this.applyReservationCodes();
      this.filterReservations();
    } else {
      this.loadReservations();
    }
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
      this.applyFilters();
    }
    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      this.applyFilters();
    }
  }

  onTitleBarOfficeIdUpdate(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.filterReservations();
    this.applyFilters();
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
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
      this.officeService.ensureOfficesLoaded(this.organizationId || '').pipe(take(1), finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      })).subscribe({
        next: () => {
          this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
            this.offices = offices || [];
            this.allAlerts = this.mappingService.mapAlertOfficeNames(this.allAlerts, this.offices);
            this.applyAlertsRouteOfficeScope();
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
      return;
    }

    this.globalSelectionService.ensureOfficeScope(this.organizationId || '').pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    })).subscribe({
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
    this.reservationService.getReservationCodes().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
      this.markViewForCheck();
    })).subscribe({
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
  }

  loadAlerts(): void {
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
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    if (this.source !== 'alerts') {
      this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
    }
    this.officeIdChange.emit(this.selectedOfficeId);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  get officeOptions(): { value: number; label: string }[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get reservationOptions(): { value: string; label: string }[] {
    return this.availableReservations.map(item => ({
      value: item.value.reservationId,
      label: item.label
    }));
  }

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

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }
    let filtered = [...this.allAlerts];
    if (!this.showInactive) {
      filtered = filtered.filter(alert => alert.isActive);
    }
    if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
      filtered = filtered.filter(alert => alert.officeId === String(this.selectedOfficeId));
    }
    if (this.selectedReservationId) {
      filtered = filtered.filter(alert => alert.reservationId === this.selectedReservationId);
    }
    if ((this.source === 'property' || this.source === 'reservation') && this.propertyId) {
      filtered = filtered.filter(alert => alert.propertyId === this.propertyId);
    }
    this.alerts = filtered;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  reload(): void {
    this.loadAlerts();
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

  private applyAlertsRouteOfficeScope(): void {
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
    this.selectedOfficeId = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOfficeId);
    }
    this.filterReservations();
    this.applyFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
