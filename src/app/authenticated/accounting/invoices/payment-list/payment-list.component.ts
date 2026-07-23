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
import { PaymentDisplayList, PaymentResponse, PaymentSearchRequest, PaymentSelection, PaymentLedgerLine } from '../../models/payment.model';
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
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('paymentLedgerLinesTemplate') paymentLedgerLinesTemplate?: TemplateRef<unknown>;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['payments']));
  destroy$ = new Subject<void>();
  showInactive = false;
  isAdmin = false;
  canEditIsActiveCheckbox = false;
  payments: PaymentResponse[] = [];
  paymentsDisplay: PaymentDisplayList[] = [];
  allPayments: PaymentDisplayList[] = [];
  expandedPayments = new Set<string>();
  isAllExpanded = false;
  paymentsLoadId = 0;
  lastPaymentSearchKey: string | null = null;
  paymentSearchInFlightKey: string | null = null;
  private cancelPaymentsLoad$ = new Subject<void>();

  readonly paymentDisplayedColumns: ColumnSet = {
    paymentDate: { displayAs: 'Date', wrap: false, maxWidth: '16ch', alignment: 'center' },
    paymentTypeDescription: { displayAs: 'Type', wrap: false, maxWidth: '16ch' },
    costCodeDescription: { displayAs: 'Cost Code', wrap: false, maxWidth: '25ch' },
    invoiceSummaryDisplay: { displayAs: 'Invoices', wrap: true, maxWidth: '36ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '24ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '18ch', alignment: 'right', headerAlignment: 'right' },
    allocatedAmountDisplay: { displayAs: 'Allocated', wrap: false, maxWidth: '18ch', alignment: 'right', headerAlignment: 'right' },
    hasDeposit: { displayAs: 'Deposit', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  activePaymentDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
    paymentDate: { displayAs: 'Date', wrap: false, maxWidth: '16ch', alignment: 'center' },
    paymentTypeDescription: { displayAs: 'Type', wrap: false, maxWidth: '16ch' },
    costCodeDescription: { displayAs: 'Cost Code', wrap: false, maxWidth: '25ch' },
    invoiceSummaryDisplay: { displayAs: 'Invoices', wrap: true, maxWidth: '36ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '24ch' },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '18ch', alignment: 'right', headerAlignment: 'right' },
    allocatedAmountDisplay: { displayAs: 'Allocated', wrap: false, maxWidth: '18ch', alignment: 'right', headerAlignment: 'right' },
    hasDeposit: { displayAs: 'Deposit', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

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
    this.loadPaymentsForCurrentSearchCriteria(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyFilters();
      this.loadPaymentsForCurrentSearchCriteria();
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
    this.paymentService.getPayments(scopedOfficeId).pipe(
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
  //#endregion

  //#region Data Load Methods
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
      switchMap((payment: PaymentResponse) => this.paymentService.updatePayment(
        this.mappingService.mapPaymentUpdateRequest(payment, nextValue)
      ).pipe(take(1))),
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
    const filtered = this.showInactive
      ? this.allPayments.filter(row => row.isActive === false)
      : this.allPayments.filter(row => row.isActive !== false);

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
    this.activePaymentDisplayedColumns = {
      expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
      ...this.paymentDisplayedColumns
    };
  }

  getPaymentLedgerLineColumnNames(): string[] {
    return Object.keys(this.paymentLedgerLineDisplayedColumns);
  }

  getPaymentLedgerLineColumnWidth(columnName: string): string | null {
    if (this.isPaymentLedgerLineGrowColumn(columnName)) {
      return null;
    }

    return this.paymentLedgerLineDisplayedColumns[columnName]?.maxWidth ?? null;
  }

  getPaymentLedgerLineColumnMinWidth(columnName: string): string | null {
    if (this.isPaymentLedgerLineGrowColumn(columnName)) {
      return this.paymentLedgerLineDisplayedColumns[columnName]?.maxWidth ?? '38ch';
    }

    return this.getPaymentLedgerLineColumnWidth(columnName);
  }

  isPaymentLedgerLineGrowColumn(columnName: string): boolean {
    return columnName === 'description';
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
    this.paymentDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
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
  private buildPaymentDisplayList(payments: PaymentResponse[]): PaymentDisplayList[] {
    const paymentById = new Map(payments.map(payment => [payment.paymentId, payment]));
    return this.mappingService.mapPaymentDisplays(payments).map(display => {
      const payment = paymentById.get(display.paymentId);
      const postingStatusId = payment?.postingStatusId ?? null;
      return {
        ...display,
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
