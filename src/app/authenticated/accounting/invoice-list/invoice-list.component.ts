import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, concatMap, filter, finalize, from, map, skip, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
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
import { ApplyCreditDialogComponent, ApplyCreditDialogData } from '../../shared/modals/apply-credit/apply-credit-dialog.component';
import { InvoicePaidFullDialogComponent } from '../../shared/modals/invoice-paid-full/invoice-paid-full-dialog.component';
import { UserGroups } from '../../users/models/user-enums';
import { TransactionType, TransactionTypeLabels } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoicePaymentRequest, InvoicePaymentResponse, InvoiceResponse } from '../models/invoice.model';
import { InvoiceService } from '../services/invoice.service';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    selector: 'app-invoice-list',
    standalone: true,
    templateUrl: './invoice-list.component.html',
    styleUrls: ['./invoice-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective]
})

export class InvoiceListComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate: TemplateRef<any>;
  @Input() hideFilters: boolean = false;
  @Input() source: 'reservation' | 'accounting' | null = null; // Track where we came from for back button navigation
  @Input() organizationId: string | null = null; // Input to accept organizationId from parent
  @Input() organizationName: string | null = null; // Selected organization display name for SuperAdmin recipient column
  @Input() organizationOptions: { value: string, label: string }[] = []; // SuperAdmin org lookup for recipient display
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() companyId: string | null = null; // Input to accept companyId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Output() organizationIdChange = new EventEmitter<string | null>(); // Emit organization changes to parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() companyIdChange = new EventEmitter<string | null>(); // Emit company changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  @Output() printInvoiceEvent = new EventEmitter<{ officeId: number | null, reservationId: string | null, invoiceId: string }>(); // Emit print invoice event to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property

  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded
  isAllExpanded: boolean = false; // Track if all rows are expanded
  loadingInvoiceLedgerLines: Set<string> = new Set();

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  queryParamsSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  isSuperUser: boolean = false;
  officeScopeResolved: boolean = false;

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  reservationsSubscription?: Subscription;
  selectedReservation: ReservationListResponse | null = null;

  companyContacts: ContactResponse[] = [];
  availableCompanyContacts: { value: ContactResponse, label: string }[] = [];
  selectedCompanyContact: ContactResponse | null = null;
 
  costCodes: CostCodesResponse[] = [];
  allCostCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: string, label: string }[] = [];
  costCodesSubscription?: Subscription;
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;

  // Payment form fields
  showPaymentForm: boolean = false;
  isManualApplyMode: boolean = false;
  selectedPaymentCostCodeId: number | null = null;
  selectedPaymentCostCode: CostCodesResponse | null = null;
  paymentTransactionType: string = '';
  paymentDescription: string = '';
  paymentAmount: number = 0;
  paymentAmountDisplay: string = '$0.00';
  remainingAmount: number = 0;
  remainingAmountDisplay: string = '0.00';
  paymentTargetInvoiceId: string | null = null;
  restoreTopbarAfterPayment: boolean = false;
  originalPaymentOfficeId: number | null = null;
  originalPaymentReservationId: string | null = null;
  originalPaymentCompanyId: string | null = null;
  creditCostCodes: { value: number, label: string }[] = [];
  baseInvoicesDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    responsibleParty: { displayAs: 'Recipient',  wrap: false, maxWidth: '25ch' },
    invoiceNumber: { displayAs: 'Invoice', maxWidth: '15ch', sortType: 'natural' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '15ch', alignment: 'center' },
    dueDate: { displayAs: 'Due Date', maxWidth: '15ch', alignment: 'center' },
    totalAmount: { displayAs: 'Total', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    paidAmount: { displayAs: '  Paid', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    dueAmount: { displayAs: 'Due', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    applyAmount: { displayAs: 'Apply', maxWidth: '20ch', alignment: 'right', headerAlignment: 'right' }
  };

  get invoicesDisplayedColumns(): ColumnSet {
    const columns = { ...this.baseInvoicesDisplayedColumns };
    if (this.source === 'accounting' && this.isSuperUser) {
      columns['reservationCode'] = { ...columns['reservationCode'], displayAs: 'Company' };
    }
    
    // Only show applyAmount column when manual apply mode is active (Apply Manually button pressed)
    if (!this.isManualApplyMode) {
      // Return columns without applyAmount
      const { applyAmount, ...columnsWithoutApply } = columns;
      return columnsWithoutApply;
    }
    
    return columns;
  }

  get dueInvoicesCount(): number {
    return this.invoicesDisplay.filter(invoice => (invoice?.dueAmountValue || 0) > 0).length;
  }

  get canShowApplyPaymentButton(): boolean {
    const hasReservationOrCompanySelection = !!this.selectedReservation || !!this.selectedCompanyContact;
    return hasReservationOrCompanySelection && this.dueInvoicesCount > 1;
  }

  ledgerLinesDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '5ch', wrap: false, alignment: 'left' },
    costCode: { displayAs: 'Cost Code', maxWidth: '25ch', wrap: false },
    transactionType: { displayAs: 'Type', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '15ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '15ch', wrap: false, alignment: 'right'}
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'reservations', 'invoices', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  get useRouteQueryParams(): boolean {
    // When embedded in parent tabs, parent inputs are the source of truth.
    // Keep Accounting defaults at All* and avoid route-driven preselection.
    return this.source !== 'reservation' && this.source !== 'accounting';
  }

  constructor(
    public accountingService: InvoiceService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private costCodesService: CostCodesService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private authService: AuthService,
    private formatter: FormatterService,
    private utilityService: UtilityService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private zone: NgZone) {
  }

  //#region Invoice-List
  ngOnInit(): void {
    this.isSuperUser = this.hasRole(UserGroups.SuperAdmin);
    this.loadOffices();
    this.loadReservations();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });
    this.loadCompanyContacts();
    this.loadCostCodes();
    
    // Wait for offices to load before processing query params
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.resolveOfficeScope(this.officeId, false);
      }
      
      if (!this.useRouteQueryParams) {
        return;
      }

      this.queryParamsSubscription?.unsubscribe();
      this.queryParamsSubscription = this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        const companyIdParam = params['companyId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.resolveOfficeScope(parsedOfficeId, true);
          }
        } else {
          if (this.officeId === null || this.officeId === undefined) {
            const defaultOfficeId = this.source === 'accounting' ? null : this.globalSelectionService.getSelectedOfficeIdValue();
            this.resolveOfficeScope(defaultOfficeId, true);
          }
        }
        
        // Handle companyId (contactId) even if officeId is not in params
        if (companyIdParam && this.companyContacts.length > 0 && this.selectedOffice) {
          const matching = this.companyContacts.find(c =>
            c.contactId === companyIdParam && c.officeId === this.selectedOffice?.officeId
          );
          if (matching && matching !== this.selectedCompanyContact) {
            this.selectedCompanyContact = matching;
            this.applyFilters();
          }
        }
      });
    });
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
      
      // Update if the value changed (including initial load when previousReservationId is undefined)
      if (previousReservationId === undefined || newReservationId !== previousReservationId) {
        // Always try to set reservation, even if reservations haven't loaded yet
        // filterReservations() will handle it when reservations are loaded
        if (this.reservations.length > 0 && this.selectedOffice) {
          this.selectedReservation = newReservationId 
            ? this.reservations.find(r => r.reservationId === newReservationId && r.officeId === this.selectedOffice?.officeId) || null
            : null;
          this.applyFilters();
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
              (!this.selectedOffice || c.officeId === this.selectedOffice.officeId)
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
  }

  getInvoices(): void {
    if (!this.selectedOffice?.officeId) {
      // Load all invoices when "All Offices" is selected
      this.loadAllInvoices();
      return;
    }
    this.accountingService.getInvoicesByOffice(this.selectedOffice.officeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices'); })).subscribe({
      next: (invoices) => {
        this.allInvoices = invoices || [];
         this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
         }
      }
    });
  }

  addInvoice(): void {
    const targetUrl = this.isSuperUser ? RouterUrl.Billing : RouterUrl.Accounting;
    const url = RouterUrl.replaceTokens(targetUrl, ['new']);
    const params: string[] = [];
    
    // Reservation is source of truth for Add Invoice prefill.
    const reservationToUse = this.selectedReservation
      ?? (this.reservationId ? this.reservations.find(r => r.reservationId === this.reservationId) || null : null);
    const reservationIdToUse = reservationToUse?.reservationId ?? this.reservationId ?? null;
    const officeIdToUse = reservationToUse?.officeId ?? this.selectedOffice?.officeId ?? this.officeId ?? null;
    const companyIdToUse = (this.companyId !== null) ? this.companyId : (this.selectedCompanyContact?.contactId || null);
    
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
    // Add returnTo parameter based on source input (explicit tracking)
    if (this.source === 'reservation') {
      params.push(`returnTo=reservation`);
    } else if (this.source === 'accounting') {
      params.push(`returnTo=accounting`);
    } else if (reservationIdToUse !== null) {
      // Fallback: if source not set but has reservation, assume reservation
      params.push(`returnTo=reservation`);
    } else {
      // Default to accounting
      params.push(`returnTo=accounting`);
    }
    if (params.length > 0) {
      this.router.navigateByUrl(url + `?${params.join('&')}`);
    } else {
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Action Methods
  deleteInvoice(invoice: InvoiceResponse): void {
    this.accountingService.deleteInvoice(invoice.invoiceId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Invoice deleted successfully', CommonMessage.Success);
        this.loadAllInvoices();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  printInvoice(invoice: InvoiceResponse): void {
    // Get values directly from the clicked invoice line
    const officeId = invoice?.officeId ?? null;
    const reservationId = invoice?.reservationId ?? null;
    const invoiceId = invoice?.invoiceId ?? null;
    
    // Emit event to parent to switch tabs without navigation
    if (invoiceId) {
      this.printInvoiceEvent.emit({ officeId, reservationId, invoiceId });
    }
  }

  goToInvoice(event: InvoiceResponse, fromEditButton: boolean = false): void {
    // Don't navigate if payment form is active, unless it's from the edit button
    if (this.showPaymentForm && !fromEditButton) {
      return;
    }
    
    const targetUrl = this.isSuperUser ? RouterUrl.Billing : RouterUrl.Accounting;
    const url = RouterUrl.replaceTokens(targetUrl, [event.invoiceId]);
    const params: string[] = [];
    
    // Prefer @Input() values from parent, otherwise use selectedOffice/selectedReservation
    const officeIdToUse = (this.officeId !== null) ? this.officeId : (this.selectedOffice?.officeId || null);
    const reservationIdToUse = (this.reservationId !== null) ? this.reservationId : (this.selectedReservation?.reservationId || null);
    const companyIdToUse = this.selectedCompanyContact?.contactId || null;
    const reservationId = event?.reservationId || null;
    
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
    // Add returnTo parameter based on source input (explicit tracking)
    if (this.source === 'reservation') {
      params.push(`returnTo=reservation`);
    } else if (this.source === 'accounting') {
      params.push(`returnTo=accounting`);
    } else if (reservationIdToUse !== null) {
      // Fallback: if source not set but has reservation, assume reservation
      params.push(`returnTo=reservation`);
    } else {
      // Default to accounting
      params.push(`returnTo=accounting`);
    }
    if (params.length > 0) {
      this.router.navigateByUrl(url + `?${params.join('&')}`);
    } else {
      this.router.navigateByUrl(url);
    }
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
    // Check DueAmount from the row data (dueAmountValue) or calculate it
    const eventAny = event as any;
    const dueAmount = eventAny.dueAmountValue !== undefined 
      ? eventAny.dueAmountValue 
      : (event.totalAmount || 0) - Math.abs(event.paidAmount || 0);
    
    if (dueAmount <= 0) {
      // Show dialog that invoice is already paid
      const dialogConfig: MatDialogConfig = {
        width: '500px',
        autoFocus: true,
        restoreFocus: true,
        disableClose: false,
        hasBackdrop: true
      };
      this.dialog.open(InvoicePaidFullDialogComponent, dialogConfig);
    } else {
      // Preserve current top-bar selections so refresh returns to the original user context.
      this.captureTopbarSelectionsForPayment();

      // Auto-select the invoice's office and reservation
      const invoiceOfficeId = event.officeId;
      const invoiceReservationId = event.reservationId;
      
      // Set selectedOffice from invoice's officeId
      if (invoiceOfficeId && this.offices.length > 0) {
        const matchingOffice = this.offices.find(o => o.officeId === invoiceOfficeId);
        if (matchingOffice && matchingOffice !== this.selectedOffice) {
          this.selectedOffice = matchingOffice;
          // Filter dependent data
          this.filterCostCodes();
          this.filterCompanyContacts();
          this.filterReservations();
          // Emit office change to parent
          this.officeIdChange.emit(this.selectedOffice.officeId);
          // Apply filters
          this.applyFilters();
        }
      }
      
      // Set selectedReservation from invoice's reservationId (after office is set)
      if (invoiceReservationId && this.selectedOffice && this.reservations.length > 0) {
        const matchingReservation = this.reservations.find(r => 
          r.reservationId === invoiceReservationId && r.officeId === this.selectedOffice?.officeId
        );
        if (matchingReservation && matchingReservation !== this.selectedReservation) {
          this.selectedReservation = matchingReservation;
          // Emit reservation change to parent
          this.reservationIdChange.emit(this.selectedReservation.reservationId);
          // Apply filters
          this.applyFilters();
        }
      }
      
      // Open inline Apply Payment row and scope submit to the clicked invoice row.
      this.openApplyPaymentDialog(event.invoiceId);
    }
  }
  //#endregion

  //#region Filter methods
  getCompanyIdToApply(): string | null {
    if (this.companyId !== null && this.companyId !== undefined && this.companyId !== '') {
      return this.companyId;
    }

    // In embedded reservation mode, never consume route query params.
    if (!this.useRouteQueryParams) {
      return null;
    }

    const routeCompanyId = this.route.snapshot.queryParams['companyId'];
    return routeCompanyId ? String(routeCompanyId) : null;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allInvoices;
    if (!this.showInactive) {
      filtered = filtered.filter(invoice => invoice.isActive);
    }

    // In Accounting SuperAdmin mode, organization filter maps to recipient organization
    // which is stored in invoice.reservationId for billing invoices.
    if (this.source === 'accounting' && this.isSuperUser && this.organizationId) {
      filtered = filtered.filter(invoice => invoice.reservationId === this.organizationId);
    }

    // Filter by office if selected
    if (this.selectedOffice) {
      filtered = filtered.filter(invoice => invoice.officeId === this.selectedOffice.officeId);
    }

    // Filter by company contact if selected (only when source is 'accounting')
    if (this.selectedCompanyContact && this.source === 'accounting') {
      filtered = filtered.filter(invoice => {
        if (!invoice.reservationId) return false;
        const reservation = this.reservations.find(r => r.reservationId === invoice.reservationId);
        if (!reservation) return false;
        return reservation.contactName === this.selectedCompanyContact!.fullName;
      });
    }

    // Filter by reservation if selected
    if (this.selectedReservation) {
      filtered = filtered.filter(invoice => invoice.reservationId === this.selectedReservation.reservationId);
    }

    // Map invoices to include expand button data for DataTableComponent
    this.invoicesDisplay = filtered.map(invoice => {
      const rawLedgerLines = invoice.ledgerLines ?? [];
      const costCodesForInvoice = this.allCostCodes.filter(costCode => costCode.officeId === invoice.officeId);
      const mappedLedgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, costCodesForInvoice, this.transactionTypes);
      const totalAmount = invoice.totalAmount || 0;
      const paidAmount = this.getPaidAmountFromLedgerLines(rawLedgerLines, invoice.officeId);
      
      // Calculate due amount: Total - Paid
      const dueAmount = totalAmount - paidAmount;
      const dueAmountValue = dueAmount; // Store raw value for validation
      
      // Store original due amount value when entering manual mode (for editability check)
      // If already in manual mode and originalDueAmountValue exists, preserve it
      const invoiceAny = invoice as any; // Type assertion for display object properties
      const originalDueAmountValue = this.isManualApplyMode && invoiceAny.originalDueAmountValue !== undefined 
        ? invoiceAny.originalDueAmountValue 
        : dueAmountValue;
      
      // Initialize applyAmount for manual mode (preserve existing value if already set)
      const applyAmountValue = this.isManualApplyMode 
        ? (invoiceAny.applyAmountValue !== undefined ? invoiceAny.applyAmountValue : 0)
        : 0;
      
      return {
      ...invoice,
      invoiceNumber: invoice.invoiceCode || '',
      reservationCode: this.getCompanyCodeDisplay(invoice),
      responsibleParty: this.getRecipientDisplay(invoice),
      totalAmount: '$' + this.formatter.currency(totalAmount),
      totalAmountValue: totalAmount, // Store raw value for validation
      paidAmount: '$' + this.formatter.currency(paidAmount), // Always display as formatted (read-only)
      paidAmountValue: paidAmount, // Store raw value (read-only, never changes during manual entry)
      paidAmountDisplay: '$' + this.formatter.currency(paidAmount), // Display value (read-only)
      dueAmount: '$' + this.formatter.currency(dueAmount),
      dueAmountValue: dueAmountValue, // Store raw value for validation (current due amount)
      originalDueAmountValue: originalDueAmountValue, // Store original due amount (for editability check)
      applyAmount: this.isManualApplyMode ? '$' + this.formatter.currency(Math.abs(applyAmountValue)) : '', // Display value for apply column (show as positive)
      applyAmountValue: applyAmountValue, // Store raw value for calculations (negative in manual mode)
      applyAmountDisplay: this.isManualApplyMode ? '$' + this.formatter.currency(Math.abs(applyAmountValue)) : '', // Display value (show as positive)
      startDate: this.formatter.formatDateString(invoice.startDate),
      endDate: this.formatter.formatDateString(invoice.endDate),
      invoiceDate: this.formatter.formatDateString(invoice.invoiceDate),
      dueDate: this.formatter.formatDateString(invoice.dueDate),
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
  }

  getPaidAmountFromLedgerLines(ledgerLines: any[], officeId: number): number {
    if (!ledgerLines || ledgerLines.length === 0) {
      return 0;
    }

    return ledgerLines.reduce((sum, line) => {
      const transactionTypeId = line?.transactionTypeId ?? this.getTransactionTypeIdFromCostCode(line?.costCodeId, officeId);
      const transactionTypeLabel = (line?.transactionType || '').toString().toLowerCase();
      const isPaymentLine = transactionTypeId === TransactionType.Payment || transactionTypeLabel === 'payment';

      if (isPaymentLine) {
        const amount = Number(line?.amount || 0);
        return sum + Math.abs(isNaN(amount) ? 0 : amount);
      }

      return sum;
    }, 0);
  }

  getTransactionTypeIdFromCostCode(costCodeId: string | null | undefined, officeId: number): number | null {
    if (!costCodeId) {
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

  filterReservations(): void {
    // When All Offices is selected, show the full reservation list as loaded for this login.
    let filteredReservations = this.selectedOffice
      ? this.reservations.filter(r => r.officeId === this.selectedOffice!.officeId)
      : this.reservations;

    // In Accounting mode, when a company contact is selected, only show reservations linked to that contact.
    if (this.source === 'accounting' && this.selectedCompanyContact?.contactId) {
      const selectedContactId = this.selectedCompanyContact.contactId;
      filteredReservations = filteredReservations.filter(r => {
        const reservationAny = r as ReservationListResponse & {
          entityId?: string | null;
          EntityId?: string | null;
          contactId?: string;
        };
        const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? reservationAny.contactId ?? null;
        return reservationEntityId === selectedContactId;
      });
    }

    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.companyContacts.find(c => c.contactId === r.contactId) ?? null)
    }));
    
    // Clear selected reservation if it no longer exists in the available list.
    if (this.selectedReservation && !filteredReservations.some(r => r.reservationId === this.selectedReservation?.reservationId)) {
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
      ? this.companyContacts.filter(c => c.officeId === this.selectedOffice?.officeId && c.isActive)
      : this.companyContacts.filter(c => c.isActive);
    this.availableCompanyContacts = filtered.map(c => ({
      value: c,
      label: c.contactCode ? `${c.contactCode}: ${c.displayName || c.companyName || c.fullName || ''}` : (c.displayName || c.companyName || c.fullName || '')
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
          (!this.selectedOffice || c.officeId === this.selectedOffice!.officeId)
        );
        if (matching && matching !== this.selectedCompanyContact) {
          this.selectedCompanyContact = matching;
          this.applyFilters();
        }
      }
    }
  }

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
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Dropdowns
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
        label: `${c.costCode}: ${c.description}`
      }));
    
    // Filter to only credit cost codes (transactionTypeId === Payment) for payment form
    this.creditCostCodes = this.costCodes
      .filter(c => c.isActive && c.transactionTypeId === TransactionType.Payment)
      .map(c => ({
        value: parseInt(c.costCodeId, 10),
        label: `${c.costCode}: ${c.description}`
      }));
  }
  //#endregion

  //#region Data Load Items
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');

        // During logout, office cache is cleared before navigation completes.
        // Avoid invoice requests with an invalid/cleared auth context.
        if (!this.offices.length) {
          this.selectedOffice = null;
          this.officeScopeResolved = true;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
          this.selectedReservation = null;
          this.selectedCompanyContact = null;
          this.availableReservations = [];
          this.availableCompanyContacts = [];
          this.allInvoices = [];
          this.invoicesDisplay = [];
          return;
        }
        
        this.showOfficeDropdown = !(this.offices.length === 1 && this.source !== 'accounting');
        const defaultOfficeId = this.officeId
          ?? (this.source === 'accounting'
            ? null
            : (this.offices.length === 1 ? this.offices[0].officeId : this.globalSelectionService.getSelectedOfficeIdValue()));
        this.resolveOfficeScope(defaultOfficeId, this.officeId === null || this.officeId === undefined);
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
        // This ensures company filtering works correctly (it depends on reservations to match contactName)
        if (this.selectedCompanyContact && this.source === 'accounting') {
          this.applyFilters();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadAllInvoices(): void {
    // This gets all invoices for the offices to which the user has access
    this.accountingService.getAllInvoices().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices'); })).subscribe({
      next: (invoices) => {
        this.allInvoices = invoices || [];
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
         }
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(accounts => {
        this.allCostCodes = accounts || [];
        this.filterCostCodes();
        this.applyFilters();
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
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies');
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    this.globalSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.resolveOfficeScope(this.selectedOffice?.officeId ?? null, true);
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompanyContact?.contactId || null);

    // Re-filter reservations based on selected company.
    this.filterReservations();
    
    // Filter invoices client-side by selected company
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
    
    this.applyFilters();
    
    // Restore scroll position after Angular change detection completes
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      if (scrollContainer) {
        (scrollContainer as HTMLElement).scrollTop = scrollTop;
      } else {
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
      }
    });
  }

  getTransactionTypeLabel(transactionTypeId: number): string {
    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    return transactionType?.label || 'Unknown';
  }

  getCostCodeDescription(costCodeId: number | string | undefined, officeId: number): string {
    if (!costCodeId) return '-';
    const costCode = this.allCostCodes.find(
      c => (c.costCodeId === costCodeId || c.costCode?.toString() === costCodeId?.toString()) && c.officeId === officeId
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
        const formattedAmount = this.formatter.currency(Math.abs(amountValue));
        return amountValue < 0 ? '-$' + formattedAmount : '$' + formattedAmount;
      default:
        return line[columnName] || '-';
    }
  }

  getDetailRowContextMethods() {
    return {
      getLedgerLineColumnValue: (line: any, columnName: string, invoice: any) => this.getLedgerLineColumnValue(line, columnName, invoice),
      ledgerLinesDisplayedColumns: this.ledgerLinesDisplayedColumns,
      ledgerLineColumnNames: Object.keys(this.ledgerLinesDisplayedColumns)
    };
  }
  //#endregion

  //#region Payment Form Methods
  onPaymentCostCodeChange(costCodeId: number | null): void {
    this.selectedPaymentCostCodeId = costCodeId;
    if (costCodeId !== null) {
      this.selectedPaymentCostCode = this.costCodes.find(c => parseInt(c.costCodeId, 10) === costCodeId) || null;
      if (this.selectedPaymentCostCode) {
        const transactionType = this.transactionTypes.find(t => t.value === this.selectedPaymentCostCode!.transactionTypeId);
        this.paymentTransactionType = transactionType?.label || '';
        // Ensure payment amount stays positive
        if (this.paymentAmount < 0) {
          this.paymentAmount = Math.abs(this.paymentAmount);
          this.paymentAmountDisplay = '$' + this.formatter.currency(this.paymentAmount);
        }
      }
    } else {
      this.selectedPaymentCostCode = null;
      this.paymentTransactionType = '';
    }
  }

  onPaymentAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;
    
    // Remove negative signs and non-numeric characters (except decimal point)
    value = value.replace(/[^0-9.]/g, '');
    
    // Limit to one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
    
    this.paymentAmountDisplay = input.value;
  }

  onPaymentAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.]/g, '').trim();
    
    if (rawValue !== '' && rawValue !== null) {
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        // Always store as positive value
        const finalValue = Math.abs(parsed);
        this.paymentAmount = finalValue;
        this.paymentAmountDisplay = '$' + this.formatter.currency(finalValue);
        input.value = this.paymentAmountDisplay;
        
        // Always recalculate remaining amount (payment amount minus apply amounts)
        // Only deduct apply amounts from invoices that have editable fields (originalDueAmountValue > 0)
        // applyAmountValue is stored as negative, so we get absolute value to sum applied amounts
        const totalApplied = this.invoicesDisplay
          .filter(inv => (inv.originalDueAmountValue || 0) > 0) // Only include invoices with editable fields
          .reduce((sum, inv) => sum + Math.abs(inv.applyAmountValue || 0), 0);
        this.remainingAmount = this.paymentAmount - totalApplied; // Amount - (all applied)
        this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
      } else {
        this.paymentAmount = 0;
        this.paymentAmountDisplay = '$' + this.formatter.currency(0);
        input.value = this.paymentAmountDisplay;
        
        // Recalculate remaining amount
        // Only deduct apply amounts from invoices that have editable fields (originalDueAmountValue > 0)
        // applyAmountValue is stored as negative, so we get absolute value to sum applied amounts
        const totalApplied = this.invoicesDisplay
          .filter(inv => (inv.originalDueAmountValue || 0) > 0) // Only include invoices with editable fields
          .reduce((sum, inv) => sum + Math.abs(inv.applyAmountValue || 0), 0);
        this.remainingAmount = this.paymentAmount - totalApplied; // Amount - (all applied)
        this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
      }
    } else {
      this.paymentAmount = 0;
      this.paymentAmountDisplay = '$' + this.formatter.currency(0);
      input.value = this.paymentAmountDisplay;
      
      // Recalculate remaining amount
      // Only deduct apply amounts from invoices that have editable fields (originalDueAmountValue > 0)
      // applyAmountValue is stored as negative, so we get absolute value to sum applied amounts
      const totalApplied = this.invoicesDisplay
        .filter(inv => (inv.originalDueAmountValue || 0) > 0) // Only include invoices with editable fields
        .reduce((sum, inv) => sum + Math.abs(inv.applyAmountValue || 0), 0);
      this.remainingAmount = this.paymentAmount - totalApplied; // Amount - (all applied)
      // If negative (overpayment), show as positive number
      this.remainingAmountDisplay = '$' + this.formatter.currency(Math.abs(this.remainingAmount));
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
    if (!this.selectedOffice) {
      this.toastr.warning('Please select an office first');
      return;
    }

    this.paymentTargetInvoiceId = targetInvoiceId;
    this.restoreTopbarAfterPayment = !!targetInvoiceId;
    this.isManualApplyMode = !targetInvoiceId;
    this.remainingAmount = this.isManualApplyMode ? Math.max(0, this.paymentAmount) : 0;
    this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
    // Show payment form fields
    this.showPaymentForm = true;
    this.applyFilters();
  }

  cancelPaymentForm(): void {
    this.showPaymentForm = false;
    this.isManualApplyMode = false;
    this.clearPaymentForm();
  }

  submitPayment(): void {
    // Validate form fields
    if (!this.selectedPaymentCostCodeId || !this.selectedPaymentCostCode) {
      this.toastr.warning('Please select a cost code');
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
    // Find all invoices that have an apply amount entered (applyAmountValue is negative)
    const invoicesWithPayments = this.invoicesDisplay.filter(invoice => {
      const applyAmountValue = invoice.applyAmountValue || 0;
      return applyAmountValue < 0 && invoice.invoiceId; // Only invoices with negative apply amounts (meaning payment was applied)
    });

    if (invoicesWithPayments.length === 0) {
      this.toastr.warning('No payments have been applied to any invoices');
      return;
    }

    // Validate that remaining amount is 0
    if (this.remainingAmount !== 0) {
      this.toastr.warning(`Remaining amount must be $0.00 before submitting. Current remaining: ${this.remainingAmountDisplay}`);
      return;
    }

    // Process payments sequentially to avoid race conditions
    // Create an array of payment data
    const paymentData = invoicesWithPayments.map(invoice => {
      const paidAmount = Math.abs(invoice.applyAmountValue || 0); // Convert negative to positive
      return {
        invoice,
        paidAmount,
        paymentRequest: {
          costCodeId: this.selectedPaymentCostCodeId!,
          description: this.paymentDescription || '',
          amount: paidAmount,
          invoices: [invoice.invoiceId] // Single invoice per request
        } as InvoicePaymentRequest
      };
    });

    // Execute payments sequentially using concatMap
    from(paymentData).pipe(
      concatMap(({ paymentRequest, invoice }) => 
        this.accountingService.applyPayment(paymentRequest).pipe(
          take(1),
          map(response => ({ response, paymentRequest, invoice }))
        )
      ),
      finalize(() => {
        // Clear payment form after all payments are processed
        this.clearPaymentForm();
        this.refreshInvoicesForCurrentScope();
        // Refresh the display to show updated paid amounts
        this.applyFilters();
      })
    ).subscribe({
      next: ({ response, paymentRequest, invoice }) => {
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

        // Check if there's a credit amount remaining from the InvoicePaymentResponse
        if (response.creditRemaining > 0) {
          this.openCreditDialog(response, paymentRequest);
        }
      },
      error: () => {
      }
    });
  }

  applyPayment(invoiceIds: string[]): void {
    const paymentRequest: InvoicePaymentRequest = {
      costCodeId: this.selectedPaymentCostCodeId!,
      description: this.paymentDescription || '',
      amount: Math.abs(this.paymentAmount), // Payment should be positive
      invoices: invoiceIds
    };

    this.accountingService.applyPayment(paymentRequest).pipe(take(1)).subscribe({
      next: (response: InvoicePaymentResponse) => {
        this.handlePaymentResponse(response, paymentRequest);
        // Only clear payment form if there's no credit remaining (credit dialog will handle clearing if needed)
        if (response.creditRemaining <= 0) {
          this.clearPaymentForm();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.toastr.error('Failed to apply payment', CommonMessage.Error);
      }
    });
  }

  applyManually(): void {
    this.isManualApplyMode = true;
    this.remainingAmount = Math.max(0, this.paymentAmount);
    this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
    this.applyFilters();
  }
  
  onApplyAmountInput(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;
    
    // Remove currency symbols and keep only numbers and decimal point
    const isNegative = value.startsWith('-');
    value = value.replace(/[^0-9.]/g, '');
    
    // Preserve negative sign if present
    if (isNegative && value !== '') {
      value = '-' + value;
    }
    
    // Limit to one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
    
    // Update display value immediately for visual feedback
    invoice.applyAmountDisplay = input.value;
  }

  onApplyAmountChange(invoice: any, newValue: string): void {
    const cleanedValue = newValue.replace(/[^0-9.-]/g, '');
    const numericValue = parseFloat(cleanedValue) || 0;
    invoice.applyAmountDisplay = numericValue.toString();
  }
  
  onApplyAmountBlur(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.]/g, '').trim();
    
    if (rawValue !== '' && rawValue !== null) {
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        // Always store as negative value
        const negativeValue = parsed < 0 ? parsed : -Math.abs(parsed);
        
        invoice.applyAmountValue = negativeValue;
        invoice.applyAmountDisplay = '$' + this.formatter.currency(Math.abs(negativeValue)); // Display as positive
        invoice.applyAmount = invoice.applyAmountDisplay;
        input.value = invoice.applyAmountDisplay;
        
        // Calculate remaining amount: subtract apply amounts from payment amount
        // Only deduct apply amounts from invoices that have editable fields (originalDueAmountValue > 0)
        // applyAmountValue is stored as negative, so we get absolute value to sum applied amounts
        const totalApplied = this.invoicesDisplay
          .filter(inv => (inv.originalDueAmountValue || 0) > 0) // Only include invoices with editable fields
          .reduce((sum, inv) => sum + Math.abs(inv.applyAmountValue || 0), 0);
        this.remainingAmount = this.paymentAmount - totalApplied; // Amount - (all applied)
        this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
      } else {
        invoice.applyAmountValue = invoice.applyAmountValue || 0;
        invoice.applyAmountDisplay = '$' + this.formatter.currency(Math.abs(invoice.applyAmountValue || 0)); // Display as positive
        invoice.applyAmount = invoice.applyAmountDisplay;
        input.value = invoice.applyAmountDisplay;
      }
    } else {
      invoice.applyAmountValue = invoice.applyAmountValue || 0;
      invoice.applyAmountDisplay = '$' + this.formatter.currency(Math.abs(invoice.applyAmountValue || 0)); // Display as positive
      invoice.applyAmount = invoice.applyAmountDisplay;
      input.value = invoice.applyAmountDisplay;
    }
  }
  
  onApplyAmountFocus(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    // Show absolute value when focusing (for easier editing)
    const absValue = Math.abs(invoice.applyAmountValue || 0);
    input.value = absValue.toString();
    input.select();
  }

  onApplyAmountEnter(invoice: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  clearPaymentForm(): void {
    this.showPaymentForm = false;
    this.isManualApplyMode = false;
    this.selectedPaymentCostCodeId = null;
    this.selectedPaymentCostCode = null;
    this.paymentTransactionType = '';
    this.paymentDescription = '';
    this.paymentAmount = 0;
    this.paymentAmountDisplay = '$' + this.formatter.currency(0);
    this.remainingAmount = 0;
    this.remainingAmountDisplay = '$' + this.formatter.currency(0);
    this.paymentTargetInvoiceId = null;
    // Clear apply amounts from all invoices
    this.invoicesDisplay.forEach(invoice => {
      invoice.applyAmountValue = 0;
      invoice.applyAmount = '';
      invoice.applyAmountDisplay = '';
    });

    if (this.restoreTopbarAfterPayment) {
      this.restoreTopbarSelectionsAfterPayment();
    }
  }

  get isPaymentFormValid(): boolean {
    const baseValid = !!this.selectedPaymentCostCodeId && this.paymentAmount !== 0;
    
    // In manual apply mode, also require that remaining amount equals 0
    if (this.isManualApplyMode) {
      return baseValid && this.remainingAmount === 0;
    }
    
    return baseValid;
  }

  handlePaymentResponse(response: InvoicePaymentResponse, paymentRequest: InvoicePaymentRequest): void {
    this.toastr.success(`Payment of $${this.formatter.currency(paymentRequest.amount)} applied`, CommonMessage.Success);
    response.invoices.forEach(i => {
      const invoice = this.allInvoices.find(r => r.invoiceId === i.invoiceId);
      if (invoice) {
        invoice.paidAmount = i.paidAmount;
      }
    });
    
    // Check if there's a credit amount remaining from the InvoicePaymentResponse
    if (response.creditRemaining > 0) {
      this.openCreditDialog(response, paymentRequest);
    }
    
    // Refresh the display to show updated paid amounts
    this.applyFilters();
    this.refreshInvoicesForCurrentScope();
  }

  openCreditDialog(response: InvoicePaymentResponse, paymentRequest: InvoicePaymentRequest): void {
    // Get unique reservationIds from the invoices in the response
    const reservationIds = [...new Set(response.invoices
      .map(inv => inv.reservationId)
      .filter((id): id is string => id !== null && id !== undefined && id !== ''))];
    
    // Filter reservations to only include those from the response invoices
    const availableReservationsForCredit = this.reservations
      .filter(r => reservationIds.includes(r.reservationId))
      .map(r => ({
        value: r,
        label: this.utilityService.getReservationDropdownLabel(r, this.companyContacts.find(c => c.contactId === r.contactId) ?? null)
      }));
    
    // Get the invoice ID from the response (use first invoice that has the credit)
    const invoiceIdWithCredit = response.invoices.length > 0 ? response.invoices[0].invoiceId : null;
    
    if (availableReservationsForCredit.length > 0 && invoiceIdWithCredit) {
      const creditDialogData: ApplyCreditDialogData = {
        creditAmount: response.creditRemaining,
        reservations: availableReservationsForCredit,
        invoiceId: invoiceIdWithCredit,
        costCodeId: paymentRequest.costCodeId,
        description: paymentRequest.description
      };
      
      const creditDialogConfig: MatDialogConfig = {
        width: '500px',
        data: creditDialogData,
        autoFocus: true,
        restoreFocus: true,
        disableClose: false
      };
      const creditDialogRef = this.dialog.open(ApplyCreditDialogComponent, creditDialogConfig);
      
      creditDialogRef.afterClosed().subscribe((creditResult: { success: boolean } | undefined) => {
        if (creditResult?.success) {
          // Clear payment form after credit is applied
          this.clearPaymentForm();
          // Refresh invoices and reservations to show updated paid amounts and creditDue
          this.applyFilters();
          this.loadReservations();
        }
      });
    }
  }
  //#endregion

  //#region Total Row Methods
   get totalAmountSum(): number {
    return this.invoicesDisplay.reduce((sum, inv) => sum + (inv.totalAmountValue || 0), 0);
  }

  get totalPaidAmountSum(): number {
    return this.invoicesDisplay.reduce((sum, inv) => sum + Math.abs(inv.paidAmountValue || 0), 0);
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
  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOffice?.officeId ?? null);
    }
    this.filterCompanyContacts();
    this.filterReservations();
    if (this.selectedOffice) {
      this.filterCostCodes();
      this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
      this.getInvoices();
    } else {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
      this.loadAllInvoices();
      this.selectedReservation = null;
      this.selectedCompanyContact = null;
      this.applyFilters();
    }
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

  refreshInvoicesForCurrentScope(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
    if (this.selectedOffice?.officeId) {
      this.getInvoices();
      return;
    }
    this.loadAllInvoices();
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
    this.costCodesSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.reservationsSubscription?.unsubscribe();
    this.queryParamsSubscription?.unsubscribe();
  }

  hasRole(role: UserGroups): boolean {
    const groups = this.authService.getUser()?.userGroups;
    if (!groups) {
      return false;
    }

    return groups.some(group => {
      if (typeof group === 'string') {
        if (group === UserGroups[role]) {
          return true;
        }
        const groupAsNumber = parseInt(group, 10);
        return !isNaN(groupAsNumber) && groupAsNumber === role;
      }
      return typeof group === 'number' && group === role;
    });
  }
  //#endregion
}
