import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { Subscription, filter, take } from 'rxjs';
import { EmailListDisplay } from '../models/email.model';
import { EmailService } from '../services/email.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { UtilityService } from '../../../services/utility.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { CompanyService } from '../../companies/services/company.service';

@Component({
  selector: 'app-email-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent],
  templateUrl: './email-list.component.html',
  styleUrl: './email-list.component.scss'
})
export class EmailListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId?: string;
  @Input() propertyCode: string | null = null;
  @Input() officeId: number | null = null;
  @Input() reservationId: string | null = null;
  @Input() companyId: string | null = null;
  @Input() emailTypeId?: number;
  @Input() source: 'property' | 'reservation' | 'invoice' | 'emails' | null = null;
  @Input() hideHeader: boolean = false;
  @Input() hideFilters: boolean = false;
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
  @Output() companyIdChange = new EventEmitter<string | null>();

  emails: EmailListDisplay[] = [];
  allEmails: EmailListDisplay[] = [];
  isLoading = false;
  isServiceError = false;

  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservationId: string | null = null;

  companies: CompanyResponse[] = [];
  availableCompanies: { value: CompanyResponse, label: string }[] = [];
  selectedCompany: CompanyResponse | null = null;
  
  showOfficeDropdown = true;
  officesSubscription?: Subscription;

  emailsDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    subject: { displayAs: 'Subject', maxWidth: '25ch' },
    toEmail: { displayAs: 'To Email', maxWidth: '25ch' },
    fromEmail: { displayAs: 'From Email', maxWidth: '25ch' },
    attachmentPath: { displayAs: 'Attachment', maxWidth: '15ch', sort: false, alignment: 'center' },
    createdOn: { displayAs: 'Sent', maxWidth: '24ch' }
  };

  constructor(
    private emailService: EmailService,
    private router: Router,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private utilityService: UtilityService,
    private companyService: CompanyService
  ) {}

  //#region Email-List
  ngOnInit(): void {
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
    this.loadCompanies();
    // Always load reservations so reservationId can be translated to reservationCode in table rows.
    this.loadReservations();
    this.loadEmails();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      this.selectedOfficeId = changes['officeId'].currentValue;
      this.filterCompanies();
      this.filterReservations();
      this.applyFilters();
    }

    if (changes['reservationId']) {
      this.selectedReservationId = changes['reservationId'].currentValue;
      this.applyFilters();
    }

    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      if (newCompanyId && this.companies.length > 0) {
        this.selectedCompany = this.companies.find(c =>
          c.companyId === newCompanyId &&
          (!this.selectedOfficeId || c.officeId === this.selectedOfficeId)
        ) || null;
      } else {
        this.selectedCompany = null;
      }
      this.filterReservations();
      this.applyFilters();
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription?.unsubscribe();
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: (allOffices: OfficeResponse[]) => {
          this.offices = allOffices || [];
          this.allEmails = this.mappingService.mapEmailOfficeNames(this.allEmails, this.offices);

          // For Accounting Emails (source='invoice'), keep default as All Offices.
          if (this.offices.length === 1 && this.source !== 'invoice') {
            this.selectedOfficeId = this.offices[0].officeId;
            this.showOfficeDropdown = false;
          } else {
            this.showOfficeDropdown = true;
          }

          this.applyFilters();
        },
        error: () => {
          this.offices = [];
          this.showOfficeDropdown = true;
        }
      });
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
    this.companyService.getCompanies().pipe(take(1)).subscribe({
      next: (companies) => {
        this.companies = companies || [];
        this.filterCompanies();
      },
      error: () => {
        this.companies = [];
        this.availableCompanies = [];
      }
    });
  }

  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    this.officeIdChange.emit(this.selectedOfficeId);
    this.filterCompanies();
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompany?.companyId || null);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  filterReservations(): void {
    if (this.source !== 'emails' && this.source !== 'property' && this.source !== 'reservation' && this.source !== 'invoice') {
      this.availableReservations = [];
      return;
    }

    if (!this.selectedOfficeId) {
      let allReservations = [...this.reservations];
      if ((this.source === 'property' || this.source === 'reservation') && this.propertyId) {
        allReservations = allReservations.filter(r => r.propertyId === this.propertyId);
      }
      if (this.source === 'invoice' && this.selectedCompany?.companyId) {
        const selectedCompanyId = this.selectedCompany.companyId;
        allReservations = allReservations.filter(r => {
          const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null };
          const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? null;
          return reservationEntityId === selectedCompanyId;
        });
      }
      this.availableReservations = allReservations.map(r => ({
        value: r,
        label: this.utilityService.getReservationLabel(r)
      }));
      return;
    }

    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOfficeId);
    const propertyFilteredReservations = ((this.source === 'property' || this.source === 'reservation') && this.propertyId)
      ? filteredReservations.filter(r => r.propertyId === this.propertyId)
      : filteredReservations;
    const companyFilteredReservations = (this.source === 'invoice' && this.selectedCompany?.companyId)
      ? propertyFilteredReservations.filter(r => {
          const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null };
          const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? null;
          return reservationEntityId === this.selectedCompany!.companyId;
        })
      : propertyFilteredReservations;
    this.availableReservations = companyFilteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));

    if (this.selectedReservationId && !companyFilteredReservations.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }
  }

  filterCompanies(): void {
    const filteredCompanies = this.selectedOfficeId
      ? this.companies.filter(c => c.officeId === this.selectedOfficeId && c.isActive)
      : this.companies.filter(c => c.isActive);

    this.availableCompanies = filteredCompanies.map(c => ({
      value: c,
      label: `${c.companyCode || ''} - ${c.name}`.trim()
    }));

    if (this.selectedCompany && !filteredCompanies.some(c => c.companyId === this.selectedCompany?.companyId)) {
      this.selectedCompany = null;
      this.companyIdChange.emit(null);
    }

    if (this.companyId && !this.selectedCompany) {
      const matchingCompany = filteredCompanies.find(c => c.companyId === this.companyId) || null;
      if (matchingCompany) {
        this.selectedCompany = matchingCompany;
      }
    }
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
    let filtered = [...this.allEmails];

    if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
      filtered = filtered.filter(email => email.officeId === String(this.selectedOfficeId));
    }

    if ((this.source === 'emails' || this.source === 'reservation' || this.source === 'property' || this.source === 'invoice') && this.selectedReservationId !== null && this.selectedReservationId !== undefined && this.selectedReservationId !== '') {
      filtered = filtered.filter(email => email.reservationId === this.selectedReservationId);
    }

    if ((this.source === 'property' || this.source === 'reservation') && this.propertyId) {
      filtered = filtered.filter(email => email.propertyId === this.propertyId);
    }

    if (this.emailTypeId !== null && this.emailTypeId !== undefined) {
      filtered = filtered.filter(email => email.emailTypeId === this.emailTypeId);
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
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Email, [email.emailId]));
  }
  //#endregion

    //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
