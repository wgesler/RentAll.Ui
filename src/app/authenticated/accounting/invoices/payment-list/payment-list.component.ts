import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, EMPTY, Subject, finalize, merge, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../../app.routes';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { MappingService } from '../../../../services/mapping.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { PaymentBillAllocation, PaymentDisplayList, PaymentOwnerAllocation, PaymentResponse, PaymentSearchRequest, PaymentSelection, PaymentLedgerLine } from '../../models/payment.model';
import { PaymentKind } from '../../models/accounting-enum';
import { buildBillSplitLineDescription, ReceiptResponse } from '../../../maintenance/models/receipt.model';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { EntityType } from '../../../contacts/models/contact-enum';
import { ContactService } from '../../../contacts/services/contact.service';
import { ReservationListResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { PaymentService } from '../../services/payment.service';
import { JournalEntryService } from '../../services/journal-entry.service';

@Component({
  standalone: true,
  selector: 'app-payment-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './payment-list.component.html',
  styleUrl: './payment-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() companyId: string | null = null;
  @Input() paymentKind: PaymentKind = PaymentKind.Invoice;
  @Input() searchRequest?: PaymentSearchRequest | null;
  @Input() embeddedInAccounting = false;
  @Input() refreshTrigger = 0;
  @Output() paymentSelect = new EventEmitter<PaymentSelection>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  private paymentService = inject(PaymentService);
  private mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private journalEntryService = inject(JournalEntryService);
  private contactService = inject(ContactService);
  private receiptService = inject(ReceiptService);
  private reservationService = inject(ReservationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('paymentLedgerLinesTemplate') paymentLedgerLinesTemplate?: TemplateRef<unknown>;

  showInactive = false;
  isAdmin = false;
  canEditIsActiveCheckbox = false;
  companyContacts: ContactResponse[] = [];
  vendorContacts: ContactResponse[] = [];
  billReceiptsById = new Map<string, ReceiptResponse>();
  selectedCompanyContact: ContactResponse | null = null;
  reservations: ReservationListResponse[] = [];
  payments: PaymentResponse[] = [];
  paymentsDisplay: PaymentDisplayList[] = [];
  allPayments: PaymentDisplayList[] = [];
  expandedPayments = new Set<string>();
  isAllExpanded = false;
  paymentsLoadId = 0;
  lastPaymentSearchKey: string | null = null;
  paymentSearchInFlightKey: string | null = null;
  cancelPaymentsLoad$ = new Subject<void>();

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['payments']));
  destroy$ = new Subject<void>();

  activePaymentDisplayedColumns: ColumnSet = {};
  readonly invoicePaymentDisplayedColumns: ColumnSet = {
    paymentDate: { displayAs: 'Date', wrap: false, maxWidth: '16ch', alignment: 'center' },
    paymentCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    paymentKindDescription: { displayAs: 'Kind', wrap: false, maxWidth: '14ch' },
    paymentTypeDescription: { displayAs: 'Type', wrap: false, maxWidth: '16ch' },
    costCodeDescription: { displayAs: 'Cost Code', wrap: false, maxWidth: '25ch' },
    invoiceSummaryDisplay: { displayAs: 'Invoices', wrap: true, maxWidth: '36ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '24ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    allocatedAmountDisplay: { displayAs: 'Allocated', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    hasDeposit: { displayAs: 'Deposit', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '12ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  readonly billPaymentDisplayedColumns: ColumnSet = {
    paymentDate: { displayAs: 'Date', wrap: false, maxWidth: '16ch', alignment: 'center' },
    paymentCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    paymentTypeDescription: { displayAs: 'Type', wrap: false, maxWidth: '16ch' },
    vendorSummaryDisplay: { displayAs: 'Vendor', wrap: true, maxWidth: '28ch' },
    billSummaryDisplay: { displayAs: 'Bills', wrap: true, maxWidth: '36ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '24ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    allocatedAmountDisplay: { displayAs: 'Allocated', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '18ch' }
  };

  readonly paymentBillAllocationDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '7ch', wrap: false, sort: false, alignment: 'center', headerAlignment: 'center' },
    receiptCode: { displayAs: 'Bill', maxWidth: '15ch', wrap: false, sortType: 'natural' },
    billNumber: { displayAs: 'Bill Number', maxWidth: '24ch', wrap: true },
    description: { displayAs: 'Description', maxWidth: '38ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '18ch', wrap: false, alignment: 'right', headerAlignment: 'right', sort: false }
  };

  readonly ownerPaymentDisplayedColumns: ColumnSet = {
    paymentDate: { displayAs: 'Date', wrap: false, maxWidth: '16ch', alignment: 'center' },
    paymentCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    paymentTypeDescription: { displayAs: 'Type', wrap: false, maxWidth: '16ch' },
    ownerSummaryDisplay: { displayAs: 'Owner', wrap: true, maxWidth: '28ch' },
    propertySummaryDisplay: { displayAs: 'Properties', wrap: true, maxWidth: '36ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '24ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    allocatedAmountDisplay: { displayAs: 'Allocated', wrap: false, maxWidth: '16ch', alignment: 'right', headerAlignment: 'right' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '18ch' }
  };

  readonly paymentOwnerAllocationDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '7ch', wrap: false, sort: false, alignment: 'center', headerAlignment: 'center' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', wrap: false, sortType: 'natural' },
    ownerName: { displayAs: 'Owner', maxWidth: '28ch', wrap: true },
    description: { displayAs: 'Description', maxWidth: '38ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '18ch', wrap: false, alignment: 'right', headerAlignment: 'right', sort: false }
  };

  get isOutboundPaymentList(): boolean {
    return this.paymentKind === PaymentKind.Bill;
  }

  get isOwnerPaymentList(): boolean {
    return this.paymentKind === PaymentKind.Owner;
  }

  get isBillStylePaymentList(): boolean {
    return this.isOutboundPaymentList || this.isOwnerPaymentList;
  }

  readonly paymentLedgerLineDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '7ch', wrap: false, sort: false, alignment: 'center', headerAlignment: 'center' },
    invoiceCode: { displayAs: 'Invoice', maxWidth: '15ch', wrap: false, sortType: 'natural' },
    ledgerLineDate: { displayAs: 'Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    description: { displayAs: 'Description', maxWidth: '38ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '18ch', wrap: false, alignment: 'right', headerAlignment: 'right', sort: false }
  };

  //#region Payment List
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.syncActivePaymentDisplayedColumns();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    if (this.embeddedInAccounting) {
      this.itemsToLoad$.next(new Set(['payments', 'companies', 'reservations']));
      this.loadCompanyContacts();
      this.loadReservations();
    }
    if (this.isOutboundPaymentList) {
      this.loadVendorContacts();
      this.loadBillReceipts();
    }
    this.loadPaymentsForCurrentSearchCriteria(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      const previousCompanyId = changes['companyId'].previousValue;
      if (previousCompanyId === undefined || newCompanyId !== previousCompanyId) {
        if (this.companyContacts.length > 0) {
          if (!newCompanyId) {
            if (this.selectedCompanyContact !== null) {
              this.selectedCompanyContact = null;
              this.applyFilters();
            }
          } else {
            const matching = this.companyContacts.find(c =>
              c.contactId === newCompanyId &&
              this.contactHasOfficeAccess(c, this.officeId)
            ) || null;
            if (matching !== this.selectedCompanyContact) {
              this.selectedCompanyContact = matching;
              this.applyFilters();
            }
          }
        }
      }
    }

    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.syncSelectedCompanyContact();
      this.applyFilters();
      if (this.isOutboundPaymentList) {
        this.loadBillReceipts();
      }
      this.loadPaymentsForCurrentSearchCriteria();
    }

    if (changes['searchRequest'] && !changes['searchRequest'].firstChange && this.isOutboundPaymentList) {
      this.loadBillReceipts();
    }

    if (changes['paymentKind'] && !changes['paymentKind'].firstChange) {
      this.syncActivePaymentDisplayedColumns();
      if (this.isOutboundPaymentList) {
        this.loadVendorContacts();
        this.loadBillReceipts();
      }
      this.loadPaymentsForCurrentSearchCriteria(true);
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadPaymentsForCurrentSearchCriteria(true);
    }

    if (changes['searchRequest'] && !changes['searchRequest'].firstChange && this.embeddedInAccounting) {
      const previousKey = this.buildPaymentSearchKey(changes['searchRequest'].previousValue as PaymentSearchRequest | null | undefined);
      const nextKey = this.buildPaymentSearchKey(changes['searchRequest'].currentValue as PaymentSearchRequest | null | undefined);
      if (previousKey !== nextKey) {
        this.loadPaymentsForCurrentSearchCriteria();
      }
    }
  }

  getPayments(force = false): void {
    if (this.embeddedInAccounting && !this.canRunAccountingSearch(this.searchRequest)) {
      this.lastPaymentSearchKey = null;
      this.paymentSearchInFlightKey = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'payments');
      this.markViewForCheck();
      return;
    }

    const searchKey = this.buildPaymentSearchKey();
    if (!force && searchKey === this.lastPaymentSearchKey) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'payments');
      return;
    }
    if (!force && searchKey === this.paymentSearchInFlightKey) {
      return;
    }
    this.paymentSearchInFlightKey = searchKey;

    this.cancelPaymentsLoad$.next();
    const loadId = ++this.paymentsLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'payments');

    const scopedOfficeId = this.resolveScopedOfficeId();
    this.paymentService.getPayments(scopedOfficeId, this.paymentKind).pipe(
      take(1),
      takeUntil(merge(this.cancelPaymentsLoad$, this.destroy$)),
      finalize(() => {
        if (this.paymentsLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'payments');
          if (this.paymentSearchInFlightKey === searchKey) {
            this.paymentSearchInFlightKey = null;
          }
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: (payments: PaymentResponse[]) => {
        if (this.paymentsLoadId !== loadId) {
          return;
        }
        this.lastPaymentSearchKey = searchKey;
        this.payments = this.filterPaymentsBySearchCriteria(payments || []);
        try {
          this.allPayments = this.buildPaymentDisplayList(this.payments);
        } catch {
          this.toastr.error('Unable to load payments.', 'Error');
          this.payments = [];
          this.allPayments = [];
          this.paymentsDisplay = [];
          this.markViewForCheck();
          return;
        }
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        if (this.paymentsLoadId !== loadId) {
          return;
        }
        this.toastr.error('Unable to load payments.', 'Error');
        this.payments = [];
        this.allPayments = [];
        this.paymentsDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  addPayment(): void {
    this.paymentSelect.emit({
      paymentId: 'new',
      officeId: this.officeId ?? null
    });
  }

  deletePayment(event: PaymentDisplayList): void {
    if (event.deleteDisabled) {
      return;
    }

    const payment = this.payments.find(item => item.paymentId === event.paymentId);
    this.journalEntryService.confirmDeleteIfAllowed(payment?.postingStatusId, 'Payment').pipe(
      take(1),
      switchMap(canProceed => {
        if (!canProceed) {
          return EMPTY;
        }

        return this.paymentService.deletePayment(event.paymentId).pipe(take(1));
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Payment deleted successfully', CommonMessage.Success);
        this.payments = this.payments.filter(payment => payment.paymentId !== event.paymentId);
        this.allPayments = this.buildPaymentDisplayList(this.payments);
        this.applyFilters();
        this.journalEntriesChanged.emit();
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to delete payment.', 'Error');
        this.markViewForCheck();
      }
    });
  }

  goToPayment(event: PaymentDisplayList): void {
    const payment = this.payments.find(item => item.paymentId === event.paymentId) ?? null;
    this.paymentSelect.emit({
      paymentId: event.paymentId,
      officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
      payment
    });
  }

  goToInvoice(event: Event, line: PaymentLedgerLine): void {
    event.stopPropagation();
    const invoiceId = (line.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    void this.router.navigateByUrl(`/${RouterUrl.replaceTokens(RouterUrl.Billing, [invoiceId])}`);
  }

  isInvoiceAllocationLink(
    line: PaymentLedgerLine | PaymentBillAllocation,
    columnName: string
  ): line is PaymentLedgerLine {
    if (this.isOutboundPaymentList || columnName !== 'invoiceCode') {
      return false;
    }

    return !!(line as PaymentLedgerLine).invoiceId?.trim();
  }

  onInvoiceAllocationClick(event: Event, line: PaymentLedgerLine | PaymentBillAllocation): void {
    if (!this.isInvoiceAllocationLink(line, 'invoiceCode')) {
      return;
    }

    this.goToInvoice(event, line);
  }
  //#endregion

  //#region Data Load Methods
  loadCompanyContacts(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'companies');
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllCompanyContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies'); })).subscribe({
          next: (contacts) => {
            this.companyContacts = contacts || [];
            this.syncSelectedCompanyContact();
            this.markViewForCheck();
          },
          error: () => {
            this.companyContacts = [];
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.companyContacts = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies');
        this.markViewForCheck();
      }
    });
  }

  loadVendorContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: (contacts) => {
        this.vendorContacts = (contacts || []).filter(contact => contact.entityTypeId === EntityType.Vendor);
        if (this.payments.length > 0) {
          this.allPayments = this.buildPaymentDisplayList(this.payments);
          this.applyFilters();
        }
        this.markViewForCheck();
      },
      error: () => {
        this.vendorContacts = [];
        this.markViewForCheck();
      }
    });
  }

  loadBillReceipts(): void {
    const officeIds = this.resolveAccountingSearchOfficeIds();
    if (officeIds.length === 0) {
      this.billReceiptsById = new Map();
      return;
    }

    this.receiptService.searchReceipts({
      officeIds,
      includeInactive: true,
      isActive: null
    }).pipe(take(1)).subscribe({
      next: (receipts) => {
        this.billReceiptsById = new Map(
          (receipts || [])
            .map(receipt => [String(receipt.receiptId || '').trim(), receipt] as const)
            .filter(([receiptId]) => receiptId.length > 0)
        );
        this.markViewForCheck();
      },
      error: () => {
        this.billReceiptsById = new Map();
        this.markViewForCheck();
      }
    });
  }

  loadReservations(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        if (this.selectedCompanyContact) {
          this.applyFilters();
        }
        this.markViewForCheck();
      },
      error: () => {
        this.reservations = [];
        this.markViewForCheck();
      }
    });
  }

  loadPaymentsForCurrentSearchCriteria(force = false): void {
    if (!this.embeddedInAccounting) {
      this.getPayments(force);
      return;
    }

    queueMicrotask(() => {
      if (!this.canRunAccountingSearch(this.searchRequest)) {
        this.lastPaymentSearchKey = null;
        this.paymentSearchInFlightKey = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'payments');
        this.markViewForCheck();
        return;
      }
      this.getPayments(force);
    });
  }
  //#endregion

  //#region Form Response Methods
  buildPaymentSearchKey(request: PaymentSearchRequest | null | undefined = this.searchRequest): string {
    const resolvedRequest = request ?? { officeIds: [] };
    return JSON.stringify({
      paymentKind: this.paymentKind,
      officeIds: this.resolveAccountingSearchOfficeIds(resolvedRequest),
      startDate: resolvedRequest.startDate,
      endDate: resolvedRequest.endDate,
      showInactive: this.showInactive,
      officeId: this.officeId
    });
  }

  filterPaymentsBySearchCriteria(payments: PaymentResponse[]): PaymentResponse[] {
    const officeIds = this.resolveAccountingSearchOfficeIds(this.searchRequest);
    const startDate = this.searchRequest?.startDate ?? null;
    const endDate = this.searchRequest?.endDate ?? null;

    return (payments || []).filter(payment => {
      if (officeIds.length > 0 && !officeIds.includes(Number(payment.officeId))) {
        return false;
      }

      if (startDate && payment.paymentDate < startDate) {
        return false;
      }

      if (endDate && payment.paymentDate > endDate) {
        return false;
      }

      return true;
    });
  }

  onPaymentCheckboxChange(event: PaymentDisplayList): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as PaymentDisplayList & { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as PaymentDisplayList & { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as PaymentDisplayList & { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyPaymentIsActiveValue(event.paymentId, nextValue);

    this.paymentService.getPaymentById(event.paymentId).pipe(
      take(1),
      switchMap((payment: PaymentResponse) => {
        if (this.paymentKind === PaymentKind.Bill) {
          const request = this.mappingService.mapPaymentBillUpdateRequest(payment, nextValue);
          return this.paymentService.updatePaymentBill(request).pipe(take(1));
        }

        const request = this.mappingService.mapPaymentInvoiceUpdateRequest(payment, nextValue);
        return this.paymentService.updatePaymentInvoice(request).pipe(take(1));
      }),
      finalize(() => {
        this.applyFilters();
        this.markViewForCheck();
      })
    ).subscribe({
      next: (saved: PaymentResponse) => {
        this.replacePaymentInCollections(saved);
        this.toastr.success('Payment updated.', CommonMessage.Success);
        this.markViewForCheck();
      },
      error: () => {
        this.applyPaymentIsActiveValue(event.paymentId, previousValue);
        this.toastr.error('Unable to update payment.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    if (this.embeddedInAccounting) {
      this.loadPaymentsForCurrentSearchCriteria(true);
      return;
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  canRunAccountingSearch(request?: PaymentSearchRequest | null): boolean {
    if (!this.embeddedInAccounting || request == null) {
      return false;
    }

    return !!(
      request.startDate
      && request.endDate
      && this.resolveAccountingSearchOfficeIds(request).length > 0
    );
  }

  resolveAccountingSearchOfficeIds(request?: PaymentSearchRequest | null): number[] {
    const fromShell = (request?.officeIds ?? this.searchRequest?.officeIds ?? []).filter(id => id > 0);
    if (fromShell.length > 0) {
      return fromShell;
    }

    const scopedOfficeId = this.officeId;
    if (scopedOfficeId != null && Number.isFinite(Number(scopedOfficeId)) && Number(scopedOfficeId) > 0) {
      return [Number(scopedOfficeId)];
    }

    return [];
  }

  resolveScopedOfficeId(): number | null {
    if (this.embeddedInAccounting) {
      return null;
    }

    if (this.officeId != null && Number.isFinite(Number(this.officeId)) && Number(this.officeId) > 0) {
      return Number(this.officeId);
    }

    return null;
  }

  applyFilters(): void {
    let filtered = this.showInactive
      ? this.allPayments.filter(row => row.isActive === false)
      : this.allPayments.filter(row => row.isActive !== false);

    if (this.selectedCompanyContact) {
      filtered = filtered.filter(row => this.paymentMatchesCompanyFilter(row.paymentId));
    }

    this.paymentsDisplay = filtered.map(payment => ({
      ...payment,
      expand: payment.paymentId,
      expanded: this.expandedPayments.has(payment.paymentId),
      expandClick: (event: Event, item: PaymentDisplayList) => {
        event.stopPropagation();
        if (this.expandedPayments.has(item.paymentId)) {
          this.expandedPayments.delete(item.paymentId);
        } else {
          this.expandedPayments.add(item.paymentId);
        }
        this.applyFilters();
        this.markViewForCheck();
      }
    }));

    this.updateIsAllExpanded();
  }

  syncActivePaymentDisplayedColumns(): void {
    const kindColumns = this.isOwnerPaymentList
      ? this.ownerPaymentDisplayedColumns
      : this.isBillStylePaymentList
        ? this.billPaymentDisplayedColumns
        : this.invoicePaymentDisplayedColumns;
    this.activePaymentDisplayedColumns = {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...kindColumns
    };
  }

  getPaymentAllocationColumnNames(): string[] {
    return Object.keys(this.getPaymentAllocationColumnSet());
  }

  getPaymentAllocationColumnSet(): ColumnSet {
    if (this.isOwnerPaymentList) {
      return this.paymentOwnerAllocationDisplayedColumns;
    }

    return this.isOutboundPaymentList
      ? this.paymentBillAllocationDisplayedColumns
      : this.paymentLedgerLineDisplayedColumns;
  }

  getPaymentAllocationColumnWidth(columnName: string): string | null {
    if (this.isPaymentAllocationGrowColumn(columnName)) {
      return null;
    }

    return this.getPaymentAllocationColumnSet()[columnName]?.maxWidth ?? null;
  }

  getPaymentAllocationColumnMinWidth(columnName: string): string | null {
    if (this.isPaymentAllocationGrowColumn(columnName)) {
      return this.getPaymentAllocationColumnSet()[columnName]?.maxWidth ?? '38ch';
    }

    return this.getPaymentAllocationColumnWidth(columnName);
  }

  isPaymentAllocationGrowColumn(columnName: string): boolean {
    return columnName === 'description';
  }

  paymentHasAllocationDetails(payment: PaymentDisplayList): boolean {
    if (this.isOwnerPaymentList) {
      return (payment.ownerAllocations?.length ?? 0) > 0;
    }

    if (this.isOutboundPaymentList) {
      return (payment.billAllocations?.length ?? 0) > 0;
    }

    return (payment.ledgerLines?.length ?? 0) > 0;
  }

  getPaymentAllocationLines(payment: PaymentDisplayList): Array<PaymentLedgerLine | PaymentBillAllocation | PaymentOwnerAllocation> {
    if (this.isOwnerPaymentList) {
      return payment.ownerAllocations ?? [];
    }

    return this.isOutboundPaymentList
      ? (payment.billAllocations ?? [])
      : (payment.ledgerLines ?? []);
  }

  getPaymentAllocationEmptyMessage(): string {
    if (this.isOwnerPaymentList) {
      return 'No owner allocations linked to this payment.';
    }

    return this.isOutboundPaymentList
      ? 'No bill allocations linked to this payment.'
      : 'No invoice allocations linked to this payment.';
  }

  getPaymentBillAllocationColumnValue(allocation: PaymentBillAllocation, columnName: string, lineIndex: number): string {
    switch (columnName) {
      case 'lineNo':
        return String(lineIndex + 1);
      case 'receiptCode':
        return (allocation.receiptCode || '').trim() || '—';
      case 'billNumber':
        return this.resolveBillAllocationBillNumber(allocation) || '—';
      case 'description':
        return this.resolveBillAllocationDescription(allocation) || '—';
      case 'amount':
        return this.formatter.currencyUsd(Number(allocation.amount) || 0);
      default:
        return '—';
    }
  }

  resolveBillAllocationVendorName(allocation: PaymentBillAllocation): string {
    const directName = (allocation.vendorName || '').trim();
    if (directName) {
      return directName;
    }

    const vendorId = (allocation.vendorId || '').trim();
    if (!vendorId) {
      return '';
    }

    const vendorContact = this.vendorContacts.find(contact => contact.contactId === vendorId);
    return this.utilityService.getVendorDropdownLabel(vendorContact);
  }

  resolveBillAllocationBillNumber(allocation: PaymentBillAllocation): string {
    const receiptId = (allocation.receiptId || '').trim();
    const bill = receiptId ? this.billReceiptsById.get(receiptId) : undefined;
    return (bill?.billNumber || '').trim();
  }

  buildVendorSummaryDisplay(allocations: PaymentBillAllocation[] | undefined): string {
    const vendorNames = Array.from(new Set(
      (allocations ?? [])
        .map(allocation => this.resolveBillAllocationVendorName(allocation))
        .filter(name => name.length > 0)
    ));
    return vendorNames.join(', ');
  }

  resolveBillAllocationDescription(allocation: PaymentBillAllocation): string {
    const receiptId = (allocation.receiptId || '').trim();
    const bill = receiptId ? this.billReceiptsById.get(receiptId) : undefined;
    const splitDescription = buildBillSplitLineDescription(bill);
    if (splitDescription) {
      return splitDescription;
    }

    return (allocation.description || '').trim();
  }

  getPaymentOwnerAllocationColumnValue(allocation: PaymentOwnerAllocation, columnName: string, lineIndex: number): string {
    switch (columnName) {
      case 'lineNo':
        return String(lineIndex + 1);
      case 'propertyCode':
        return (allocation.propertyCode || '').trim() || '—';
      case 'ownerName':
        return (allocation.ownerName || '').trim() || '—';
      case 'description':
        return (allocation.description || '').trim() || '—';
      case 'amount':
        return this.formatter.currencyUsd(Number(allocation.amount) || 0);
      default:
        return '—';
    }
  }

  getPaymentAllocationColumnValue(
    line: PaymentLedgerLine | PaymentBillAllocation | PaymentOwnerAllocation,
    columnName: string,
    lineIndex: number
  ): string {
    if (this.isOwnerPaymentList) {
      return this.getPaymentOwnerAllocationColumnValue(line as PaymentOwnerAllocation, columnName, lineIndex);
    }

    if (this.isOutboundPaymentList) {
      return this.getPaymentBillAllocationColumnValue(line as PaymentBillAllocation, columnName, lineIndex);
    }

    return this.getPaymentLedgerLineColumnValue(line as PaymentLedgerLine, columnName, lineIndex);
  }

  getPaymentLedgerLineColumnNames(): string[] {
    return this.getPaymentAllocationColumnNames();
  }

  getPaymentLedgerLineColumnWidth(columnName: string): string | null {
    return this.getPaymentAllocationColumnWidth(columnName);
  }

  getPaymentLedgerLineColumnMinWidth(columnName: string): string | null {
    return this.getPaymentAllocationColumnMinWidth(columnName);
  }

  isPaymentLedgerLineGrowColumn(columnName: string): boolean {
    return this.isPaymentAllocationGrowColumn(columnName);
  }

  getPaymentLedgerLineColumnValue(line: PaymentLedgerLine, columnName: string, lineIndex: number): string {
    switch (columnName) {
      case 'lineNo':
        return String(lineIndex + 1);
      case 'invoiceCode':
        return (line.invoiceCode || '').trim() || '—';
      case 'ledgerLineDate':
        return this.formatter.formatDateString(line.ledgerLineDate) || '—';
      case 'description':
        return (line.description || '').trim() || '—';
      case 'amount':
        return this.formatter.currencyUsd(Number(line.amount) || 0);
      default:
        return '—';
    }
  }

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      this.paymentsDisplay.forEach(payment => this.expandedPayments.add(payment.paymentId));
    } else {
      this.expandedPayments.clear();
    }
    this.applyFilters();
    this.markViewForCheck();
  }

  updateIsAllExpanded(): void {
    if (this.paymentsDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }

    this.isAllExpanded = this.paymentsDisplay.every(payment => this.expandedPayments.has(payment.paymentId));
  }

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.invoicePaymentDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
    this.billPaymentDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
    this.ownerPaymentDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
    this.syncActivePaymentDisplayedColumns();
  }

  applyPaymentIsActiveValue(paymentId: string, isActive: boolean): void {
    const updateRow = (row: { paymentId: string; isActive: boolean }) => {
      if (row.paymentId === paymentId) {
        row.isActive = isActive;
      }
    };
    this.allPayments.forEach(updateRow);
    this.payments.forEach(updateRow);
    this.applyFilters();
  }

  replacePaymentInCollections(saved: PaymentResponse): void {
    const savedId = (saved.paymentId || '').trim();
    if (!savedId) {
      return;
    }
    const paymentIndex = this.payments.findIndex(payment => payment.paymentId === savedId);
    if (paymentIndex >= 0) {
      this.payments = [
        ...this.payments.slice(0, paymentIndex),
        saved,
        ...this.payments.slice(paymentIndex + 1)
      ];
    }
    this.allPayments = this.buildPaymentDisplayList(this.payments);
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  syncSelectedCompanyContact(): void {
    const companyIdToApply = this.getCompanyIdToApply();
    if (!companyIdToApply) {
      if (this.selectedCompanyContact !== null) {
        this.selectedCompanyContact = null;
        this.applyFilters();
      }
      return;
    }

    const matching = this.companyContacts.find(c =>
      c.contactId === companyIdToApply &&
      this.contactHasOfficeAccess(c, this.officeId)
    ) || null;
    if (matching !== this.selectedCompanyContact) {
      this.selectedCompanyContact = matching;
      this.applyFilters();
    }
  }

  getCompanyIdToApply(): string | null {
    if (this.companyId !== null && this.companyId !== undefined && this.companyId !== '') {
      return this.companyId;
    }

    return this.selectedCompanyContact?.contactId ?? null;
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

  reservationMatchesCompanyFilter(reservation: ReservationListResponse): boolean {
    if (!this.selectedCompanyContact) {
      return true;
    }

    const companyName = this.selectedCompanyContact.companyName;
    const relatedCompanyContacts = this.companyContacts.filter(contact => contact.isActive && contact.companyName === companyName);
    const companyContactIds = relatedCompanyContacts.map(contact => contact.contactId);
    return companyContactIds.includes(reservation.contactId)
      || (!!reservation.companyId && companyContactIds.includes(reservation.companyId))
      || relatedCompanyContacts.some(contact => contact.companyName === reservation.companyName || contact.displayName === reservation.companyName);
  }

  paymentMatchesCompanyFilter(paymentId: string): boolean {
    if (!this.selectedCompanyContact || this.isBillStylePaymentList) {
      return !this.selectedCompanyContact;
    }

    const payment = this.payments.find(item => item.paymentId === paymentId);
    if (!payment) {
      return false;
    }

    const ledgerLines = payment.invoiceAllocations ?? payment.ledgerLines ?? [];
    if (ledgerLines.length === 0) {
      return false;
    }

    return ledgerLines.some(line => {
      const reservationId = (line.reservationId || '').trim();
      if (!reservationId) {
        return false;
      }

      const reservation = this.reservations.find(item => item.reservationId === reservationId);
      return !!reservation && this.reservationMatchesCompanyFilter(reservation);
    });
  }

  private buildPaymentDisplayList(payments: PaymentResponse[]): PaymentDisplayList[] {
    const paymentById = new Map(payments.map(payment => [payment.paymentId, payment]));
    return this.mappingService.mapPaymentDisplays(payments).map(display => {
      const payment = paymentById.get(display.paymentId);
      const postingStatusId = payment?.postingStatusId ?? null;
      return {
        ...display,
        vendorSummaryDisplay: this.isOutboundPaymentList
          ? this.buildVendorSummaryDisplay(display.billAllocations)
          : undefined,
        postingStatusId,
        deleteDisabled: !this.journalEntryService.canDeleteApplicationObject(postingStatusId)
      };
    });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelPaymentsLoad$.next();
    this.cancelPaymentsLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
