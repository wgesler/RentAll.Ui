import { CommonModule } from "@angular/common";
import { SelectionModel } from '@angular/cdk/collections';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, concatMap, filter, finalize, from, map, take, takeUntil, toArray} from 'rxjs';
import { RouterUrl } from '../../../../app.routes';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { ReservationListResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { PropertyService } from '../../../properties/services/property.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { UserGroups } from '../../../users/models/user-enums';
import { TransactionType, TransactionTypeLabels } from '../../models/accounting-enum';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { CostCodesResponse } from '../../models/cost-codes.model';
import { InvoiceGetRequest, InvoicePaymentRequest, InvoicePaymentResponse, InvoicePreviewSelection, InvoiceResponse, InvoiceSelection } from '../../models/invoice.model';
import { InvoiceService } from '../../services/invoice.service';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { CostCodesService } from '../../services/cost-codes.service';
import { InvoiceDocumentService } from '../../services/invoice-document.service';
import { InvoiceIifExportService } from '../../services/invoice-iif-export.service';
import { QbClassType, QbNameType } from '../../../organizations/models/qb-type-enum';

@Component({
    selector: 'app-invoice-list',
    standalone: true,
    templateUrl: './invoice-list.component.html',
    styleUrls: ['./invoice-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class InvoiceListComponent implements OnInit, OnDestroy, OnChanges {
  @Input({ required: true }) source: 'reservation' | 'accounting';
  @Input() organizationId: string | null = null; // Input to accept organizationId from parent
  @Input() organizationName: string | null = null; // Selected organization display name for SuperAdmin recipient column
  @Input() organizationOptions: { value: string, label: string }[] = []; // SuperAdmin org lookup for recipient display
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() companyId: string | null = null; // Input to accept companyId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Input() invoiceSearchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  /** When true with source=reservation, document preview opens in the host shell instead of routing away. */
  @Input() embedDocumentPreviewInShell = false;
  @Output() organizationIdChange = new EventEmitter<string | null>(); // Emit organization changes to parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() companyIdChange = new EventEmitter<string | null>(); // Emit company changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  @Output() journalEntriesChanged = new EventEmitter<void>();
  @Output() previewEvent = new EventEmitter<InvoicePreviewSelection>();
  @Output() invoiceSelect = new EventEmitter<InvoiceSelection>();
  accountingService = inject(InvoiceService);
  toastr = inject(ToastrService);
  router = inject(Router);
  mappingService = inject(MappingService);
  private costCodesService = inject(CostCodesService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private officeService = inject(OfficeService);
  private reservationService = inject(ReservationService);
  private propertyService = inject(PropertyService);
  private contactService = inject(ContactService);
  private authService = inject(AuthService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private invoiceIifExportService = inject(InvoiceIifExportService);
  private invoiceDocumentService = inject(InvoiceDocumentService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate: TemplateRef<any>;
  @ViewChild(DataTableComponent) invoiceDataTable?: DataTableComponent;
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  showPaid: boolean = true;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property

  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded
  isAllExpanded: boolean = false; // Track if all rows are expanded
  loadingInvoiceLedgerLines: Set<string> = new Set();

  // Selection/Export
  selectedInvoiceIds: Set<string> = new Set();
  selectedInvoices: InvoiceResponse[] = [];
  hasQuickBooksAccess = false;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  isSuperUser: boolean = false;
  officeScopeResolved: boolean = false;

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservation: ReservationListResponse | null = null;

  companyContacts: ContactResponse[] = [];
  availableCompanyContacts: { value: ContactResponse, label: string }[] = [];
  selectedCompanyContact: ContactResponse | null = null;
 
  costCodes: CostCodesResponse[] = [];
  allCostCodes: CostCodesResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allChartOfAccounts: ChartOfAccountResponse[] = [];
  availableCostCodes: { value: number, label: string }[] = [];
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;

  // Payment form fields
  showPaymentForm: boolean = false;
  isManualApplyMode: boolean = false;
  selectedPaymentCostCodeId: number | null = null;
  selectedPaymentCostCode: CostCodesResponse | null = null;
  paymentTransactionType: string = '';
  paymentDescription: string = '';
  paymentDate: Date | null = new Date();
  paymentAmount: number = 0;
  paymentAmountDisplay: string = '$0.00';
  remainingAmount: number = 0;
  remainingAmountDisplay: string = '0.00';
  paymentOfficeId: number | null = null;
  isSubmittingPayment: boolean = false;
  paymentTargetInvoiceId: string | null = null;
  manualApplyEditableInvoiceId: string | null = null;
  pendingApplyAmountFocusInvoiceId: string | null = null;
  restoreTopbarAfterPayment: boolean = false;
  originalPaymentOfficeId: number | null = null;
  originalPaymentReservationId: string | null = null;
  originalPaymentCompanyId: string | null = null;
  creditCostCodes: { value: number, label: string }[] = [];
  lastInvoiceSearchKey: string | null = null;
  invoiceSearchInFlightKey: string | null = null;

  baseInvoicesDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
    responsibleParty: { displayAs: 'Recipient',  wrap: false, maxWidth: '20ch' },
    invoiceNumber: { displayAs: 'Invoice', maxWidth: '15ch', sortType: 'natural' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '15ch', alignment: 'center' },
    dueDate: { displayAs: 'Due Date', maxWidth: '15ch', alignment: 'center' },
    created: { displayAs: 'Created', maxWidth: '15ch', alignment: 'center' },
    totalAmount: { displayAs: 'Total', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    paidAmount: { displayAs: 'Paid', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    dueAmount: { displayAs: 'Due', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    applyAmount: { displayAs: 'Apply', maxWidth: '20ch', alignment: 'right', headerAlignment: 'right' }
  };

  invoicesDisplayedColumns: ColumnSet = {};

  ledgerLinesDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '5ch', wrap: false, alignment: 'left' },
    ledgerLineDate: { displayAs: 'Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    costCode: { displayAs: 'Cost Code', maxWidth: '25ch', wrap: false },
    transactionType: { displayAs: 'Type', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '15ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '15ch', wrap: false, alignment: 'right'}
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['reservations', 'invoices']));
  destroy$ = new Subject<void>();

  //#region Invoice-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.isSuperUser = this.authService.hasRole(UserGroups.SuperAdmin);
    this.hasQuickBooksAccess = this.authService.hasQuickBooksAccess();
    this.rebuildInvoicesDisplayedColumns();
    this.loadOffices();
    this.loadReservations();
    this.loadCompanyContacts();
    this.loadCostCodes();
    this.loadChartOfAccounts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Update if the value changed (including initial load when previousOfficeId is undefined)
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.resolveOfficeScope(newOfficeId, false);
        } else {
          // Offices not loaded yet, wait for them to load in loadOffices()
          // The loadOffices() method will handle setting selectedOffice from officeId input
        }
      }
    }
    
    // Watch for changes to reservationId input from parent (including initial load)
    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      const previousReservationId = changes['reservationId'].previousValue;
      
      if (previousReservationId === undefined || newReservationId !== previousReservationId) {
        this.syncSelectedReservationFromInput(newReservationId);
        if (this.officeScopeResolved) {
          this.loadInvoicesForCurrentSearchCriteria();
        }
      }
    }
    
    // Watch for changes to companyId input from parent (including initial load)
    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      const previousCompanyId = changes['companyId'].previousValue;
      
      // Update if the value changed (including initial load when previousCompanyId is undefined)
      if (previousCompanyId === undefined || newCompanyId !== previousCompanyId) {
        if (this.companyContacts.length > 0) {
          if (!newCompanyId) {
            if (this.selectedCompanyContact !== null) {
              this.selectedCompanyContact = null;
              this.filterReservations();
              this.applyFilters();
            }
          } else {
            const matching = this.companyContacts.find(c =>
              c.contactId === newCompanyId &&
              this.contactHasOfficeAccess(c, this.selectedOffice?.officeId ?? null)
            ) || null;
            if (matching !== this.selectedCompanyContact) {
              this.selectedCompanyContact = matching;
              this.filterReservations();
              this.applyFilters();
            }
          }
        }
      }
    }

    if (changes['organizationId']) {
      const newOrganizationId = changes['organizationId'].currentValue;
      const previousOrganizationId = changes['organizationId'].previousValue;

      if (previousOrganizationId === undefined || newOrganizationId !== previousOrganizationId) {
        this.applyFilters();
      }
    }

    if (changes['organizationName']) {
      const newOrganizationName = changes['organizationName'].currentValue;
      const previousOrganizationName = changes['organizationName'].previousValue;

      if (previousOrganizationName === undefined || newOrganizationName !== previousOrganizationName) {
        this.applyFilters();
      }
    }

    if (changes['invoiceSearchDateRange'] && !changes['invoiceSearchDateRange'].firstChange && this.officeScopeResolved) {
      this.loadInvoicesForCurrentSearchCriteria();
    }
  }

  getInvoices(): void {
    this.loadInvoicesForCurrentSearchCriteria(true);
  }

  addInvoice(): void {
    const params: string[] = [];

    // Reservation is source of truth for Add Invoice prefill.
    const reservationToUse = this.selectedReservation
      ?? (this.reservationId ? this.reservations.find(r => r.reservationId === this.reservationId) || null : null);
    const reservationIdToUse = reservationToUse?.reservationId ?? this.reservationId ?? null;
    const officeIdToUse = reservationToUse?.officeId ?? this.selectedOffice?.officeId ?? this.officeId ?? null;
    const companyIdToUse = (this.companyId !== null) ? this.companyId : (this.selectedCompanyContact?.contactId || null);

    if (this.embedDocumentPreviewInShell && (this.source === 'accounting' || this.source === 'reservation')) {
      this.invoiceSelect.emit({
        invoiceId: 'new',
        officeId: officeIdToUse,
        reservationId: reservationIdToUse,
        invoice: null
      });
      return;
    }

    if (this.source === 'reservation' && reservationIdToUse) {
      params.push('tab=invoices');
      params.push('invoiceId=new');
      if (officeIdToUse !== null) {
        params.push(`officeId=${officeIdToUse}`);
      }
      params.push(`reservationId=${reservationIdToUse}`);
      if (companyIdToUse !== null && companyIdToUse !== undefined && companyIdToUse !== '') {
        params.push(`companyId=${companyIdToUse}`);
      }
      const reservationUrl = RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationIdToUse]);
      this.router.navigateByUrl(`${reservationUrl}?${params.join('&')}`);
      return;
    }

    const targetUrl = this.isSuperUser ? RouterUrl.Billing : RouterUrl.Accounting;
    const url = RouterUrl.replaceTokens(targetUrl, ['new']);
    if (officeIdToUse !== null) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse !== null) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    if (companyIdToUse !== null && companyIdToUse !== undefined && companyIdToUse !== '') {
      params.push(`companyId=${companyIdToUse}`);
    }
    if (this.isSuperUser && this.organizationId) {
      params.push(`organizationId=${this.organizationId}`);
    }
    if (this.source === 'accounting') {
      params.push(`returnTo=accounting`);
    } else if (reservationIdToUse !== null) {
      params.push(`returnTo=reservation`);
    } else {
      params.push(`returnTo=accounting`);
    }
    this.router.navigateByUrl(params.length > 0 ? `${url}?${params.join('&')}` : url);
  }

  deleteInvoice(invoice: InvoiceResponse): void {
    if (this.invoiceHasAppliedPayments(invoice)) {
      this.toastr.error('Invoices with payments applied may not be deleted.', CommonMessage.Error);
      return;
    }

    this.accountingService.deleteInvoice(invoice.invoiceId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Invoice deleted successfully', CommonMessage.Success);
        this.loadInvoicesForCurrentSearchCriteria(true);
      },
      error: (err: HttpErrorResponse) => {
        const message = typeof err?.error === 'string'
          ? err.error
          : err?.error?.message ?? 'Unable to delete invoice.';
        this.toastr.error(message, CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }  //#endregion

  //#region Action Methods
  printInvoice(invoice: InvoiceResponse): void {
    if (!invoice?.invoiceId) {
      return;
    }

    this.invoiceDocumentService.printInvoice(invoice).pipe(take(1)).subscribe({
      error: (err: Error) => {
        this.toastr.error(err?.message || 'Failed to print invoice.', CommonMessage.Error);
      }
    });
  }

  downloadInvoice(invoice: InvoiceResponse): void {
    if (!invoice?.invoiceId) {
      return;
    }

    this.invoiceDocumentService.downloadInvoicePdf(invoice).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Invoice downloaded.', CommonMessage.Success);
      },
      error: (err: Error) => {
        this.toastr.error(err?.message || 'Failed to download invoice.', CommonMessage.Error);
      }
    });
  }

  goToInvoice(event: InvoiceResponse, fromEditButton: boolean = false): void {
    // Don't navigate if payment form is active, unless it's from the edit button
    if (this.showPaymentForm && !fromEditButton) {
      return;
    }

    const officeIdToUse = (this.officeId !== null) ? this.officeId : (this.selectedOffice?.officeId || null);
    const reservationIdToUse = (this.reservationId !== null) ? this.reservationId : (this.selectedReservation?.reservationId || null);

    // Embedded shells own the editor swap; do not rely on a sibling-route remount / query-only nav.
    if (this.embedDocumentPreviewInShell && (this.source === 'accounting' || this.source === 'reservation')) {
      // Prefer the cached InvoiceResponse — row click emits a display row whose ledgerLines
      // are already remapped for the table and must not be treated as API payload.
      const sourceInvoice = this.allInvoices.find(invoice => invoice.invoiceId === event.invoiceId) ?? event;
      this.invoiceSelect.emit({
        invoiceId: event.invoiceId,
        officeId: officeIdToUse,
        reservationId: reservationIdToUse ?? event.reservationId ?? null,
        invoice: sourceInvoice
      });
      return;
    }
    
    const params: string[] = [];

    // Prefer @Input() values from parent, otherwise use selectedOffice/selectedReservation
    const companyIdToUse = this.selectedCompanyContact?.contactId || null;
    const reservationId = event?.reservationId || null;

    if (this.source === 'reservation' && reservationIdToUse) {
      params.push('tab=invoices');
      params.push(`invoiceId=${event.invoiceId}`);
      if (officeIdToUse !== null) {
        params.push(`officeId=${officeIdToUse}`);
      }
      params.push(`reservationId=${reservationIdToUse}`);
      if (companyIdToUse !== null && companyIdToUse !== undefined && companyIdToUse !== '') {
        params.push(`companyId=${companyIdToUse}`);
      }
      const reservationUrl = RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationIdToUse]);
      this.router.navigateByUrl(`${reservationUrl}?${params.join('&')}`, { state: { prefetchedInvoice: event } });
      return;
    }

    const targetUrl = this.isSuperUser ? RouterUrl.Billing : RouterUrl.Accounting;
    const url = RouterUrl.replaceTokens(targetUrl, [event.invoiceId]);
    if (officeIdToUse !== null) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse !== null) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    if (companyIdToUse !== null && companyIdToUse !== undefined && companyIdToUse !== '') {
      params.push(`companyId=${companyIdToUse}`);
    }
    if (this.isSuperUser && reservationId) {
      params.push(`organizationId=${reservationId}`);
    }
    if (this.source === 'accounting') {
      params.push(`returnTo=accounting`);
    } else if (reservationIdToUse !== null) {
      params.push(`returnTo=reservation`);
    } else {
      params.push(`returnTo=accounting`);
    }
    this.router.navigateByUrl(params.length > 0 ? `${url}?${params.join('&')}` : url, { state: { prefetchedInvoice: event } });
  }

  goToReservation(event: InvoiceResponse): void {
    if (this.showPaymentForm) {
      return;
    }

    const reservationId = event?.reservationId || null;
    if (!reservationId) {
      return;
    }

    const params: string[] = ['returnTo=invoice-list'];
    const officeIdToUse = event?.officeId ?? this.selectedOffice?.officeId ?? null;
    const companyIdToUse = this.selectedCompanyContact?.contactId || null;

    if (officeIdToUse !== null && officeIdToUse !== undefined) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationId) {
      params.push(`reservationId=${reservationId}`);
    }
    if (companyIdToUse) {
      params.push(`companyId=${companyIdToUse}`);
    }
    if (this.isSuperUser && this.organizationId) {
      params.push(`organizationId=${this.organizationId}`);
    }

    const reservationUrl = RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
    this.router.navigateByUrl(`${reservationUrl}?${params.join('&')}`);
  }

  goToInvoiceCreateView(event: InvoiceResponse): void {
    if (this.showPaymentForm) {
      return;
    }

    const params: string[] = [];
    const officeIdToUse = event?.officeId ?? this.officeId ?? this.selectedOffice?.officeId ?? null;
    const reservationIdToUse = event?.reservationId ?? this.reservationId ?? this.selectedReservation?.reservationId ?? null;
    const invoiceIdToUse = event?.invoiceId ?? null;
    const companyIdToUse = this.selectedCompanyContact?.contactId || null;

    if (officeIdToUse !== null) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse !== null) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    if (invoiceIdToUse) {
      params.push(`invoiceId=${invoiceIdToUse}`);
    }
    if (companyIdToUse !== null && companyIdToUse !== undefined && companyIdToUse !== '') {
      params.push(`companyId=${companyIdToUse}`);
    }

    if (this.source === 'reservation' && this.embedDocumentPreviewInShell) {
      this.previewEvent.emit({
        invoiceId: invoiceIdToUse!,
        invoiceCode: event?.invoiceCode ?? null,
        officeId: officeIdToUse,
        reservationId: reservationIdToUse,
        companyId: companyIdToUse
      });
      return;
    }

    if (this.source === 'accounting' && this.embedDocumentPreviewInShell) {
      this.previewEvent.emit({
        invoiceId: invoiceIdToUse!,
        invoiceCode: event?.invoiceCode ?? null,
        officeId: officeIdToUse,
        reservationId: reservationIdToUse,
        companyId: companyIdToUse
      });
      return;
    }

    if (this.source === 'reservation') {
      params.push(`returnTo=reservation`);
    } else {
      params.push(`returnTo=accounting`);
    }

    const targetUrl = RouterUrl.InvoiceCreate;
    if (params.length > 0) {
      this.router.navigateByUrl(`${targetUrl}?${params.join('&')}`);
    } else {
      this.router.navigateByUrl(targetUrl);
    }
  }

  onPayable(event: InvoiceResponse | any): void {
    // Keep top-bar filters unchanged. Open manual apply mode and focus clicked row amount.
    const invoiceOfficeId = Number(event?.officeId ?? 0);
    this.paymentOfficeId = Number.isFinite(invoiceOfficeId) && invoiceOfficeId > 0 ? invoiceOfficeId : null;
    this.pendingApplyAmountFocusInvoiceId = event?.invoiceId ? String(event.invoiceId) : null;
    this.openApplyPaymentDialog(this.pendingApplyAmountFocusInvoiceId);
    this.focusPendingApplyAmountInput();
  }

  buildInvoiceSearchKey(officeIds: number[]): string {
    const request = this.buildInvoiceSearchRequest(officeIds);
    return JSON.stringify({
      officeIds: [...officeIds].sort((a, b) => a - b),
      reservationId: request.reservationId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null,
      isActive: request.isActive ?? null,
      includeInactive: request.includeInactive,
      includePaid: request.includePaid
    });
  }

  syncSelectedReservationFromInput(reservationId: string | null | undefined): void {
    this.selectedReservation = reservationId
      ? this.reservations.find(r =>
          r.reservationId === reservationId
          && (!this.selectedOffice || r.officeId === this.selectedOffice.officeId)
        ) || null
      : null;
    this.filterReservations();
  }
  //#endregion

  //#region Filter methods
  onInactiveToggleChange(event: MatSlideToggleChange): void {
    this.showInactive = event.checked;
    this.loadInvoicesForCurrentSearchCriteria(true);
    this.cdr.markForCheck();
  }

  onShowPaidToggleChange(event: MatSlideToggleChange): void {
    this.showPaid = event.checked;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allInvoices;
    filtered = this.showInactive
      ? filtered.filter(invoice => invoice.isActive === false)
      : filtered.filter(invoice => invoice.isActive === true);

    if (this.source === 'accounting' && !this.showPaid) {
      filtered = filtered.filter(invoice => Math.abs(this.getInvoiceBalanceDue(invoice)) > 0.005);
    }

    // In Accounting SuperAdmin mode, organization filter maps to recipient organization
    // which is stored in invoice.reservationId for billing invoices.
    if (this.source === 'accounting' && this.isSuperUser && this.organizationId) {
      filtered = filtered.filter(invoice => invoice.reservationId === this.organizationId);
    }

    if (this.selectedOffice) {
      filtered = filtered.filter(invoice => invoice.officeId === this.selectedOffice!.officeId);
    }

    if (this.selectedReservation) {
      filtered = filtered.filter(invoice => invoice.reservationId === this.selectedReservation!.reservationId);
    }

    if (this.selectedCompanyContact) {
      const companyName = this.selectedCompanyContact.companyName;
      const companyContacts = this.companyContacts.filter(contact => contact.isActive && contact.companyName === companyName);
      const companyContactIds = companyContacts.map(contact => contact.contactId);
      filtered = filtered.filter(invoice => {
        const reservation = this.reservations.find(r => r.reservationId === invoice.reservationId);
        if (!reservation) {
          return false;
        }
        return companyContactIds.includes(reservation.contactId)
          || companyContacts.some(contact => contact.companyName === reservation.companyName || contact.displayName === reservation.companyName);
      });
    }

    // Map invoices to include expand button data for DataTableComponent
    this.invoicesDisplay = filtered.map(invoice => {
      const rawLedgerLines = invoice.ledgerLines ?? [];
      const costCodesForInvoice = this.allCostCodes.filter(costCode => costCode.officeId === invoice.officeId);
      const mappedLedgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, costCodesForInvoice, this.transactionTypes);
      const totalAmount = invoice.totalAmount || 0;
      const paidAmount = this.resolveInvoicePaidAmount(invoice);
      
      // Calculate due amount: Total - Paid
      const dueAmount = totalAmount - paidAmount;
      const dueAmountValue = dueAmount; // Store raw value for validation
      
      // Store original due amount value when entering manual mode (for editability check)
      // If already in manual mode and originalDueAmountValue exists, preserve it
      const invoiceAny = invoice as any; // Type assertion for display object properties
      const originalDueAmountValue = this.isManualApplyMode && invoiceAny.originalDueAmountValue !== undefined 
        ? invoiceAny.originalDueAmountValue 
        : dueAmountValue;
      
      // Manual apply: fill apply box only for selected rows (or single row when opened via $)
      let applyAmountValue = 0;
      if (this.isManualApplyMode) {
        const targetInvoiceId = this.manualApplyEditableInvoiceId;
        if (targetInvoiceId) {
          applyAmountValue = invoice.invoiceId === targetInvoiceId ? dueAmountValue : 0;
        } else if (this.showPaymentForm && this.selectedInvoiceIds.has(invoice.invoiceId)) {
          applyAmountValue = dueAmountValue;
        }
      }
      const applyAmountEditable = !this.manualApplyEditableInvoiceId || this.manualApplyEditableInvoiceId === invoice.invoiceId;
      
      return {
      ...invoice,
      selected: this.showInvoiceTableSelections && this.selectedInvoiceIds.has(invoice.invoiceId),
      invoiceNumber: invoice.invoiceCode || '',
      reservationCode: this.getCompanyCodeDisplay(invoice),
      propertyCode: (invoice.propertyCode || '').trim() || '—',
      responsibleParty: this.getRecipientDisplay(invoice),
      totalAmount: '$' + this.formatter.currency(totalAmount),
      totalAmountValue: totalAmount, // Store raw value for validation
      paidAmount: '$' + this.formatter.currency(paidAmount), // Always display as formatted (read-only)
      paidAmountValue: paidAmount, // Store raw value (read-only, never changes during manual entry)
      paidAmountDisplay: '$' + this.formatter.currency(paidAmount), // Display value (read-only)
      dueAmount: '$' + this.formatter.currency(dueAmount),
      dueAmountValue: dueAmountValue, // Store raw value for validation (current due amount)
      originalDueAmountValue: originalDueAmountValue, // Store original due amount (for editability check)
      applyAmount: this.isManualApplyMode ? (applyAmountValue < 0 ? '-$' + this.formatter.currency(-applyAmountValue) : '$' + this.formatter.currency(applyAmountValue)) : '',
      applyAmountValue: applyAmountValue, // Store raw value for calculations
      applyAmountDisplay: this.isManualApplyMode ? (applyAmountValue < 0 ? '-$' + this.formatter.currency(-applyAmountValue) : '$' + this.formatter.currency(applyAmountValue)) : '',
      applyAmountEditable: applyAmountEditable,
      startDate: this.formatter.formatDateString(invoice.startDate),
      endDate: this.formatter.formatDateString(invoice.endDate),
      period: this.formatter.formatInvoiceListAccountingPeriod(invoice.accountingPeriod),
      invoiceDate: this.formatter.formatDateString(invoice.invoiceDate),
      dueDate: this.formatter.formatDateString(invoice.dueDate),
      created: this.formatter.formatInvoiceListCreatedOn(invoice.createdOn),
      expand: invoice.invoiceId, // Store invoiceId for expand functionality
      expanded: this.expandedInvoices.has(invoice.invoiceId), // Restore expanded state from Set
      ledgerLines: mappedLedgerLines,
      expandClick: (event: Event, item: any) => {
        event.stopPropagation();
        if (this.expandedInvoices.has(item.invoiceId)) {
          this.expandedInvoices.delete(item.invoiceId);
        } else {
          this.expandedInvoices.add(item.invoiceId);
          this.ensureInvoiceLedgerLinesLoaded(item.invoiceId);
        }
        this.applyFilters();
      }
      };
    });
    // Update isAllExpanded state after filtering
    this.updateIsAllExpanded();
    this.cdr.markForCheck();
  }

  filterReservations(): void {
    // When All Offices is selected, show the full reservation list as loaded for this login.
    let filteredReservations = this.selectedOffice
      ? this.reservations.filter(r => r.officeId === this.selectedOffice!.officeId)
      : this.reservations;

    if (this.selectedCompanyContact) {
      const companyName = this.selectedCompanyContact.companyName;
      const companyContacts = this.companyContacts.filter(contact => contact.isActive && contact.companyName === companyName);
      const companyContactIds = companyContacts.map(contact => contact.contactId);
      filteredReservations = filteredReservations.filter(reservation =>
        companyContactIds.includes(reservation.contactId)
        || companyContacts.some(contact => contact.companyName === reservation.companyName || contact.displayName === reservation.companyName)
      );
    }

    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.companyContacts.find(c => c.contactId === r.contactId) ?? null)
    }));
    
    // Clear selected reservation if it no longer exists in the available list.
    if (this.selectedReservation && !filteredReservations.some(r => r.reservationId === this.selectedReservation?.reservationId)) {
      // When parent passes reservationId as source-of-truth, keep that selection pinned
      // instead of emitting a null clear that can override parent state.
      if (this.reservationId) {
        const pinnedReservation = this.reservations.find(r =>
          r.reservationId === this.reservationId
          && (!this.selectedOffice || r.officeId === this.selectedOffice.officeId)
        ) || null;
        if (pinnedReservation) {
          this.selectedReservation = pinnedReservation;
          this.applyFilters();
          return;
        }
      }

      this.selectedReservation = null;
      this.reservationIdChange.emit(null);
      this.applyFilters();
    }
    
    // Ensure reservationId from @Input is set after filtering
    if (this.reservationId !== null && this.reservationId !== undefined && this.reservations.length > 0) {
      const matchingReservation = this.reservations.find(r => 
        r.reservationId === this.reservationId &&
        (!this.selectedOffice || r.officeId === this.selectedOffice.officeId)
      ) || null;
      if (matchingReservation && matchingReservation !== this.selectedReservation) {
        this.selectedReservation = matchingReservation;
        this.applyFilters();
      }
    }
  }

  filterCompanyContacts(): void {
    const filtered = this.selectedOffice
      ? this.companyContacts.filter(c => c.isActive && this.contactHasOfficeAccess(c, this.selectedOffice?.officeId ?? null))
      : this.companyContacts.filter(c => c.isActive);
    this.availableCompanyContacts = filtered.map(c => ({
      value: c,
      label: this.utilityService.getCompanyDropdownLabel(c)
    }));

    if (this.selectedCompanyContact && !filtered.some(c => c.contactId === this.selectedCompanyContact?.contactId)) {
      this.selectedCompanyContact = null;
      this.companyIdChange.emit(null);
      this.applyFilters();
    }

    if (this.companyContacts.length > 0) {
      const companyIdToApply = this.getCompanyIdToApply();
      if (companyIdToApply) {
        const matching = this.companyContacts.find(c =>
          c.contactId === companyIdToApply &&
          this.contactHasOfficeAccess(c, this.selectedOffice?.officeId ?? null)
        );
        if (matching && matching !== this.selectedCompanyContact) {
          this.selectedCompanyContact = matching;
          this.applyFilters();
        }
      }
    }
  }
    
  filterChartOfAccounts(): void {
    if (!this.selectedOffice) {
      this.chartOfAccounts = [];
      return;
    }

    this.chartOfAccounts = this.allChartOfAccounts.filter(account => account.officeId === this.selectedOffice!.officeId);
  }

  filterCostCodes(): void {
    if (!this.selectedOffice) {
      this.costCodes = [];
      this.availableCostCodes = [];
      this.creditCostCodes = [];
      return;
    }
    
    // Get cost codes for the selected office from the observable data
    this.costCodes = this.costCodesService.getCostCodesForOffice(this.selectedOffice.officeId);
    this.availableCostCodes = this.costCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));
    
    // Filter to only credit cost codes (transactionTypeId === Payment) for payment form
    this.creditCostCodes = this.costCodes
      .filter(c => c.isActive && c.transactionTypeId === TransactionType.Payment)
      .map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));
  }

  get resolvedPaymentOfficeId(): number | null {
    return this.paymentOfficeId ?? this.selectedOffice?.officeId ?? null;
  }

  refreshPaymentCostCodesForResolvedOffice(): void {
    const officeId = this.resolvedPaymentOfficeId;
    if (!officeId) {
      this.creditCostCodes = [];
      if (this.selectedPaymentCostCodeId != null) {
        this.selectedPaymentCostCodeId = null;
        this.selectedPaymentCostCode = null;
        this.paymentTransactionType = '';
      }
      return;
    }

    this.creditCostCodes = this.allCostCodes
      .filter(c => c.officeId === officeId && c.isActive && c.transactionTypeId === TransactionType.Payment)
      .map(c => ({
        value: c.costCodeId,
        label: this.utilityService.getCostCodeDropdownLabel(c)
      }));

    if (this.selectedPaymentCostCodeId != null && !this.creditCostCodes.some(c => c.value === this.selectedPaymentCostCodeId)) {
      this.selectedPaymentCostCodeId = null;
      this.selectedPaymentCostCode = null;
      this.paymentTransactionType = '';
    }
  }

  ensureInvoiceLedgerLinesLoaded(invoiceId: string | null | undefined): void {
    if (!invoiceId || this.loadingInvoiceLedgerLines.has(invoiceId)) {
      return;
    }

    const existingInvoice = this.allInvoices.find(invoice => invoice.invoiceId === invoiceId);
    if (!existingInvoice || (existingInvoice.ledgerLines?.length ?? 0) > 0) {
      return;
    }

    this.loadingInvoiceLedgerLines.add(invoiceId);
    this.accountingService.getInvoiceByGuid(invoiceId).pipe(
      take(1),
      finalize(() => this.loadingInvoiceLedgerLines.delete(invoiceId))
    ).subscribe({
      next: (fullInvoice) => {
        const targetIndex = this.allInvoices.findIndex(invoice => invoice.invoiceId === invoiceId);
        if (targetIndex === -1) {
          return;
        }

        this.allInvoices[targetIndex] = {
          ...this.allInvoices[targetIndex],
          ...fullInvoice,
          ledgerLines: fullInvoice.ledgerLines ?? []
        };

        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.markViewForCheck();
      }
    });
  }  
  //#endregion

  //#region Expand All Methods
  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      // Expand all: add all invoice IDs to the set
      this.invoicesDisplay.forEach(invoice => {
        if (invoice.invoiceId) {
          this.expandedInvoices.add(invoice.invoiceId);
        }
      });
    } else {
      // Collapse all: clear the set
      this.expandedInvoices.clear();
    }
    // Update the expanded state for all invoices
    this.applyFilters();
  }

  updateIsAllExpanded(): void {
    // Check if all visible invoices are expanded
    if (this.invoicesDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }
    this.isAllExpanded = this.invoicesDisplay.every(invoice => 
      invoice.invoiceId && this.expandedInvoices.has(invoice.invoiceId)
    );
  }
  //#endregion

  //#region Selection/Export Methods
  onInvoiceSelectionSet(_selection: SelectionModel<unknown>): void {
    this.selectedInvoiceIds = new Set(
      this.invoicesDisplay
        .filter(row => !!row.selected && row.invoiceId)
        .map(row => String(row.invoiceId))
    );

    for (const invoiceId of [...this.selectedInvoiceIds]) {
      if (this.getInvoiceDueAmountValue(invoiceId) <= 0) {
        this.selectedInvoiceIds.delete(invoiceId);
        const row = this.invoicesDisplay.find(invoice => invoice.invoiceId === invoiceId);
        if (row) {
          row.selected = false;
        }
      }
    }

    this.selectedInvoices = this.allInvoices.filter(inv => this.selectedInvoiceIds.has(inv.invoiceId));

    if (!this.isManualApplyMode || !this.showPaymentForm || this.isRowScopedPaymentMode) {
      this.invoicesDisplay.forEach(row => {
        row.selected = this.showInvoiceTableSelections && this.selectedInvoiceIds.has(row.invoiceId);
      });
    }

    this.markViewForCheck();
  }

  /** User checkbox toggle while Apply Payment is open — refresh apply boxes (not called from table data reload). */
  onInvoiceApplySelectionRowChanged(row: { invoiceId?: string; selected?: boolean }, checked: boolean): void {
    if (!this.isManualApplyMode || !this.showPaymentForm || this.isRowScopedPaymentMode) {
      return;
    }

    const invoiceId = String(row?.invoiceId ?? '').trim();
    if (!invoiceId) {
      return;
    }

    if (checked) {
      if (this.getInvoiceDueAmountValue(invoiceId) <= 0) {
        row.selected = false;
        return;
      }
      this.selectedInvoiceIds.add(invoiceId);
    } else {
      this.selectedInvoiceIds.delete(invoiceId);
    }

    this.refreshApplyAmountsForSelection();
  }

  refreshApplyAmountsForSelection(): void {
    this.invoicesDisplay.forEach(displayRow => {
      if (!displayRow.invoiceId) {
        return;
      }
      const isSelected = this.selectedInvoiceIds.has(displayRow.invoiceId);
      displayRow.selected = isSelected;
      const dueAmount = isSelected
        ? this.roundCurrencyValue(Number(displayRow.dueAmountValue ?? 0))
        : 0;
      this.setInvoiceApplyAmount(displayRow, dueAmount);
    });
    this.syncPaymentHeaderFromDisplayApplyAmounts();
    this.invoiceDataTable?.refreshDisplayedData();
    this.markViewForCheck();
  }

  exportInvoicesToIif(): void {
    if (!this.hasQuickBooksAccess) {
      return;
    }
    const invoiceIds = Array.from(this.selectedInvoiceIds);
    if (invoiceIds.length === 0) {
      this.toastr.warning('Select one or more invoices to export.', 'Export');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoiceExport');
    from(invoiceIds).pipe(
      concatMap(invoiceId => this.accountingService.getInvoiceByGuid(invoiceId).pipe(take(1))),
      toArray(),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoiceExport'))
    ).subscribe({
      next: (invoices) => {
        const reservationsById = new Map<string, ReservationListResponse>();
        this.reservations.forEach(reservation => reservationsById.set(reservation.reservationId, reservation));

        const propertyIds = Array.from(new Set(
          invoices
            .map(invoice => reservationsById.get(invoice.reservationId || '')?.propertyId)
            .filter((propertyId): propertyId is string => !!propertyId)
        ));

        from(propertyIds).pipe(
          concatMap(propertyId => this.propertyService.getPropertyByGuid(propertyId).pipe(take(1))),
          toArray()
        ).subscribe({
          next: (properties) => {
            const propertyById = new Map<string, { city: string; propertyCode: string }>();
            properties.forEach(property => {
              propertyById.set(property.propertyId, {
                city: String(property.city || '').trim(),
                propertyCode: String(property.propertyCode || '').trim()
              });
            });

            const officesById = new Map((this.offices || []).map(office => [office.officeId, office]));
            const classAndMemoByInvoiceId: Record<string, string> = {};
            const nameByInvoiceId: Record<string, string> = {};
            invoices.forEach(invoice => {
              const reservation = reservationsById.get(invoice.reservationId || '');
              const property = reservation?.propertyId ? propertyById.get(reservation.propertyId) : undefined;
              const office = officesById.get(invoice.officeId);
              const contact = reservation?.contactId
                ? this.contactService.getAllContactsValue().find(c => c.contactId === reservation.contactId) ?? null
                : null;
              const exportContext = {
                recipient: String(this.getRecipientDisplay(invoice) || '').trim(),
                reservationCode: String(reservation?.reservationCode || invoice.reservationCode || '').trim().replace(/^R-/i, ''),
                reservationBoardLabel: reservation ? this.utilityService.getReservationBoardLabel(reservation, contact).trim().replace(':', ' /') : '',
                occupantName: String(reservation?.tenantName || '').trim(),
                city: String(property?.city || '').trim(),
                propertyCode: String(property?.propertyCode || reservation?.propertyCode || '').trim(),
                officeCode: String(office?.officeCode || '').trim(),
                officeName: String(office?.name || invoice.officeName || '').trim(),
                responsibleParty: String(invoice.responsibleParty || '').trim()
              };

              nameByInvoiceId[invoice.invoiceId] = this.invoiceIifExportService.buildQuickBooksName(
                office?.qbNameTypeId ?? QbNameType.Unselected,
                exportContext
              );
              classAndMemoByInvoiceId[invoice.invoiceId] = this.invoiceIifExportService.buildQuickBooksClass(
                office?.qbClassTypeId ?? QbClassType.Unselected,
                exportContext
              );
            });

            const chartOfAccountsForExport = this.selectedOffice
              ? this.chartOfAccounts
              : this.allChartOfAccounts;
            const iifContent = this.invoiceIifExportService.generateInvoicesIifContent(
              invoices,
              this.allCostCodes,
              chartOfAccountsForExport,
              {
                nameByInvoiceId,
                classByInvoiceId: classAndMemoByInvoiceId
              }
            );
            const fileName = `invoices-${this.utilityService.todayAsCalendarDateString()}.iif`;
            const blob = new Blob([iifContent], { type: 'text/plain;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(url);
          },
          error: () => {
            this.toastr.error('Failed to load property details for invoice export.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.toastr.error('Failed to export invoices.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Data Load Items
  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.officeService.ensureOfficesLoaded(organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
        this.offices = allOffices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);

        // During logout, office cache is cleared before navigation completes.
        // Avoid invoice requests with an invalid/cleared auth context.
        if (!this.offices.length) {
          this.selectedOffice = null;
          this.officeScopeResolved = true;
          this.selectedReservation = null;
          this.selectedCompanyContact = null;
          this.availableReservations = [];
          this.availableCompanyContacts = [];
          this.allInvoices = [];
          this.invoicesDisplay = [];
          this.markViewForCheck();
          return;
        }

        const defaultOfficeId = this.officeId ?? null;
        this.resolveOfficeScope(defaultOfficeId, this.officeId === null || this.officeId === undefined);
        this.markViewForCheck();
      });
    });
  }

  loadReservations(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
        
        // Sync selectedReservation from input
        if (this.reservationId !== null && this.reservationId !== undefined && this.selectedOffice) {
          const matchingReservation = this.reservations.find(r => 
            r.reservationId === this.reservationId && r.officeId === this.selectedOffice?.officeId
          ) || null;
          if (matchingReservation !== this.selectedReservation) {
            this.selectedReservation = matchingReservation;
            this.applyFilters();
          }
        }
        
        // If a company is selected, re-apply filters now that reservations are loaded
        // Re-apply filters once reservations load so company matching can evaluate reservation fields.
        if (this.selectedCompanyContact) {
          this.applyFilters();
        }
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        this.availableReservations = [];
        this.markViewForCheck();
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
          this.allCostCodes = accounts || [];
          this.filterCostCodes();
          this.applyFilters();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.allCostCodes = [];
      }
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.allChartOfAccounts = accounts || [];
        this.filterChartOfAccounts();
        this.markViewForCheck();
      });
    });
  }

  loadCompanyContacts(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'companies');
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllCompanyContacts().pipe(
          take(1),
          finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies'); })
        ).subscribe({
          next: (contacts) => {
            this.companyContacts = contacts || [];
            this.filterCompanyContacts();
            this.markViewForCheck();
          },
          error: () => {
            this.companyContacts = [];
            this.availableCompanyContacts = [];
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.companyContacts = [];
        this.availableCompanyContacts = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies');
        this.markViewForCheck();
      }
    });
  }

  loadInvoicesForCurrentSearchCriteria(force: boolean = false): void {
    if (!this.officeScopeResolved) {
      return;
    }

    const officeIds = this.resolveOfficeIdsForSearch();
    if (officeIds.length === 0) {
      this.lastInvoiceSearchKey = null;
      this.invoiceSearchInFlightKey = null;
      this.allInvoices = [];
      this.invoicesDisplay = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices');
      this.markViewForCheck();
      return;
    }

    const searchKey = this.buildInvoiceSearchKey(officeIds);
    if (!force && (searchKey === this.lastInvoiceSearchKey || searchKey === this.invoiceSearchInFlightKey)) {
      return;
    }

    this.invoiceSearchInFlightKey = searchKey;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
    this.accountingService.searchInvoices(this.buildInvoiceSearchRequest(officeIds)).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices');
      if (this.invoiceSearchInFlightKey === searchKey) {
        this.invoiceSearchInFlightKey = null;
      }
    })).subscribe({
      next: (invoices) => {
        this.lastInvoiceSearchKey = searchKey;
        this.allInvoices = invoices || [];
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.allInvoices = [];
        this.invoicesDisplay = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompanyContact?.contactId || null);

    // Re-filter reservations based on selected company.
    this.filterReservations();

    this.applyFilters();
  }

  compareReservationById(a: ReservationListResponse | null, b: ReservationListResponse | null): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return a.reservationId === b.reservationId;
  }

  onReservationChange(): void {
    // Emit reservation change to parent
    this.reservationIdChange.emit(this.selectedReservation?.reservationId || null);
    
    // Preserve scroll position before filtering to prevent page jump
    const scrollContainer = document.querySelector('.tableDiv') || document.querySelector('.mat');
    const scrollTop = scrollContainer ? (scrollContainer as HTMLElement).scrollTop : window.pageYOffset;

    this.loadInvoicesForCurrentSearchCriteria();
    
    // Restore scroll position after Angular change detection completes
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      if (scrollContainer) {
        (scrollContainer as HTMLElement).scrollTop = scrollTop;
      } else {
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
      }
    });
  }

  focusPendingApplyAmountInput(): void {
    const invoiceId = this.pendingApplyAmountFocusInvoiceId;
    if (!invoiceId || !this.isManualApplyMode || !this.showPaymentForm) {
      return;
    }

    const inputId = this.getApplyAmountInputId(invoiceId);
    queueMicrotask(() => {
      setTimeout(() => {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!input) {
          return;
        }
        input.focus();
        input.select();
        this.pendingApplyAmountFocusInvoiceId = null;
      }, 0);
    });
  }
  //#endregion

  //#region Get Methods
  get showInvoiceTableSelections(): boolean {
    return this.source === 'accounting';
  }

  rebuildInvoicesDisplayedColumns(): void {
    const columns = { ...this.baseInvoicesDisplayedColumns };
    if (this.source === 'accounting' && this.isSuperUser) {
      columns['reservationCode'] = { ...columns['reservationCode'], displayAs: 'Company' };
    }

    if (!this.isManualApplyMode) {
      const { applyAmount, ...columnsWithoutApply } = columns;
      this.invoicesDisplayedColumns = columnsWithoutApply;
      return;
    }

    this.invoicesDisplayedColumns = columns;
  }

  get dueInvoicesCount(): number {
    return this.invoicesDisplay.filter(invoice => (invoice?.dueAmountValue || 0) > 0).length;
  }

  get isPaymentFormValid(): boolean {
    const hasPaymentDate = this.utilityService.toDateOnlyJsonString(this.paymentDate) !== null;
    const baseValid = hasPaymentDate && !!this.selectedPaymentCostCodeId && this.paymentAmount !== 0;

    if (this.isRowScopedPaymentMode) {
      return baseValid;
    }

    if (this.isManualApplyMode) {
      return baseValid && this.isRemainingAmountZero();
    }

    return baseValid;
  }

  getPaymentRequestDescription(): string {
    const trimmedDescription = (this.paymentDescription || '').trim();
    if (trimmedDescription) {
      return trimmedDescription;
    }

    // Ensure each payment request gets a concrete description so it is persisted as a distinct line.
    const now = new Date();
    const isoStamp = now.toISOString().replace('T', ' ').slice(0, 19);
    return `Payment ${isoStamp}`;
  }

  getCompanyIdToApply(): string | null {
    if (this.companyId !== null && this.companyId !== undefined && this.companyId !== '') {
      return this.companyId;
    }

    return this.selectedCompanyContact?.contactId ?? null;
  }

  /**
   * API ledger lines do not carry transactionTypeId (only costCodeId).
   * Prefer Invoice.PaidAmount (authoritative after apply-payment); fall back to Payment lines via cost code.
   */
  resolveInvoicePaidAmount(invoice: InvoiceResponse): number {
    const paidFromInvoice = Number(invoice.paidAmount || 0);
    if (Number.isFinite(paidFromInvoice) && Math.abs(paidFromInvoice) > 0.005) {
      return paidFromInvoice;
    }

    const rawLedgerLines = invoice.ledgerLines ?? [];
    if (rawLedgerLines.length === 0) {
      return Number.isFinite(paidFromInvoice) ? paidFromInvoice : 0;
    }

    return this.getPaidAmountFromLedgerLines(rawLedgerLines, invoice.officeId);
  }

  getPaidAmountFromLedgerLines(ledgerLines: any[], officeId: number): number {
    if (!ledgerLines || ledgerLines.length === 0) {
      return 0;
    }

    return ledgerLines.reduce((sum, line) => {
      if (!this.isInvoicePaymentLedgerLine(line, officeId)) {
        return sum;
      }

      const amount = Number(line?.amount || 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }

  isInvoicePaymentLedgerLine(line: any, officeId: number): boolean {
    // Prefer cost-code lookup: list payloads omit transactionTypeId and mapping defaults missing to Charge (0).
    const fromCostCode = this.getTransactionTypeIdFromCostCode(line?.costCodeId, officeId);
    if (fromCostCode === TransactionType.Payment) {
      return true;
    }

    if (Number(line?.transactionTypeId) === TransactionType.Payment) {
      return true;
    }

    const transactionTypeLabel = (line?.transactionType || '').toString().toLowerCase();
    return transactionTypeLabel === 'payment';
  }

  invoiceHasAppliedPayments(invoice: InvoiceResponse & { paidAmountValue?: number }): boolean {
    return Math.abs(this.getInvoicePaidAmount(invoice)) > 0;
  }

  getInvoicePaidAmount(invoice: InvoiceResponse & { paidAmountValue?: number }): number {
    if (invoice.paidAmountValue != null && !Number.isNaN(Number(invoice.paidAmountValue))) {
      return Number(invoice.paidAmountValue);
    }

    return this.resolveInvoicePaidAmount(invoice);
  }

  getTransactionTypeIdFromCostCode(costCodeId: number | null | undefined, officeId: number): number | null {
    if (costCodeId == null) {
      return null;
    }

    const matchingCostCode = this.allCostCodes.find(c => c.costCodeId === costCodeId && c.officeId === officeId);
    return matchingCostCode?.transactionTypeId ?? null;
  }

  getRecipientDisplay(invoice: InvoiceResponse): string {
    if (this.source === 'accounting' && this.isSuperUser) {
      return this.getOrganizationNameById(invoice.reservationId)
        || this.organizationName
        || invoice.responsibleParty
        || '';
    }
    return invoice.responsibleParty || '';
  }

  getCompanyCodeDisplay(invoice: InvoiceResponse): string {
    if (this.source === 'accounting' && this.isSuperUser) {
      return invoice.reservationCode || '-';
    }
    return invoice.reservationCode || '-';
  }

  getOrganizationNameById(organizationId: string | null | undefined): string | null {
    if (!organizationId) {
      return null;
    }
    return this.organizationOptions.find(organization => organization.value === organizationId)?.label || null;
  }

  getInvoiceBalanceDue(invoice: InvoiceResponse): number {
    const totalAmount = invoice.totalAmount || 0;
    return totalAmount - this.resolveInvoicePaidAmount(invoice);
  }

  getInvoiceDueAmountValue(invoiceId: string): number {
    const row = this.invoicesDisplay.find(invoice => invoice.invoiceId === invoiceId);
    if (row?.dueAmountValue !== undefined && row?.dueAmountValue !== null) {
      return this.roundCurrencyValue(Number(row.dueAmountValue));
    }

    const invoice = this.allInvoices.find(item => item.invoiceId === invoiceId);
    return invoice ? this.roundCurrencyValue(this.getInvoiceBalanceDue(invoice)) : 0;
  }

  formatApplyAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  setInvoiceApplyAmount(invoice: { applyAmountValue?: number; applyAmountDisplay?: string; applyAmount?: string }, amount: number): void {
    const value = this.roundCurrencyValue(amount);
    invoice.applyAmountValue = value;
    const display = this.formatApplyAmountDisplay(value);
    invoice.applyAmountDisplay = display;
    invoice.applyAmount = display;
  }

  getApplyAmountInputId(invoiceId: string): string {
    return `apply-amount-invoice-list-${invoiceId}`;
  }

  isInvoiceFullyPaid(invoice: InvoiceResponse): boolean {
    return this.getInvoiceBalanceDue(invoice) <= 0.005;
  }

  contactHasOfficeAccess(contact: ContactResponse, officeId: number | null): boolean {
    if (officeId == null) {
      return true;
    }

    if (contact.officeId === officeId) {
      return true;
    }

    const officeAccess = Array.isArray(contact.officeAccess) ? contact.officeAccess : [];
    return officeAccess.some(id => Number(id) === officeId);
  }

  getTransactionTypeLabel(transactionTypeId: number): string {
    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    return transactionType?.label || 'Unknown';
  }

  getCostCodeDescription(costCodeId: number | undefined, officeId: number): string {
    if (costCodeId == null) return '-';
    const costCode = this.allCostCodes.find(
      c => c.costCodeId === costCodeId && c.officeId === officeId
    );
    
    return costCode?.description || costCodeId.toString();
  }

  getReservationCode(reservationId: string | null | undefined, invoiceReservationCode: string | null | undefined): string {    // Use the invoice's reservationCode if available, otherwise return the ID or '-'
    return invoiceReservationCode || reservationId || '-';
  }

  getLedgerLineColumnNames(): string[] {
    return Object.keys(this.ledgerLinesDisplayedColumns);
  }

  getLedgerLineColumnValue(line: any, columnName: string, invoice: any, lineIndex?: number): any {
    switch (columnName) {
      case 'lineNo':
        return lineIndex !== undefined ? lineIndex + 1 : '-';
      case 'ledgerLineDate':
        return this.formatter.formatDateString(line.ledgerLineDate || invoice.invoiceDate) || '—';
      case 'costCode':
        return line.costCode || this.getCostCodeDescription(line.costCodeId, invoice.officeId);
      case 'transactionType':
        return line.transactionType || this.getTransactionTypeLabel(line.transactionTypeId ?? 0);
      case 'reservation':
        return this.getReservationCode(line.reservationId, invoice.reservationCode);
      case 'description':
        return line.description || '-';
      case 'amount':
        const amountValue = line.amount || 0;
        const formattedAmount = this.formatter.currency(amountValue < 0 ? -amountValue : amountValue);
        return amountValue < 0 ? '-$' + formattedAmount : '$' + formattedAmount;
      default:
        return line[columnName] || '-';
    }
  }

  //#endregion

  //#region Payment Form Methods
  onPaymentCostCodeChange(costCodeId: number | null): void {
    this.selectedPaymentCostCodeId = costCodeId;
    if (costCodeId !== null) {
      const officeId = this.resolvedPaymentOfficeId;
      this.selectedPaymentCostCode = this.allCostCodes.find(c =>
        c.costCodeId === costCodeId && (!officeId || c.officeId === officeId)
      ) || null;
      if (this.selectedPaymentCostCode) {
        const transactionType = this.transactionTypes.find(t => t.value === this.selectedPaymentCostCode!.transactionTypeId);
        this.paymentTransactionType = transactionType?.label || '';
      }
    } else {
      this.selectedPaymentCostCode = null;
      this.paymentTransactionType = '';
    }
  }

  onPaymentAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;
    
    value = value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;
    
    // Limit to one decimal point
    const parts = normalizedValue.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = normalizedValue;
    }
    
    this.paymentAmountDisplay = input.value;
    if (this.isRowScopedPaymentMode) {
      const parsed = parseFloat(input.value.replace(/[^0-9.-]/g, '').trim());
      this.paymentAmount = isNaN(parsed) ? 0 : parsed;
      this.syncRowApplyAmountFromDialog();
    }
  }

  onPaymentAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
    
    if (rawValue !== '' && rawValue !== null) {
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        const finalValue = parsed;
        this.paymentAmount = finalValue;
        this.paymentAmountDisplay = finalValue < 0
          ? '-$' + this.formatter.currency(-finalValue)
          : '$' + this.formatter.currency(finalValue);
        input.value = this.paymentAmountDisplay;
        this.syncRowApplyAmountFromDialog();
        this.updateRemainingAmount();
      } else {
        this.paymentAmount = 0;
        this.paymentAmountDisplay = '$' + this.formatter.currency(0);
        input.value = this.paymentAmountDisplay;
        this.syncRowApplyAmountFromDialog();
        this.updateRemainingAmount();
      }
    } else {
      this.paymentAmount = 0;
      this.paymentAmountDisplay = '$' + this.formatter.currency(0);
      input.value = this.paymentAmountDisplay;
      this.syncRowApplyAmountFromDialog();
      this.updateRemainingAmount();
    }
  }

  onPaymentAmountFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = this.paymentAmount.toString();
    input.select();
  }

  onPaymentAmountEnter(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  openApplyPaymentDialog(targetInvoiceId: string | null = null): void {
    const isRowScopedApply = !!targetInvoiceId;

    if (!isRowScopedApply) {
      // Toolbar "Apply Payment" requires explicit office scope from the top bar.
      this.paymentOfficeId = null;
      if (!this.selectedOffice?.officeId) {
        this.toastr.warning('Please select an office first');
        return;
      }
      this.paymentOfficeId = this.selectedOffice.officeId;
    } else if (!this.paymentOfficeId) {
      // Row-level "$" applies against that invoice's office context.
      this.toastr.warning('Unable to determine office for selected invoice.');
      return;
    }

    this.paymentTargetInvoiceId = null;
    this.manualApplyEditableInvoiceId = targetInvoiceId ? String(targetInvoiceId) : null;
    this.restoreTopbarAfterPayment = !!targetInvoiceId;
    this.isManualApplyMode = true;
    this.rebuildInvoicesDisplayedColumns();
    this.paymentDate = this.paymentDate ?? new Date();
    this.refreshPaymentCostCodesForResolvedOffice();
    this.updateRemainingAmount();
    // Show payment form fields
    this.showPaymentForm = true;
    this.applyFilters();
    this.syncPaymentHeaderFromDisplayApplyAmounts();
    this.focusPendingApplyAmountInput();
  }

  syncPaymentHeaderFromDisplayApplyAmounts(): void {
    const total = this.invoicesDisplay.reduce(
      (sum, row) => this.roundCurrencyValue(sum + Number(row.applyAmountValue || 0)),
      0
    );
    this.paymentAmount = total;
    this.paymentAmountDisplay = this.formatApplyAmountDisplay(total);
    this.updateRemainingAmount();
  }

  ensureInvoiceApplyLineSelected(invoice: { invoiceId?: string; selected?: boolean }, applyAmount: number): void {
    if (!this.isManualApplyMode || !this.showPaymentForm || this.isRowScopedPaymentMode) {
      return;
    }

    const invoiceId = String(invoice?.invoiceId ?? '').trim();
    if (!invoiceId) {
      return;
    }

    const value = this.roundCurrencyValue(applyAmount);

    if (Math.abs(value) <= 0.005) {
      this.selectedInvoiceIds.delete(invoiceId);
      invoice.selected = false;
      this.invoiceDataTable?.refreshDisplayedData();
      return;
    }

    if (!this.selectedInvoiceIds.has(invoiceId)) {
      this.selectedInvoiceIds.add(invoiceId);
      invoice.selected = true;
      this.invoiceDataTable?.refreshDisplayedData();
    }
  }

  cancelPaymentForm(): void {
    this.showPaymentForm = false;
    this.isManualApplyMode = false;
    this.clearPaymentForm();
  }

  //#region Apply Payment Methods
  submitPayment(): void {
    if (this.isSubmittingPayment) {
      return;
    }

    // Validate form fields
    if (!this.selectedPaymentCostCodeId || !this.selectedPaymentCostCode) {
      this.toastr.warning('Please select a cost code');
      return;
    }

    if (!this.utilityService.toDateOnlyJsonString(this.paymentDate)) {
      this.toastr.warning('Please select a payment date');
      return;
    }

    if (this.paymentAmount === 0) {
      this.toastr.warning('Please enter an amount');
      return;
    }

    // If in manual apply mode, send individual payment requests for each invoice with a paid amount
    if (this.isManualApplyMode) {
      this.submitManualPayments();
      return;
    }

    // If launched from the $ action, apply to that one row only.
    const invoiceIdsToApply: string[] = this.paymentTargetInvoiceId
      ? [this.paymentTargetInvoiceId]
      : this.invoicesDisplay
          .map(invoice => invoice.invoiceId)
          .filter((id): id is string => id !== null && id !== undefined && id !== '');

    if (invoiceIdsToApply.length === 0) {
      this.toastr.warning('No invoices available to apply payment to');
      return;
    }

    this.applyPayment(invoiceIdsToApply);
  }

  submitManualPayments(): void {
    if (this.isSubmittingPayment) {
      return;
    }

    // Find all invoices that have an apply amount entered
    const invoicesWithPayments = this.invoicesDisplay.filter(invoice => {
      const applyAmountValue = invoice.applyAmountValue || 0;
      return applyAmountValue !== 0 && invoice.invoiceId;
    });

    if (invoicesWithPayments.length === 0) {
      this.toastr.warning('No payments have been applied to any invoices');
      return;
    }

    // Validate that remaining amount is 0
    if (!this.isRemainingAmountZero()) {
      this.toastr.warning(`Remaining amount must be $0.00 before submitting. Current remaining: ${this.remainingAmountDisplay}`);
      return;
    }

    // Process payments sequentially to avoid race conditions
    // Create an array of payment data
    const paymentDescription = this.getPaymentRequestDescription();
    const paymentData = invoicesWithPayments.map(invoice => {
      const paidAmount = Number(invoice.applyAmountValue || 0);
      return {
        invoice,
        paidAmount,
        paymentRequest: {
          paymentDate: this.utilityService.toDateOnlyJsonString(this.paymentDate) ?? this.utilityService.todayAsCalendarDateString(),
          costCodeId: this.selectedPaymentCostCodeId!,
          description: paymentDescription,
          amount: paidAmount,
          invoices: [invoice.invoiceId] // Single invoice per request
        } as InvoicePaymentRequest
      };
    });

    this.isSubmittingPayment = true;
    let appliedPaymentCount = 0;

    // Execute payments sequentially using concatMap
    from(paymentData).pipe(
      concatMap(({ paymentRequest, invoice }) => 
        this.accountingService.applyPayment(paymentRequest).pipe(
          take(1),
          map(response => ({ response, paymentRequest, invoice }))
        )
      ),
      finalize(() => {
        this.isSubmittingPayment = false;
        // Clear payment form after all payments are processed
        this.clearPaymentForm();
        this.loadInvoicesForCurrentSearchCriteria(true);
        // Refresh the display to show updated paid amounts
        this.applyFilters();
        if (appliedPaymentCount > 0) {
          this.journalEntriesChanged.emit();
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: ({ response, paymentRequest, invoice }) => {
        appliedPaymentCount++;
        // Update invoice data from response
        response.invoices.forEach(i => {
          const invoiceToUpdate = this.allInvoices.find(r => r.invoiceId === i.invoiceId);
          if (invoiceToUpdate) {
            invoiceToUpdate.paidAmount = i.paidAmount;
          }
        });

        // Show success message for each payment
        this.toastr.success(
          `Payment of $${this.formatter.currency(paymentRequest.amount)} applied to invoice ${invoice.invoiceNumber || invoice.invoiceId}`,
          CommonMessage.Success
        );
        this.markViewForCheck();

      },
      error: () => {
        this.markViewForCheck();
      }
    });
  }

  applyPayment(invoiceIds: string[]): void {
    if (this.isSubmittingPayment) {
      return;
    }

    const paymentRequest: InvoicePaymentRequest = {
      paymentDate: this.utilityService.toDateOnlyJsonString(this.paymentDate) ?? this.utilityService.todayAsCalendarDateString(),
      costCodeId: this.selectedPaymentCostCodeId!,
      description: this.getPaymentRequestDescription(),
      amount: this.paymentAmount,
      invoices: invoiceIds
    };

    this.isSubmittingPayment = true;
    this.accountingService.applyPayment(paymentRequest).pipe(
      take(1),
      finalize(() => {
        this.isSubmittingPayment = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: (response: InvoicePaymentResponse) => {
        this.handlePaymentResponse(response, paymentRequest);
        this.clearPaymentForm();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.toastr.error('Failed to apply payment', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  onApplyAmountInput(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^0-9.\-]/g, '');

    // Keep only a single leading negative sign.
    value = value.replace(/(?!^)-/g, '');

    // Limit to one decimal point while preserving in-progress values like "-" or "-.".
    const parts = value.split('.');
    if (parts.length > 2) {
      value = `${parts[0]}.${parts.slice(1).join('')}`;
    }

    input.value = value;
    
    // Update display value immediately for visual feedback
    invoice.applyAmountDisplay = input.value;
  }

  onApplyAmountChange(invoice: any, newValue: string): void {
    // Keep raw user typing (including a standalone leading "-") until blur formatting.
    invoice.applyAmountDisplay = newValue;
  }
  
  onApplyAmountBlur(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitizedValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const normalizedSign = sanitizedValue.replace(/(?!^)-/g, '');
    const parts = normalizedSign.split('.');
    const normalizedValue = parts.length > 2
      ? `${parts[0]}.${parts.slice(1).join('')}`
      : normalizedSign;
    
    if (normalizedValue !== '' && normalizedValue !== null && normalizedValue !== '-') {
      const parsed = parseFloat(normalizedValue);
      if (!isNaN(parsed)) {
        const finalValue = parsed;
        invoice.applyAmountValue = finalValue;
        invoice.applyAmountDisplay = finalValue < 0
          ? '-$' + this.formatter.currency(-finalValue)
          : '$' + this.formatter.currency(finalValue);
        invoice.applyAmount = invoice.applyAmountDisplay;
        input.value = invoice.applyAmountDisplay;
        
      } else {
        invoice.applyAmountValue = invoice.applyAmountValue || 0;
        invoice.applyAmountDisplay = (invoice.applyAmountValue || 0) < 0
          ? '-$' + this.formatter.currency(-(invoice.applyAmountValue || 0))
          : '$' + this.formatter.currency(invoice.applyAmountValue || 0);
        invoice.applyAmount = invoice.applyAmountDisplay;
        input.value = invoice.applyAmountDisplay;
      }
    } else {
      invoice.applyAmountValue = invoice.applyAmountValue || 0;
      invoice.applyAmountDisplay = (invoice.applyAmountValue || 0) < 0
        ? '-$' + this.formatter.currency(-(invoice.applyAmountValue || 0))
        : '$' + this.formatter.currency(invoice.applyAmountValue || 0);
      invoice.applyAmount = invoice.applyAmountDisplay;
      input.value = invoice.applyAmountDisplay;
    }

    const appliedAmount = this.roundCurrencyValue(Number(invoice.applyAmountValue || 0));
    this.ensureInvoiceApplyLineSelected(invoice, appliedAmount);
    this.syncPaymentHeaderFromDisplayApplyAmounts();
    this.markViewForCheck();
  }
  
  onApplyAmountFocus(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    const currentValue = Number(invoice.applyAmountValue || 0);
    input.value = currentValue.toString();
    input.select();
  }

  onApplyAmountEnter(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  clearPaymentForm(): void {
    this.showPaymentForm = false;
    this.isManualApplyMode = false;
    this.rebuildInvoicesDisplayedColumns();
    this.selectedPaymentCostCodeId = null;
    this.selectedPaymentCostCode = null;
    this.paymentTransactionType = '';
    this.paymentDescription = '';
    this.paymentDate = new Date();
    this.paymentAmount = 0;
    this.paymentAmountDisplay = '$' + this.formatter.currency(0);
    this.updateRemainingAmount();
    this.paymentOfficeId = null;
    this.paymentTargetInvoiceId = null;
    this.manualApplyEditableInvoiceId = null;
    this.pendingApplyAmountFocusInvoiceId = null;
    // Clear apply amounts from all invoices
    this.invoicesDisplay.forEach(invoice => {
      invoice.applyAmountValue = 0;
      invoice.applyAmount = '';
      invoice.applyAmountDisplay = '';
    });

    if (this.restoreTopbarAfterPayment) {
      this.restoreTopbarSelectionsAfterPayment();
    }

    this.applyFilters();
  }

  handlePaymentResponse(response: InvoicePaymentResponse, paymentRequest: InvoicePaymentRequest): void {
    this.toastr.success(`Payment of $${this.formatter.currency(paymentRequest.amount)} applied`, CommonMessage.Success);
    response.invoices.forEach(i => {
      const invoice = this.allInvoices.find(r => r.invoiceId === i.invoiceId);
      if (invoice) {
        invoice.paidAmount = i.paidAmount;
      }
    });
    
    // Refresh the display to show updated paid amounts
    this.applyFilters();
    this.loadInvoicesForCurrentSearchCriteria(true);
    this.journalEntriesChanged.emit();
  }
  //#endregion

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    const previousOfficeId = this.selectedOffice?.officeId ?? null;
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    const nextOfficeId = this.selectedOffice?.officeId ?? null;
    const officeChanged = previousOfficeId !== nextOfficeId;

    this.officeScopeResolved = true;
    if (emitChange) {
      this.officeIdChange.emit(nextOfficeId);
    }

    if (officeChanged && this.source === 'accounting') {
      this.selectedCompanyContact = null;
      this.selectedReservation = null;
      this.companyIdChange.emit(null);
      this.reservationIdChange.emit(null);
    }

    this.filterCompanyContacts();
    this.filterReservations();
    this.filterCostCodes();
    this.filterChartOfAccounts();
    this.loadInvoicesForCurrentSearchCriteria();
  }

  captureTopbarSelectionsForPayment(): void {
    this.originalPaymentOfficeId = this.selectedOffice?.officeId ?? this.officeId ?? null;
    this.originalPaymentReservationId = this.selectedReservation?.reservationId ?? this.reservationId ?? null;
    this.originalPaymentCompanyId = this.selectedCompanyContact?.contactId ?? this.companyId ?? null;
  }

  restoreTopbarSelectionsAfterPayment(): void {
    const officeIdToRestore = this.originalPaymentOfficeId ?? this.officeId ?? null;
    const reservationIdToRestore = this.originalPaymentReservationId ?? this.reservationId ?? null;
    const companyIdToRestore = this.originalPaymentCompanyId ?? this.companyId ?? null;

    const restoredOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeIdToRestore);
    this.selectedOffice = restoredOffice;
    this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);

    this.filterCostCodes();
    this.filterChartOfAccounts();
    this.filterCompanyContacts();
    this.filterReservations();

    if (companyIdToRestore) {
      this.selectedCompanyContact = this.companyContacts.find(c =>
        c.contactId === companyIdToRestore &&
        (!this.selectedOffice || c.officeId === this.selectedOffice.officeId)
      ) || null;
    } else {
      this.selectedCompanyContact = null;
    }
    this.companyIdChange.emit(this.selectedCompanyContact?.contactId || null);

    if (reservationIdToRestore) {
      this.selectedReservation = this.reservations.find(r =>
        r.reservationId === reservationIdToRestore &&
        (!this.selectedOffice || r.officeId === this.selectedOffice.officeId)
      ) || null;
    }

    if (!this.selectedReservation && reservationIdToRestore) {
      this.selectedReservation = this.reservations.find(r => r.reservationId === reservationIdToRestore) || null;
    }

    if (!reservationIdToRestore) {
      this.selectedReservation = null;
    }
    this.reservationIdChange.emit(this.selectedReservation?.reservationId || null);

    this.applyFilters();

    this.restoreTopbarAfterPayment = false;
    this.originalPaymentOfficeId = null;
    this.originalPaymentReservationId = null;
    this.originalPaymentCompanyId = null;
  }

  resolveOfficeIdsForSearch(): number[] {
    if (this.selectedOffice?.officeId) {
      return [this.selectedOffice.officeId];
    }
    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  buildInvoiceSearchRequest(officeIds: number[]): InvoiceGetRequest {
    const reservationId = this.selectedReservation?.reservationId ?? this.reservationId ?? null;

    if (this.source === 'accounting') {
      return {
        officeIds,
        reservationId,
        isActive: !this.showInactive,
        includeInactive: true,
        includePaid: true,
        startDate: this.invoiceSearchDateRange?.startDate ?? null,
        endDate: this.invoiceSearchDateRange?.endDate ?? null
      };
    }

    return {
      officeIds,
      reservationId: reservationId || null,
      isActive: !this.showInactive,
      includeInactive: true,
      includePaid: true
    };
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  isRemainingAmountZero(): boolean {
    return this.remainingAmount > -0.005 && this.remainingAmount < 0.005;
  }

  hasNegativeRemainingAmount(): boolean {
    return this.remainingAmount < -0.005;
  }

  updateRemainingAmount(): void {
    if (!this.isManualApplyMode) {
      this.remainingAmount = 0;
      this.remainingAmountDisplay = '$' + this.formatter.currency(0);
      return;
    }

    const totalApplied = this.roundCurrencyValue(this.invoicesDisplay
      .reduce((sum, inv) => sum + Number(inv.applyAmountValue || 0), 0));

    const remaining = this.roundCurrencyValue(this.roundCurrencyValue(this.paymentAmount) - totalApplied);
    this.remainingAmount = (remaining > -0.005 && remaining < 0.005) ? 0 : remaining;
    this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
  }

  get isRowScopedPaymentMode(): boolean {
    return !!this.manualApplyEditableInvoiceId;
  }

  syncRowApplyAmountFromDialog(): void {
    const targetInvoiceId = this.manualApplyEditableInvoiceId;
    if (!targetInvoiceId) {
      return;
    }

    const amountValue = Number(this.paymentAmount || 0);
    const invoice = this.allInvoices.find(item => item.invoiceId === targetInvoiceId);
    if (invoice) {
      this.setInvoiceApplyAmount(
        invoice as InvoiceResponse & { applyAmountValue?: number; applyAmountDisplay?: string; applyAmount?: string },
        amountValue
      );
    }

    const row = this.invoicesDisplay.find(invoice => invoice.invoiceId === targetInvoiceId);
    if (row) {
      this.setInvoiceApplyAmount(row, amountValue);
    }
    this.cdr.detectChanges();
  }
  //#endregion

  //#region Total Row Methods
  get totalAmountSum(): number {
    return this.invoicesDisplay.reduce((sum, inv) => sum + (inv.totalAmountValue || 0), 0);
  }

  get totalPaidAmountSum(): number {
    return this.invoicesDisplay.reduce((sum, inv) => sum + (inv.paidAmountValue || 0), 0);
  }

  get totalDueAmountSum(): number {
    return this.invoicesDisplay.reduce((sum, inv) => sum + (inv.dueAmountValue || 0), 0);
  }

  get formattedTotalAmount(): string {
    return '$' + this.formatter.currency(this.totalAmountSum);
  }

  get formattedTotalPaidAmount(): string {
    return '$' + this.formatter.currency(this.totalPaidAmountSum);
  }

  get formattedTotalDueAmount(): string {
    return '$' + this.formatter.currency(this.totalDueAmountSum);
  }

  get totalsRow(): { [key: string]: string } | undefined {
    if (this.invoicesDisplay.length === 0) {
      return undefined;
    }
    return {
      totalAmount: this.formattedTotalAmount,
      paidAmount: this.formattedTotalPaidAmount,
      dueAmount: this.formattedTotalDueAmount
    };
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
