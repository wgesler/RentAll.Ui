import { CommonModule } from '@angular/common';
import { SelectionModel } from '@angular/cdk/collections';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../../app.routes';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { BehaviorSubject, EMPTY, Subject, catchError, concatMap, finalize, from, of, switchMap, take, takeUntil, tap } from 'rxjs';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
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
import { InvoiceResponse, LedgerLineListDisplay, MissingInvoiceReportDisplay } from '../../models/invoice.model';
import { CostCodesService } from '../../services/cost-codes.service';
import { InvoiceService } from '../../services/invoice.service';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { UserGroups } from '../../../users/models/user-enums';

@Component({
  selector: 'app-missing-invoice-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './missing-invoice-report.component.html',
  styleUrl: './missing-invoice-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MissingInvoiceReportComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeIds: number[] = [];
  @Input() companyName: string | null = null;
  @Input() officeName: string | null = null;
  @Input() refreshTrigger = 0;

  @Output() invoicesCreated = new EventEmitter<void>();
  @Output() editInvoice = new EventEmitter<InvoiceResponse>();

  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate?: TemplateRef<unknown>;

  private invoiceService = inject(InvoiceService);
  private reservationService = inject(ReservationService);
  private costCodesService = inject(CostCodesService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private mappingService = inject(MappingService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private commonService = inject(CommonService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  private readonly invoiceReportBaseColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '5ch', sort: false, includeInFilter: false },
    officeName: { displayAs: 'Office', maxWidth: '20ch', wrap: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    invoiceCode: { displayAs: 'Invoice', maxWidth: '17ch', sortType: 'natural', wrap: false },
    stayStartDate: { displayAs: 'Start Date', maxWidth: '14ch', alignment: 'center', wrap: false },
    stayEndDate: { displayAs: 'End Date', maxWidth: '14ch', alignment: 'center', wrap: false },
    monthStart: { displayAs: 'Month', maxWidth: '14ch', alignment: 'center' },
    periodStart: { displayAs: 'Period Start', maxWidth: '14ch', alignment: 'center', wrap: false },
    periodEnd: { displayAs: 'Period End', maxWidth: '14ch', alignment: 'center', wrap: false },
    daysStayed: { displayAs: 'Days Stayed', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
    daysBilled: { displayAs: 'Days Billed', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
    ignore: { displayAs: 'Ignore', maxWidth: '10ch', alignment: 'center', headerAlignment: 'center', isCheckbox: true, checkboxEditable: true }
  };

  /** When true (default), list billed mismatches; when false, matched billed rows. */
  showMissing = true;

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
  invoicesDisplay: MissingInvoiceReportDisplay[] = [];
  expandedRowKeys = new Set<string>();
  selectedRowKeys = new Set<string>();
  isAllExpanded = false;
  isCreatingInvoices = false;
  noDataMessage = 'No missing invoices through the current month.';
  loadedCompanyName = '';

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['missingInvoiceReport']));
  destroy$ = new Subject<void>();

  readonly invoiceReportDisplayedColumns = this.invoiceReportBaseColumns;

  //#region Missing Invoice Report
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
      }
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
      this.noDataMessage = 'Select at least one office to view the missing invoice report.';
      this.buildInvoicesDisplay();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'missingInvoiceReport');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;

    this.reservationService.rebuildBilledMatchup(officeIds).pipe(
      catchError((rebuildError: HttpErrorResponse) => {
        const rebuildMessage = typeof rebuildError?.error === 'string'
          ? rebuildError.error
          : rebuildError.error?.title || rebuildError.error?.message || rebuildError.message;
        this.toastr.warning(
          rebuildMessage || 'Billed rebuild failed; loading missing invoices from existing billed data.',
          'Missing Invoice Report'
        );
        return of([]);
      }),
      switchMap(() => this.invoiceService.searchMissingInvoices({ officeIds, missingOnly: this.showMissing })),
      take(1),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'missingInvoiceReport');
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: invoices => {
        this.invoices = invoices ?? [];
        this.expandedRowKeys.clear();
        this.selectedRowKeys.clear();
        this.isAllExpanded = false;
        this.noDataMessage = this.showMissing
          ? 'No missing invoices through the current month.'
          : 'No billed matchup rows for active reservations through the current month.';
        this.buildInvoicesDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.invoices = [];
        this.invoicesDisplay = [];
        this.isServiceError = true;
        const message = typeof error?.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message || 'Unable to load missing invoice report.';
        this.toastr.error(message, 'Missing Invoice Report');
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
      const costCodesForInvoice = this.allCostCodes.filter(costCode => costCode.officeId === invoice.officeId);
      const mappedLedgerLines = this.mappingService.mapLedgerLines(invoice.ledgerLines ?? [], costCodesForInvoice, this.transactionTypes);

      const monthStart = invoice.billedMonthStart || invoice.accountingPeriod;
      const periodStart = invoice.billedPeriodStart;
      const periodEnd = invoice.billedPeriodEnd;

      return {
        ...invoiceWithoutIds,
        ignore: !!invoice.billedIgnore,
        officeName: (invoice.officeName || '').trim() || '—',
        invoiceCode: (invoice.invoiceCode || '').trim() || '—',
        reservationCode: invoice.reservationCode || '—',
        stayStartDate: invoice.billedStartDate
          ? this.formatter.formatDateString(invoice.billedStartDate)
          : '—',
        stayEndDate: invoice.billedEndDate
          ? this.formatter.formatDateString(invoice.billedEndDate)
          : '—',
        monthStart: this.formatter.formatDateString(monthStart),
        periodStart: periodStart ? this.formatter.formatDateString(periodStart) : '—',
        periodEnd: periodEnd ? this.formatter.formatDateString(periodEnd) : '—',
        daysStayed: invoice.billedDaysStayed ?? '—',
        daysBilled: invoice.billedDaysBilled ?? '—',
        ledgerLines: mappedLedgerLines,
        canOpenInvoice: this.canOpenInvoiceSource(invoice),
        invoiceDisabled: !this.showMissing,
        editDisabled: false,
        expand: rowKey,
        expanded: rowKey ? this.expandedRowKeys.has(rowKey) : false,
        selected: rowKey ? this.selectedRowKeys.has(rowKey) : false,
        expandClick: (event: Event, item: MissingInvoiceReportDisplay) => {
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
        .map(item => this.getRowKey(item as MissingInvoiceReportDisplay))
        .filter(key => !!key)
    );
    this.syncSelectedRowsOnDisplay();
    this.markViewForCheck();
  }

  onCreateInvoice(rowDisplay: MissingInvoiceReportDisplay): void {
    if (!this.showMissing) {
      this.toastr.warning('Turn Missing on to bill rows from this report.', 'Missing Invoice Report');
      return;
    }

    const preview = this.resolveInvoicePreview(rowDisplay);
    if (!preview) {
      this.toastr.warning('No invoice preview is available for this row.', 'Missing Invoice Report');
      return;
    }

    this.createInvoices([preview]);
  }

  onEditInvoice(rowDisplay: MissingInvoiceReportDisplay): void {
    this.openInvoiceEditor(rowDisplay);
  }

  onRowOpenInvoice(rowDisplay: MissingInvoiceReportDisplay): void {
    this.openInvoiceEditor(rowDisplay);
  }

  openInvoiceEditor(rowDisplay: MissingInvoiceReportDisplay): void {
    const source = this.resolveInvoicePreview(rowDisplay);
    if (!source || !this.canOpenInvoiceSource(source)) {
      this.toastr.warning('No invoice is available to open for this row.', 'Missing Invoice Report');
      return;
    }

    this.editInvoice.emit(source);
  }

  canOpenInvoiceSource(invoice: Pick<InvoiceResponse, 'invoiceId' | 'ledgerLines'> | null | undefined): boolean {
    if (!invoice) {
      return false;
    }

    if ((invoice.invoiceId || '').trim()) {
      return true;
    }

    return (invoice.ledgerLines?.length ?? 0) > 0;
  }

  onCreateSelectedInvoices(): void {
    if (!this.showMissing) {
      this.toastr.warning('Turn Missing on to bill rows from this report.', 'Missing Invoice Report');
      return;
    }

    const previews = this.getSelectedInvoicePreviews();
    if (previews.length === 0) {
      this.toastr.warning('Please select an invoice to be created.', 'Missing Invoice Report');
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

    from(previews).pipe(
      concatMap(preview => {
        const request = this.mappingService.mapPreBillingInvoiceToCreateRequest(preview, organizationId);
        return this.invoiceService.createInvoice(request).pipe(
          tap(() => createdCount++),
          catchError((error: HttpErrorResponse) => {
            const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(error);
            const message = closedPeriodMessage
              || (typeof error?.error === 'string' ? error.error : error.error?.title || error.error?.message || error.message)
              || 'Unable to create invoice.';
            this.toastr.error(message, 'Missing Invoice Report');
            return EMPTY;
          })
        );
      }),
      finalize(() => {
        this.isCreatingInvoices = false;
        if (createdCount > 0) {
          this.toastr.success(
            `Created ${createdCount} invoice${createdCount === 1 ? '' : 's'}.`,
            CommonMessage.Success
          );
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

  resolveInvoicePreview(rowDisplay: MissingInvoiceReportDisplay): InvoiceResponse | null {
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

  getLedgerLineColumnValue(line: LedgerLineListDisplay, columnName: string, invoice: MissingInvoiceReportDisplay, lineIndex?: number): string {
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

  get totalsRow(): Record<string, string> | undefined {
    if (this.invoicesDisplay.length === 0) {
      return undefined;
    }

    const count = this.invoicesDisplay.length;
    return {
      reservationCode: `Totals: (${count} row${count === 1 ? '' : 's'})`
    };
  }

  formatBillingPeriodLine(): string {
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return `Through ${monthLabel}`;
  }

  getRowKey(
    invoice: Pick<InvoiceResponse, 'reservationCode' | 'accountingPeriod' | 'billedMonthStart'> | null | undefined
  ): string {
    const reservationCode = (invoice?.reservationCode || '').trim();
    const monthKey = this.invoiceService.firstDayOfMonthFromCalendarDate(
      invoice?.billedMonthStart || invoice?.accountingPeriod || ''
    );
    if (!reservationCode || !monthKey) {
      return '';
    }

    return `${reservationCode}|${monthKey}`;
  }

  normalizeOfficeIds(value: number[] | null | undefined): number[] {
    return (value ?? []).filter(id => id > 0);
  }

  resolveOfficeIds(): number[] {
    return this.normalizeOfficeIds(this.officeIds);
  }

  goToReservation(row: MissingInvoiceReportDisplay): void {
    const source = this.resolveInvoicePreview(row);
    const reservationId = (source?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const officeId = row.officeId ?? source?.officeId ?? this.resolveOfficeIds()[0] ?? null;
    const returnParams = new URLSearchParams();
    returnParams.set('tab', '0');
    returnParams.set('invoiceKind', 'missingInvoiceReport');
    if (officeId != null && officeId > 0) {
      returnParams.set('officeId', String(officeId));
    }

    const organizationId = (source?.organizationId || this.authService.getUser()?.organizationId || '').trim();
    if (this.authService.hasRole(UserGroups.SuperAdmin) && organizationId) {
      returnParams.set('organizationId', organizationId);
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

  onMissingToggleChange(event: MatSlideToggleChange): void {
    this.showMissing = event.checked;
    this.loadReport();
  }

  onIgnoreCheckboxChange(rowDisplay: MissingInvoiceReportDisplay): void {
    const changedColumn = (rowDisplay as MissingInvoiceReportDisplay & { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedColumn !== 'ignore') {
      return;
    }

    const rowWithCheckboxMeta = rowDisplay as MissingInvoiceReportDisplay & {
      __previousCheckboxValue?: boolean;
      __checkboxValue?: boolean;
    };
    const previousValue = rowWithCheckboxMeta.__previousCheckboxValue === true;
    const nextValue = rowWithCheckboxMeta.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    const billedId = rowDisplay.billedId ?? 0;
    if (billedId <= 0) {
      rowDisplay.ignore = previousValue;
      this.markViewForCheck();
      return;
    }

    this.reservationService.setBilledIgnore(billedId, nextValue).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success(nextValue ? 'Row ignored.' : 'Row un-ignored.', 'Missing Invoice Report');
        this.loadReport();
      },
      error: () => {
        rowDisplay.ignore = previousValue;
        this.toastr.error('Unable to update ignore.', 'Missing Invoice Report');
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'missingInvoiceReport');
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
