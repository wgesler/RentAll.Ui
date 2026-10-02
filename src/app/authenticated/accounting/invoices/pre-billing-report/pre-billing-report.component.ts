import { CommonModule } from '@angular/common';
import { SelectionModel } from '@angular/cdk/collections';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../../app.routes';
import { BehaviorSubject, EMPTY, Subject, catchError, concatMap, finalize, from, take, takeUntil, tap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { CommonService } from '../../../../services/common.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { TransactionTypeLabels } from '../../models/accounting-enum';
import { CostCodesResponse } from '../../models/cost-codes.model';
import { InvoiceResponse, InvoiceSelection, LedgerLineListDisplay, PreBillingInvoiceDisplay } from '../../models/invoice.model';
import { UserGroups } from '../../../users/models/user-enums';
import { CostCodesService } from '../../services/cost-codes.service';
import { InvoiceService } from '../../services/invoice.service';

@Component({
  selector: 'app-pre-billing-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './pre-billing-report.component.html',
  styleUrl: './pre-billing-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreBillingReportComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeIds: number[] = [];
  @Input() billingMonth: string | null = null;
  @Input() companyName: string | null = null;
  @Input() officeName: string | null = null;
  @Input() refreshTrigger = 0;

  @Output() invoicesCreated = new EventEmitter<void>();
  @Output() editInvoice = new EventEmitter<InvoiceResponse>();
  @Output() invoiceSelectEvent = new EventEmitter<InvoiceSelection>();

  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate?: TemplateRef<unknown>;

  private invoiceService = inject(InvoiceService);
  private costCodesService = inject(CostCodesService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private commonService = inject(CommonService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  readonly preBillingDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '5ch', sort: false, includeInFilter: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    invoiceCode: { displayAs: 'Invoice', maxWidth: '17ch', sortType: 'natural', wrap: false },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural', wrap: false },
    responsibleParty: { displayAs: 'Recipient', wrap: false, maxWidth: '25ch' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '15ch', alignment: 'center' },
    totalAmount: { displayAs: 'Total', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' }
  };

  readonly ledgerLinesDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '5ch', wrap: false, alignment: 'left' },
    ledgerLineDate: { displayAs: 'Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    costCode: { displayAs: 'Cost Code', maxWidth: '25ch', wrap: false },
    transactionType: { displayAs: 'Type', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '15ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '15ch', wrap: false, alignment: 'right' }
  };

  allCostCodes: CostCodesResponse[] = [];
  transactionTypes: { value: number; label: string }[] = TransactionTypeLabels;

  isServiceError = false;
  invoices: InvoiceResponse[] = [];
  invoicesDisplay: PreBillingInvoiceDisplay[] = [];
  expandedRowKeys = new Set<string>();
  selectedRowKeys = new Set<string>();
  isAllExpanded = false;
  isCreatingInvoices = false;
  noDataMessage = 'No reservations need billing for the selected offices and month.';
  loadedCompanyName = '';

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['preBillingReport']));
  destroy$ = new Subject<void>();

  //#region Pre-Billing Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOrganization();
    this.loadCostCodes();
    this.loadReport();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['companyName'] && !changes['companyName'].firstChange) {
      this.markViewForCheck();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadReport();
      return;
    }

    const officeIdsChange = changes['officeIds'];
    if (officeIdsChange && !officeIdsChange.firstChange) {
      const previousOfficeIds = this.normalizeOfficeIds(officeIdsChange.previousValue);
      const currentOfficeIds = this.normalizeOfficeIds(officeIdsChange.currentValue);
      if (previousOfficeIds.join(',') !== currentOfficeIds.join(',')) {
        this.loadReport();
        return;
      }
    }

    const billingMonthChange = changes['billingMonth'];
    if (billingMonthChange && !billingMonthChange.firstChange
      && billingMonthChange.previousValue !== billingMonthChange.currentValue) {
      this.loadReport();
    }
  }
  //#endregion

  //#region Data Load Methods
  loadOrganization(): void {
    const cachedOrganization = this.commonService.getOrganizationValue();
    if (cachedOrganization?.name) {
      this.loadedCompanyName = cachedOrganization.name.trim();
    }

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(organization => {
      this.loadedCompanyName = organization?.name?.trim() || '';
      this.markViewForCheck();
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.costCodesService.getAllCostCodes().pipe(takeUntil(this.destroy$)).subscribe(costCodes => {
          this.allCostCodes = costCodes || [];
          this.buildInvoicesDisplay();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.allCostCodes = [];
      }
    });
  }

  loadReport(): void {
    const officeIds = this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.invoices = [];
      this.isServiceError = false;
      this.expandedRowKeys.clear();
      this.selectedRowKeys.clear();
      this.isAllExpanded = false;
      this.noDataMessage = 'Select at least one office to view the pre-billing report.';
      this.buildInvoicesDisplay();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preBillingReport');
      this.markViewForCheck();
      return;
    }

    const billingMonth = this.resolveBillingMonth();
    this.isServiceError = false;

    this.invoiceService.searchPreBillingInvoices({ officeIds, billingMonth }).pipe(take(1), finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preBillingReport');
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: invoices => {
        this.invoices = invoices ?? [];
        this.expandedRowKeys.clear();
        this.selectedRowKeys.clear();
        this.isAllExpanded = false;
        this.noDataMessage = 'No reservations need billing for the selected offices and month.';
        this.buildInvoicesDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.invoices = [];
        this.invoicesDisplay = [];
        this.isServiceError = true;
        const message = typeof error?.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message || 'Unable to load pre-billing report.';
        this.toastr.error(message, 'Pre-Billing');
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Expand All Methods
  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      this.invoices.forEach(invoice => {
        const rowKey = this.getRowKey(invoice);
        if (rowKey) {
          this.expandedRowKeys.add(rowKey);
        }
      });
    } else {
      this.expandedRowKeys.clear();
    }
    this.buildInvoicesDisplay();
    this.markViewForCheck();
  }

  buildInvoicesDisplay(): void {
    this.invoicesDisplay = this.invoices.map(invoice => {
      const rowKey = this.getRowKey(invoice);
      const { organizationId: _organizationId, reservationId: _reservationId, ...invoiceWithoutIds } = invoice;
      const totalAmount = Number(invoice.totalAmount) || 0;
      const costCodesForInvoice = this.allCostCodes.filter(costCode => costCode.officeId === invoice.officeId);
      const mappedLedgerLines = this.mappingService.mapLedgerLines(invoice.ledgerLines ?? [], costCodesForInvoice, this.transactionTypes);

      return {
        ...invoiceWithoutIds,
        invoiceCode: (invoice.invoiceCode || '').trim() || '—',
        reservationCode: invoice.reservationCode || '—',
        propertyCode: (invoice.propertyCode || '').trim() || '—',
        responsibleParty: invoice.responsibleParty || invoice.contactName || invoice.companyName || '',
        period: this.formatter.formatInvoiceListAccountingPeriod(invoice.accountingPeriod),
        invoiceDate: this.formatter.formatDateString(invoice.invoiceDate),
        totalAmount: '$' + this.formatter.currency(totalAmount),
        totalAmountValue: totalAmount,
        ledgerLines: mappedLedgerLines,
        expand: rowKey,
        expanded: rowKey ? this.expandedRowKeys.has(rowKey) : false,
        selected: rowKey ? this.selectedRowKeys.has(rowKey) : false,
        expandClick: (event: Event, item: PreBillingInvoiceDisplay) => {
          event.stopPropagation();
          const key = this.getRowKey(item);
          if (!key) {
            return;
          }

          if (this.expandedRowKeys.has(key)) {
            this.expandedRowKeys.delete(key);
          } else {
            this.expandedRowKeys.add(key);
          }

          this.buildInvoicesDisplay();
          this.markViewForCheck();
        }
      };
    });

    this.updateIsAllExpanded();
  }

  updateIsAllExpanded(): void {
    if (this.invoicesDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }

    this.isAllExpanded = this.invoicesDisplay.every(row => {
      const rowKey = this.getRowKey(row);
      return !!rowKey && this.expandedRowKeys.has(rowKey);
    });
  }
  //#endregion

  //#region Selection/Create Methods
  onSelectionSet(selection: SelectionModel<unknown> | null | undefined): void {
    const selected = Array.isArray(selection?.selected) ? selection.selected : [];
    this.selectedRowKeys = new Set(
      selected
        .map(item => this.getRowKey(item as PreBillingInvoiceDisplay))
        .filter(key => !!key)
    );
    this.syncSelectedRowsOnDisplay();
    this.markViewForCheck();
  }

  onCreateInvoice(rowDisplay: PreBillingInvoiceDisplay): void {
    const preview = this.resolveInvoicePreview(rowDisplay);
    if (!preview) {
      return;
    }

    this.createInvoices([preview]);
  }

  onEditInvoice(rowDisplay: PreBillingInvoiceDisplay): void {
    const preview = this.resolveInvoicePreview(rowDisplay);
    if (!preview) {
      return;
    }

    this.editInvoice.emit(preview);
  }

  onCreateSelectedInvoices(): void {
    const previews = this.getSelectedInvoicePreviews();
    if (previews.length === 0) {
      this.toastr.warning('Please select an invoice to be created.', 'Pre-Billing');
      return;
    }

    this.createInvoices(previews);
  }

  get isCreateTopButtonDisabled(): boolean {
    return this.isCreatingInvoices;
  }

  createInvoices(previews: InvoiceResponse[]): void {
    if (this.isCreatingInvoices || previews.length === 0) {
      return;
    }

    const organizationId = (this.authService.getUser()?.organizationId ?? previews[0]?.organizationId ?? '').trim();
    if (!organizationId) {
      this.toastr.error('Organization is required to create invoices.', CommonMessage.Error);
      return;
    }

    this.isCreatingInvoices = true;
    let createdCount = 0;
    let billCount = 0;
    let vendorCreated = false;

    from(previews).pipe(
      concatMap(preview => {
        const request = this.mappingService.mapPreBillingInvoiceToCreateRequest(preview, organizationId);
        return this.invoiceService.createInvoice(request).pipe(
          tap(created => {
            createdCount++;
            if (created.referralBillCreated) {
              billCount++;
            }
            if (created.referralVendorCreated) {
              vendorCreated = true;
            }
          }),
          catchError((error: HttpErrorResponse) => {
            const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(error);
            const message = closedPeriodMessage
              || (typeof error?.error === 'string' ? error.error : error.error?.title || error.error?.message || error.message)
              || 'Unable to create invoice.';
            this.toastr.error(message, 'Pre-Billing');
            return EMPTY;
          })
        );
      }),
      finalize(() => {
        this.isCreatingInvoices = false;
        if (createdCount > 0) {
          this.toastr.success(
            this.invoiceService.formatCreatedDocumentsMessage(createdCount, billCount),
            CommonMessage.Success
          );
          if (vendorCreated) {
            this.invoiceService.promptReferralVendorCreated();
          }
          this.selectedRowKeys.clear();
          this.loadReport();
          this.invoicesCreated.emit();
        }
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  getSelectedInvoicePreviews(): InvoiceResponse[] {
    return this.invoices.filter(invoice => this.selectedRowKeys.has(this.getRowKey(invoice)));
  }

  resolveInvoicePreview(rowDisplay: PreBillingInvoiceDisplay): InvoiceResponse | null {
    const rowKey = this.getRowKey(rowDisplay);
    if (!rowKey) {
      return null;
    }

    return this.invoices.find(invoice => this.getRowKey(invoice) === rowKey) ?? null;
  }

  syncSelectedRowsOnDisplay(): void {
    this.invoicesDisplay.forEach(row => {
      const rowKey = this.getRowKey(row);
      row.selected = !!rowKey && this.selectedRowKeys.has(rowKey);
    });
  }
  //#endregion

  //#region Ledger Line Display Methods
  getLedgerLineColumnNames(): string[] {
    return Object.keys(this.ledgerLinesDisplayedColumns);
  }

  getLedgerLineColumnValue(line: LedgerLineListDisplay, columnName: string, invoice: PreBillingInvoiceDisplay, lineIndex?: number): string {
    switch (columnName) {
      case 'lineNo':
        return lineIndex !== undefined ? String(lineIndex + 1) : '—';
      case 'ledgerLineDate': {
        const rawInvoice = this.invoices.find(item => this.getRowKey(item) === this.getRowKey(invoice));
        return this.formatter.formatDateString(line.ledgerLineDate || rawInvoice?.invoiceDate) || '—';
      }
      case 'costCode':
        return line.costCode || this.getCostCodeDescription(line.costCodeId, invoice.officeId);
      case 'transactionType':
        return line.transactionType || '—';
      case 'description':
        return line.description || '—';
      case 'amount': {
        const amountValue = line.amount || 0;
        const formattedAmount = this.formatter.currency(amountValue < 0 ? -amountValue : amountValue);
        return amountValue < 0 ? '-$' + formattedAmount : '$' + formattedAmount;
      }
      default:
        return String(line[columnName as keyof LedgerLineListDisplay] ?? '—');
    }
  }

  getCostCodeDescription(costCodeId: number | null | undefined, officeId: number): string {
    if (costCodeId == null) {
      return '—';
    }

    const costCode = this.allCostCodes.find(code => code.costCodeId === costCodeId && code.officeId === officeId);
    return costCode?.description || String(costCodeId);
  }
  //#endregion

  //#region Form Response Methods
  get reportEntityLine(): string {
    return this.entityLineLabel;
  }

  get entityLineLabel(): string {
    return [this.resolvedCompanyName, this.displayOfficeName].filter(label => !!label).join(' ');
  }

  get resolvedCompanyName(): string {
    return (this.companyName || this.loadedCompanyName || '').trim();
  }

  get displayOfficeName(): string {
    return (this.officeName || '').trim();
  }

  get reportPeriodLine(): string {
    return this.formatBillingPeriodLine();
  }

  get totalAmount(): number {
    return this.invoices.reduce((sum, invoice) => sum + (Number(invoice.totalAmount) || 0), 0);
  }

  get reservationCountLabel(): string {
    const count = this.invoicesDisplay.length;
    return `${count} reservation${count === 1 ? '' : 's'}`;
  }

  get totalsRow(): Record<string, string> | undefined {
    if (this.invoicesDisplay.length === 0) {
      return undefined;
    }

    return {
      reservationCode: 'Totals:',
      responsibleParty: this.reservationCountLabel,
      totalAmount: this.formatAmount(this.totalAmount)
    };
  }

  formatAmount(value: number): string {
    return this.formatter.currencyUsd(value);
  }

  formatBillingPeriodLine(): string {
    const parsed = this.utilityService.parseDateOnlyStringToDate(this.resolveBillingMonth());
    if (!parsed) {
      return '';
    }

    return parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  normalizeOfficeIds(value: number[] | null | undefined): number[] {
    return (value ?? []).filter(id => id > 0);
  }

  resolveOfficeIds(): number[] {
    return this.normalizeOfficeIds(this.officeIds);
  }

  resolveBillingMonth(): string {
    const billingMonth = (this.billingMonth || '').trim();
    if (billingMonth) {
      return this.invoiceService.firstDayOfMonthFromCalendarDate(billingMonth);
    }

    return this.defaultNextMonth();
  }

  defaultNextMonth(): string {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return this.utilityService.formatDateOnlyForApi(nextMonth) ?? '';
  }

  getRowKey(
    invoice: Pick<InvoiceResponse, 'reservationCode' | 'accountingPeriod'> | null | undefined
  ): string {
    const reservationCode = (invoice?.reservationCode || '').trim();
    const monthKey = this.invoiceService.firstDayOfMonthFromCalendarDate(invoice?.accountingPeriod || '');
    if (!reservationCode || !monthKey) {
      return '';
    }

    return `${reservationCode}|${monthKey}`;
  }

  openInvoice(row: PreBillingInvoiceDisplay): void {
    const source = this.resolveInvoicePreview(row);
    const invoiceId = (source?.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    this.invoiceSelectEvent.emit({
      invoiceId,
      officeId: row.officeId ?? source?.officeId ?? this.resolveOfficeIds()[0] ?? null,
      reservationId: source?.reservationId?.trim() || null
    });
  }

  goToReservation(row: PreBillingInvoiceDisplay): void {
    const source = this.resolveInvoicePreview(row);
    const reservationId = (source?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const officeId = row.officeId ?? source?.officeId ?? this.resolveOfficeIds()[0] ?? null;
    const returnParams = new URLSearchParams();
    returnParams.set('tab', '0');
    returnParams.set('invoiceKind', 'preBillingReport');
    if (officeId != null && officeId > 0) {
      returnParams.set('officeId', String(officeId));
    }

    const organizationId = (source?.organizationId || this.authService.getUser()?.organizationId || '').trim();
    if (this.authService.hasRole(UserGroups.SuperAdmin) && organizationId) {
      returnParams.set('organizationId', organizationId);
    }

    const billingMonth = this.resolveBillingMonth();
    if (billingMonth) {
      returnParams.set('billingMonth', billingMonth);
    }

    const listReturnPath = `/${RouterUrl.AccountingList}?${returnParams.toString()}`;
    const queryParams: Record<string, string> = {
      returnTo: 'invoice-list',
      listReturnPath,
      reservationId
    };
    if (officeId != null && officeId > 0) {
      queryParams['officeId'] = String(officeId);
    }
    if (row.propertyId) {
      queryParams['propertyId'] = row.propertyId;
    }
    if (this.authService.hasRole(UserGroups.SuperAdmin) && organizationId) {
      queryParams['organizationId'] = organizationId;
    }

    void this.router.navigate(
      ['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])],
      { queryParams }
    );
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preBillingReport');
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
