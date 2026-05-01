import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { AuthService } from '../../../services/auth.service';
import { Subscription, skip, take } from 'rxjs';
import { EmailListDisplay } from '../models/email.model';
import { EmailService } from '../services/email.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { EmailType, getEmailType } from '../models/email.enum';

@Component({
  selector: 'app-email-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, TitleBarSelectComponent, DataTableComponent],
  templateUrl: './email-list.component.html',
  styleUrl: './email-list.component.scss'
})
export class EmailListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() hideHeader: boolean = false;
  @Input() hideFilters: boolean = false;
  @Input() source: 'property' | 'reservation' | 'invoice' | 'emails' | 'maintenance' | null = null;
  @Input() propertyId?: string;
  @Input() propertyCode: string | null = null;
  @Input() organizationId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() companyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() emailTypeId?: number;
  /** When set, keep only rows with this document type (e.g. Inspection). Rows without `documentTypeId` match if subject starts with "Inspection Issues". */
  @Input() filterDocumentTypeId?: number;
  @Input() activeOnly: boolean = false;
  @Input() reservations: ReservationListResponse[] = []; // Shared reservations list from parent (or loaded internally)
  @Output() organizationIdChange = new EventEmitter<string | null>();
  @Output() companyIdChange = new EventEmitter<string | null>();
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
 
  emails: EmailListDisplay[] = [];
  allEmails: EmailListDisplay[] = [];
  isLoading = false;
  isServiceError = false;

  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservationId: string | null = null;

  companyContacts: ContactResponse[] = [];
  availableCompanyContacts: { value: ContactResponse, label: string }[] = [];
  selectedCompanyContact: ContactResponse | null = null;
  selectedEmailTypeId: number | null = null;
  emailTypes: { value: number, label: string }[] = [];
  
  showOfficeDropdown = false;
  preferredOfficeId: number | null = null;
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  officeScopeResolved: boolean = false;

  emailsDisplayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    emailTypeName: { displayAs: 'Email Type', maxWidth: '20ch' },
    subject: { displayAs: 'Subject', maxWidth: '30ch' },
    toEmail: { displayAs: 'To Email', maxWidth: '25ch' },
    fromEmail: { displayAs: 'From Email', maxWidth: '25ch' },
    attachmentPath: { displayAs: 'Attachment', maxWidth: '20ch', sort: false, alignment: 'center' },
    createdOn: { displayAs: 'Sent', maxWidth: '35ch', alignment: 'center' }
  };

  constructor(
    private emailService: EmailService,
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

  //#region Email-List
  ngOnInit(): void {
    this.organizationId = this.organizationId || this.authService.getUser()?.organizationId?.trim() || null;
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    if (!this.source) {
      this.source = 'emails';
    }

    if (this.officeId !== null && this.officeId !== undefined) {
      this.selectedOfficeId = this.officeId;
    }

    if (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') {
      this.selectedReservationId = this.reservationId;
    }

    this.loadOffices();
    this.initializeEmailTypes();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0 && (this.officeId === null || this.officeId === undefined)) {
        this.resolveOfficeScope(officeId, true);
      }
    });
    this.loadCompanies();
    // Use reservations passed from parent if available, otherwise load them
    if (this.reservations && this.reservations.length > 0) {
      // Use passed reservations - already set via @Input
      this.applyReservationCodes();
      this.filterReservations();
    } else {
      // Always load reservations so reservationId can be translated to reservationCode in table rows.
      this.loadReservations();
    }
    this.loadEmails();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle reservations input changes from parent
    if (changes['reservations'] && !changes['reservations'].firstChange) {
      if (this.reservations && this.reservations.length > 0) {
        this.applyReservationCodes();
        this.filterReservations();
        this.applyFilters();
      }
    }
    
    if (changes['officeId']) {
      this.onTitleBarOfficeIdUpdate(changes['officeId'].currentValue);
    }

    if (changes['reservationId']) {
      this.onTitleBarReservationIdUpdate(changes['reservationId'].currentValue);
    }

    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      if (newCompanyId && this.companyContacts.length > 0) {
        this.selectedCompanyContact = this.companyContacts.find(c =>
          c.contactId === newCompanyId &&
          (!this.selectedOfficeId || c.officeId === this.selectedOfficeId)
        ) || null;
      } else {
        this.selectedCompanyContact = null;
      }
      this.filterReservations();
      this.applyFilters();
    }

    if (changes['activeOnly'] && !changes['activeOnly'].firstChange) {
      this.applyFilters();
    }

    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      this.applyFilters();
    }

    if (changes['filterDocumentTypeId']) {
      this.applyFilters();
    }
  }

  //#region Title Bar Updates
  onTitleBarOfficeIdUpdate(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.filterCompanies();
    this.filterReservations();
    this.applyFilters();
  }

  onTitleBarReservationIdUpdate(reservationId: string | null): void {
    this.selectedReservationId = reservationId;
    this.applyFilters();
  }
  //#endregion

  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId || '', this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.allEmails = this.mappingService.mapEmailOfficeNames(this.allEmails, this.offices);
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, useGlobalSelection: this.source !== 'invoice', disableSingleOfficeRule: this.source === 'invoice' }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.resolveOfficeScope(uiState.selectedOfficeId, this.officeId === null || this.officeId === undefined);
          }
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.resolveOfficeScope(null, false);
      }
    });
  }

  loadEmails(): void {
    this.isLoading = true;
    this.emailService.getEmails().subscribe({
      next: (emails) => {
        this.allEmails = this.mappingService.mapEmailListDisplays(emails || []);
        this.allEmails = this.mappingService.mapEmailOfficeNames(this.allEmails, this.offices);
        this.applyReservationCodes();
        this.applyFilters();
        this.isServiceError = false;
        this.isLoading = false;
      },
      error: () => {
        this.allEmails = [];
        this.emails = [];
        this.isServiceError = true;
        this.isLoading = false;
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (reservations) => {
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

  loadCompanies(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllCompanyContacts().pipe(take(1)).subscribe({
          next: (contacts) => {
            this.companyContacts = contacts || [];
            this.filterCompanies();
          },
          error: () => {
            this.companyContacts = [];
            this.availableCompanyContacts = [];
          }
        });
      },
      error: () => {
        this.companyContacts = [];
        this.availableCompanyContacts = [];
      }
    });
  }

  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
    this.officeIdChange.emit(this.selectedOfficeId);
    this.filterCompanies();
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompanyContact?.contactId || null);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  compareReservationId(a: string | null, b: string | null): boolean {
    return String(a ?? '') === String(b ?? '');
  }

  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onEmailTypeChange(): void {
    this.applyFilters();
  }

  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get companyOptions(): { value: string, label: string }[] {
    return this.availableCompanyContacts.map(company => ({
      value: company.value.contactId,
      label: company.label
    }));
  }

  get selectedCompanyContactId(): string | null {
    return this.selectedCompanyContact?.contactId ?? null;
  }

  get reservationOptions(): { value: string, label: string }[] {
    return this.availableReservations.map(reservation => ({
      value: reservation.value.reservationId,
      label: reservation.label
    }));
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.onOfficeChange();
  }

  onCompanyDropdownChange(value: string | number | null): void {
    const contactId = value == null || value === '' ? null : String(value);
    this.selectedCompanyContact = contactId
      ? this.companyContacts.find(contact => contact.contactId === contactId) || null
      : null;
    this.onCompanyChange();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.onReservationChange();
  }

  onEmailTypeDropdownChange(value: string | number | null): void {
    this.selectedEmailTypeId = value == null || value === '' ? null : Number(value);
    this.onEmailTypeChange();
  }

  filterReservations(): void {
    if (this.source !== 'emails' && this.source !== 'property' && this.source !== 'reservation' && this.source !== 'invoice' && this.source !== 'maintenance') {
      this.availableReservations = [];
      return;
    }

    if (!this.selectedOfficeId) {
      let allReservations = [...this.reservations];
      if ((this.source === 'property' || this.source === 'reservation' || this.source === 'maintenance') && this.propertyId) {
        allReservations = allReservations.filter(r => r.propertyId === this.propertyId);
      }
      if (this.source === 'invoice' && this.selectedCompanyContact?.contactId) {
        const selectedContactId = this.selectedCompanyContact.contactId;
        allReservations = allReservations.filter(r => {
          const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null; contactId?: string };
          const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? reservationAny.contactId ?? null;
          return reservationEntityId === selectedContactId;
        });
      }
      this.availableReservations = allReservations.map(r => ({
        value: r,
        label: this.utilityService.getReservationDropdownLabel(r, this.companyContacts.find(c => c.contactId === r.contactId) ?? null)
      }));
      return;
    }

    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOfficeId);
    const propertyFilteredReservations = ((this.source === 'property' || this.source === 'reservation' || this.source === 'maintenance') && this.propertyId)
      ? filteredReservations.filter(r => r.propertyId === this.propertyId)
      : filteredReservations;
    const companyFilteredReservations = (this.source === 'invoice' && this.selectedCompanyContact?.contactId)
      ? propertyFilteredReservations.filter(r => {
          const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null; contactId?: string };
          const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? reservationAny.contactId ?? null;
          return reservationEntityId === this.selectedCompanyContact!.contactId;
        })
      : propertyFilteredReservations;
    this.availableReservations = companyFilteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.companyContacts.find(c => c.contactId === r.contactId) ?? null)
    }));

    if (this.selectedReservationId && !companyFilteredReservations.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }
  }

  filterCompanies(): void {
    const filtered = this.selectedOfficeId
      ? this.companyContacts.filter(c => c.officeId === this.selectedOfficeId && c.isActive)
      : this.companyContacts.filter(c => c.isActive);

    this.availableCompanyContacts = filtered.map(c => ({
      value: c,
      label: this.utilityService.getCompanyDropdownLabel(c)
    }));

    if (this.selectedCompanyContact && !filtered.some(c => c.contactId === this.selectedCompanyContact?.contactId)) {
      this.selectedCompanyContact = null;
      this.companyIdChange.emit(null);
    }

    if (this.companyId && !this.selectedCompanyContact) {
      const matching = filtered.find(c => c.contactId === this.companyId) || null;
      if (matching) {
        this.selectedCompanyContact = matching;
      }
    }
  }

  initializeEmailTypes(): void {
    this.emailTypes = Object.values(EmailType)
      .filter((value): value is number => typeof value === 'number')
      .map(value => ({
        value,
        label: getEmailType(value)
      }))
      .filter(type => !!type.label);
  }

  applyReservationCodes(): void {
    if (!this.allEmails || this.allEmails.length === 0) {
      return;
    }

    if (!this.reservations || this.reservations.length === 0) {
      return;
    }

    const reservationCodeById = new Map<string, string>(
      this.reservations.map(r => [r.reservationId, r.reservationCode || ''])
    );

    this.allEmails = this.allEmails.map(email => ({
      ...email,
      reservationCode: email.reservationCode || (email.reservationId ? (reservationCodeById.get(email.reservationId) || '') : '')
    }));
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = [...this.allEmails];

    // Keep alerts on the sidebar Emails page only; hide them in shell-embedded email tabs.
    if (this.source !== 'emails') {
      filtered = filtered.filter(email => email.emailTypeId !== EmailType.Alert);
    }

    if (this.source !== 'reservation' && this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
      filtered = filtered.filter(email => email.officeId === String(this.selectedOfficeId));
    }

    const reservationIdToFilter = this.selectedReservationId || this.reservationId || null;
    const propertyIdToFilter = this.propertyId || null;
    const useShellScopeFilter = this.source === 'reservation' || this.source === 'property' || this.source === 'maintenance' || this.source === 'invoice';
    if (useShellScopeFilter) {
      if (reservationIdToFilter) {
        filtered = filtered.filter(email => email.reservationId === reservationIdToFilter);
      } else if (propertyIdToFilter) {
        filtered = filtered.filter(email => email.propertyId === propertyIdToFilter);
      }
    } else if (this.source === 'emails' && this.selectedReservationId !== null && this.selectedReservationId !== undefined && this.selectedReservationId !== '') {
      filtered = filtered.filter(email => email.reservationId === this.selectedReservationId);
    }

    const emailTypeToFilter = this.selectedEmailTypeId ?? this.emailTypeId;
    if (emailTypeToFilter !== null && emailTypeToFilter !== undefined) {
      filtered = filtered.filter(email => email.emailTypeId === emailTypeToFilter);
    }

    if (this.filterDocumentTypeId !== null && this.filterDocumentTypeId !== undefined) {
      filtered = filtered.filter(email => this.emailMatchesDocumentTypeFilter(email));
    }

    const activeReservationsOnly = this.activeOnly;
    if (activeReservationsOnly && this.reservations && this.reservations.length > 0) {
      const activeReservationIds = new Set(
        this.reservations
          .filter(r => r.isActive)
          .map(r => r.reservationId)
      );
      filtered = filtered.filter(email => !email.reservationId || activeReservationIds.has(email.reservationId));
    }

    this.emails = filtered;
  }

  reload(): void {
    this.loadEmails();
  }

  viewDocument(email: EmailListDisplay): void {
    const documentId = email?.documentId;
    if (!documentId) {
      return;
    }

    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.DocumentView, [documentId])],
      {
        queryParams: {
          returnTo: 'email'
        }
      }
    );
  }

  viewEmail(email: EmailListDisplay): void {
    const queryParams: any = {};
    const reservationIdToUse = this.selectedReservationId || this.reservationId || null;

    if (this.source === 'reservation' && reservationIdToUse) {
      queryParams.returnTo = 'reservationTab';
      queryParams.tab = 'email';
      queryParams.reservationId = reservationIdToUse;
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      if (this.propertyId) {
        queryParams.propertyId = this.propertyId;
      }
    } else if (this.source === 'property' && this.propertyId) {
      queryParams.returnTo = 'propertyTab';
      queryParams.tab = 'email';
      queryParams.propertyId = this.propertyId;
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
    } else if (this.source === 'maintenance' && this.propertyId) {
      queryParams.returnTo = 'maintenanceTab';
      queryParams.propertyId = this.propertyId;
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
    } else if (this.source === 'invoice') {
      queryParams.returnTo = 'accountingTab';
      queryParams.tab = '3';
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedCompanyContact?.contactId) {
        queryParams.companyId = this.selectedCompanyContact.contactId;
      } else if (this.companyId) {
        queryParams.companyId = this.companyId;
      }
    }

    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.Email, [email.emailId])],
      { queryParams }
    );
  }

  deleteEmail(email: EmailListDisplay): void {
    this.emailService.deleteEmail(email.emailId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Email deleted successfully', CommonMessage.Success);
        this.allEmails = this.allEmails.filter(e => e.emailId !== email.emailId);
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }
  //#endregion

  //#region Utility Methods
   emailMatchesDocumentTypeFilter(email: EmailListDisplay): boolean {
    const want = this.filterDocumentTypeId;
    if (want === null || want === undefined) {
      return true;
    }
    const rowDt = email.documentTypeId;
    if (rowDt === want) {
      return true;
    }
    if (rowDt === undefined || rowDt === null || Number.isNaN(Number(rowDt))) {
      return (email.subject || '').trim().startsWith('Inspection Issues');
    }
    return false;
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOfficeId = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.officeScopeResolved = true;
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOfficeId);
    }
    this.filterCompanies();
    this.filterReservations();
    this.applyFilters();
  }

  get emailTypeOptions(): { value: number, label: string }[] {
    return this.emailTypes;
  }
  //#endregion
}
