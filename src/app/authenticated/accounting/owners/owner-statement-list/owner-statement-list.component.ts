import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, concatMap, finalize, from, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../../maintenance/models/maintenance-search.model';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { BankCardResponse } from '../../../organizations/models/bank.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { AccountType, PaymentType, PaymentTypeLabels } from '../../models/accounting-enum';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { OwnerPaymentsRequest, OwnerStatementMonthLineListDisplay } from '../../models/owner-statement.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { OwnerStatementDocumentService } from '../../services/owner-statement-document.service';
import { OwnerReportsCacheService } from '../../services/owner-reports-cache.service';
import { OwnerStatementService } from '../../services/owner-statement.service';
import { ReportService } from '../../services/report.service';

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './owner-statement-list.component.html',
  styleUrls: ['./owner-statement-list.component.scss', '../owner-report/owner-report.component.scss', '../../invoices/invoice-list/invoice-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;
  @Output() viewStatement = new EventEmitter<OwnerStatementMonthLineListDisplay>();
  @Output() ownersPaid = new EventEmitter<void>();
  private commonService = inject(CommonService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);
  private ownerStatementService = inject(OwnerStatementService);
  private ownerStatementDocumentService = inject(OwnerStatementDocumentService);
  private reportService = inject(ReportService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private formatter = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  isPayingOwners = false;
  isClosingMonth = false;
  isDownloadingOwnerStatements = false;
  showPaid = true;
  showPaymentForm = false;
  paymentDate: Date | null = new Date();
  paymentDescription = '';
  paymentAmount = 0;
  paymentAmountDisplay = '$0.00';
  selectedPaymentTypeId = PaymentType.Check;
  selectedPaymentChartOfAccountId: number | null = null;
  selectedPaymentCreditCardId: number | null = null;
  paymentChartOfAccounts: { value: number; label: string }[] = [];
  paymentCreditCardOptions: { value: number; label: string; chartOfAccountId: number }[] = [];
  paymentTypeOptions = PaymentTypeLabels;
  allChartOfAccounts: ChartOfAccountResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  companyName = '';
  noDataMessage = 'Press Go to run the report.';
  allLines: OwnerStatementMonthLineListDisplay[] = [];
  lines: OwnerStatementMonthLineListDisplay[] = [];
  selectedOwnerStatementLines: OwnerStatementMonthLineListDisplay[] = [];
  private customToBePaidByLineId = new Map<string, string>();
  private readonly ownerStatementBaseColumns: ColumnSet = {
    ownerName: { displayAs: 'Owner', wrap: false, maxWidth: '35ch' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    monthDisplay: { displayAs: 'Period', wrap: false, maxWidth: '15ch', alignment: 'center' },
    startingBalance: { displayAs: 'Starting', wrap: false, maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    income: { displayAs: 'Income', wrap: false, maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    expenses: { displayAs: 'Expenses', wrap: false, maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    ownerPayment: { displayAs: 'Owed', wrap: false, maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    ownerPaymentPaid: { displayAs: 'Paid', wrap: false, maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    endingBalance: { displayAs: 'Balance', wrap: false, maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' }
  };
  private readonly ownerStatementToBePaidColumn: ColumnSet = {
    toBePaid: {
      displayAs: 'To Be Paid',
      wrap: false,
      maxWidth: '16ch',
      alignment: 'right',
      headerAlignment: 'right',
      editableType: 'text',
      suppressRowClick: true
    }
  };
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  //#region Owner-Statement-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOrganization();
    this.loadChartOfAccounts();
    this.loadAccountingOffices();
    this.loadOwnerStatementList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading'] || changes['refreshTrigger'] || changes['searchRequest']) {
      this.loadOwnerStatementList();
    }
  }

  onViewStatement(row: OwnerStatementMonthLineListDisplay): void {
    this.viewStatement.emit(row);
  }

  printOwnerStatement(row: OwnerStatementMonthLineListDisplay): void {
    if (!row?.ownerStatementLineId) {
      return;
    }

    this.ownerStatementDocumentService.printOwnerStatement(row).pipe(take(1)).subscribe({
      error: (err: Error) => {
        this.toastr.error(err?.message || 'Failed to print owner statement.', CommonMessage.Error);
      }
    });
  }

  downloadOwnerStatement(row: OwnerStatementMonthLineListDisplay): void {
    if (!row?.ownerStatementLineId) {
      return;
    }

    this.ownerStatementDocumentService.downloadOwnerStatementPdf(row).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Owner statement downloaded.', CommonMessage.Success);
      },
      error: (err: Error) => {
        this.toastr.error(err?.message || 'Failed to download owner statement.', CommonMessage.Error);
      }
    });
  }

  onSelectionSet(selection: SelectionModel<unknown>): void {
    this.selectedOwnerStatementLines = (selection?.selected ?? []) as OwnerStatementMonthLineListDisplay[];
    this.syncToBePaidColumns();
    if (this.showPaymentForm) {
      this.syncPaymentAmountFromOwnerSelection();
      this.refreshPaymentAccountsForResolvedOffice();
    }
    this.markViewForCheck();
  }

  onInlineToBePaidChange(row: OwnerStatementMonthLineListDisplay & { __changedInlineColumn?: string }): void {
    if (row.__changedInlineColumn !== 'toBePaid') {
      return;
    }

    const amount = this.mappingService.parseCurrencyValue(row.toBePaid);
    row.toBePaid = this.formatter.currencyUsd(amount);
    this.customToBePaidByLineId.set(row.ownerStatementLineId, row.toBePaid);
    if (this.showPaymentForm) {
      this.syncPaymentAmountFromOwnerSelection();
    }
    this.markViewForCheck();
  }

  syncToBePaidColumns(): void {
    const selectedLineIds = new Set(
      this.selectedOwnerStatementLines.map(line => line.ownerStatementLineId)
    );

    for (const line of this.lines) {
      const isSelected = selectedLineIds.has(line.ownerStatementLineId);
      line.toBePaidReadOnly = !isSelected;

      if (!isSelected) {
        line.toBePaid = '';
        line.toBePaidEditing = false;
        continue;
      }

      const customAmount = this.customToBePaidByLineId.get(line.ownerStatementLineId);
      line.toBePaid = customAmount ?? line.ownerPayment;
    }
  }

  closeOwnerStatementMonth(): void {
    const request = this.mappingService.mapOwnerStatementMonthLineSearchRequest(this.searchRequest);
    if (request.officeIds.length === 0) {
      this.toastr.warning('Select at least one office before closing the month.', 'Close Month');
      return;
    }

    if (!request.endDate) {
      this.toastr.warning('Run the report for a specific month before closing.', 'Close Month');
      return;
    }

    if (this.lines.length === 0) {
      this.toastr.warning('No owner statement rows to close.', 'Close Month');
      return;
    }

    const periodLabel = this.headerPeriodLine;
    if (!window.confirm(`Close ${periodLabel} and save ending balances for ${this.lines.length} propert${this.lines.length === 1 ? 'y' : 'ies'}? Pressing again will overwrite the saved balances for this month.`)) {
      return;
    }

    this.isClosingMonth = true;
    this.markViewForCheck();
    this.reportService.closeOwnerStatementMonth(request).pipe(
      take(1),
      finalize(() => {
        this.isClosingMonth = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: (result) => {
        const updatedCount = (result.journalEntriesCreated ?? 0) + (result.journalEntriesUpdated ?? 0);
        this.toastr.success(
          `Saved month-end balances for ${result.propertiesProcessed ?? 0} propert${(result.propertiesProcessed ?? 0) === 1 ? 'y' : 'ies'} (${updatedCount} balance journal entr${updatedCount === 1 ? 'y' : 'ies'}).`,
          CommonMessage.Success
        );
        this.loadOwnerStatementList();
      },
      error: (err: HttpErrorResponse) => {
        const message = typeof err.error === 'string'
          ? err.error
          : (err.error?.message || err.message || 'Unable to close owner statement month.');
        this.toastr.error(message, CommonMessage.Error);
      }
    });
  }

  downloadSelectedOwnerStatements(): void {
    if (this.selectedOwnerStatementLines.length === 0) {
      this.toastr.warning('Select one or more owner statements to download.', 'Download');
      return;
    }

    const lineCount = this.selectedOwnerStatementLines.length;
    this.isDownloadingOwnerStatements = true;
    this.markViewForCheck();
    from(this.selectedOwnerStatementLines).pipe(
      concatMap(line => this.ownerStatementDocumentService.downloadOwnerStatementPdf(line).pipe(take(1))),
      finalize(() => {
        this.isDownloadingOwnerStatements = false;
        this.markViewForCheck();
      })
    ).subscribe({
      complete: () => {
        this.toastr.success(`Downloaded ${lineCount} owner statement(s).`, CommonMessage.Success);
        this.markViewForCheck();
      },
      error: (err: Error) => {
        this.toastr.error(err?.message || 'Failed to download owner statements.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  onPayOwners(): void {
    this.openApplyPaymentDialog();
  }

  openApplyPaymentDialog(): void {
    this.paymentDate = this.utilityService.parseCalendarDateInput(this.searchRequest?.endDate) ?? this.paymentDate ?? new Date();
    this.selectedPaymentChartOfAccountId = null;
    this.selectedPaymentCreditCardId = null;
    this.refreshPaymentAccountsForResolvedOffice();
    this.showPaymentForm = true;
    this.syncPaymentAmountFromOwnerSelection();
    this.markViewForCheck();
  }

  cancelPaymentForm(): void {
    this.showPaymentForm = false;
    this.clearPaymentForm();
    this.markViewForCheck();
  }

  submitPayment(): void {
    if (this.isPayingOwners || !this.isPaymentFormValid) {
      return;
    }

    const paymentRequest = this.buildOwnerPaymentsRequest(this.selectedOwnerStatementLines);
    if (!paymentRequest) {
      return;
    }

    this.isPayingOwners = true;
    this.markViewForCheck();
    this.ownerStatementService.applyOwnerPayments(paymentRequest).pipe(
      take(1),
      finalize(() => {
        this.isPayingOwners = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: () => {
        const paymentCount = paymentRequest.payments.length;
        const paymentLabel = paymentCount === 1 ? 'owner payment' : 'owner payments';
        this.toastr.success(`${paymentCount} ${paymentLabel} applied`, CommonMessage.Success);
        this.selectedOwnerStatementLines = [];
        this.customToBePaidByLineId.clear();
        this.syncToBePaidColumns();
        this.clearPaymentForm();
        this.ownersPaid.emit();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        const message = this.utilityService.extractApiErrorMessage(error);
        this.toastr.error(message || 'Failed to apply owner payments', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  buildOwnerPaymentsRequest(lines: OwnerStatementMonthLineListDisplay[]): OwnerPaymentsRequest | null {
    const paymentDate = this.utilityService.toDateOnlyJsonString(this.paymentDate)
      ?? this.utilityService.toDateOnlyJsonString(this.searchRequest?.endDate)
      ?? this.utilityService.todayAsCalendarDateString();
    const chartOfAccountId = this.resolveSelectedPaymentChartOfAccountId();
    if (chartOfAccountId == null) {
      this.toastr.warning(this.isCreditCardPaymentTypeSelected ? 'Please select a credit card' : 'Please select a bank account');
      return null;
    }

    const officeIds = [...new Set(lines.map(line => line.officeId).filter(officeId => officeId > 0))];
    if (officeIds.length > 1) {
      this.toastr.warning('Select owners from one office to apply payment.');
      return null;
    }

    const request = this.mappingService.mapOwnerPaymentsRequest(
      lines,
      paymentDate,
      this.selectedPaymentTypeId,
      chartOfAccountId,
      this.paymentDescription
    );

    if (request.payments.length === 0) {
      this.toastr.warning('Selected lines have no payment amount to apply.', CommonMessage.Error);
      return null;
    }

    const selectedTotal = request.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (!this.utilityService.areCurrencyAmountsEqual(selectedTotal, this.paymentAmount)) {
      this.toastr.warning('Applied owner amounts must equal the payment amount.');
      return null;
    }

    return request;
  }

  syncPaymentAmountFromOwnerSelection(): void {
    if (!this.showPaymentForm) {
      return;
    }

    const total = this.selectedOwnerStatementLines.reduce((sum, line) => {
      return sum + this.mappingService.parseCurrencyValue(line.toBePaid || line.ownerPayment);
    }, 0);
    this.paymentAmount = this.roundCurrencyValue(total);
    this.paymentAmountDisplay = this.formatPaymentAmountDisplay(this.paymentAmount);
  }

  get resolvedPaymentOfficeId(): number | null {
    return this.resolvePaymentOfficeId();
  }

  resolvePaymentOfficeId(): number | null {
    const selectedOfficeIds = [...new Set(
      this.selectedOwnerStatementLines
        .map(line => line.officeId)
        .filter(officeId => Number.isFinite(officeId) && officeId > 0)
    )];
    if (selectedOfficeIds.length === 1) {
      return selectedOfficeIds[0];
    }

    const requestOfficeIds = (this.searchRequest?.officeIds ?? []).filter(officeId => officeId > 0);
    if (requestOfficeIds.length === 1) {
      return requestOfficeIds[0];
    }
    if (selectedOfficeIds.length > 0) {
      return selectedOfficeIds[0];
    }
    if (requestOfficeIds.length > 0) {
      return requestOfficeIds[0];
    }
    return null;
  }

  get isCreditCardPaymentTypeSelected(): boolean {
    return Number(this.selectedPaymentTypeId) === PaymentType.CreditCard;
  }

  get isPaymentFormValid(): boolean {
    const hasPaymentDate = this.utilityService.toDateOnlyJsonString(this.paymentDate) !== null;
    const hasPaymentAccount = this.resolveSelectedPaymentChartOfAccountId() != null;
    return hasPaymentDate && hasPaymentAccount && this.paymentAmount !== 0;
  }

  refreshPaymentAccountsForResolvedOffice(): void {
    this.refreshPaymentChartOfAccountsForResolvedOffice();
    this.refreshPaymentCreditCardOptionsForResolvedOffice();
  }

  refreshPaymentChartOfAccountsForResolvedOffice(): void {
    const officeId = this.resolvePaymentOfficeId();
    if (!officeId) {
      this.paymentChartOfAccounts = [];
      this.selectedPaymentChartOfAccountId = null;
      return;
    }

    this.paymentChartOfAccounts = this.allChartOfAccounts
      .filter(account => account.officeId === officeId)
      .filter(account => Number(account.accountTypeId) === AccountType.Bank)
      .sort((left, right) =>
        this.utilityService.getChartOfAccountDropdownLabel(left).localeCompare(
          this.utilityService.getChartOfAccountDropdownLabel(right),
          undefined,
          { sensitivity: 'base' }
        )
      )
      .map(account => ({
        value: Number(account.accountId),
        label: this.utilityService.getChartOfAccountDropdownLabel(account)
      }));

    const hasValidSelection =
      this.selectedPaymentChartOfAccountId != null
      && this.paymentChartOfAccounts.some(account => account.value === this.selectedPaymentChartOfAccountId);
    if (hasValidSelection) {
      return;
    }

    const defaultOwnerEscrowAccountId = this.resolveDefaultOwnerEscrowBankAccountId(officeId);
    if (
      defaultOwnerEscrowAccountId != null
      && this.paymentChartOfAccounts.some(account => account.value === defaultOwnerEscrowAccountId)
    ) {
      this.selectedPaymentChartOfAccountId = defaultOwnerEscrowAccountId;
      return;
    }

    this.selectedPaymentChartOfAccountId = this.paymentChartOfAccounts[0]?.value ?? null;
  }

  resolveDefaultOwnerEscrowBankAccountId(officeId: number): number | null {
    const office = (this.accountingOffices || []).find(item => Number(item.officeId) === Number(officeId)) || null;
    const defaultOwnerEscrowAccountId = Number(office?.defaultEscrowOwnersAccountId ?? 0);
    if (!Number.isFinite(defaultOwnerEscrowAccountId) || defaultOwnerEscrowAccountId <= 0) {
      return null;
    }
    return defaultOwnerEscrowAccountId;
  }

  refreshPaymentCreditCardOptionsForResolvedOffice(): void {
    const officeId = this.resolvePaymentOfficeId();
    const options = new Map<number, { value: number; label: string; chartOfAccountId: number }>();
    const addOfficeCards = (targetOfficeId: number): void => {
      const office = (this.accountingOffices || []).find(item => Number(item.officeId) === targetOfficeId) || null;
      const mappedCards = this.mappingService.mapBankCardsFromResponse(office?.bankCards as BankCardResponse[]);
      mappedCards.forEach(card => {
        const bankCardId = Number(card.bankCardId ?? 0);
        const chartOfAccountId = Number(card.chartOfAccountId ?? 0);
        if (!Number.isFinite(bankCardId) || bankCardId <= 0 || !Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0) {
          return;
        }
        if (!options.has(bankCardId)) {
          options.set(bankCardId, {
            value: bankCardId,
            label: (card.displayName || '').trim() || this.mappingService.mapBankCardDisplay(card),
            chartOfAccountId
          });
        }
      });
    };

    if (officeId) {
      addOfficeCards(officeId);
    } else {
      (this.accountingOffices || []).forEach(office => addOfficeCards(Number(office.officeId)));
    }

    this.paymentCreditCardOptions = Array.from(options.values())
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

    const hasValidSelection =
      this.selectedPaymentCreditCardId != null
      && this.paymentCreditCardOptions.some(option => option.value === this.selectedPaymentCreditCardId);
    this.selectedPaymentCreditCardId = hasValidSelection
      ? this.selectedPaymentCreditCardId
      : this.paymentCreditCardOptions[0]?.value ?? null;
  }

  onPaymentTypeChange(paymentTypeId: number): void {
    this.selectedPaymentTypeId = Number(paymentTypeId);
    if (this.isCreditCardPaymentTypeSelected) {
      this.refreshPaymentCreditCardOptionsForResolvedOffice();
    }
    this.markViewForCheck();
  }

  onPaymentChartOfAccountChange(accountId: number | null): void {
    this.selectedPaymentChartOfAccountId = accountId;
    this.markViewForCheck();
  }

  resolveSelectedPaymentChartOfAccountId(): number | null {
    if (this.isCreditCardPaymentTypeSelected) {
      const selectedCard = this.paymentCreditCardOptions.find(option => option.value === this.selectedPaymentCreditCardId) || null;
      return selectedCard?.chartOfAccountId ?? null;
    }
    return this.selectedPaymentChartOfAccountId ?? null;
  }

  formatPaymentAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  roundCurrencyValue(amount: number): number {
    if (!Number.isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  onPaymentAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;
    const parts = normalizedValue.split('.');
    input.value = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalizedValue;
    this.paymentAmountDisplay = input.value;
  }

  onPaymentAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const parsed = rawValue ? parseFloat(rawValue) : NaN;
    this.paymentAmount = this.roundCurrencyValue(isNaN(parsed) ? 0 : parsed);
    this.paymentAmountDisplay = this.formatPaymentAmountDisplay(this.paymentAmount);
    input.value = this.paymentAmountDisplay;
    this.markViewForCheck();
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

  clearPaymentForm(): void {
    this.showPaymentForm = false;
    this.selectedPaymentTypeId = PaymentType.Check;
    this.selectedPaymentChartOfAccountId = null;
    this.selectedPaymentCreditCardId = null;
    this.paymentDescription = '';
    this.paymentDate = this.utilityService.parseCalendarDateInput(this.searchRequest?.endDate) ?? new Date();
    this.paymentAmount = 0;
    this.paymentAmountDisplay = this.formatPaymentAmountDisplay(0);
    this.refreshPaymentAccountsForResolvedOffice();
  }
  //#endregion

  //#region Data Loading Methods
  clearOwnerStatementDisplay(): void {
    this.allLines = [];
    this.lines = [];
    this.selectedOwnerStatementLines = [];
    this.customToBePaidByLineId.clear();
    this.isServiceError = false;
    this.markViewForCheck();
  }

  loadOrganization(): void {
    const cachedOrganization = this.commonService.getOrganizationValue();
    if (cachedOrganization?.name) {
      this.companyName = cachedOrganization.name.trim();
    }

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(organization => {
      this.companyName = organization?.name?.trim() || '';
      this.markViewForCheck();
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
          this.allChartOfAccounts = accounts || [];
          this.refreshPaymentAccountsForResolvedOffice();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.allChartOfAccounts = [];
        this.markViewForCheck();
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          this.refreshPaymentAccountsForResolvedOffice();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.markViewForCheck();
      }
    });
  }

  loadOwnerStatementList(): void {
    const request = this.mappingService.mapOwnerStatementMonthLineSearchRequest(this.searchRequest);
    if (request.officeIds.length === 0) {
      this.allLines = [];
      this.lines = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    if (!this.matchesCachedOwnerReportsBundle()) {
      this.allLines = [];
      this.lines = [];
      this.noDataMessage = 'Press Go to run the report.';
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    const cashReport = this.ownerReportsCacheService.getCashReport();
    if (!cashReport) {
      this.allLines = [];
      this.lines = [];
      this.noDataMessage = 'Press Go to run the report.';
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
      this.markViewForCheck();
      return;
    }

    this.noDataMessage = 'No owner statement lines matched the current filters.';
    this.isServiceError = false;
    let monthLines = this.mappingService.mapOwnerCashReportToMonthLines(cashReport, request);
    const propertyId = (request.propertyId || '').trim();
    if (propertyId) {
      monthLines = monthLines.filter(line => (line.propertyId || '').trim() === propertyId);
    }
    this.allLines = this.mappingService.mapOwnerStatementMonthLineDisplays(monthLines);
    this.customToBePaidByLineId.clear();
    this.applyShowPaidFilter();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementMonthLines');
    this.markViewForCheck();
  }

  onShowPaidToggleChange(event: MatSlideToggleChange): void {
    this.showPaid = event.checked;
    this.applyShowPaidFilter();
    this.markViewForCheck();
  }

  applyShowPaidFilter(): void {
    this.lines = this.showPaid
      ? [...this.allLines]
      : this.allLines.filter(line => !this.mappingService.isOwnerOwedFullyPaid(
        this.mappingService.parseCurrencyValue(line.ownerPayment),
        this.mappingService.parseCurrencyValue(line.ownerPaymentPaid)
      ));
    const visibleLineIds = new Set(this.lines.map(line => line.ownerStatementLineId));
    this.selectedOwnerStatementLines = this.selectedOwnerStatementLines.filter(line => visibleLineIds.has(line.ownerStatementLineId));
    this.syncToBePaidColumns();
  }

  //#endregion

  get showToBePaidColumn(): boolean {
    return this.selectedOwnerStatementLines.length > 0;
  }

  get ownerStatementDisplayedColumns(): ColumnSet {
    if (!this.showToBePaidColumn) {
      return this.ownerStatementBaseColumns;
    }

    const { ownerPayment, ownerPaymentPaid, endingBalance, ...leadingColumns } = this.ownerStatementBaseColumns;
    return {
      ...leadingColumns,
      ...this.ownerStatementToBePaidColumn,
      ownerPaymentPaid,
      endingBalance
    };
  }

  get reportTitle(): string {
    return 'Owner Statements';
  }

  get headerEntityLine(): string {
    const officeLabel = this.getHeaderOfficeLabel();
    return [this.companyName, officeLabel].filter(label => !!label).join(' ');
  }

  get headerPeriodLine(): string {
    const startDate = this.searchRequest?.startDate ?? null;
    const endDate = this.searchRequest?.endDate ?? null;
    const periodLabel = this.mappingService.buildFinancialReportPeriodLabel(startDate, endDate, false);
    return periodLabel || 'All Dates';
  }

  getHeaderOfficeLabel(): string {
    const officeNames = [...new Set(
      this.lines
        .map(line => (line.officeName || '').trim())
        .filter(name => !!name)
    )];
    if (officeNames.length === 1) {
      return officeNames[0];
    }
    if (officeNames.length > 1) {
      return 'All Offices';
    }
    const requestedOfficeCount = (this.searchRequest?.officeIds || []).filter(id => id > 0).length;
    if (requestedOfficeCount > 1) {
      return 'All Offices';
    }
    return '';
  }

  //#region Total Row Methods
  get totalsRow(): { [key: string]: string } | undefined {
    if (this.lines.length === 0) {
      return undefined;
    }

    return {
      startingBalance: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('startingBalance')),
      income: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('income')),
      expenses: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('expenses')),
      ...(this.showToBePaidColumn
        ? { toBePaid: this.formatter.currencyUsd(this.getOwnerStatementToBePaidSum()) }
        : { ownerPayment: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('ownerPayment')) }),
      ownerPaymentPaid: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('ownerPaymentPaid')),
      endingBalance: this.formatter.currencyUsd(this.getOwnerStatementAmountSum('endingBalance'))
    };
  }

  getOwnerStatementAmountSum(columnName: 'startingBalance' | 'income' | 'expenses' | 'ownerPayment' | 'ownerPaymentPaid' | 'endingBalance'): number {
    return this.lines.reduce((sum, line) => sum + this.mappingService.parseCurrencyValue(line[columnName]), 0);
  }

  getOwnerStatementToBePaidSum(): number {
    return this.lines.reduce((sum, line) => {
      if (!(line.toBePaid || '').trim()) {
        return sum;
      }
      return sum + this.mappingService.parseCurrencyValue(line.toBePaid);
    }, 0);
  }

  private matchesCachedOwnerReportsBundle(): boolean {
    if (!this.ownerReportsCacheService.isBundleLoaded()) {
      return false;
    }

    const request = this.mappingService.mapOwnerReportSearchRequest(this.searchRequest);
    return this.ownerReportsCacheService.matchesOwnerReportBundleScope({
      officeIds: request.officeIds,
      propertyId: null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    });
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
