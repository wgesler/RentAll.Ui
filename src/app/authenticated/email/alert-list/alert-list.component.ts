import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { skip, Subscription, take } from 'rxjs';
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
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { AlertListDisplay, AlertResponse } from '../models/alert.model';
import { AlertService } from '../services/alert.service';

@Component({
  selector: 'app-alert-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, TitleBarSelectComponent, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './alert-list.component.html',
  styleUrl: './alert-list.component.scss'
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
  @Input() reservations: ReservationListResponse[] = [];
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
  @Output() alertEdit = new EventEmitter<string>();
  @Output() alertSelected = new EventEmitter<AlertResponse | null>();

  alerts: AlertListDisplay[] = [];
  allAlerts: AlertListDisplay[] = [];
  alertsById = new Map<string, AlertResponse>();
  isLoading = false;
  isServiceError = false;

  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  availableReservations: { value: ReservationListResponse; label: string }[] = [];
  selectedReservationId: string | null = null;
  showOfficeDropdown = true;
  preferredOfficeId: number | null = null;
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  officeScopeResolved = false;
  contacts: ContactResponse[] = [];

  alertsDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    subject: { displayAs: 'Subject', maxWidth: '30ch' },
    toEmail: { displayAs: 'To Email', maxWidth: '24ch' },
    startDate: { displayAs: 'Start Date', maxWidth: '14ch', alignment: 'center' },
    frequencyLabel: { displayAs: 'Frequency', maxWidth: '14ch', alignment: 'center' },
    createdOn: { displayAs: 'Created', maxWidth: '26ch', alignment: 'center' }
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
    private globalSelectionService: GlobalSelectionService
  ) {}

  //#region Alert-List
  ngOnInit(): void {
    this.organizationId = this.organizationId || this.authService.getUser()?.organizationId?.trim() || null;
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    if (!this.source) {
      this.source = 'alerts';
    }
    if (this.officeId !== null && this.officeId !== undefined) {
      this.selectedOfficeId = this.officeId;
    }
    if (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') {
      this.selectedReservationId = this.reservationId;
    }

    this.loadContacts();
    this.loadOffices();
    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0 && (this.officeId === null || this.officeId === undefined)) {
        this.resolveOfficeScope(officeId, true);
      }
    });
    if (this.reservations && this.reservations.length > 0) {
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
      this.selectedOfficeId = changes['officeId'].currentValue;
      this.filterReservations();
      this.applyFilters();
    }
    if (changes['reservationId']) {
      this.selectedReservationId = changes['reservationId'].currentValue;
      this.applyFilters();
    }
    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      this.applyFilters();
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contacts = this.contactService.getAllContactsValue() || [];
        this.filterReservations();
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId || '', this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.allAlerts = this.mappingService.mapAlertOfficeNames(this.allAlerts, this.offices);
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, useGlobalSelection: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.resolveOfficeScope(uiState.selectedOfficeId, this.officeId === null || this.officeId === undefined);
          }
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = true;
        this.resolveOfficeScope(null, false);
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: reservations => {
        this.reservations = reservations || [];
        this.applyReservationCodes();
        this.filterReservations();
        this.applyFilters();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadAlerts(): void {
    this.isLoading = true;
    this.alertService.getAlerts().pipe(take(1)).subscribe({
      next: alerts => {
        const alertResponses = alerts || [];
        this.alertsById = new Map(alertResponses.map(alert => [alert.alertId, alert]));
        this.allAlerts = this.mappingService.mapAlertListDisplays(alertResponses);
        this.allAlerts = this.mappingService.mapAlertOfficeNames(this.allAlerts, this.offices);
        this.applyReservationCodes();
        this.applyFilters();
        this.isServiceError = false;
        this.isLoading = false;
      },
      error: () => {
        this.allAlerts = [];
        this.alerts = [];
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
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
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOfficeId = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.officeScopeResolved = true;
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOfficeId);
    }
    this.filterReservations();
    this.applyFilters();
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
  }
  //#endregion
}
