
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, filter, skip, take } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { MaterialModule } from '../../../material.module';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { CostCodesResponse } from '../models/cost-codes.model';
import { TransactionType } from '../models/accounting-enum';
import { InvoiceResponse } from '../models/invoice.model';
import { InvoiceService } from '../services/invoice.service';
import { CostCodesService } from '../services/cost-codes.service';
import { UtilityService } from '../../../services/utility.service';

interface GeneralLedgerDisplayRow {
  officeName: string;
  reservationCode: string;
  invoiceCode: string;
  date: string;
  description: string;
  debit: string;
  credit: string;
  total: string;
  sortDateValue: number;
  debitValue: number;
  creditValue: number;
  totalValue: number;
}

interface LedgerLineWithDateFields {
  costCodeId?: string;
  transactionTypeId?: number;
  amount?: number;
  transactionDate?: string;
  createdOn?: string;
  modifiedOn?: string;
}

@Component({
    selector: 'app-general-ledger',
    standalone: true,
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    templateUrl: './general-ledger.component.html',
    styleUrls: ['./general-ledger.component.scss']
})
export class GeneralLedgerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() hideFilters: boolean = false;
  @Input() organizationId: string | null = null; // Input to accept organizationId from parent
  @Input() companyId: string | null = null; // Input to accept companyId from parent
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Output() organizationIdChange = new EventEmitter<string | null>(); // Emit organization changes to parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() companyIdChange = new EventEmitter<string | null>(); // Emit company changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  
  selectedOfficeId: number | null = null;
  selectedReservationId: string | null = null;
  selectedCompanyContact: ContactResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  companyContacts: ContactResponse[] = [];
  availableCompanyContacts: { value: ContactResponse, label: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  reservationsSubscription?: Subscription;
  companyContactsSubscription?: Subscription;
  invoicesSubscription?: Subscription;
  costCodesSubscription?: Subscription;
  allInvoices: InvoiceResponse[] = [];
  costCodes: CostCodesResponse[] = [];
  ledgerRows: GeneralLedgerDisplayRow[] = [];
  isLoading: boolean = false;
  showInactive: boolean = false;
  showOfficeDropdown: boolean = false;
  officeScopeResolved: boolean = false;
  preferredOfficeId: number | null = null;
  generalLedgerColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '16ch' },
    reservationCode: { displayAs: 'ReservationCode', maxWidth: '18ch', sortType: 'natural' },
    invoiceCode: { displayAs: 'InvoiceCode', maxWidth: '16ch', sortType: 'natural' },
    date: { displayAs: 'Date', maxWidth: '20ch' },
    description: { displayAs: 'Description', maxWidth: '28ch' },
    debit: { displayAs: 'Debit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    credit: { displayAs: 'Credit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    total: { displayAs: 'Total', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' }
  };

  constructor(
    private officeService: OfficeService,
    private mappingService: MappingService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private accountingService: InvoiceService,
    private costCodesService: CostCodesService,
    private utilityService: UtilityService,
    private formatter: FormatterService,
    private authService: AuthService,
    private globalSelectionService: GlobalSelectionService
  ) {}

  //#region General-Ledger
  ngOnInit(): void {
    this.organizationId = this.organizationId || this.authService.getUser()?.organizationId?.trim() || null;
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    this.loadOffices();
    this.loadReservations();
    this.loadCompanyContacts();
    this.loadCostCodes();
    this.loadInvoices();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });

    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.officeId !== undefined && this.offices.length > 0) {
        this.selectedOfficeId = this.officeId;
      }
    });
  }

  onAdd(): void {
  }
  //#endregion

  //#region Form Response methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.buildGeneralLedgerRows();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.resolveOfficeScope(newOfficeId, false);
        }
      }
    }

    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      if (this.reservations.length > 0) {
        this.selectedReservationId = newReservationId;
      }
    }

    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      if (this.companyContacts.length > 0) {
        this.selectedCompanyContact = newCompanyId
          ? this.companyContacts.find(c => c.contactId === newCompanyId && (!this.selectedOfficeId || c.officeId === this.selectedOfficeId)) || null
          : null;
        this.filterReservations();
      }
    }
  }
   
  onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
    this.officeIdChange.emit(this.selectedOfficeId);
    this.filterCompanyContacts();
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.loadInvoices();
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompanyContact?.contactId || null);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.buildGeneralLedgerRows();
  }

  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
    this.buildGeneralLedgerRows();
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId || '', this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.showOfficeDropdown = this.offices.length > 1;
        this.resolveOfficeScope(this.officeId ?? this.globalSelectionService.getSelectedOfficeIdValue(), this.officeId === null || this.officeId === undefined);
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(null, false);
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
        this.buildGeneralLedgerRows();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadCompanyContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllCompanyContacts().pipe(take(1)).subscribe({
          next: (contacts) => {
            this.companyContacts = contacts || [];
            this.filterCompanyContacts();
            this.buildGeneralLedgerRows();
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

  loadInvoices(): void {
    this.isLoading = true;
    this.invoicesSubscription?.unsubscribe();
    const invoiceObservable = this.selectedOfficeId
      ? this.accountingService.getInvoicesByOffice(this.selectedOfficeId)
      : this.accountingService.getAllInvoices();

    this.invoicesSubscription = invoiceObservable.pipe(take(1)).subscribe({
      next: (invoices) => {
        this.allInvoices = invoices || [];
        this.buildGeneralLedgerRows();
        this.isLoading = false;
      },
      error: () => {
        this.allInvoices = [];
        this.ledgerRows = [];
        this.isLoading = false;
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesSubscription?.unsubscribe();
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(costCodes => {
        this.costCodes = costCodes || [];
        this.buildGeneralLedgerRows();
      });
    });
  }

  filterCompanyContacts(): void {
    const filtered = this.selectedOfficeId
      ? this.companyContacts.filter(c => c.officeId === this.selectedOfficeId && c.isActive)
      : this.companyContacts.filter(c => c.isActive);

    this.availableCompanyContacts = filtered.map(c => ({
      value: c,
      label: c.contactCode ? `${c.contactCode}: ${c.displayName || c.companyName || c.fullName || ''}` : (c.displayName || c.companyName || c.fullName || '')
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

  filterReservations(): void {
    let filteredReservations = this.selectedOfficeId
      ? this.reservations.filter(r => r.officeId === this.selectedOfficeId)
      : this.reservations;

    if (this.selectedCompanyContact?.contactId) {
      const selectedContactId = this.selectedCompanyContact.contactId;
      filteredReservations = filteredReservations.filter(r => {
        const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null; contactId?: string };
        const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? reservationAny.contactId ?? null;
        return reservationEntityId === selectedContactId;
      });
    }

    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));

    if (this.selectedReservationId && !filteredReservations.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }

    if (this.reservationId && !this.selectedReservationId) {
      const matchingReservation = filteredReservations.find(r => r.reservationId === this.reservationId) || null;
      if (matchingReservation) {
        this.selectedReservationId = matchingReservation.reservationId;
      }
    }

    this.buildGeneralLedgerRows();
  }
  //#endregion

  //#region General Ledger Table
  buildGeneralLedgerRows(): void {
    const reservationById = new Map(this.reservations.map(r => [r.reservationId, r]));
    let filteredInvoices = this.allInvoices;

    if (!this.showInactive) {
      filteredInvoices = filteredInvoices.filter(invoice => invoice.isActive);
    }

    if (this.selectedCompanyContact?.contactId) {
      const selectedCompanyName = this.selectedCompanyContact.fullName;
      filteredInvoices = filteredInvoices.filter(invoice => {
        if (!invoice.reservationId) {
          return false;
        }
        const reservation = reservationById.get(invoice.reservationId);
        return reservation?.contactName === selectedCompanyName;
      });
    }

    if (this.selectedReservationId) {
      filteredInvoices = filteredInvoices.filter(invoice => invoice.reservationId === this.selectedReservationId);
    }

    const lineRows = filteredInvoices.flatMap(invoice => {
      const reservation = invoice.reservationId ? reservationById.get(invoice.reservationId) : undefined;
      return (invoice.ledgerLines || []).map(line => {
        const lineWithDateFields = line as LedgerLineWithDateFields;
        const isCredit = this.isCreditLine(lineWithDateFields, invoice.officeId);
        const amount = line.amount || 0;
        const debitValue = isCredit ? 0 : amount;
        const creditValue = isCredit ? Math.abs(amount) : 0;
        const sortDateValue = this.getSortDateValue(invoice, lineWithDateFields);
        const officeName = invoice.officeName || reservation?.officeName || this.getOfficeName(invoice.officeId);
        const reservationCode = invoice.reservationCode || reservation?.reservationCode || '-';
        const invoiceCode = invoice.invoiceCode || '-';

        return {
          officeName,
          reservationCode,
          invoiceCode,
          sortDateValue,
          description: line.description || '',
          debitValue,
          creditValue,
          sourceDate: this.getSourceDate(invoice, lineWithDateFields)
        };
      });
    });

    lineRows.sort((a, b) => a.sortDateValue - b.sortDateValue);
    let runningTotal = 0;

    this.ledgerRows = lineRows.map(row => {
      runningTotal += row.debitValue - row.creditValue;
      return {
        officeName: row.officeName,
        reservationCode: row.reservationCode,
        invoiceCode: row.invoiceCode,
        date: this.formatter.formatDateTimeString(row.sourceDate),
        description: row.description,
        debit: row.debitValue !== 0 ? this.formatSignedCurrency(row.debitValue) : '',
        credit: row.creditValue > 0 ? this.formatCurrency(row.creditValue) : '',
        total: this.formatSignedCurrency(runningTotal),
        sortDateValue: row.sortDateValue,
        debitValue: row.debitValue,
        creditValue: row.creditValue,
        totalValue: runningTotal
      };
    });
  }

  getOfficeName(officeId: number): string {
    return this.offices.find(o => o.officeId === officeId)?.name || '';
  }

  isCreditLine(line: LedgerLineWithDateFields, officeId: number): boolean {
    const transactionTypeId = this.resolveTransactionTypeId(line, officeId);
    if (transactionTypeId === null) {
      return false;
    }
    return transactionTypeId === TransactionType.Payment;
  }

  resolveTransactionTypeId(line: LedgerLineWithDateFields, officeId: number): number | null {
    if (line.transactionTypeId !== undefined && line.transactionTypeId !== null) {
      return line.transactionTypeId;
    }

    const costCodeId = line.costCodeId;
    if (!costCodeId) {
      return null;
    }

    const matchingCostCode = this.costCodes.find(c => c.officeId === officeId && c.costCodeId === costCodeId);
    return matchingCostCode?.transactionTypeId ?? null;
  }

  getSortDateValue(invoice: InvoiceResponse, line: LedgerLineWithDateFields): number {
    const sourceDate = this.getSourceDate(invoice, line);
    const parsedDate = sourceDate ? new Date(sourceDate).getTime() : Number.NaN;
    return Number.isNaN(parsedDate) ? 0 : parsedDate;
  }

  getSourceDate(invoice: InvoiceResponse, line: LedgerLineWithDateFields): string {
    const lineDate = typeof line.transactionDate === 'string'
      ? line.transactionDate
      : typeof line.createdOn === 'string'
        ? line.createdOn
        : typeof line.modifiedOn === 'string'
          ? line.modifiedOn
          : '';
    return lineDate || invoice.invoiceDate || invoice.createdOn || invoice.modifiedOn || '';
  }

  formatCurrency(value: number): string {
    return '$' + this.formatter.currency(value);
  }

  formatSignedCurrency(value: number): string {
    const absoluteValue = Math.abs(value);
    const formatted = this.formatCurrency(absoluteValue);
    return value < 0 ? `-${formatted}` : formatted;
  }

  get totalsRow(): { [columnName: string]: string } | undefined {
    if (this.ledgerRows.length === 0) {
      return undefined;
    }

    const debitTotal = this.ledgerRows.reduce((sum, row) => sum + row.debitValue, 0);
    const creditTotal = this.ledgerRows.reduce((sum, row) => sum + row.creditValue, 0);
    const endingTotal = this.ledgerRows[this.ledgerRows.length - 1]?.totalValue ?? 0;

    return {
      debit: this.formatCurrency(debitTotal),
      credit: this.formatCurrency(creditTotal),
      total: this.formatSignedCurrency(endingTotal)
    };
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.reservationsSubscription?.unsubscribe();
    this.companyContactsSubscription?.unsubscribe();
    this.invoicesSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOfficeId = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.officeScopeResolved = true;
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOfficeId);
    }
    this.filterCompanyContacts();
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.loadInvoices();
  }
  //#endregion
}
