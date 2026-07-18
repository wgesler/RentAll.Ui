import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, skip, take, takeUntil, filter, finalize, firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { UserGroups } from '../../users/models/user-enums';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { ReceiptPrefill, ReceiptRequest, ReceiptResponse, ReceiptSelection } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { WorkOrderComponent } from '../../maintenance/work-order/work-order.component';
import { WorkOrderCreateComponent } from '../../maintenance/work-order-create/work-order-create.component';
import { WorkOrderListComponent, WorkOrderSelection } from '../../maintenance/work-order-list/work-order-list.component';
import { WorkOrderPreviewSelection, WorkOrderResponse } from '../../maintenance/models/work-order.model';
import { ReceiptsListComponent } from '../../maintenance/receipts-list/receipts-list.component';
import { DepositsListComponent } from '../bank/deposits-list/deposits-list.component';
import { DepositComponent } from '../bank/deposit/deposit.component';
import { DepositResponse, DepositSelection } from '../models/deposit.model';
import { TransfersListComponent } from '../bank/transfers-list/transfers-list.component';
import { TransferComponent } from '../bank/transfer/transfer.component';
import { TransferReportComponent } from '../bank/transfer-report/transfer-report.component';
import { TransferResponse, TransferSelection } from '../models/transfer.model';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { WorkOrderService } from '../../maintenance/services/work-order.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { InvoiceComponent } from '../invoices/invoice/invoice.component';
import { InvoiceCreateComponent } from '../invoices/invoice-create/invoice-create.component';
import { InvoiceListComponent } from '../invoices/invoice-list/invoice-list.component';
import { InvoiceService } from '../services/invoice.service';
import { InvoicePreviewSelection, InvoiceResponse, InvoiceSelection } from '../models/invoice.model';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger/general-ledger.component';
import { GeneralLedgerListComponent } from '../general-ledger/general-ledger-list/general-ledger-list.component';
import { FinancialReportComponent } from '../reports/financial-report/financial-report.component';
import { ArAgingReportComponent } from '../reports/ar-aging-report/ar-aging-report.component';
import { ApAgingReportComponent } from '../reports/ap-aging-report/ap-aging-report.component';
import { EscrowReportComponent } from '../reports/escrow-report/escrow-report.component';
import { AR_AGING_DATE_PRESET_OPTIONS, AR_AGING_INTERVAL_OPTIONS, AR_AGING_SORT_BY_OPTIONS, AR_AGING_THROUGH_ALL_VALUE, AR_AGING_THROUGH_OPTIONS, ArAgingDatePreset, ArAgingReportFilters, ArAgingSortBy, normalizeArAgingThroughDays, resolveArAgingAsOfDate } from '../models/ar-aging-report.model';
import { AP_AGING_SORT_BY_OPTIONS, ApAgingReportFilters, ApAgingSortBy, normalizeApAgingThroughDays, resolveApAgingAsOfDate } from '../models/ap-aging-report.model';
import { RentRollComponent } from '../vendors/rent-roll/rent-roll.component';
import { OwnerReportComponent } from '../owners/owner-report/owner-report.component';
import { OwnerStatementCreateComponent } from '../owners/owner-statement-create/owner-statement-create.component';
import { OwnerStatementListComponent } from '../owners/owner-statement-list/owner-statement-list.component';
import { AccountingShellBankActivityKind, AccountingShellBillsReceiptKind, AccountingShellGeneralLedgerKind, AccountingShellOwnerKind, AccountingShellReportKind } from '../models/accounting-shell.model';
import { JournalEntryRecapComponent } from '../general-ledger/journal-entry-recap/journal-entry-recap.component';
import { ReconcileComponent } from '../bank/reconcile/reconcile.component';
import { BeginReconciliationDialogComponent } from '../bank/reconcile/begin-reconciliation-dialog.component';
import { BeginReconciliationDialogResult, ReconcileResponse } from '../models/reconcile.model';
import { ReconcileAccountReportComponent } from '../reports/reconcile-account-report/reconcile-account-report.component';
import { ReconcileAccountReportContext } from '../models/reconcile-account-report.model';
import { ReconcileService } from '../services/reconcile.service';
import { FinancialReportKind } from '../models/financial-report.model';
import { RentRollCreateBillRequest } from '../models/rent-roll.model';
import { CostCodesService } from '../services/cost-codes.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { Class, ClassLabels } from '../models/accounting-enum';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { JournalEntryLineSelection, JournalEntryResponse, JournalEntrySyncResult } from '../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection, OwnerStatementJournalEntryLineSearchRequest, OwnerStatementListViewState, OwnerStatementMonthLineListDisplay, OwnerStatementReportKind } from '../models/owner-statement.model';
import { OwnerReportDetailsComponent } from '../owners/owner-report-details/owner-report-details.component';
import { SecurityDepositService } from '../services/security-deposit.service';
import { SecurityDepositsListComponent } from '../bank/security-deposits-list/security-deposits-list.component';
import { SecurityDepositReportComponent } from '../bank/security-deposit-report/security-deposit-report.component';
import { SecurityDepositReportSelection } from '../models/security-deposit-report.model';
import { OwnerReportsCacheService } from '../services/owner-reports-cache.service';

type JournalEntrySyncProgressKey =
  | 'invoice'
  | 'bill'
  | 'receipt'
  | 'workOrder'
  | 'deposit'
  | 'transfer'
  | 'departureFee'
  | 'linenAndTowelFee'
  | 'retainedEarnings';

interface JournalEntrySyncProgressRow {
  key: JournalEntrySyncProgressKey;
  label: string;
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  status: string;
}

interface AccountingShellPinnedTopBarState {
  enabled: boolean;
  startDate: string;
  endDate: string;
  asOfDate?: string;
  asOfStart?: string;
  selectedTabIndex?: number;
  selectedBillsReceiptKind?: AccountingShellBillsReceiptKind;
  selectedBankActivityKind?: AccountingShellBankActivityKind;
  selectedOwnerKind?: AccountingShellOwnerKind;
  selectedReportKind?: AccountingShellReportKind;
  selectedGeneralLedgerKind?: AccountingShellGeneralLedgerKind;
  organizationId?: string | null;
  officeId?: number | null;
  companyId?: string | null;
  reservationId?: string | null;
  billsPropertyId?: string | null;
  chartOfAccountId?: number | null;
  financialReportClass?: Class;
  arAgingDatePreset?: ArAgingDatePreset;
  arAgingIntervalDays?: number;
  arAgingThroughValue?: number;
  arAgingSortBy?: ArAgingSortBy;
  apAgingSortBy?: ApAgingSortBy;
  glPropertyId?: string | null;
  glReservationId?: string | null;
}

@Component({
    selector: 'app-accounting-shell',
    standalone: true,
    imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    InvoiceComponent,
    InvoiceCreateComponent,
    InvoiceListComponent,
    ReceiptsListComponent,
    ReceiptComponent,
    DepositsListComponent,
    DepositComponent,
    TransfersListComponent,
    TransferComponent,
    TransferReportComponent,
    WorkOrderListComponent,
    WorkOrderComponent,
    WorkOrderCreateComponent,
    GeneralLedgerListComponent,
    JournalEntryRecapComponent,
    ReconcileComponent,
    GeneralLedgerComponent,
    FinancialReportComponent,
    ArAgingReportComponent,
    ApAgingReportComponent,
    EscrowReportComponent,
    SecurityDepositsListComponent,
    SecurityDepositReportComponent,
    ReconcileAccountReportComponent,
    RentRollComponent,
    OwnerReportComponent,
    OwnerStatementCreateComponent,
    OwnerStatementListComponent,
    OwnerReportDetailsComponent,
    TitleBarSelectComponent
],
    templateUrl: './accounting-shell.component.html',
    styleUrls: ['./accounting-shell.component.scss']
})
export class AccountingShellComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private costCodesService = inject(CostCodesService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private generalLedgerService = inject(GeneralLedgerService);
  private reconcileService = inject(ReconcileService);
  private formatterService = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private propertyService = inject(PropertyService);
  private securityDepositService = inject(SecurityDepositService);
  private reservationService = inject(ReservationService);
  private receiptService = inject(ReceiptService);
  private workOrderService = inject(WorkOrderService);
  private invoiceService = inject(InvoiceService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);

  private readonly clearPinsEventName = 'rentall-clear-pins';
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingInvoiceEditor') accountingInvoiceEditor?: InvoiceComponent;
  @ViewChild('financialReport') financialReport?: FinancialReportComponent;
  @ViewChild('arAgingReport') arAgingReport?: ArAgingReportComponent;
  @ViewChild('ownerApAgingReport') ownerApAgingReport?: ApAgingReportComponent;
  @ViewChild('reportsApAgingReport') reportsApAgingReport?: ApAgingReportComponent;
  @ViewChild('reconcileAccountReport') reconcileAccountReport?: ReconcileAccountReportComponent;
  @ViewChild('billsReceiptsMenuTrigger') billsReceiptsMenuTrigger?: MatMenuTrigger;
  @ViewChild('bankActivitiesMenuTrigger') bankActivitiesMenuTrigger?: MatMenuTrigger;
  @ViewChild('ownersMenuTrigger') ownersMenuTrigger?: MatMenuTrigger;
  @ViewChild('reportsMenuTrigger') reportsMenuTrigger?: MatMenuTrigger;
  @ViewChild('generalLedgerMenuTrigger') generalLedgerMenuTrigger?: MatMenuTrigger;

  private skipNextDropdownTabMenuOpen = false;
  private readonly pinnedDateRangeStorageKeyPrefix = 'rentall-accounting-shell-pinned-dates';
  readonly tabBillsReceipts = 1;
  readonly tabBankActivities = 2;
  readonly tabOwners = 3;
  readonly tabMaxIndexLimited = 1;
  readonly tabReports = 4;
  readonly tabGeneralLedger = 5;
  readonly tabMaxIndex = 5;
  readonly shellBillsReceiptMenuOptions: { kind: AccountingShellBillsReceiptKind; label: string }[] = [
    { kind: 'bills', label: 'Bills' },
    { kind: 'receipts', label: 'Receipts' },
    { kind: 'rentRoll', label: 'Rent Roll' }
  ];
  readonly shellBankActivityMenuOptions: { kind: AccountingShellBankActivityKind; label: string }[] = [
    { kind: 'undepositedFunds', label: 'Undeposited Funds' },
    { kind: 'deposits', label: 'Deposits' },
    { kind: 'untransferredFunds', label: 'Untransferred Funds' },
    { kind: 'transfers', label: 'Transfers' },
    { kind: 'transferReport', label: 'Transfer Reports' },
    { kind: 'printChecks', label: 'Print Checks' },
    { kind: 'securityDeposits', label: 'Security Deposits' },
    { kind: 'reconcile', label: 'Reconcile' }
  ];
  readonly shellOwnerMenuOptions: { kind: AccountingShellOwnerKind; label: string }[] = [
    { kind: 'workOrders', label: 'Work Orders' },
    { kind: 'utilities', label: 'Utilities & Bills' },
    { kind: 'statements', label: 'Accrual & Cash' },
    { kind: 'apAging', label: 'AP Aging' },
    { kind: 'escrow', label: 'Escrow (E2)' },
    { kind: 'ownerStatements', label: 'Owner Statements' }
  ];
  readonly shellReportMenuOptions: { kind: AccountingShellReportKind; label: string }[] = [
    { kind: 'profitLoss', label: 'Profit & Loss' },
    { kind: 'balanceSheet', label: 'Balance Sheet' },
    { kind: 'arAging', label: 'AR Aging' },
    { kind: 'apAging', label: 'AP Aging' },
    { kind: 'reconcileAccountSummary', label: 'Reconcile' }
  ];
  readonly shellGeneralLedgerMenuOptions: { kind: AccountingShellGeneralLedgerKind; label: string }[] = [
    { kind: 'ledger', label: 'General Ledger' },
    { kind: 'recap', label: 'Journal Entry Recap' }
  ];
  selectedBillsReceiptKind: AccountingShellBillsReceiptKind = 'bills';
  selectedBankActivityKind: AccountingShellBankActivityKind = 'undepositedFunds';
  selectedOwnerKind: AccountingShellOwnerKind = 'utilities';
  selectedReportKind: AccountingShellReportKind = 'profitLoss';
  selectedGeneralLedgerKind: AccountingShellGeneralLedgerKind = 'ledger';

  selectedTabIndex = 0;
  isSuperAdmin: boolean = false;
  currentUserOrganizationId: string | null = null;

  organizations: OrganizationResponse[] = [];
  offices: OfficeResponse[] = [];
  organizationId = '';
  initialOfficeScopeApplied = false;
  selectedOrganizationId: string | null = null;
  selectedOfficeId: number | null = null;
  selectedCompanyId: string | null = null;
  selectedReservationId: string | null = null;
  activeInvoiceId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
  invoiceDetailInstance = 0;
  userId = '';
  startDate: Date | null = null;
  endDate: Date | null = null;
  asOfDate: Date | null = null;
  asOfStart: Date | null = null;
  dateRangePinned = false;
  invoiceSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
  billsSearchRequest: MaintenanceListSearchRequest = { officeIds: [] };
  billsRefreshTrigger = 0;
  receiptsRefreshTrigger = 0;
  rentRollRefreshTrigger = 0;
  showBillsReceiptDetail = false;
  selectedBillsReceiptId: string | null = null;
  billsReceiptProperty: PropertyResponse | null = null;
  billsReceiptPrefill: ReceiptPrefill | null = null;
  billsReceiptAgreementLineId: number | null = null;
  billsReceiptAgreementLineNotes: string | null = null;
  billsReceiptAutoSaveAttemptToken = 0;
  billsReceiptDetailInstance = 0;
  rentRollCreateQueue: RentRollCreateBillRequest[] = [];
  rentRollCreateQueueIndex = -1;
  rentRollCreateQueueSavedCount = 0;
  ignoreNextBillsReceiptBackEvent = false;
  isRentRollCreateTransitioning = false;
  rentRollTransitionUnlockTimer: ReturnType<typeof setTimeout> | null = null;
  billsReceiptOrigin: 'bills' | 'rentRoll' = 'bills';
  showReceiptsReceiptDetail = false;
  selectedReceiptsReceiptId: string | null = null;
  receiptsReceiptProperty: PropertyResponse | null = null;
  receiptsReceiptDetailInstance = 0;
  showDepositsDetail = false;
  selectedDepositId: string | null = null;
  selectedDeposit: DepositResponse | null = null;
  depositsProperty: PropertyResponse | null = null;
  depositDetailInstance = 0;
  showTransfersDetail = false;
  selectedTransferId: string | null = null;
  selectedTransfer: TransferResponse | null = null;
  transfersProperty: PropertyResponse | null = null;
  transferDetailInstance = 0;
  showTransferReportDetail = false;
  selectedTransferReportId: string | null = null;
  selectedTransferReport: TransferResponse | null = null;
  transferReportDetailInstance = 0;
  selectedChartOfAccountId: number | null = null;
  selectedFinancialReportClass: Class = Class.TotalOnly;
  selectedArAgingDatePreset: ArAgingDatePreset = 'today';
  selectedArAgingIntervalDays = 30;
  selectedArAgingThroughValue = 90;
  selectedArAgingSortBy: ArAgingSortBy = 'default';
  selectedApAgingSortBy: ApAgingSortBy = 'default';
  arAgingReportFilters: ArAgingReportFilters = this.buildArAgingReportFilters();
  apAgingReportFilters: ApAgingReportFilters = this.buildApAgingReportFilters();
  readonly shellArAgingDatePresetOptions = AR_AGING_DATE_PRESET_OPTIONS;
  readonly shellArAgingIntervalOptions = AR_AGING_INTERVAL_OPTIONS;
  readonly shellArAgingThroughOptions = AR_AGING_THROUGH_OPTIONS;
  readonly shellArAgingSortByOptions = AR_AGING_SORT_BY_OPTIONS;
  get shellApAgingSortByOptions(): { value: ApAgingSortBy; label: string }[] {
    if (!this.isOwnerApAgingViewActive) {
      return AP_AGING_SORT_BY_OPTIONS;
    }

    return AP_AGING_SORT_BY_OPTIONS.map(option =>
      option.value === 'vendor' ? { ...option, label: 'Owner' } : option
    );
  }
  selectedGlPropertyId: string | null = null;
  selectedGlReservationId: string | null = null;
  selectedBillsPropertyId: string | null = null;
  shellBillsPropertyTitleBarOptions: SearchableSelectOption[] = [];
  glProperties: PropertyCodeResponse[] = [];
  glReservations: ReservationCodeResponse[] = [];
  availableGlProperties: SearchableSelectOption[] = [];
  availableGlReservations: SearchableSelectOption[] = [];
  showGeneralLedgerDetail = false;
  showGeneralLedgerOfficeValidationError = false;
  generalLedgerDetailInstance = 0;
  activeJournalEntryId: string | null = null;
  selectedJournalEntryLineId: string | null = null;
  copyFromJournalEntry: JournalEntryResponse | null = null;
  generalLedgerRefreshTrigger = 0;
  financialReportsRefreshTrigger = 0;
  undepositedFundsRefreshTrigger = 0;
  untransferredFundsRefreshTrigger = 0;
  depositsRefreshTrigger = 0;
  transfersRefreshTrigger = 0;
  transferReportRefreshTrigger = 0;
  reconcileRefreshTrigger = 0;
  reconcileSetup: BeginReconciliationDialogResult | null = null;
  reconcileAccountReportContext: ReconcileAccountReportContext | null = null;
  private preserveReconcileAccountReportContext = false;
  private reconcileLeaveReportView: 'summary' | 'detail' | null = null;
  reconcileHistoryRows: ReconcileResponse[] = [];
  shellReconcileStatementDateOptions: SearchableSelectOption[] = [];
  selectedReconcileId: number | null = null;
  printChecksRefreshTrigger = 0;
  securityDepositsRefreshTrigger = 0;
  showSecurityDepositReport = false;
  securityDepositReportContext: SecurityDepositReportSelection | null = null;
  securityDepositReportInstance = 0;
  ownersUtilitiesRefreshTrigger = 0;
  ownersWorkOrdersRefreshTrigger = 0;
  ownersStatementsRefreshTrigger = 0;
  hasUnreturnedSecurityDeposits = false;
  ownerStatementReturnAfterUtilityDetail = false;
  ownerStatementReturnAfterWorkOrderDetail = false;
  ownerStatementReturnAfterInvoiceDetail = false;
  ownerStatementReturnOwnerKind: AccountingShellOwnerKind = 'statements';
  ownerStatementReturnReportKind: OwnerStatementReportKind = 'accrual';
  selectedOwnerStatementReportKind: OwnerStatementReportKind = 'accrual';
  showOwnerStatementJournalEntryLines = false;
  ownerStatementJournalEntryLineRequest: OwnerStatementJournalEntryLineSearchRequest | null = null;
  ownerStatementJournalEntryLinesRefreshTrigger = 0;
  ownersStatementViewState: OwnerStatementListViewState | null = null;
  selectedOwnerStatementMonthLine: OwnerStatementMonthLineListDisplay | null = null;
  showInvoiceCreate = false;
  invoiceCreateContext: InvoicePreviewSelection | null = null;
  invoiceCreateInstance = 0;
  invoiceCreateReturnToEditor = false;
  showOwnersUtilityReceiptDetail = false;
  selectedOwnersUtilityReceiptId: string | null = null;
  ownersUtilityReceiptProperty: PropertyResponse | null = null;
  ownersUtilityReceiptDetailInstance = 0;
  showOwnersWorkOrderDetail = false;
  selectedOwnersWorkOrderId: string | null = null;
  selectedOwnersWorkOrder: WorkOrderResponse | null = null;
  ownersWorkOrderProperty: PropertyResponse | null = null;
  ownersWorkOrderDetailInstance = 0;
  showWorkOrderCreate = false;
  workOrderCreateContext: WorkOrderPreviewSelection | null = null;
  workOrderCreateInstance = 0;
  workOrderCreateReturnToDetail = false;
  chartOfAccounts: ChartOfAccountResponse[] = [];
  isJournalEntrySyncInProgress = false;
  syncProgressRows: JournalEntrySyncProgressRow[] = [];
  showSyncProgressDialog = false;
  isSyncProgressComplete = false;
  isFinancialReportDrillDownActive = false;
  isFinancialReportJournalEntryDetailActive = false;
  isArAgingDrillDownActive = false;
  isApAgingDrillDownActive = false;
  isOwnerReportsLoading = false;

  destroy$ = new Subject<void>();

  constructor() {
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
  }

  //#region Accounting
  ngOnInit(): void {
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.userId = this.authService.getUser()?.userId || '';
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.applyPinnedDateRangeFromStorage();
    this.loadChartOfAccounts();
    this.loadPropertyCodes();
    this.loadReservationCodes();
    this.initializeSuperAdminFilters();
    if (!this.isSuperAdmin) {
      this.selectedOfficeId = this.globalSelectionService.resolvePageOfficeId({
        topBarPinned: this.dateRangePinned,
        pageOfficeId: this.selectedOfficeId,
        offices: this.offices
      });
      this.loadOffices();
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
        if (this.dateRangePinned) {
          return;
        }
        this.applyOfficeFromGlobal(officeId);
        this.syncBillsSearchRequest();
        if (this.selectedTabIndex === this.tabBillsReceipts) {
          this.refreshActiveBillsReceiptList();
        }
        if (this.selectedTabIndex === this.tabBankActivities) {
          this.refreshActiveBankActivityList();
        }
        if (this.selectedTabIndex === this.tabOwners) {
          this.refreshActiveOwnerView();
        }
        if (this.usesReportTitleBarFilters()) {
          if (this.usesGeneralLedgerTitleBarFilters()) {
            this.refreshPropertyOptions();
            this.refreshReservationOptions();
            this.clearInvalidChartOfAccountSelection();
            this.refreshGeneralLedgerListView();
          }
          if (this.usesFinancialReportTitleBarFilters()) {
            this.financialReportsRefreshTrigger++;
          }
          if (this.isReconcileAccountReportActive()) {
            this.loadReconcileHistoryForSelectedAccount();
          }
          if (this.usesArAgingTitleBarFilters()) {
            this.financialReportsRefreshTrigger++;
          }
        }
      });
    }
    this.applyQueryParamState(this.route.snapshot.queryParams);

    this.syncArAgingReportFilters();

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => this.applyQueryParamState(params));

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(paramMap => {
      const invoiceId = paramMap.get('id');
      this.activeInvoiceId = invoiceId;
      this.hydrateSelectedInvoiceForActiveId();
      if (invoiceId && this.selectedTabIndex !== 0) {
        this.selectedTabIndex = 0;
      }
    });

    this.refreshSecurityDepositsOwedBadge();
    this.securityDepositService.securityDepositsOutstanding$.pipe(takeUntil(this.destroy$)).subscribe(outstanding => {
      this.hasUnreturnedSecurityDeposits = outstanding;
      this.cdr.markForCheck();
    });
  }

  /** List→detail remounts this shell (accounting vs accounting/:id); restore prefetch from router state. */
hydrateSelectedInvoiceForActiveId(): void {
    if (!this.activeInvoiceId) {
      this.selectedInvoice = null;
      return;
    }

    if (this.selectedInvoice?.invoiceId === this.activeInvoiceId) {
      return;
    }

    const stateInvoice = history.state?.['prefetchedInvoice'] as InvoiceResponse | undefined;
    this.selectedInvoice = stateInvoice?.invoiceId === this.activeInvoiceId ? stateInvoice : null;
  }

  initializeSuperAdminFilters(): void {
    this.isSuperAdmin = this.authService.hasRole(UserGroups.SuperAdmin);
    if (!this.isSuperAdmin) {
      return;
    }

    this.selectedOrganizationId = null;
    this.currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
    this.organizationService.getOrganizations().pipe(takeUntil(this.destroy$)).subscribe({
      next: (organizations) => {
        this.organizations = (organizations || []).filter(o => o.organizationId !== this.currentUserOrganizationId);
      }
    });
  }
  //#endregion

  //#region Invoice Drop Downs
  onInvoiceOrganizationChange(organizationId: string | null): void {
    if (this.selectedOrganizationId !== organizationId) {
      this.selectedOrganizationId = organizationId;
    }
  }

  onInvoiceOfficeChange(officeId: number | null): void {
    if (this.dateRangePinned) {
      return;
    }
    if (this.selectedOfficeId !== officeId) {
      this.selectedOfficeId = officeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
  }

  onInvoiceCompanyChange(companyId: string | null): void {
    if (this.selectedCompanyId !== companyId) {
      this.selectedCompanyId = companyId;
    }
  }

  onInvoiceReservationChange(reservationId: string | null): void {
    if (this.selectedReservationId !== reservationId) {
      this.selectedReservationId = reservationId;
    }
  }

  onAccountingInvoiceCompanyDropdownChange(value: string | number | null): void {
    this.selectedCompanyId = value == null || value === '' ? null : String(value);
    this.persistPinnedTopBarIfActive();
  }

  onAccountingInvoiceReservationDropdownChange(value: string | number | null): void {
    const reservationId = value == null || value === '' ? null : String(value);
    if (!reservationId && !this.selectedReservationId) {
      return;
    }
    this.selectedReservationId = reservationId;
    this.persistPinnedTopBarIfActive();
  }

  onAccountingInvoiceEditorOfficeDropdownChange(value: string | number | null): void {
    const editor = this.shellInvoiceEditor;
    if (!editor) {
      return;
    }
    editor.onTitleBarOfficeChange(value);
  }

  onAccountingInvoiceEditorReservationDropdownChange(value: string | number | null): void {
    const editor = this.shellInvoiceEditor;
    if (!editor) {
      return;
    }
    editor.onTitleBarReservationChange(value);
  }
  //#endregion

  //#region General Ledger
  onGeneralLedgerLineSelect(event: JournalEntryLineSelection): void {
    const journalEntryId = (event?.journalEntryId || '').trim();
    if (!journalEntryId) {
      return;
    }

    this.showGeneralLedgerOfficeValidationError = false;
    this.copyFromJournalEntry = null;
    this.activeJournalEntryId = journalEntryId;
    this.selectedJournalEntryLineId = (event.journalEntryLineId || '').trim() || null;
    this.showGeneralLedgerDetail = true;
    this.cdr.markForCheck();
  }

  onSecurityDepositJournalEntrySelect(event: { journalEntryId: string }): void {
    const journalEntryId = (event?.journalEntryId || '').trim();
    if (!journalEntryId) {
      return;
    }

    this.showGeneralLedgerOfficeValidationError = false;
    this.copyFromJournalEntry = null;
    this.activeJournalEntryId = journalEntryId;
    this.selectedJournalEntryLineId = null;
    this.showGeneralLedgerDetail = true;
    this.cdr.markForCheck();
  }

  onSecurityDepositReportOpen(selection: SecurityDepositReportSelection): void {
    const reservationId = (selection?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    if (selection.officeId != null && this.selectedOfficeId !== selection.officeId) {
      this.selectedOfficeId = selection.officeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }

    this.securityDepositReportContext = {
      reservationId,
      reservationCode: selection.reservationCode ?? null,
      officeId: selection.officeId ?? this.selectedOfficeId,
      securityDepositReturnDate: selection.securityDepositReturnDate ?? null
    };
    this.showSecurityDepositReport = true;
    this.securityDepositReportInstance++;
    this.cdr.markForCheck();
  }

  onSecurityDepositReportBack(): void {
    this.showSecurityDepositReport = false;
    this.securityDepositReportContext = null;
    this.securityDepositsRefreshTrigger++;
    this.cdr.markForCheck();
  }

  onCreateJournalEntry(copyFrom: JournalEntryResponse | null = null): void {
    this.showGeneralLedgerOfficeValidationError = false;
    this.selectedGlPropertyId = null;
    this.selectedGlReservationId = null;
    this.selectedJournalEntryLineId = null;
    this.copyFromJournalEntry = copyFrom;
    if (copyFrom || (this.activeJournalEntryId === 'new' && this.showGeneralLedgerDetail)) {
      this.generalLedgerDetailInstance++;
    }
    this.activeJournalEntryId = 'new';
    this.showGeneralLedgerDetail = true;
    this.cdr.markForCheck();
  }

  onGeneralLedgerOfficeValidationRequired(): void {
    this.showGeneralLedgerOfficeValidationError = true;
  }

  onGeneralLedgerBack(): void {
    const shouldRefreshOwnerStatements = this.selectedTabIndex === this.tabOwners
      && this.isOwnerReportView(this.selectedOwnerKind)
      && this.showOwnerStatementJournalEntryLines;
    const shouldRefreshSecurityDeposits = this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'securityDeposits';
    this.showGeneralLedgerOfficeValidationError = false;
    this.showGeneralLedgerDetail = false;
    this.activeJournalEntryId = null;
    this.selectedJournalEntryLineId = null;
    this.copyFromJournalEntry = null;
    if (shouldRefreshOwnerStatements) {
      this.ownersStatementsRefreshTrigger++;
    }
    if (shouldRefreshSecurityDeposits) {
      this.securityDepositsRefreshTrigger++;
    }
  }

  onGeneralLedgerCreated(created?: JournalEntryResponse): void {
    this.showGeneralLedgerOfficeValidationError = false;
    if (created) {
      this.copyFromJournalEntry = null;
      this.showGeneralLedgerDetail = false;
      this.activeJournalEntryId = null;
      this.selectedJournalEntryLineId = null;
    }
    if (created?.transactionDate) {
      this.ensureDateRangeIncludesTransactionDate(created.transactionDate);
    }
    if (this.usesGeneralLedgerTitleBarFilters()) {
      this.selectedChartOfAccountId = null;
      this.selectedGlPropertyId = null;
      this.selectedGlReservationId = null;
    }
    this.syncInvoiceSearchDateRange();
    this.onJournalEntriesChanged();
    this.refreshGeneralLedgerListView();
  }

  onGeneralLedgerShellSaved(created?: JournalEntryResponse): void {
    if (this.activeJournalEntryId === 'new') {
      this.onGeneralLedgerCreated(created);
      return;
    }

    this.onJournalEntriesChanged();
  }

  onOwnerStatementJournalEntryLineSelect(event: JournalEntryLineSelection): void {
    this.activeJournalEntryId = event.journalEntryId;
    this.selectedJournalEntryLineId = event.journalEntryLineId;
    this.showGeneralLedgerDetail = true;
  }

  onInvoiceSelect(selection: InvoiceSelection): void {
    const invoiceId = (selection?.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    if (selection.officeId != null && this.selectedOfficeId !== selection.officeId) {
      this.selectedOfficeId = selection.officeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
    if (selection.reservationId && this.selectedReservationId !== selection.reservationId) {
      this.selectedReservationId = selection.reservationId;
    }

    const reopeningInvoiceAdd = invoiceId === 'new'
      && this.activeInvoiceId === 'new';
    this.selectedInvoice = invoiceId === 'new' ? null : (selection.invoice ?? null);
    this.activeInvoiceId = invoiceId;
    if (reopeningInvoiceAdd) {
      this.invoiceDetailInstance++;
    }
    this.selectedTabIndex = 0;
    this.cdr.markForCheck();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ tab: '0' }),
      queryParamsHandling: 'merge',
      state: selection.invoice ? { prefetchedInvoice: selection.invoice } : undefined
    });
  }

  onShellChartOfAccountDropdownChange(value: string | number | null): void {
    const chartOfAccountId = value == null || value === '' ? null : Number(value);
    if (this.selectedChartOfAccountId === chartOfAccountId) {
      return;
    }
    this.selectedChartOfAccountId = chartOfAccountId;
    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    if (this.isReconcileAccountReportActive()) {
      this.reconcileAccountReportContext = null;
      this.loadReconcileHistoryForSelectedAccount();
    }
    this.refreshGeneralLedgerListView();
    if (this.showReconcileChartOfAccountFilter) {
      this.reconcileRefreshTrigger++;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }

  onShellReconcileStatementDateChange(value: string | number | null): void {
    const reconcileId = value == null || value === '' ? null : Number(value);
    if (reconcileId == null || !Number.isFinite(reconcileId) || reconcileId <= 0) {
      this.selectedReconcileId = null;
      this.reconcileAccountReportContext = null;
      this.financialReportsRefreshTrigger++;
      return;
    }

    if (this.selectedReconcileId === reconcileId) {
      return;
    }

    const selected = this.reconcileHistoryRows.find(row => row.reconcileId === reconcileId) ?? null;
    this.applyReconcileHistorySelection(selected, true);
  }

  onShellGlPropertyDropdownChange(value: string | number | null): void {
    const propertyId = value == null || value === '' ? null : String(value);
    if (this.selectedGlPropertyId === propertyId) {
      return;
    }
    this.selectedGlPropertyId = propertyId;
    this.refreshReservationOptions();

    if (this.isGeneralLedgerDetailActive) {
      return;
    }

    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    this.refreshGeneralLedgerListView();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }

  onShellGlReservationDropdownChange(value: string | number | null): void {
    const reservationId = value == null || value === '' ? null : String(value);
    if (this.selectedGlReservationId === reservationId) {
      return;
    }
    this.selectedGlReservationId = reservationId;
    const reservation = this.glReservations.find(item => item.reservationId === reservationId) || null;
    if (reservation?.propertyId) {
      this.selectedGlPropertyId = reservation.propertyId;
      this.refreshPropertyOptions();
      this.refreshReservationOptions();
    }

    if (this.isGeneralLedgerDetailActive) {
      return;
    }

    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    this.refreshGeneralLedgerListView();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }
  //#endregion

  //#region Financial Report Drill-Down
  get activeApAgingReport(): ApAgingReportComponent | undefined {
    if (this.isOwnerApAgingViewActive) {
      return this.ownerApAgingReport;
    }

    if (this.selectedTabIndex === this.tabReports && this.isApAgingReportKind(this.selectedReportKind)) {
      return this.reportsApAgingReport;
    }

    return this.ownerApAgingReport ?? this.reportsApAgingReport;
  }

  get isAgingOrFinancialDrillBackActive(): boolean {
    return !!(
      this.activeApAgingReport?.activeReceiptId
      || this.activeApAgingReport?.activeInvoiceId
      || this.activeApAgingReport?.activeWorkOrderId
      || this.activeApAgingReport?.drillDownView
      || this.arAgingReport?.activeInvoiceId
      || this.arAgingReport?.drillDownView
      || this.isApAgingDrillDownActive
      || this.isArAgingDrillDownActive
      || this.isFinancialReportDrillDownActive
    );
  }

  onFinancialReportDrillDownBack(): void {
    const apAgingReport = this.activeApAgingReport;
    if (
      apAgingReport?.activeReceiptId
      || apAgingReport?.activeInvoiceId
      || apAgingReport?.activeWorkOrderId
      || apAgingReport?.drillDownView
      || this.isApAgingDrillDownActive
    ) {
      apAgingReport?.drillDownBack();
      return;
    }

    if (this.arAgingReport?.activeInvoiceId || this.arAgingReport?.drillDownView || this.isArAgingDrillDownActive) {
      this.arAgingReport?.drillDownBack();
      return;
    }

    this.activeFinancialReport?.drillDownBack();
  }

  onFinancialReportDrillDownActiveChange(active: boolean): void {
    this.isFinancialReportDrillDownActive = active;
  }

  onFinancialReportJournalEntryDetailChange(active: boolean): void {
    this.isFinancialReportJournalEntryDetailActive = active;
    this.cdr.markForCheck();
  }

  onFinancialReportShellTitleBarRefresh(): void {
    this.cdr.markForCheck();
  }

  syncFinancialReportDrillDownActiveState(): void {
    this.isFinancialReportDrillDownActive = !!this.activeFinancialReport?.drillDownView;
  }

  get activeFinancialReport(): FinancialReportComponent | undefined {
    if (this.selectedTabIndex === this.tabReports && this.selectedReportKind !== 'arAging' && !this.isApAgingReportKind(this.selectedReportKind)) {
      return this.financialReport;
    }
    return undefined;
  }

  get shellInvoiceEditor(): InvoiceComponent | undefined {
    if (this.selectedTabIndex === 0 && this.activeInvoiceId) {
      return this.accountingInvoiceEditor;
    }

    if (this.activeFinancialReport?.activeInvoiceId) {
      return this.activeFinancialReport.drillDownInvoiceEditor;
    }

    if (this.activeApAgingReport?.activeReceiptId) {
      return undefined;
    }

    if (this.activeApAgingReport?.activeInvoiceId) {
      return this.activeApAgingReport.drillDownInvoiceEditor;
    }

    if (this.arAgingReport?.activeInvoiceId) {
      return this.arAgingReport.drillDownInvoiceEditor;
    }

    return undefined;
  }

  get isShellInvoiceTitleBarActive(): boolean {
    return !!this.shellInvoiceEditor?.form;
  }
  //#endregion

  //#region AR Aging Report
  onApAgingDrillDownActiveChange(active: boolean): void {
    this.isApAgingDrillDownActive = active;
    this.cdr.markForCheck();
  }

  onApAgingJournalEntriesChanged(): void {
    this.onJournalEntriesChanged();
  }

  onArAgingDrillDownActiveChange(active: boolean): void {
    this.isArAgingDrillDownActive = active;
    this.cdr.markForCheck();
  }

  onArAgingJournalEntriesChanged(): void {
    this.onJournalEntriesChanged();
  }

  get isOwnerApAgingViewActive(): boolean {
    return this.selectedTabIndex === this.tabOwners && this.selectedOwnerKind === 'apAging';
  }

  usesArAgingTitleBarFilters(): boolean {
    return this.isOwnerApAgingViewActive
      || (this.selectedTabIndex === this.tabReports
        && (this.selectedReportKind === 'arAging' || this.isApAgingReportKind(this.selectedReportKind)));
  }

  get usesArAgingSortByOptions(): boolean {
    return this.selectedReportKind === 'arAging';
  }

  get usesApAgingSortByOptions(): boolean {
    return this.isOwnerApAgingViewActive || this.isApAgingReportKind(this.selectedReportKind);
  }

  get selectedAgingSortByValue(): string {
    return this.usesApAgingSortByOptions
      ? this.selectedApAgingSortBy
      : this.selectedArAgingSortBy;
  }

  isApAgingReportKind(kind: AccountingShellReportKind | null | undefined): boolean {
    return kind === 'apAging';
  }

  get showArAgingCustomAsOfDate(): boolean {
    return this.selectedArAgingDatePreset === 'custom';
  }

  buildApAgingReportFilters(): ApAgingReportFilters {
    const asOfDateApi = this.utilityService.formatDateOnlyForApi(this.asOfDate);
    // Owners → AP Aging always shows an editable "As of" date. Use that date directly;
    // preset resolution (e.g. "today") would ignore picker changes.
    const asOfDate = this.isOwnerApAgingViewActive
      ? (asOfDateApi || this.utilityService.todayAsCalendarDateString())
      : resolveApAgingAsOfDate(this.selectedArAgingDatePreset, asOfDateApi);

    return {
      datePreset: this.isOwnerApAgingViewActive ? 'custom' : this.selectedArAgingDatePreset,
      asOfDate,
      intervalDays: this.selectedArAgingIntervalDays,
      throughDays: normalizeApAgingThroughDays(this.selectedArAgingThroughValue),
      sortBy: this.selectedApAgingSortBy
    };
  }

  syncApAgingReportFilters(): void {
    this.apAgingReportFilters = this.buildApAgingReportFilters();
  }

  buildArAgingReportFilters(): ArAgingReportFilters {
    return {
      datePreset: this.selectedArAgingDatePreset,
      asOfDate: resolveArAgingAsOfDate(
        this.selectedArAgingDatePreset,
        this.utilityService.formatDateOnlyForApi(this.asOfDate)
      ),
      intervalDays: this.selectedArAgingIntervalDays,
      throughDays: normalizeArAgingThroughDays(this.selectedArAgingThroughValue),
      sortBy: this.selectedArAgingSortBy
    };
  }

  syncArAgingReportFilters(): void {
    this.arAgingReportFilters = this.buildArAgingReportFilters();
    this.syncApAgingReportFilters();
  }

  onShellArAgingDatePresetChange(value: string | number | null): void {
    const datePreset = String(value ?? '') as ArAgingDatePreset;
    if (!this.shellArAgingDatePresetOptions.some(option => option.value === datePreset)) {
      return;
    }

    this.selectedArAgingDatePreset = datePreset;
    this.syncArAgingAsOfDateFromFilters();
    this.publishArAgingFilterState();
    this.persistPinnedTopBarIfActive();
  }

  onShellArAgingIntervalChange(value: string | number | null): void {
    const intervalDays = Number(value);
    if (!Number.isFinite(intervalDays) || !this.shellArAgingIntervalOptions.some(option => option.value === intervalDays)) {
      return;
    }

    this.selectedArAgingIntervalDays = intervalDays;
    this.publishArAgingFilterState();
    this.persistPinnedTopBarIfActive();
  }

  onShellArAgingThroughChange(value: string | number | null): void {
    const throughValue = Number(value);
    if (!Number.isFinite(throughValue) || !this.shellArAgingThroughOptions.some(option => option.value === throughValue)) {
      return;
    }

    this.selectedArAgingThroughValue = throughValue;
    this.publishArAgingFilterState();
    this.persistPinnedTopBarIfActive();
  }

  onShellApAgingSortByChange(value: string | number | null): void {
    const sortBy = String(value ?? '') as ApAgingSortBy;
    if (!this.shellApAgingSortByOptions.some(option => option.value === sortBy)) {
      return;
    }

    this.selectedApAgingSortBy = sortBy;
    this.publishApAgingFilterState();
    this.cdr.markForCheck();
  }

  onShellArAgingSortByChange(value: string | number | null): void {
    const sortBy = String(value ?? '') as ArAgingSortBy;
    if (!this.shellArAgingSortByOptions.some(option => option.value === sortBy)) {
      return;
    }

    this.selectedArAgingSortBy = sortBy;
    this.publishArAgingFilterState();
    this.persistPinnedTopBarIfActive();
  }

  syncArAgingAsOfDateFromFilters(): void {
    const resolvedAsOfDate = this.utilityService.parseDateOnlyStringToDate(
      resolveArAgingAsOfDate(
        this.selectedArAgingDatePreset,
        this.utilityService.formatDateOnlyForApi(this.asOfDate)
      )
    );
    if (!resolvedAsOfDate) {
      return;
    }

    this.asOfDate = resolvedAsOfDate;
    this.syncAsOfStartFromAsOfDate();
    this.syncArAgingReportFilters();
  }

  onAsOfDateChange(): void {
    this.normalizeAsOfDateValue();
    this.asOfDate = this.cloneShellDate(this.asOfDate);
    this.syncAsOfStartFromAsOfDate();
    this.publishAsOfDateState();
  }

  publishAsOfDateState(): void {
    this.syncAsOfStartFromAsOfDate();
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }

    this.syncArAgingReportFilters();
    this.syncApAgingReportFilters();

    if (this.usesAccountingShellAsOfDate) {
      this.financialReportsRefreshTrigger++;
      if (this.selectedTabIndex === this.tabOwners && this.selectedOwnerKind === 'escrow') {
        this.ownersStatementsRefreshTrigger++;
      }
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildAsOfQueryParams(),
      queryParamsHandling: 'merge'
    });
    this.cdr.markForCheck();
  }

  normalizeAsOfDateValue(): void {
    if (this.asOfDate) {
      this.asOfDate.setHours(0, 0, 0, 0);
    }
  }

  normalizeAsOfStartValue(): void {
    if (this.asOfStart) {
      this.asOfStart.setHours(0, 0, 0, 0);
    }
  }

  syncAsOfStartFromAsOfDate(): void {
    if (!this.asOfDate) {
      this.asOfStart = null;
      return;
    }

    const asOfYear = this.asOfDate.getFullYear();
    const currentAsOfStartYear = this.asOfStart?.getFullYear();
    if (this.asOfStart == null || currentAsOfStartYear !== asOfYear) {
      this.asOfStart = new Date(asOfYear, 0, 1);
      this.normalizeAsOfStartValue();
    }
  }

  applyStoredAsOfStart(storedAsOfStart: string | undefined): void {
    if (!storedAsOfStart) {
      this.syncAsOfStartFromAsOfDate();
      return;
    }

    const asOfStart = this.utilityService.parseCalendarDateInput(storedAsOfStart);
    if (!asOfStart) {
      this.syncAsOfStartFromAsOfDate();
      return;
    }

    asOfStart.setHours(0, 0, 0, 0);
    this.asOfStart = asOfStart;
  }

  publishApAgingFilterState(): void {
    this.syncArAgingAsOfDateFromFilters();
    this.syncApAgingReportFilters();
    this.financialReportsRefreshTrigger++;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
  }

  publishArAgingFilterState(): void {
    this.syncArAgingAsOfDateFromFilters();
    this.syncArAgingReportFilters();
    this.financialReportsRefreshTrigger++;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Bills Receipt Detail
  onBillsReceiptSelect(selection: ReceiptSelection, origin: 'bills' | 'rentRoll' = 'bills'): void {
    const receiptId = (selection?.receiptId || '').trim() || null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;

    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
      this.refreshBillsPropertyOptions();
    }
    this.selectedBillsPropertyId = propertyId;
    this.syncBillsSearchRequest();

    const propertyStub = this.buildBillsReceiptPropertyStub(resolvedOfficeId);
    if (propertyId) {
      propertyStub.propertyId = propertyId;
      const cachedProperty = this.glProperties.find(property => property.propertyId === propertyId);
      if (cachedProperty?.propertyCode) {
        propertyStub.propertyCode = cachedProperty.propertyCode;
      }
    }

    this.selectedTabIndex = this.tabBillsReceipts;
    this.selectedBillsReceiptKind = 'bills';
    this.billsReceiptOrigin = origin;
    this.billsReceiptProperty = propertyStub;
    this.billsReceiptAgreementLineId = this.toAgreementLineId(selection?.agreementLineId);
    this.billsReceiptAgreementLineNotes = (selection?.notes || '').trim() || null;
    this.billsReceiptAutoSaveAttemptToken = selection?.autoSaveValidationAttempt ? Date.now() : 0;
    const reopeningBillsReceiptAdd = receiptId === 'new'
      && this.showBillsReceiptDetail
      && this.selectedBillsReceiptId === 'new';
    this.selectedBillsReceiptId = receiptId;
    if (reopeningBillsReceiptAdd) {
      this.billsReceiptDetailInstance++;
    }
    this.billsReceiptPrefill = null;
    this.showBillsReceiptDetail = true;
  }

  onBillsReceiptBack(): void {
    if (this.ignoreNextBillsReceiptBackEvent) {
      this.ignoreNextBillsReceiptBackEvent = false;
      return;
    }

    this.releaseRentRollTransitionLock();
    if (this.hasActiveRentRollCreateQueue) {
      this.clearRentRollCreateQueue();
    }
    this.showBillsReceiptDetail = false;
    this.selectedBillsReceiptId = null;
    this.billsReceiptProperty = null;
    this.billsReceiptPrefill = null;
    this.billsReceiptAgreementLineId = null;
    this.billsReceiptAgreementLineNotes = null;
    this.billsReceiptAutoSaveAttemptToken = 0;
    this.selectedBillsReceiptKind = this.billsReceiptOrigin === 'rentRoll' ? 'rentRoll' : 'bills';
    this.billsReceiptOrigin = 'bills';
  }

  onBillsReceiptSaved(): void {
    if (this.billsReceiptOrigin === 'rentRoll' && this.hasActiveRentRollCreateQueue) {
      this.rentRollCreateQueueSavedCount++;
      this.onJournalEntriesChanged();
      this.rentRollCreateQueueIndex++;
      if (this.rentRollCreateQueueIndex < this.rentRollCreateQueue.length) {
        // Receipt can still emit backEvent around savedEvent in embedded shell mode.
        // Ignore that single back event so queue mode stays in bill detail.
        this.ignoreNextBillsReceiptBackEvent = true;
        this.activateRentRollTransitionLock();
        this.openRentRollBillEditor(this.rentRollCreateQueue[this.rentRollCreateQueueIndex]);
        return;
      }

      const totalCount = this.rentRollCreateQueue.length;
      const createdCount = this.rentRollCreateQueueSavedCount;
      this.clearRentRollCreateQueue();
      this.onBillsReceiptBack();
      this.toastr.success(`Created ${createdCount} of ${totalCount} selected bill${totalCount === 1 ? '' : 's'}.`, 'Create Bills');
      return;
    }

    const savedOrigin = this.billsReceiptOrigin;
    this.onBillsReceiptBack();
    this.billsRefreshTrigger++;
    if (savedOrigin === 'rentRoll') {
      this.rentRollRefreshTrigger++;
    }
  }

  onRentRollCreateBill(request: RentRollCreateBillRequest): void {
    this.startRentRollCreateQueue([request]);
  }

  openRentRollBillEditor(request: RentRollCreateBillRequest): void {
    const propertyId = (request.propertyId || '').trim();
    const officeId = request.officeId ?? this.selectedOfficeId ?? null;
    const billDate = request.billDate || this.utilityService.formatDateOnlyForApi(this.endDate) || this.utilityService.formatDateOnlyForApi(new Date());
    const dueDate = request.dueDate || billDate;
    const editorPrefillKey = `${request.agreementLineId || 'line'}-${Date.now()}`;
    this.selectedBillsPropertyId = propertyId || null;
    this.syncBillsSearchRequest();
    const openBillEditor = (property: PropertyResponse | null) => {
      this.selectedTabIndex = this.tabBillsReceipts;
      this.selectedBillsReceiptKind = 'bills';
      this.billsReceiptOrigin = 'rentRoll';
      this.selectedBillsReceiptId = 'new';
      this.billsReceiptProperty = property;
      this.billsReceiptPrefill = {
        key: editorPrefillKey,
        officeId,
        propertyIds: propertyId ? [propertyId] : [],
        agreementLineId: this.toAgreementLineId(request.agreementLineId),
        agreementLineNotes: (request.notes || '').trim() || null,
        receiptDate: billDate,
        dueDate,
        accountingPeriod: billDate,
        description: (request.description || '').trim(),
        amount: Number(request.amount || 0),
        bankCardId: 0,
        vendorId: request.vendorId,
        vendorName: request.vendorName,
        split: {
          amount: Number(request.amount || 0),
          description: (request.description || '').trim(),
          receiptTypeId: 1,
          chartOfAccountId: request.chartOfAccountId
        }
      };
      this.billsReceiptAgreementLineId = this.toAgreementLineId(request.agreementLineId);
      this.billsReceiptAgreementLineNotes = (request.notes || '').trim() || null;
      this.billsReceiptAutoSaveAttemptToken = 0;
      this.showBillsReceiptDetail = true;
    };

    const initialProperty = this.buildBillsReceiptPropertyStub(officeId);
    if (propertyId) {
      initialProperty.propertyId = propertyId;
    }
    openBillEditor(initialProperty);

    if (!propertyId) {
      return;
    }

    this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
      next: property => {
        if (!this.showBillsReceiptDetail || this.billsReceiptPrefill?.key !== editorPrefillKey) {
          return;
        }
        this.billsReceiptProperty = property;
      },
      error: () => {
        // Keep the stub property in place if full property lookup fails.
      }
    });
  }

  async onRentRollOpenBill(selection: ReceiptSelection): Promise<void> {
    const receiptId = (selection?.receiptId || '').trim();
    if (!receiptId) {
      return;
    }
    await this.ensureRentRollBillAgreementLineLink(selection);
    this.onBillsReceiptSelect(selection, 'rentRoll');
  }

  onRentRollCreateBills(requests: RentRollCreateBillRequest[]): void {
    const createRequests = Array.isArray(requests) ? requests : [];
    if (createRequests.length === 0) {
      this.toastr.warning('Select at least one rent roll row first.', 'Create Bills');
      return;
    }
    this.startRentRollCreateQueue(createRequests);
  }

  get hasActiveRentRollCreateQueue(): boolean {
    return this.rentRollCreateQueueIndex >= 0 && this.rentRollCreateQueueIndex < this.rentRollCreateQueue.length;
  }

  startRentRollCreateQueue(requests: RentRollCreateBillRequest[]): void {
    const queue = (requests || []).filter(request => !!request);
    if (queue.length === 0) {
      this.toastr.warning('Select at least one rent roll row first.', 'Create Bills');
      return;
    }
    this.rentRollCreateQueue = queue;
    this.rentRollCreateQueueIndex = 0;
    this.rentRollCreateQueueSavedCount = 0;
    this.activateRentRollTransitionLock();
    this.openRentRollBillEditor(queue[0]);
  }

  clearRentRollCreateQueue(): void {
    this.rentRollCreateQueue = [];
    this.rentRollCreateQueueIndex = -1;
    this.rentRollCreateQueueSavedCount = 0;
  }

  activateRentRollTransitionLock(): void {
    this.isRentRollCreateTransitioning = true;
    if (typeof document !== 'undefined') {
      document.body.classList.add('rent-roll-create-transition-lock');
    }
    if (this.rentRollTransitionUnlockTimer) {
      clearTimeout(this.rentRollTransitionUnlockTimer);
    }
    this.rentRollTransitionUnlockTimer = setTimeout(() => {
      this.releaseRentRollTransitionLock();
    }, 450);
  }

  releaseRentRollTransitionLock(): void {
    this.isRentRollCreateTransitioning = false;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('rent-roll-create-transition-lock');
    }
    if (this.rentRollTransitionUnlockTimer) {
      clearTimeout(this.rentRollTransitionUnlockTimer);
      this.rentRollTransitionUnlockTimer = null;
    }
  }

  getRentRollBillValidationMessage(request: RentRollCreateBillRequest): string | null {
    const propertyId = (request.propertyId || '').trim();
    const officeId = Number(request.officeId || 0);
    const amount = Number(request.amount || 0);
    const vendorId = (request.vendorId || '').trim();
    const chartOfAccountId = Number(request.chartOfAccountId || 0);

    if (!propertyId) {
      return 'Skipped one row: missing property.';
    }
    if (!Number.isFinite(officeId) || officeId <= 0) {
      return 'Skipped one row: missing office.';
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return 'Skipped one row: amount must be greater than zero.';
    }
    if (!vendorId) {
      return 'Skipped one row: vendor is required for a bill.';
    }
    if (!Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0) {
      return 'Skipped one row: chart of account is required.';
    }
    return null;
  }

  buildRentRollReceiptRequest(
    request: RentRollCreateBillRequest,
    organizationId: string
  ): ReceiptRequest | null {
    const propertyId = (request.propertyId || '').trim();
    const officeId = Number(request.officeId || 0);
    const vendorId = (request.vendorId || '').trim();
    const chartOfAccountId = Number(request.chartOfAccountId || 0);
    const amount = Number(request.amount || 0);
    const description = (request.description || '').trim() || `Rent Roll - ${propertyId}`;
    const billDate = request.billDate || this.utilityService.formatDateOnlyForApi(this.endDate) || this.utilityService.formatDateOnlyForApi(new Date());
    const dueDate = request.dueDate || billDate;
    if (!billDate || !dueDate) {
      return null;
    }
    if (!propertyId || !vendorId || officeId <= 0 || chartOfAccountId <= 0 || amount <= 0) {
      return null;
    }
    return {
      organizationId,
      officeId,
      propertyIds: [propertyId],
      agreementLineId: this.toAgreementLineId(request.agreementLineId),
      receiptDate: billDate,
      dueDate,
      accountingPeriod: billDate,
      billNumber: null,
      ticketId: '',
      amount,
      paidAmount: 0,
      paidDate: null,
      description,
      bankCardId: null,
      vendorId,
      vendorName: (request.vendorName || '').trim() || null,
      splits: [{
        amount,
        description,
        receiptTypeId: 1,
        chartOfAccountId
      }],
      receiptPath: null,
      fileDetails: null,
      isUtility: false,
      isActive: true
    };
  }

  toAgreementLineId(value: string | number | null | undefined): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return Math.trunc(parsed);
  }

  async ensureRentRollBillAgreementLineLink(selection: ReceiptSelection): Promise<void> {
    const receiptId = (selection?.receiptId || '').trim();
    const agreementLineId = this.toAgreementLineId(selection?.agreementLineId);
    const notes = (selection?.notes || '').trim();
    if (!receiptId || !agreementLineId || !notes) {
      return;
    }
    try {
      const receipt = await firstValueFrom(this.receiptService.getReceiptById(receiptId));
      if (this.toAgreementLineId(receipt?.agreementLineId)) {
        return;
      }
      const updateRequest: ReceiptRequest = {
        receiptId: receipt.receiptId,
        organizationId: receipt.organizationId,
        officeId: receipt.officeId,
        propertyIds: [...(receipt.propertyIds || [])],
        agreementLineId,
        receiptDate: receipt.receiptDate,
        dueDate: receipt.dueDate,
        accountingPeriod: receipt.accountingPeriod,
        billNumber: receipt.billNumber ?? null,
        ticketId: receipt.ticketId || '',
        amount: Number(receipt.amount || 0),
        paidAmount: Number(receipt.paidAmount || 0),
        paidDate: receipt.paidDate ?? null,
        description: (receipt.description || '').trim(),
        bankCardId: receipt.bankCardId ?? null,
        vendorId: receipt.vendorId ?? null,
        vendorName: receipt.vendorName ?? null,
        splits: [...(receipt.splits || [])],
        receiptPath: receipt.receiptPath ?? null,
        fileDetails: null,
        paymentTypeId: Number(receipt.paymentTypeId || 0),
        checkPrinted: !!receipt.checkPrinted,
        isUtility: !!receipt.isUtility,
        isActive: !!receipt.isActive
      };
      await firstValueFrom(this.receiptService.updateReceipt(updateRequest));
      this.billsRefreshTrigger++;
      this.rentRollRefreshTrigger++;
    } catch {
      // Do not block opening the bill editor if this background link fails.
    }
  }

  onJournalEntriesChanged(): void {
    this.syncGlFiltersFromInvoiceContext();
    this.billsRefreshTrigger++;
    this.receiptsRefreshTrigger++;
    this.undepositedFundsRefreshTrigger++;
    this.untransferredFundsRefreshTrigger++;
    this.depositsRefreshTrigger++;
    this.transfersRefreshTrigger++;
    this.transferReportRefreshTrigger++;
    this.printChecksRefreshTrigger++;
    this.ownersUtilitiesRefreshTrigger++;
    if (this.selectedTabIndex === this.tabOwners) {
      if (this.selectedOwnerKind === 'ownerStatements') {
        this.ownersStatementsRefreshTrigger++;
      }
      if (this.isOwnerReportView(this.selectedOwnerKind) && this.showOwnerStatementJournalEntryLines) {
        this.ownerStatementJournalEntryLinesRefreshTrigger++;
      }
    }
    this.financialReportsRefreshTrigger++;
    this.generalLedgerRefreshTrigger++;
  }

  onReceiptsReceiptSelect(selection: ReceiptSelection): void {
    const receiptId = selection?.receiptId ?? null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;

    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
      this.refreshBillsPropertyOptions();
    }
    this.selectedBillsPropertyId = propertyId;
    this.syncBillsSearchRequest();

    const propertyStub = this.buildBillsReceiptPropertyStub(resolvedOfficeId);
    if (propertyId) {
      propertyStub.propertyId = propertyId;
      const cachedProperty = this.glProperties.find(property => property.propertyId === propertyId);
      if (cachedProperty?.propertyCode) {
        propertyStub.propertyCode = cachedProperty.propertyCode;
      }
    }

    this.selectedTabIndex = this.tabBillsReceipts;
    this.selectedBillsReceiptKind = 'receipts';
    this.receiptsReceiptProperty = propertyStub;
    const reopeningReceiptsReceiptAdd = receiptId === 'new'
      && this.showReceiptsReceiptDetail
      && this.selectedReceiptsReceiptId === 'new';
    this.selectedReceiptsReceiptId = receiptId;
    if (reopeningReceiptsReceiptAdd) {
      this.receiptsReceiptDetailInstance++;
    }
    this.showReceiptsReceiptDetail = true;
  }

  onReceiptsReceiptBack(): void {
    this.showReceiptsReceiptDetail = false;
    this.selectedReceiptsReceiptId = null;
    this.receiptsReceiptProperty = null;
  }

  onReceiptsReceiptSaved(): void {
    this.onReceiptsReceiptBack();
    this.receiptsRefreshTrigger++;
  }

  onDepositSelect(selection: DepositSelection): void {
    const depositId = selection?.depositId ?? null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;

    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
    this.syncBillsSearchRequest();

    this.selectedDeposit = selection?.deposit ?? null;

    const propertyStub = this.buildBillsReceiptPropertyStub(resolvedOfficeId);
    if (propertyId) {
      propertyStub.propertyId = propertyId;
      const cachedProperty = this.glProperties.find(property => property.propertyId === propertyId);
      if (cachedProperty?.propertyCode) {
        propertyStub.propertyCode = cachedProperty.propertyCode;
      }
    }

    this.selectedTabIndex = this.tabBankActivities;
    this.selectedBankActivityKind = 'deposits';
    this.depositsProperty = propertyStub;
    const reopeningDepositAdd = depositId === 'new'
      && this.showDepositsDetail
      && this.selectedDepositId === 'new';
    this.selectedDepositId = depositId;
    if (reopeningDepositAdd) {
      this.depositDetailInstance++;
    }
    this.showDepositsDetail = true;
  }

  onDepositBack(): void {
    this.showDepositsDetail = false;
    this.selectedDepositId = null;
    this.selectedDeposit = null;
    this.depositsProperty = null;
  }

  onDepositSaved(): void {
    this.onDepositBack();
    this.depositsRefreshTrigger++;
    this.onJournalEntriesChanged();
  }

  onTransferSelect(selection: TransferSelection): void {
    const transferId = selection?.transferId ?? null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;

    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
    this.syncBillsSearchRequest();

    this.selectedTransfer = selection?.transfer ?? null;

    const propertyStub = this.buildBillsReceiptPropertyStub(resolvedOfficeId);
    if (propertyId) {
      propertyStub.propertyId = propertyId;
      const cachedProperty = this.glProperties.find(property => property.propertyId === propertyId);
      if (cachedProperty?.propertyCode) {
        propertyStub.propertyCode = cachedProperty.propertyCode;
      }
    }

    this.selectedTabIndex = this.tabBankActivities;
    this.selectedBankActivityKind = 'transfers';
    this.transfersProperty = propertyStub;
    const reopeningTransferAdd = transferId === 'new'
      && this.showTransfersDetail
      && this.selectedTransferId === 'new';
    this.selectedTransferId = transferId;
    if (reopeningTransferAdd) {
      this.transferDetailInstance++;
    }
    this.showTransfersDetail = true;
  }

  onTransferBack(): void {
    this.showTransfersDetail = false;
    this.selectedTransferId = null;
    this.selectedTransfer = null;
    this.transfersProperty = null;
  }

  onTransferSaved(): void {
    this.onTransferBack();
    this.transfersRefreshTrigger++;
    this.onJournalEntriesChanged();
  }

  onTransferReportSelect(selection: TransferSelection): void {
    const transferId = (selection?.transferId || '').trim();
    if (!transferId) {
      return;
    }

    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;
    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
      this.syncBillsSearchRequest();
    }

    this.selectedTransferReportId = transferId;
    this.selectedTransferReport = selection?.transfer ?? null;
    this.selectedTabIndex = this.tabBankActivities;
    this.selectedBankActivityKind = 'transferReport';
    this.showTransferReportDetail = true;
  }

  onTransferReportBack(): void {
    this.showTransferReportDetail = false;
    this.selectedTransferReportId = null;
    this.selectedTransferReport = null;
  }

  onEscrowTransferNavigate(): void {
    this.onTransferReportBack();
    this.selectBankActivity('transferReport');
  }

  onTransferReportPosted(transfer: TransferResponse): void {
    this.selectedTransferReport = transfer;
    this.onJournalEntriesChanged();
  }

  buildBillsReceiptPropertyStub(officeId: number | null): PropertyResponse {
    const resolvedOfficeId = officeId ?? 0;
    const officeName = this.offices.find(office => office.officeId === resolvedOfficeId)?.name ?? '';
    return {
      propertyId: '',
      organizationId: this.organizationId,
      propertyCode: '',
      officeId: resolvedOfficeId,
      officeName,
      isActive: true
    } as PropertyResponse;
  }

  onOwnersUtilityReceiptSelect(selection: ReceiptSelection): void {
    const receiptId = selection?.receiptId ?? null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;

    if (this.selectedOfficeId !== resolvedOfficeId) {
      this.selectedOfficeId = resolvedOfficeId;
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
      this.syncBillsSearchRequest();
    }

    const propertyStub = this.buildBillsReceiptPropertyStub(resolvedOfficeId);
    if (propertyId) {
      propertyStub.propertyId = propertyId;
      const cachedProperty = this.glProperties.find(property => property.propertyId === propertyId);
      if (cachedProperty?.propertyCode) {
        propertyStub.propertyCode = cachedProperty.propertyCode;
      }
    }

    this.selectedTabIndex = this.tabOwners;
    this.selectedOwnerKind = 'utilities';
    this.ownersUtilityReceiptProperty = propertyStub;
    const reopeningOwnersUtilityReceiptAdd = receiptId === 'new'
      && this.showOwnersUtilityReceiptDetail
      && this.selectedOwnersUtilityReceiptId === 'new';
    this.selectedOwnersUtilityReceiptId = receiptId;
    if (reopeningOwnersUtilityReceiptAdd) {
      this.ownersUtilityReceiptDetailInstance++;
    }
    this.showOwnersUtilityReceiptDetail = true;
  }

  onOwnersUtilityReceiptBack(): void {
    this.showOwnersUtilityReceiptDetail = false;
    this.selectedOwnersUtilityReceiptId = null;
    this.ownersUtilityReceiptProperty = null;

    if (this.ownerStatementReturnAfterUtilityDetail) {
      this.ownerStatementReturnAfterUtilityDetail = false;
      this.selectedTabIndex = this.tabOwners;
      this.selectedOwnerKind = this.ownerStatementReturnOwnerKind;
      if (this.isOwnerReportView(this.selectedOwnerKind)) {
        this.selectedOwnerStatementReportKind = this.ownerStatementReturnReportKind;
      }
      if (this.selectedOwnerKind === 'ownerStatements') {
        this.ownersStatementsRefreshTrigger++;
      }
    }
  }

  onOwnersUtilityReceiptSaved(): void {
    const returnToStatements = this.ownerStatementReturnAfterUtilityDetail;
    this.onOwnersUtilityReceiptBack();
    if (returnToStatements) {
      if (this.selectedOwnerKind === 'ownerStatements') {
        this.ownersStatementsRefreshTrigger++;
      }
    } else {
      this.ownersUtilitiesRefreshTrigger++;
    }
  }

  onOwnersWorkOrderSelect(selection: WorkOrderSelection): void {
    this.clearWorkOrderCreateState();

    const workOrderId = selection?.workOrderId ?? null;
    const propertyId = (selection?.propertyId || '').trim() || null;
    const resolvedOfficeId = this.selectedOfficeId;

    this.selectedOwnersWorkOrder = selection?.workOrder ?? null;
    this.ownersWorkOrderProperty = propertyId
      ? this.buildOwnersWorkOrderPropertyStub(resolvedOfficeId, propertyId)
      : this.buildBillsReceiptPropertyStub(resolvedOfficeId);

    this.selectedTabIndex = this.tabOwners;
    this.selectedOwnerKind = 'workOrders';
    const reopeningOwnersWorkOrderAdd = workOrderId === 'new'
      && this.showOwnersWorkOrderDetail
      && this.selectedOwnersWorkOrderId === 'new';
    this.selectedOwnersWorkOrderId = workOrderId;
    if (reopeningOwnersWorkOrderAdd) {
      this.ownersWorkOrderDetailInstance++;
    }
    this.showOwnersWorkOrderDetail = true;
    this.cdr.detectChanges();
  }

  buildOwnersWorkOrderPropertyStub(officeId: number | null, propertyId: string): PropertyResponse {
    const stub = this.buildBillsReceiptPropertyStub(officeId);
    return {
      ...stub,
      propertyId
    } as PropertyResponse;
  }

  onOwnersWorkOrderBack(): void {
    this.showOwnersWorkOrderDetail = false;
    this.selectedOwnersWorkOrderId = null;
    this.selectedOwnersWorkOrder = null;
    this.ownersWorkOrderProperty = null;

    if (this.ownerStatementReturnAfterWorkOrderDetail) {
      this.ownerStatementReturnAfterWorkOrderDetail = false;
      this.selectedTabIndex = this.tabOwners;
      this.selectedOwnerKind = this.ownerStatementReturnOwnerKind;
      if (this.isOwnerReportView(this.selectedOwnerKind)) {
        this.selectedOwnerStatementReportKind = this.ownerStatementReturnReportKind;
      }
      if (this.selectedOwnerKind === 'ownerStatements') {
        this.ownersStatementsRefreshTrigger++;
      }
    }
  }

  onOwnersWorkOrderSaved(): void {
    const returnToStatements = this.ownerStatementReturnAfterWorkOrderDetail;
    this.onOwnersWorkOrderBack();
    if (returnToStatements) {
      if (this.selectedOwnerKind === 'ownerStatements') {
        this.ownersStatementsRefreshTrigger++;
      }
    } else {
      this.ownersWorkOrdersRefreshTrigger++;
    }
  }

  onWorkOrderPreviewOpen(selection: WorkOrderPreviewSelection): void {
    const workOrderId = (selection?.workOrderId || '').trim();
    if (!workOrderId) {
      return;
    }

    this.workOrderCreateReturnToDetail = !!selection.returnToDetail || this.showOwnersWorkOrderDetail;
    this.workOrderCreateContext = {
      workOrderId,
      propertyId: selection.propertyId ?? null,
      reservationId: selection.reservationId ?? null,
      officeId: selection.officeId ?? this.selectedOfficeId ?? null,
      propertyCode: (selection.propertyCode || '').trim()
    };
    this.showWorkOrderCreate = true;
    this.workOrderCreateInstance++;
    this.showOwnersWorkOrderDetail = false;
    this.selectedOwnersWorkOrderId = null;
    this.ownersWorkOrderProperty = null;
    this.selectedTabIndex = this.tabOwners;
    this.selectedOwnerKind = 'workOrders';
    this.cdr.markForCheck();
  }

  onWorkOrderCreateBack(): void {
    const returnToDetail = this.workOrderCreateReturnToDetail;
    const workOrderId = this.workOrderCreateContext?.workOrderId ?? null;
    const propertyId = this.workOrderCreateContext?.propertyId ?? null;

    this.clearWorkOrderCreateState();

    if (returnToDetail && workOrderId) {
      this.onOwnersWorkOrderSelect({
        workOrderId,
        propertyId,
        officeId: this.selectedOfficeId
      });
    }
  }

clearWorkOrderCreateState(): void {
    this.showWorkOrderCreate = false;
    this.workOrderCreateContext = null;
    this.workOrderCreateReturnToDetail = false;
  }

  onOwnerStatementActivityLinkSelect(selection: OwnerStatementActivityLinkSelection): void {
    const activityId = (selection?.activityId || '').trim();
    const activityCode = (selection?.activityCode || '').trim();
    const activityType = (selection?.activityType || '').trim().toLowerCase();
    const propertyId = (selection?.propertyId || '').trim() || null;
    const officeId = selection?.officeId ?? this.selectedOfficeId ?? null;
    const resolvedOfficeId = officeId != null && Number.isFinite(Number(officeId)) ? Number(officeId) : null;
    if (!activityCode && !activityType) {
      return;
    }

    if (/^JE/i.test(activityCode)) {
      this.openOwnerStatementJournalEntryByCode(activityCode, activityId || null);
      return;
    }

    if (activityType === 'workorder') {
      this.openOwnerStatementWorkOrder(activityId, activityCode, propertyId);
      return;
    }

    if (activityType === 'bill' || activityType === 'receipt') {
      this.openOwnerStatementReceipt(activityId, activityCode, resolvedOfficeId, propertyId);
      return;
    }

    if (activityType === 'reservation' || activityType === 'invoice') {
      this.openOwnerStatementInvoice(activityId, activityCode, resolvedOfficeId);
      return;
    }

    if (/^WO-/i.test(activityCode)) {
      this.openOwnerStatementWorkOrder(activityId, activityCode, propertyId);
      return;
    }

    if (/^RC/i.test(activityCode)) {
      this.openOwnerStatementReceipt(activityId, activityCode, resolvedOfficeId, propertyId);
      return;
    }

    if (/^R-\d+/i.test(activityCode)) {
      this.openOwnerStatementInvoice(activityId, activityCode, resolvedOfficeId);
    }
  }

openOwnerStatementJournalEntryByCode(journalEntryCode: string, journalEntryLineId: string | null): void {
    this.generalLedgerService.getJournalEntryByCode(journalEntryCode).pipe(take(1)).subscribe({
      next: journalEntry => {
        if (!journalEntry?.journalEntryId) {
          this.toastr.error('Unable to locate journal entry by code.', 'Error');
          return;
        }

        this.selectedTabIndex = this.tabOwners;
        this.showOwnerStatementJournalEntryLines = true;
        this.activeJournalEntryId = journalEntry.journalEntryId;
        this.selectedJournalEntryLineId = journalEntryLineId;
        this.showGeneralLedgerDetail = true;
      },
      error: () => this.toastr.error('Unable to locate journal entry by code.', 'Error')
    });
  }

  onOwnersStatementViewStateChange(viewState: OwnerStatementListViewState): void {
    this.ownersStatementViewState = viewState;
  }

  onOwnerStatementMonthLineView(line: OwnerStatementMonthLineListDisplay): void {
    this.selectedOwnerStatementMonthLine = line;
  }

  onOwnerStatementCreateBack(): void {
    this.selectedOwnerStatementMonthLine = null;
  }

  onInvoicePreviewOpen(selection: InvoicePreviewSelection): void {
    const invoiceId = (selection?.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    this.invoiceCreateReturnToEditor = !!selection.returnToEditor || !!this.activeInvoiceId;
    this.invoiceCreateContext = {
      invoiceId,
      invoiceCode: selection.invoiceCode ?? null,
      officeId: selection.officeId ?? this.selectedOfficeId,
      reservationId: selection.reservationId ?? this.selectedReservationId,
      companyId: selection.companyId ?? this.selectedCompanyId,
      returnToEditor: this.invoiceCreateReturnToEditor
    };
    this.showInvoiceCreate = true;
    this.invoiceCreateInstance++;
    this.selectedTabIndex = 0;
    this.cdr.markForCheck();
  }

  onInvoiceCreateBack(): void {
    const returnToEditor = this.invoiceCreateReturnToEditor;
    const invoiceId = this.invoiceCreateContext?.invoiceId ?? this.activeInvoiceId;

    this.showInvoiceCreate = false;
    this.invoiceCreateContext = null;
    this.invoiceCreateReturnToEditor = false;

    if (returnToEditor && invoiceId) {
      this.activeInvoiceId = invoiceId;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { invoiceId, tab: 'invoices' },
        queryParamsHandling: 'merge'
      });
    }

    this.cdr.markForCheck();
  }

  onOwnerStatementAmountDrillDownSelect(selection: OwnerStatementJournalEntryLineSearchRequest): void {
    this.selectedTabIndex = this.tabOwners;
    this.ownerStatementJournalEntryLineRequest = {
      officeIds: [...(selection.officeIds || [])],
      ownerId: selection.ownerId,
      propertyId: selection.propertyId ?? null,
      metric: selection.metric,
      startDate: this.billsSearchRequest.startDate ?? null,
      endDate: this.billsSearchRequest.endDate ?? null
    };
    this.showOwnerStatementJournalEntryLines = true;
    this.showGeneralLedgerDetail = false;
    this.activeJournalEntryId = null;
    this.selectedJournalEntryLineId = null;
    this.ownerStatementJournalEntryLinesRefreshTrigger++;
  }

  onOwnerStatementJournalEntryLinesBack(): void {
    this.showOwnerStatementJournalEntryLines = false;
    this.ownerStatementJournalEntryLineRequest = null;
    this.ownerStatementJournalEntryLinesRefreshTrigger = 0;
    this.showGeneralLedgerDetail = false;
    this.activeJournalEntryId = null;
    this.selectedJournalEntryLineId = null;
  }

openOwnerStatementInvoice(activityId: string, invoiceCode: string, officeId: number | null, invoice?: InvoiceResponse | null): void {
    const openInvoice = (invoiceId: string, prefetchedInvoice: InvoiceResponse | null = null) => {
      this.captureOwnerStatementReturnContext();
      this.ownerStatementReturnAfterInvoiceDetail = true;
      this.selectedTabIndex = 0;
      this.selectedInvoice = prefetchedInvoice;
      this.activeInvoiceId = invoiceId;
      this.selectedOfficeId = officeId;
      this.syncBillsSearchRequest();
    };

    if (activityId) {
      openInvoice(activityId, invoice ?? null);
      return;
    }

    const officeIds = officeId != null ? [officeId] : (this.billsSearchRequest?.officeIds || []).filter(id => id > 0);
    if (officeIds.length === 0) {
      this.toastr.error('Unable to resolve invoice office scope.', 'Error');
      return;
    }

    this.invoiceService.getInvoiceByCode(invoiceCode, officeIds).pipe(take(1)).subscribe({
      next: invoice => {
        if (!invoice?.invoiceId) {
          this.toastr.error('Unable to locate invoice by code.', 'Error');
          return;
        }

        openInvoice(invoice.invoiceId, invoice);
      },
      error: () => this.toastr.error('Unable to locate invoice by code.', 'Error')
    });
  }

openOwnerStatementReceipt(activityId: string, receiptCode: string, officeId: number | null, propertyId: string | null): void {
    if (activityId) {
      this.captureOwnerStatementReturnContext();
      this.ownerStatementReturnAfterUtilityDetail = true;
      this.onOwnersUtilityReceiptSelect({ receiptId: activityId, officeId, propertyId });
      return;
    }

    if (!propertyId) {
      this.toastr.error('Unable to locate receipt without property.', 'Error');
      return;
    }

    this.receiptService.getReceiptsByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: receipts => {
        const matched = (receipts || []).find(receipt =>
          (receipt.receiptCode || '').trim().toLowerCase() === receiptCode.toLowerCase()
          || (receipt.billNumber || '').trim().toLowerCase() === receiptCode.toLowerCase()
        );
        if (!matched?.receiptId) {
          this.toastr.error('Unable to locate receipt by code.', 'Error');
          return;
        }

        this.captureOwnerStatementReturnContext();
        this.ownerStatementReturnAfterUtilityDetail = true;
        this.onOwnersUtilityReceiptSelect({ receiptId: matched.receiptId, officeId, propertyId, receipt: matched });
      },
      error: () => this.toastr.error('Unable to locate receipt by code.', 'Error')
    });
  }

openOwnerStatementWorkOrder(activityId: string, workOrderCode: string, propertyId: string | null): void {
    if (activityId) {
      this.captureOwnerStatementReturnContext();
      this.ownerStatementReturnAfterWorkOrderDetail = true;
      this.onOwnersWorkOrderSelect({ workOrderId: activityId, propertyId });
      return;
    }

    if (!propertyId) {
      this.toastr.error('Unable to locate work order without property.', 'Error');
      return;
    }

    this.workOrderService.getWorkOrdersByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: workOrders => {
        const matched = (workOrders || []).find(workOrder =>
          (workOrder.workOrderCode || '').trim().toLowerCase() === workOrderCode.toLowerCase()
        );
        if (!matched?.workOrderId) {
          this.toastr.error('Unable to locate work order by code.', 'Error');
          return;
        }

        this.captureOwnerStatementReturnContext();
        this.ownerStatementReturnAfterWorkOrderDetail = true;
        this.onOwnersWorkOrderSelect({ workOrderId: matched.workOrderId, propertyId });
      },
      error: () => this.toastr.error('Unable to locate work order by code.', 'Error')
    });
  }
  //#endregion

  //#region Tab Selection
  onDropdownTabLabelClick(event: Event): void {
    event.stopPropagation();
  }

  onDropdownTabButtonClick(event: Event, trigger: MatMenuTrigger): void {
    event.stopPropagation();
    event.preventDefault();
    trigger.openMenu();
  }

  isDropdownTabIndex(tabIndex: number): boolean {
    return tabIndex === this.tabBillsReceipts
      || tabIndex === this.tabBankActivities
      || tabIndex === this.tabOwners
      || tabIndex === this.tabReports
      || tabIndex === this.tabGeneralLedger;
  }

  openDropdownTabMenu(tabIndex: number): void {
    switch (tabIndex) {
      case this.tabBillsReceipts:
        this.billsReceiptsMenuTrigger?.openMenu();
        break;
      case this.tabBankActivities:
        this.bankActivitiesMenuTrigger?.openMenu();
        break;
      case this.tabOwners:
        this.ownersMenuTrigger?.openMenu();
        break;
      case this.tabReports:
        this.reportsMenuTrigger?.openMenu();
        break;
      case this.tabGeneralLedger:
        this.generalLedgerMenuTrigger?.openMenu();
        break;
    }
  }

  onMatTabSelected(event: { index: number }): void {
    if (this.skipNextDropdownTabMenuOpen) {
      this.skipNextDropdownTabMenuOpen = false;
      return;
    }

    if (this.isDropdownTabIndex(event.index)) {
      if (this.selectedTabIndex !== event.index) {
        this.onTabChange(event);
        return;
      }
      this.openDropdownTabMenu(event.index);
      this.cdr.markForCheck();
      return;
    }

    this.onTabChange(event);
  }

  onTabChange(event: { index: number }): void {
    this.skipNextDropdownTabMenuOpen = true;
    if (!this.hasAccountingFullAccess && event.index > this.tabMaxIndexLimited) {
      this.selectedTabIndex = 0;
      return;
    }

    // Ignore re-emits for the already-selected tab (mat-tab can fire these during content swaps).
    if (event.index === this.selectedTabIndex && !!this.activeInvoiceId) {
      return;
    }

    const leavingInvoicesTab = event.index !== 0;
    const hadInvoiceDetail = !!this.activeInvoiceId
      || this.showInvoiceCreate
      || !!this.route.snapshot.paramMap.get('id');

    if (leavingInvoicesTab) {
      this.clearInvoiceShellDetailState();
    }

    if (event.index !== this.tabBillsReceipts) {
      this.onBillsReceiptBack();
      this.onReceiptsReceiptBack();
    }
    if (event.index !== this.tabOwners) {
      this.selectedOwnerStatementMonthLine = null;
      this.onOwnersUtilityReceiptBack();
      this.onOwnersWorkOrderBack();
      this.onOwnerStatementJournalEntryLinesBack();
      this.clearWorkOrderCreateState();
    }
    if (event.index !== this.tabBankActivities && !this.usesReportTitleBarFilters()) {
      this.onGeneralLedgerBack();
      this.onDepositBack();
      this.onTransferBack();
      this.onTransferReportBack();
      this.onSecurityDepositReportBack();
    }
    if (event.index !== this.tabReports) {
      this.isFinancialReportDrillDownActive = false;
      this.isFinancialReportJournalEntryDetailActive = false;
      this.isArAgingDrillDownActive = false;
    }
    if (event.index !== this.tabReports && event.index !== this.tabOwners) {
      this.isApAgingDrillDownActive = false;
    } else if (event.index === this.tabReports && !this.isApAgingReportKind(this.selectedReportKind)) {
      this.isApAgingDrillDownActive = false;
    } else if (event.index === this.tabOwners && this.selectedOwnerKind !== 'apAging') {
      this.isApAgingDrillDownActive = false;
    }
    this.clearInactiveDropdownSelections(event.index);
    this.selectedTabIndex = event.index;
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === this.tabBillsReceipts) {
      this.refreshActiveBillsReceiptList();
    }
    if (this.selectedTabIndex === this.tabBankActivities) {
      this.refreshActiveBankActivityList();
    }
    if (this.selectedTabIndex === this.tabOwners) {
      this.refreshActiveOwnerView();
    }
    if (this.usesFinancialReportTitleBarFilters() || this.isReconcileAccountReportActive()) {
      this.financialReportsRefreshTrigger++;
      if (this.usesFinancialReportTitleBarFilters()) {
        queueMicrotask(() => this.syncFinancialReportDrillDownActiveState());
      }
    }
    if (this.selectedTabIndex === this.tabReports && this.selectedReportKind === 'arAging') {
      this.financialReportsRefreshTrigger++;
    }
    if (this.usesGeneralLedgerTitleBarFilters()) {
      if (!('chartOfAccountId' in this.route.snapshot.queryParams)) {
        this.selectedChartOfAccountId = null;
      }
      this.syncGlFiltersFromInvoiceContext();
      this.refreshPropertyOptions();
      this.refreshReservationOptions();
      this.refreshGeneralLedgerListView();
    }

    const shellQueryParams = this.buildShellQueryParams({ tab: String(event.index) });
    if (leavingInvoicesTab && hadInvoiceDetail) {
      this.navigateAccountingShellListUrl(shellQueryParams);
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: shellQueryParams,
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }

  selectBillsReceipt(kind: AccountingShellBillsReceiptKind): void {
    this.billsReceiptsMenuTrigger?.closeMenu();
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedBillsReceiptKind !== kind;
    const rentRollDatesChanged = kind === 'rentRoll' ? this.applyRentRollMonthDateRange() : false;

    if (kindChanged) {
      if (this.selectedBillsReceiptKind === 'bills') {
        this.onBillsReceiptBack();
      } else if (this.selectedBillsReceiptKind === 'receipts') {
        this.onReceiptsReceiptBack();
      }
    }

    this.selectedBillsReceiptKind = kind;

    if (previousTab !== this.tabBillsReceipts) {
      this.onTabChange({ index: this.tabBillsReceipts });
      return;
    }

    if (kindChanged) {
      this.refreshActiveBillsReceiptList();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ billsReceipt: kind }),
        queryParamsHandling: 'merge'
      });
      return;
    }

    if (kind === 'rentRoll' && rentRollDatesChanged) {
      this.publishDateRangeState();
    }
    this.persistPinnedTopBarIfActive();
  }

  selectBankActivity(kind: AccountingShellBankActivityKind): void {
    this.bankActivitiesMenuTrigger?.closeMenu();
    if (kind === 'reconcile') {
      this.activateBankActivity('reconcile');
      this.openBeginReconciliationDialog();
      return;
    }

    this.activateBankActivity(kind);
  }

activateBankActivity(kind: AccountingShellBankActivityKind): void {
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedBankActivityKind !== kind;

    if (kindChanged) {
      this.onGeneralLedgerBack();
      this.onDepositBack();
      this.onTransferBack();
      this.onTransferReportBack();
      this.onSecurityDepositReportBack();
    }

    this.selectedBankActivityKind = kind;

    if (previousTab !== this.tabBankActivities) {
      this.onTabChange({ index: this.tabBankActivities });
      return;
    }

    this.syncBillsSearchRequest();
    this.refreshActiveBankActivityList();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ bankActivity: kind }),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }

  selectOwnerKind(kind: AccountingShellOwnerKind): void {
    this.ownersMenuTrigger?.closeMenu();
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedOwnerKind !== kind;
    const statementDatesChanged = this.isOwnerReportView(kind) ? this.applyOwnerStatementsMonthDateRange() : false;

    if (kindChanged) {
      this.selectedOwnerStatementMonthLine = null;
      this.onOwnersUtilityReceiptBack();
      this.onOwnersWorkOrderBack();
      this.onOwnerStatementJournalEntryLinesBack();
      this.clearWorkOrderCreateState();
    }

    this.selectedOwnerKind = kind;

    if (kindChanged && kind === 'statements') {
      this.selectedOwnerStatementReportKind = 'accrual';
    }

    if (kindChanged && kind === 'apAging') {
      this.isApAgingDrillDownActive = false;
      this.syncArAgingAsOfDateFromFilters();
    }

    if (kindChanged && kind === 'escrow') {
      this.ensureDefaultAsOfDates();
    }

    if (previousTab !== this.tabOwners) {
      this.onTabChange({ index: this.tabOwners });
      return;
    }

    if (kindChanged) {
      this.refreshActiveOwnerView();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ ownerKind: kind }),
        queryParamsHandling: 'merge'
      });
      return;
    }

    if (statementDatesChanged) {
      this.refreshActiveOwnerView();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ ownerKind: kind }),
        queryParamsHandling: 'merge'
      });
    }
    this.persistPinnedTopBarIfActive();
  }

  selectGeneralLedgerKind(kind: AccountingShellGeneralLedgerKind): void {
    this.generalLedgerMenuTrigger?.closeMenu();
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedGeneralLedgerKind !== kind;

    if (kindChanged) {
      this.onGeneralLedgerBack();
      if (kind === 'recap') {
        this.selectedChartOfAccountId = null;
      }
    }

    this.selectedGeneralLedgerKind = kind;

    if (previousTab !== this.tabGeneralLedger) {
      this.onTabChange({ index: this.tabGeneralLedger });
      return;
    }

    if (kind !== 'recap') {
      this.refreshGeneralLedgerListView();
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ glView: kind }),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }

  selectReport(kind: AccountingShellReportKind): void {
    this.reportsMenuTrigger?.closeMenu();
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedReportKind !== kind;
    if (
      kindChanged
      && (kind === 'reconcileAccountSummary' || kind === 'reconcileAccountDetail')
      && !this.preserveReconcileAccountReportContext
    ) {
      this.reconcileAccountReportContext = null;
    }
    this.selectedReportKind = kind;

    if (previousTab !== this.tabReports) {
      this.onTabChange({ index: this.tabReports });
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ tab: String(this.tabReports), report: kind, bankActivity: null }),
        queryParamsHandling: 'merge'
      });
      this.persistPinnedTopBarIfActive();
      if (kind === 'reconcileAccountSummary' || kind === 'reconcileAccountDetail') {
        this.loadReconcileHistoryForSelectedAccount();
      }
      return;
    }

    if (kind === 'arAging' || this.isApAgingReportKind(kind)) {
      this.isFinancialReportDrillDownActive = false;
      this.isFinancialReportJournalEntryDetailActive = false;
      this.isArAgingDrillDownActive = false;
      this.isApAgingDrillDownActive = false;
      this.syncArAgingAsOfDateFromFilters();
      if (kindChanged) {
        this.financialReportsRefreshTrigger++;
      }
    } else if (kind === 'reconcileAccountSummary' || kind === 'reconcileAccountDetail') {
      this.isFinancialReportDrillDownActive = false;
      this.isFinancialReportJournalEntryDetailActive = false;
      this.isArAgingDrillDownActive = false;
      this.isApAgingDrillDownActive = false;
      if (kindChanged) {
        this.loadReconcileHistoryForSelectedAccount();
      }
    } else if (kindChanged) {
      if (kind === 'balanceSheet') {
        this.ensureDefaultAsOfDates();
      }
      this.financialReportsRefreshTrigger++;
      queueMicrotask(() => this.syncFinancialReportDrillDownActiveState());
    }

    if (kindChanged) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ report: kind }),
        queryParamsHandling: 'merge'
      });
    }
    this.persistPinnedTopBarIfActive();
  }

  refreshActiveBillsReceiptList(): void {
    if (this.selectedBillsReceiptKind === 'bills') {
      this.billsRefreshTrigger++;
      return;
    }
    if (this.selectedBillsReceiptKind === 'receipts') {
      this.receiptsRefreshTrigger++;
      return;
    }
    this.rentRollRefreshTrigger++;
  }

  refreshActiveBankActivityList(): void {
    if (this.selectedBankActivityKind === 'printChecks') {
      this.printChecksRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'securityDeposits') {
      this.securityDepositsRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'deposits') {
      this.depositsRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'transfers') {
      this.transfersRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'transferReport') {
      this.transferReportRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'undepositedFunds') {
      this.undepositedFundsRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'untransferredFunds') {
      this.untransferredFundsRefreshTrigger++;
      return;
    }
    if (this.selectedBankActivityKind === 'reconcile') {
      this.reconcileRefreshTrigger++;
    }
  }

  refreshListsForActiveTab(): void {
    if (this.selectedTabIndex === this.tabBillsReceipts) {
      this.refreshActiveBillsReceiptList();
    }
    if (this.selectedTabIndex === this.tabBankActivities) {
      this.refreshActiveBankActivityList();
    }
    if (this.selectedTabIndex === this.tabOwners) {
      this.refreshActiveOwnerView();
    }
    if (this.usesFinancialReportTitleBarFilters() || this.isReconcileAccountReportActive()) {
      this.financialReportsRefreshTrigger++;
    }
    if (this.usesArAgingTitleBarFilters()) {
      this.financialReportsRefreshTrigger++;
    }
    if (this.usesGeneralLedgerTitleBarFilters()) {
      this.refreshGeneralLedgerListView();
    }
    this.cdr.markForCheck();
  }

  refreshActiveOwnerView(): void {
    if (this.selectedOwnerKind === 'workOrders') {
      this.ownersWorkOrdersRefreshTrigger++;
      return;
    }
    if (this.selectedOwnerKind === 'utilities') {
      this.ownersUtilitiesRefreshTrigger++;
      return;
    }
    if (this.selectedOwnerKind === 'apAging') {
      this.syncApAgingReportFilters();
      this.financialReportsRefreshTrigger++;
      return;
    }
    if (this.selectedOwnerKind === 'escrow') {
      this.ownersStatementsRefreshTrigger++;
      return;
    }
    if (this.isOwnerReportView(this.selectedOwnerKind) || this.selectedOwnerKind === 'ownerStatements') {
      return;
    }
    this.ownersStatementsRefreshTrigger++;
  }

  onOwnerStatementReportKindChange(kind: OwnerStatementReportKind): void {
    if (this.selectedOwnerStatementReportKind === kind) {
      return;
    }

    this.selectedOwnerStatementReportKind = kind;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ ownerReport: kind }),
      queryParamsHandling: 'merge'
    });
  }

  onOwnerReportGoClick(): void {
    if (!this.showOwnerReportGoButton || this.isOwnerReportsLoading) {
      return;
    }
    this.syncOwnerReportsBundleSearchRequest();

    if (this.billsSearchRequest.officeIds.length === 0) {
      this.toastr.warning('Select an office before running the report.');
      return;
    }

    const startDate = this.billsSearchRequest.startDate;
    const endDate = this.billsSearchRequest.endDate;
    if (this.isOwnerEscrowViewActive) {
      if (!endDate) {
        this.toastr.warning('As of date is required.');
        return;
      }
    } else if (!startDate || !endDate) {
      this.toastr.warning('Start Date and End Date are required.');
      return;
    } else if (startDate > endDate) {
      this.toastr.warning('End Date must be on or after Start Date.');
      return;
    }

    this.ownerReportsCacheService.clear();
    this.isOwnerReportsLoading = true;
    this.ownersStatementsRefreshTrigger++;
    this.generalLedgerRefreshTrigger++;
    this.cdr.markForCheck();
    this.ownerReportsCacheService.load(this.billsSearchRequest).pipe(
      take(1),
      finalize(() => {
        this.isOwnerReportsLoading = false;
        this.ownersStatementsRefreshTrigger++;
        this.generalLedgerRefreshTrigger++;
        this.cdr.markForCheck();
      })
    ).subscribe({
      error: (error: HttpErrorResponse) => {
        this.ownerReportsCacheService.clear();
        const message = this.utilityService.extractApiErrorMessage(error);
        if (/timeout/i.test(message)) {
          this.toastr.error(
            'The report took too long to generate. Try a shorter date range or narrow filters.',
            CommonMessage.ServiceError
          );
          return;
        }

        this.toastr.error(message || 'Unable to load owner reports.', CommonMessage.ServiceError);
      }
    });
  }

  syncOwnerReportsBundleSearchRequest(): void {
    this.syncInvoiceSearchDateRange();
    const propertyId = this.selectedTabIndex === this.tabGeneralLedger && this.selectedGeneralLedgerKind === 'recap'
      ? this.selectedGlPropertyId
      : this.selectedBillsPropertyId;

    if (this.isOwnerEscrowViewActive) {
      this.billsSearchRequest = {
        officeIds: this.resolveOfficeIdsForOwnerReportsSearch(),
        propertyId: propertyId || null,
        startDate: this.utilityService.formatDateOnlyForApi(this.asOfStart),
        endDate: this.utilityService.formatDateOnlyForApi(this.asOfDate)
      };
      return;
    }

    this.billsSearchRequest = {
      officeIds: this.resolveOfficeIdsForOwnerReportsSearch(),
      propertyId: propertyId || null,
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  resolveOfficeIdsForOwnerReportsSearch(): number[] {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      return [this.selectedOfficeId];
    }

    return [];
  }

refreshGeneralLedgerListView(): void {
    if (this.selectedTabIndex !== this.tabGeneralLedger || this.selectedGeneralLedgerKind !== 'ledger') {
      return;
    }
    this.generalLedgerRefreshTrigger++;
  }

ensureDateRangeIncludesTransactionDate(transactionDate: string): void {
    const date = this.utilityService.parseDateOnlyStringToDate(transactionDate);
    if (!date) {
      return;
    }

    date.setHours(0, 0, 0, 0);
    let changed = false;

    if (!this.startDate || date.getTime() < this.startDate.getTime()) {
      this.startDate = new Date(date);
      changed = true;
    }

    if (!this.endDate || date.getTime() > this.endDate.getTime()) {
      this.endDate = new Date(date);
      changed = true;
    }

    if (!changed) {
      return;
    }

    this.normalizeDateRangeValues();
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
  }
  //#endregion

  //#region Reconcile
  openBeginReconciliationDialog(): void {
    if (this.selectedOfficeId == null || this.selectedOfficeId <= 0) {
      this.toastr.warning('Select an office before reconciling.');
      return;
    }

    const selectedAccount = this.resolveSelectedReconcileChartOfAccount();

    this.dialog.open(BeginReconciliationDialogComponent, {
      width: '95vw',
      maxWidth: '56rem',
      maxHeight: '95vh',
      panelClass: 'accounting-form-dialog-panel',
      data: {
        organizationId: this.organizationId,
        officeId: this.selectedOfficeId,
        accountOptions: this.shellReconcileChartOfAccountTitleBarOptions,
        adjustmentAccountOptions: this.shellChartOfAccountTitleBarOptions,
        accountReconcileDefaults: this.buildReconcileAccountDefaults(),
        defaultChartOfAccountId: this.selectedChartOfAccountId,
        defaultStatementDate: this.endDate ?? this.utilityService.parseCalendarDateInput(selectedAccount?.statementDate ?? null),
        existingSetup: this.reconcileSetup
      }
    }).afterClosed().pipe(take(1)).subscribe((result?: BeginReconciliationDialogResult) => {
      if (!result) {
        return;
      }

      this.applyBeginReconciliationResult(result);
    });
  }

applyBeginReconciliationResult(result: BeginReconciliationDialogResult): void {
    this.reconcileSetup = result;
    this.selectedChartOfAccountId = result.chartOfAccountId;
    const statementDate = this.utilityService.parseCalendarDateInput(result.statementDate);
    if (statementDate) {
      this.endDate = statementDate;
    }

    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
    this.reconcileRefreshTrigger++;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
    this.cdr.markForCheck();
  }

  onReconcileLeave(): void {
    const setup = this.reconcileSetup;
    this.reconcileSetup = null;

    if (setup) {
      this.reconcileAccountReportContext = {
        endingBalance: setup.endingBalance
      };
      this.selectedChartOfAccountId = setup.chartOfAccountId;
      const statementDate = this.utilityService.parseCalendarDateInput(setup.statementDate);
      if (statementDate) {
        this.endDate = statementDate;
        this.syncInvoiceSearchDateRange();
      }
    }

    this.openReconcileAccountReport(this.reconcileLeaveReportView ?? 'detail');
    this.reconcileLeaveReportView = null;
    this.loadReconcileHistoryForSelectedAccount();
  }

  onReconcileAccountReportViewChange(view: 'summary' | 'detail'): void {
    this.selectReport(view === 'detail' ? 'reconcileAccountDetail' : 'reconcileAccountSummary');
  }

loadReconcileHistoryForSelectedAccount(): void {
    if (!this.isReconcileAccountReportActive()) {
      return;
    }

    const officeId = this.selectedOfficeId;
    const accountId = this.selectedChartOfAccountId;
    if (officeId == null || officeId <= 0 || accountId == null || accountId <= 0) {
      this.clearReconcileHistorySelection(true);
      return;
    }

    this.reconcileService.getReconcilesByAccountId(officeId, accountId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: rows => {
        const seenStatementDates = new Set<string>();
        this.reconcileHistoryRows = (rows ?? []).filter(row => {
          if (!row.statementDate || seenStatementDates.has(row.statementDate)) {
            return false;
          }
          seenStatementDates.add(row.statementDate);
          return true;
        });
        this.shellReconcileStatementDateOptions = this.reconcileHistoryRows.map(row => ({
          value: row.reconcileId,
          label: this.formatterService.formatDateString(row.statementDate ?? undefined) || row.statementDate || ''
        }));

        if (!this.reconcileHistoryRows.length) {
          this.clearReconcileHistorySelection(true);
          return;
        }

        const preferredApiDate = this.utilityService.formatDateOnlyForApi(this.endDate);
        const preferred = preferredApiDate
          ? this.reconcileHistoryRows.find(row => row.statementDate === preferredApiDate) ?? null
          : null;
        const selected = preferred
          ?? (this.selectedReconcileId != null
            ? this.reconcileHistoryRows.find(row => row.reconcileId === this.selectedReconcileId) ?? null
            : null)
          ?? this.reconcileHistoryRows[0];
        this.applyReconcileHistorySelection(selected, true);
      },
      error: () => {
        this.clearReconcileHistorySelection(true);
        this.toastr.error('Unable to load reconciliation history for the selected account.');
      }
    });
  }

applyReconcileHistorySelection(reconcile: ReconcileResponse | null, refreshReport: boolean): void {
    if (!reconcile) {
      this.clearReconcileHistorySelection(refreshReport);
      return;
    }

    this.selectedReconcileId = reconcile.reconcileId;
    const statementDate = this.utilityService.parseCalendarDateInput(reconcile.statementDate);
    if (statementDate) {
      this.endDate = statementDate;
      this.syncInvoiceSearchDateRange();
    }
    this.reconcileAccountReportContext = {
      endingBalance: reconcile.endingBalance
    };

    if (refreshReport) {
      this.financialReportsRefreshTrigger++;
    }
  }

clearReconcileHistorySelection(refreshReport: boolean): void {
    this.reconcileHistoryRows = [];
    this.shellReconcileStatementDateOptions = [];
    this.selectedReconcileId = null;
    this.reconcileAccountReportContext = null;

    if (refreshReport) {
      this.financialReportsRefreshTrigger++;
    }
  }

openReconcileAccountReport(view: 'summary' | 'detail'): void {
    const kind = view === 'detail' ? 'reconcileAccountDetail' : 'reconcileAccountSummary';
    this.preserveReconcileAccountReportContext = true;
    this.selectedReportKind = kind;
    this.isFinancialReportDrillDownActive = false;
    this.isFinancialReportJournalEntryDetailActive = false;
    this.isArAgingDrillDownActive = false;

    if (this.selectedTabIndex !== this.tabReports) {
      this.onTabChange({ index: this.tabReports });
    } else {
      this.financialReportsRefreshTrigger++;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ tab: String(this.tabReports), report: kind, bankActivity: null }),
      queryParamsHandling: 'merge'
    });
    this.preserveReconcileAccountReportContext = false;
    this.persistPinnedTopBarIfActive();
    this.cdr.markForCheck();
  }

  onReconcileComplete(): void {
    this.chartOfAccountsService.notifyChartOfAccountsChanged();
    this.reconcileLeaveReportView = 'summary';
  }

resolveSelectedReconcileChartOfAccount(): ChartOfAccountResponse | null {
    if (this.selectedChartOfAccountId == null) {
      return null;
    }

    return this.chartOfAccounts.find(account => account.accountId === this.selectedChartOfAccountId) ?? null;
  }

buildReconcileAccountDefaults(): { chartOfAccountId: number; endingBalance: number | null; statementDate: string | null }[] {
    return (this.chartOfAccounts || [])
      .filter(account => this.selectedOfficeId == null || account.officeId === this.selectedOfficeId)
      .map(account => ({
        chartOfAccountId: account.accountId,
        endingBalance: account.endingBalance ?? null,
        statementDate: account.statementDate ?? null
      }));
  }
  //#endregion

  //#region Date Range
  syncInvoiceSearchDateRange(): void {
    this.invoiceSearchDateRange = {
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  syncBillsSearchRequest(): void {
    this.billsSearchRequest = {
      officeIds: this.resolveOfficeIdsForBillsSearch(),
      propertyId: (this.selectedTabIndex === this.tabBillsReceipts || this.selectedTabIndex === this.tabOwners) ? this.selectedBillsPropertyId : null,
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  resolveOfficeIdsForBillsSearch(): number[] {
    if (this.selectedOfficeId != null) {
      return [this.selectedOfficeId];
    }
    return this.offices.map(office => office.officeId).filter(id => id > 0);
  }

  onDateRangeChange(): void {
    this.normalizeDateRangeValues();
    this.startDate = this.cloneShellDate(this.startDate);
    this.endDate = this.cloneShellDate(this.endDate);
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
    this.publishDateRangeState();
  }

  publishDateRangeState(): void {
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === this.tabBillsReceipts) {
      this.refreshActiveBillsReceiptList();
    }
    if (this.selectedTabIndex === this.tabBankActivities) {
      this.refreshActiveBankActivityList();
    }
    if (this.selectedTabIndex === this.tabOwners) {
      this.refreshActiveOwnerView();
    }
    if (this.usesFinancialReportTitleBarFilters() || this.isReconcileAccountReportActive()) {
      this.financialReportsRefreshTrigger++;
    }
    if (this.usesArAgingTitleBarFilters()) {
      this.syncArAgingReportFilters();
      this.financialReportsRefreshTrigger++;
    }
    if (this.usesGeneralLedgerTitleBarFilters()) {
      this.refreshGeneralLedgerListView();
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildRangeQueryParams(),
      queryParamsHandling: 'merge'
    });
  }

  buildRangeQueryParams(): Record<string, string | null> {
    return {
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  buildAsOfQueryParams(): Record<string, string | null> {
    return {
      asOfDate: this.utilityService.formatDateOnlyForApi(this.asOfDate),
      asOfStart: this.utilityService.formatDateOnlyForApi(this.asOfStart)
    };
  }
  //#endregion

  //#region Pinned Date Range
persistPinnedTopBarIfActive(): void {
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
  }

applyPinnedTopBarFields(stored: AccountingShellPinnedTopBarState): void {
    this.selectedTabIndex = stored.selectedTabIndex ?? this.selectedTabIndex;
    if (stored.selectedBillsReceiptKind) {
      this.selectedBillsReceiptKind = stored.selectedBillsReceiptKind;
    }
    if (stored.selectedBankActivityKind) {
      this.selectedBankActivityKind = stored.selectedBankActivityKind;
    }
    if ((stored.selectedOwnerKind as string | undefined) === 'securityDeposits') {
      this.selectedTabIndex = this.tabBankActivities;
      this.selectedBankActivityKind = 'securityDeposits';
    } else if (stored.selectedOwnerKind) {
      this.selectedOwnerKind = stored.selectedOwnerKind;
    }
    if (stored.selectedReportKind) {
      this.selectedReportKind = stored.selectedReportKind;
    }
    if (stored.selectedGeneralLedgerKind) {
      this.selectedGeneralLedgerKind = stored.selectedGeneralLedgerKind;
    }
    this.selectedOrganizationId = stored.organizationId ?? null;
    this.selectedOfficeId = stored.officeId ?? null;
    this.selectedCompanyId = stored.companyId ?? null;
    this.selectedReservationId = stored.reservationId ?? null;
    this.selectedBillsPropertyId = stored.billsPropertyId ?? null;
    this.selectedChartOfAccountId = stored.chartOfAccountId ?? null;
    if (stored.financialReportClass != null) {
      this.selectedFinancialReportClass = stored.financialReportClass;
    }
    if (stored.arAgingDatePreset) {
      this.selectedArAgingDatePreset = stored.arAgingDatePreset;
    }
    if (stored.arAgingIntervalDays != null) {
      this.selectedArAgingIntervalDays = stored.arAgingIntervalDays;
    }
    if (stored.arAgingThroughValue != null) {
      this.selectedArAgingThroughValue = stored.arAgingThroughValue;
    }
    if (stored.arAgingSortBy) {
      this.selectedArAgingSortBy = stored.arAgingSortBy;
    }
    if (stored.apAgingSortBy) {
      this.selectedApAgingSortBy = stored.apAgingSortBy;
    }
    this.selectedGlPropertyId = stored.glPropertyId ?? null;
    this.selectedGlReservationId = stored.glReservationId ?? null;
    this.syncArAgingReportFilters();
    this.syncArAgingAsOfDateFromFilters();
  }

  toggleDateRangePin(): void {
    this.dateRangePinned = !this.dateRangePinned;
    if (this.dateRangePinned) {
      if (this.showAccountingShellRangeDates) {
        this.onDateRangeChange();
      } else {
        this.syncAsOfStartFromAsOfDate();
        this.persistPinnedDateRange();
      }
      return;
    }
    this.clearPinnedDateRangeStorage();
    this.setDefaultDateRange();
    this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
    this.publishDateRangeState();
  }

  applyPinnedDateRangeFromStorage(): void {
    const stored = this.readPinnedDateRangeFromStorage();
    const hasRange = !!(stored?.enabled && stored.startDate && stored.endDate);
    const hasAsOf = !!(stored?.enabled && stored.asOfDate);

    if (hasRange || hasAsOf) {
      this.dateRangePinned = true;

      if (stored!.startDate) {
        const start = this.utilityService.parseCalendarDateInput(stored!.startDate);
        if (start) {
          start.setHours(0, 0, 0, 0);
          this.startDate = start;
        }
      }

      if (stored!.endDate) {
        const end = this.utilityService.parseCalendarDateInput(stored!.endDate);
        if (end) {
          end.setHours(0, 0, 0, 0);
          this.endDate = end;
        }
      }

      if (stored!.asOfDate) {
        const asOf = this.utilityService.parseCalendarDateInput(stored!.asOfDate);
        if (asOf) {
          asOf.setHours(0, 0, 0, 0);
          this.asOfDate = asOf;
        }
      }

      this.applyStoredAsOfStart(stored!.asOfStart);
      this.applyPinnedTopBarFields(stored!);
      this.syncInvoiceSearchDateRange();
      this.syncBillsSearchRequest();
      this.syncArAgingReportFilters();
      return;
    }

    if (stored?.enabled) {
      this.clearPinnedDateRangeStorage();
    }

    this.dateRangePinned = false;
    this.setDefaultDateRange();
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
  }

  persistPinnedDateRange(): void {
    if (!this.dateRangePinned) {
      return;
    }

    this.syncAsOfStartFromAsOfDate();

    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    const asOfDate = this.utilityService.formatDateOnlyForApi(this.asOfDate);
    const asOfStart = this.utilityService.formatDateOnlyForApi(this.asOfStart);
    if (this.usesAccountingShellAsOfDate && !this.showAccountingShellEndDate) {
      if (!asOfDate || !asOfStart) {
        return;
      }
    } else if (!startDate || !endDate) {
      return;
    }

    const snapshot: AccountingShellPinnedTopBarState = {
      enabled: true,
      startDate: startDate ?? '',
      endDate: endDate ?? '',
      asOfDate: asOfDate ?? undefined,
      asOfStart: asOfStart ?? undefined,
      selectedTabIndex: this.selectedTabIndex,
      selectedBillsReceiptKind: this.selectedBillsReceiptKind,
      selectedBankActivityKind: this.selectedBankActivityKind,
      selectedOwnerKind: this.selectedOwnerKind,
      selectedReportKind: this.selectedReportKind,
      selectedGeneralLedgerKind: this.selectedGeneralLedgerKind,
      organizationId: this.selectedOrganizationId,
      officeId: this.selectedOfficeId,
      companyId: this.selectedCompanyId,
      reservationId: this.selectedReservationId,
      billsPropertyId: this.selectedBillsPropertyId,
      chartOfAccountId: this.selectedChartOfAccountId,
      financialReportClass: this.selectedFinancialReportClass,
      arAgingDatePreset: this.selectedArAgingDatePreset,
      arAgingIntervalDays: this.selectedArAgingIntervalDays,
      arAgingThroughValue: this.selectedArAgingThroughValue,
      arAgingSortBy: this.selectedArAgingSortBy,
      apAgingSortBy: this.selectedApAgingSortBy,
      glPropertyId: this.selectedGlPropertyId,
      glReservationId: this.selectedGlReservationId
    };

    localStorage.setItem(this.getPinnedDateRangeStorageKey(), JSON.stringify(snapshot));
  }

  readPinnedDateRangeFromStorage(): AccountingShellPinnedTopBarState | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(this.getPinnedDateRangeStorageKey());
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as AccountingShellPinnedTopBarState;
      if (parsed?.enabled !== true) {
        return null;
      }

      const hasRange = !!parsed.startDate && !!parsed.endDate;
      const hasAsOf = !!parsed.asOfDate;
      if (!hasRange && !hasAsOf) {
        return null;
      }

      const officeId = parsed.officeId == null || parsed.officeId === undefined ? null : Number(parsed.officeId);
      const chartOfAccountId = parsed.chartOfAccountId == null || parsed.chartOfAccountId === undefined ? null : Number(parsed.chartOfAccountId);
      return {
        enabled: true,
        startDate: String(parsed.startDate || ''),
        endDate: String(parsed.endDate || ''),
        asOfDate: parsed.asOfDate ? String(parsed.asOfDate) : undefined,
        asOfStart: parsed.asOfStart ? String(parsed.asOfStart) : undefined,
        selectedTabIndex: Number.isFinite(Number(parsed.selectedTabIndex)) ? Number(parsed.selectedTabIndex) : 0,
        selectedBillsReceiptKind: parsed.selectedBillsReceiptKind,
        selectedBankActivityKind: parsed.selectedBankActivityKind,
        selectedOwnerKind: parsed.selectedOwnerKind,
        selectedReportKind: parsed.selectedReportKind,
        selectedGeneralLedgerKind: parsed.selectedGeneralLedgerKind,
        organizationId: parsed.organizationId == null || parsed.organizationId === '' ? null : String(parsed.organizationId),
        officeId: Number.isFinite(officeId) && officeId > 0 ? officeId : null,
        companyId: parsed.companyId == null || parsed.companyId === '' ? null : String(parsed.companyId),
        reservationId: parsed.reservationId == null || parsed.reservationId === '' ? null : String(parsed.reservationId),
        billsPropertyId: parsed.billsPropertyId == null || parsed.billsPropertyId === '' ? null : String(parsed.billsPropertyId),
        chartOfAccountId: Number.isFinite(chartOfAccountId) && chartOfAccountId > 0 ? chartOfAccountId : null,
        financialReportClass: parsed.financialReportClass,
        arAgingDatePreset: parsed.arAgingDatePreset,
        arAgingIntervalDays: parsed.arAgingIntervalDays,
        arAgingThroughValue: parsed.arAgingThroughValue,
        arAgingSortBy: parsed.arAgingSortBy,
        apAgingSortBy: parsed.apAgingSortBy,
        glPropertyId: parsed.glPropertyId == null || parsed.glPropertyId === '' ? null : String(parsed.glPropertyId),
        glReservationId: parsed.glReservationId == null || parsed.glReservationId === '' ? null : String(parsed.glReservationId)
      };
    } catch {
      return null;
    }
  }

  clearPinnedDateRangeStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(this.getPinnedDateRangeStorageKey());
  }

  getPinnedDateRangeStorageKey(): string {
    const userKey = this.userId?.trim() || 'anonymous';
    return `${this.pinnedDateRangeStorageKeyPrefix}-${userKey}`;
  }
  //#endregion

  //#region Get Methods
  getOfficeOptions(offices: OfficeResponse[] | null | undefined): { value: number, label: string }[] {
    return (offices || []).map(office => ({ value: office.officeId, label: office.name }));
  }

  getAccountingCompanyOptions(contacts: ContactResponse[] | null | undefined, selectedOfficeId: number | null | undefined): { value: string, label: string }[] {
    const dedupedByCompanyLabel = new Map<string, { value: string, label: string }>();
    const normalizeCompanyKey = (label: string): string => label.replace(/[^a-z0-9]/gi, '').toLowerCase();

    (contacts || [])
      .filter(contact => !!contact?.isActive)
      .filter(contact => selectedOfficeId == null || contact.officeId === selectedOfficeId || (contact.officeAccess || []).some(id => Number(id) === selectedOfficeId))
      .forEach(contact => {
        const label = this.getAccountingCompanyLabel(contact);
        if (!label) {
          return;
        }
        const dedupeKey = normalizeCompanyKey(label);

        if (!dedupedByCompanyLabel.has(dedupeKey)) {
          dedupedByCompanyLabel.set(dedupeKey, {
            value: contact.contactId,
            label
          });
          return;
        }

        const existing = dedupedByCompanyLabel.get(dedupeKey)!;
        if (label.length > existing.label.length) {
          dedupedByCompanyLabel.set(dedupeKey, {
            value: contact.contactId,
            label
          });
        }
      });

    return Array.from(dedupedByCompanyLabel.values())
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
        || a.value.localeCompare(b.value, undefined, { sensitivity: 'base' })
      )
      .map(({ value, label }) => ({ value, label }));
  }

  getAccountingCompanyLabel(contact: ContactResponse | null | undefined): string {
    return this.utilityService.getCompanyDropdownLabel(contact);
  }

  getReservationOptions(reservations: { value: { reservationId: string }, label: string }[] | null | undefined): { value: string, label: string }[] {
    return (reservations || []).map(reservation => ({ value: reservation.value.reservationId, label: reservation.label }));
  }

  get hasAccountingFullAccess(): boolean {
    return this.authService.hasAccountingFullAccess();
  }

  get effectiveTabMaxIndex(): number {
    return this.hasAccountingFullAccess ? this.tabMaxIndex : this.tabMaxIndexLimited;
  }

  get effectiveSelectedTabIndex(): number {
    return Math.min(this.selectedTabIndex, this.effectiveTabMaxIndex);
  }

  clampSelectedTabIndexForAccess(): void {
    if (this.selectedTabIndex > this.effectiveTabMaxIndex) {
      this.selectedTabIndex = 0;
    }
  }

  get showJournalEntrySyncTools(): boolean {
    return this.hasAccountingFullAccess
      && !this.activeInvoiceId
      && !this.isGeneralLedgerDetailActive
      && !this.isBillsReceiptDetailActive
      && !this.isReceiptsReceiptDetailActive
      && !this.isDepositDetailActive
      && !this.isTransferDetailActive
      && !this.isOwnersUtilityReceiptDetailActive
      && !this.isOwnersWorkOrderDetailActive
      && !this.isWorkOrderCreateActive
      && !this.isFinancialReportDrillDownActive
      && !this.isArAgingDrillDownActive
      && !this.isApAgingDrillDownActive;
  }

  resolveOfficeIdsForJournalEntrySync(): number[] {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      return [this.selectedOfficeId];
    }

    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  resolveOfficeIdsForJournalEntryClear(): number[] {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      return [this.selectedOfficeId];
    }

    // Empty list means "all offices for this organization" on clear-all endpoint.
    return [];
  }

  async syncJournalEntries(): Promise<void> {
    const officeIds = this.resolveOfficeIdsForJournalEntrySync();
    if (officeIds.length === 0) {
      this.toastr.warning('Select at least one office before syncing journal entries.', 'Sync');
      return;
    }

    this.initializeJournalEntrySyncProgress();
    this.showSyncProgressDialog = true;
    this.isSyncProgressComplete = false;
    this.beginJournalEntrySyncTools();
    await this.waitForUiPaint();
    let syncCompleted = false;

    try {
      const startResponse = await firstValueFrom(this.generalLedgerService.startAllJournalEntrySyncJob({
        officeIds,
        startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
        endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
      }));
      if (!startResponse.jobId) {
        throw new Error('Sync job did not return an ID.');
      }

      syncCompleted = await this.pollJournalEntrySyncJob(startResponse.jobId);
      if (syncCompleted) {
        this.onJournalEntriesChanged();
      }
      this.toastr.success('Journal entry sync completed.', 'Sync');
    } catch (error) {
      this.showJournalEntrySyncError('Sync', error);
    } finally {
      this.finishJournalEntrySyncTools(true);
    }
  }

  clearJournalEntries(): void {
    const officeIds = this.resolveOfficeIdsForJournalEntryClear();
    let clearSucceeded = false;

    this.beginJournalEntrySyncTools();
    this.generalLedgerService.clearAllJournalEntries(officeIds).pipe(
      take(1),
      finalize(() => {
        this.finishJournalEntrySyncTools();
        if (clearSucceeded) {
          this.onJournalEntriesChanged();
        }
      })
    ).subscribe({
      next: (result) => {
        clearSucceeded = true;
        this.showJournalEntrySyncResult('Journal entries cleared', result, true);
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.error(error?.error ?? 'Unable to clear journal entries.', CommonMessage.Error);
      }
    });
  }

beginJournalEntrySyncTools(): void {
    this.isJournalEntrySyncInProgress = true;
    this.cdr.detectChanges();
  }

finishJournalEntrySyncTools(markSyncProgressComplete: boolean = false): void {
    this.isJournalEntrySyncInProgress = false;
    if (markSyncProgressComplete) {
      this.isSyncProgressComplete = true;
    }
    this.cdr.detectChanges();
  }

  showJournalEntrySyncResult(title: string, result: JournalEntrySyncResult, isClear: boolean = false): void {
    const actionLabel = isClear ? 'deleted' : 'created';
    const count = isClear ? result.journalEntriesDeleted : result.journalEntriesCreated;
    const skipped = isClear ? 0 : result.journalEntriesSkipped;
    let message = isClear
      ? `${count} journal entries ${actionLabel}`
      : `${result.documentsProcessed} documents processed, ${count} journal entries ${actionLabel}`;

    if (!isClear && skipped > 0) {
      message += `, ${skipped} skipped`;
    }

    if (result.errors.length > 0) {
      message += `. ${result.errors.length} issue(s): ${result.errors.slice(0, 3).join('; ')}`;
      if (result.errors.length > 3) {
        message += '...';
      }
      this.toastr.warning(message, title);
      return;
    }

    this.toastr.success(message, title);
  }

  showJournalEntrySyncError(title: string, error: unknown): void {
    const httpError = error as HttpErrorResponse;
    const message = typeof httpError?.error === 'string'
      ? httpError.error
      : httpError?.message ?? 'Unable to sync journal entries.';
    this.toastr.error(message, title);
  }

  initializeJournalEntrySyncProgress(): void {
    this.syncProgressRows = [
      { key: 'invoice', label: 'Invoices', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'bill', label: 'Bills', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'receipt', label: 'Receipts', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'workOrder', label: 'Work Orders', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'deposit', label: 'Deposits', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'transfer', label: 'Transfers', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'departureFee', label: 'Departure Fees', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'linenAndTowelFee', label: 'Linen & Towel Fees', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'retainedEarnings', label: 'Retained Earnings', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' }
    ];
  }

  closeSyncProgressDialog(): void {
    if (this.isJournalEntrySyncInProgress) {
      return;
    }
    this.showSyncProgressDialog = false;
  }

  updateJournalEntrySyncProgress(
    key: JournalEntrySyncProgressKey,
    update: (row: JournalEntrySyncProgressRow) => void
  ): void {
    const row = this.syncProgressRows.find(item => item.key === key);
    if (!row) {
      return;
    }
    update(row);
    this.syncProgressRows = [...this.syncProgressRows];
  }

  async pollJournalEntrySyncJob(jobId: string): Promise<boolean> {
    const maxPollCount = 1800; // 15 minutes at 500ms
    for (let pollCount = 0; pollCount < maxPollCount; pollCount++) {
      const status = await firstValueFrom(this.generalLedgerService.getAllJournalEntrySyncJobStatus(jobId));
      const byType = new Map((status.types || []).map(row => [row.type, row]));

      this.syncProgressRows = this.syncProgressRows.map(row => {
        const update = byType.get(row.key);
        if (!update) {
          return row;
        }
        return {
          ...row,
          label: update.label || row.label,
          total: update.total,
          processed: update.processed,
          skipped: update.skipped,
          errors: update.errors,
          status: update.status || row.status
        };
      });
      this.cdr.detectChanges();

      if (status.isCompleted) {
        return true;
      }

      await this.wait(500);
    }

    throw new Error('Sync progress polling timed out.');
  }

  waitForUiPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get showShellOfficeDropdown(): boolean {
    return !this.isSuperAdmin && this.offices.length > 0;
  }

  get showShellDateRange(): boolean {
    return !this.activeInvoiceId;
  }

  get billsReceiptsTabLabel(): string {
    return 'Vendors';
  }

  clearInactiveDropdownSelections(activeTabIndex: number): void {
    if (activeTabIndex !== this.tabBillsReceipts) {
      this.selectedBillsReceiptKind = 'bills';
    }
    if (activeTabIndex !== this.tabBankActivities) {
      this.selectedBankActivityKind = 'undepositedFunds';
    }
    if (activeTabIndex !== this.tabOwners) {
      this.selectedOwnerKind = 'utilities';
    }
    if (activeTabIndex !== this.tabReports) {
      this.selectedReportKind = 'profitLoss';
    }
    if (activeTabIndex !== this.tabGeneralLedger) {
      this.selectedGeneralLedgerKind = 'ledger';
    }
  }

  get isBillsReceiptDetailActive(): boolean {
    return this.selectedTabIndex === this.tabBillsReceipts
      && this.selectedBillsReceiptKind === 'bills'
      && this.showBillsReceiptDetail;
  }

  get isReceiptsReceiptDetailActive(): boolean {
    return this.selectedTabIndex === this.tabBillsReceipts
      && this.selectedBillsReceiptKind === 'receipts'
      && this.showReceiptsReceiptDetail;
  }

  get isDepositDetailActive(): boolean {
    return this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'deposits'
      && this.showDepositsDetail;
  }

  get isTransferDetailActive(): boolean {
    return this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'transfers'
      && this.showTransfersDetail;
  }

  get isTransferReportDetailActive(): boolean {
    return this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'transferReport'
      && this.showTransferReportDetail;
  }

  get isOwnersUtilityReceiptDetailActive(): boolean {
    return this.selectedTabIndex === this.tabOwners
      && this.selectedOwnerKind === 'utilities'
      && this.showOwnersUtilityReceiptDetail;
  }

  get isOwnersWorkOrderDetailActive(): boolean {
    return this.selectedTabIndex === this.tabOwners
      && this.selectedOwnerKind === 'workOrders'
      && this.showOwnersWorkOrderDetail;
  }

  get isWorkOrderCreateActive(): boolean {
    return this.selectedTabIndex === this.tabOwners
      && this.selectedOwnerKind === 'workOrders'
      && this.showWorkOrderCreate
      && !!this.workOrderCreateContext;
  }

  get workOrderCreateOfficeTitleBarOptions(): { value: number; label: string }[] {
    const officeId = this.workOrderCreateContext?.officeId;
    if (officeId == null) {
      return [];
    }

    const office = this.offices.find(item => item.officeId === officeId);
    return [{ value: officeId, label: office?.name || office?.officeCode || String(officeId) }];
  }

  get workOrderCreatePropertyTitleBarOptions(): SearchableSelectOption[] {
    const propertyId = (this.workOrderCreateContext?.propertyId || '').trim();
    if (!propertyId) {
      return [];
    }

    return [{
      value: propertyId,
      label: (this.workOrderCreateContext?.propertyCode || '').trim() || propertyId
    }];
  }

  get workOrderCreateReservationTitleBarOptions(): SearchableSelectOption[] {
    const reservationId = (this.workOrderCreateContext?.reservationId || '').trim();
    if (!reservationId) {
      return [];
    }

    return [{ value: reservationId, label: reservationId }];
  }

  get isGeneralLedgerDetailActive(): boolean {
    return (this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind !== 'reconcile'
      || this.selectedTabIndex === this.tabGeneralLedger
      || this.selectedTabIndex === this.tabOwners && this.isOwnerReportView(this.selectedOwnerKind) && this.showOwnerStatementJournalEntryLines)
      && this.showGeneralLedgerDetail;
  }

  get isOwnerStatementJournalEntryLineListActive(): boolean {
    return this.selectedTabIndex === this.tabOwners
      && this.isOwnerReportView(this.selectedOwnerKind)
      && this.showOwnerStatementJournalEntryLines
      && !this.showGeneralLedgerDetail;
  }

  get ownerStatementSubviewTitle(): string {
    return this.selectedOwnerStatementReportKind === 'cash'
      ? 'Owner Cash Report'
      : 'Owner Accrual Report';
  }

  get selectedOwnerReportKind(): OwnerStatementReportKind {
    return this.selectedOwnerStatementReportKind;
  }

  get isOwnerReportViewActive(): boolean {
    return this.isOwnerReportView(this.selectedOwnerKind);
  }

  get isOwnerEscrowViewActive(): boolean {
    return this.selectedTabIndex === this.tabOwners && this.selectedOwnerKind === 'escrow';
  }

  get showOwnerReportGoButton(): boolean {
    if (this.isOwnerStatementCreateActive) {
      return false;
    }

    if (this.selectedTabIndex === this.tabOwners
      && (this.isOwnerReportView(this.selectedOwnerKind)
        || this.selectedOwnerKind === 'ownerStatements')) {
      return true;
    }

    return this.selectedTabIndex === this.tabGeneralLedger
      && this.selectedGeneralLedgerKind === 'recap'
      && !this.isGeneralLedgerDetailActive;
  }

  get ownerStatementCreateOfficeTitleBarOptions(): { value: number; label: string }[] {
    const line = this.selectedOwnerStatementMonthLine;
    if (!line) {
      return [];
    }

    return [{ value: line.officeId, label: line.officeName || '' }];
  }

  get ownerStatementCreatePropertyTitleBarOptions(): { value: string; label: string }[] {
    const line = this.selectedOwnerStatementMonthLine;
    if (!line) {
      return [];
    }

    return [{ value: line.propertyId, label: line.propertyCode || '' }];
  }

  get ownerStatementCreateOwnerTitleBarOptions(): { value: string; label: string }[] {
    const line = this.selectedOwnerStatementMonthLine;
    if (!line) {
      return [];
    }

    return [{ value: line.ownerId, label: line.ownerName || '' }];
  }

  get isOwnerStatementCreateActive(): boolean {
    return this.selectedTabIndex === this.tabOwners
      && this.selectedOwnerKind === 'ownerStatements'
      && !!this.selectedOwnerStatementMonthLine;
  }

  get isSecurityDepositReportActive(): boolean {
    return this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'securityDeposits'
      && this.showSecurityDepositReport
      && !!this.securityDepositReportContext;
  }

  get securityDepositReportOfficeTitleBarOptions(): { value: number; label: string }[] {
    const officeId = this.securityDepositReportContext?.officeId;
    if (officeId == null) {
      return [];
    }

    const office = this.offices.find(item => item.officeId === officeId);
    return [{ value: officeId, label: office?.name || String(officeId) }];
  }

  get securityDepositReportReservationTitleBarOptions(): { value: string; label: string }[] {
    const reservationId = (this.securityDepositReportContext?.reservationId || '').trim();
    if (!reservationId) {
      return [];
    }

    return [{
      value: reservationId,
      label: (this.securityDepositReportContext?.reservationCode || '').trim() || reservationId
    }];
  }

  get isInvoiceCreateActive(): boolean {
    return this.selectedTabIndex === 0 && this.showInvoiceCreate && !!this.invoiceCreateContext;
  }

  get invoiceCreateOfficeTitleBarOptions(): { value: number; label: string }[] {
    const officeId = this.invoiceCreateContext?.officeId;
    if (officeId == null) {
      return [];
    }

    const office = this.offices.find(item => item.officeId === officeId);
    return [{ value: officeId, label: office?.name || String(officeId) }];
  }

  get invoiceCreateReservationTitleBarOptions(): { value: string; label: string }[] {
    const reservationId = (this.invoiceCreateContext?.reservationId || '').trim();
    if (!reservationId) {
      return [];
    }

    const reservationEntry = this.accountingInvoiceList?.availableReservations?.find(
      item => item.value.reservationId === reservationId
    );

    return [{
      value: reservationId,
      label: reservationEntry?.label?.trim() || reservationId
    }];
  }

  get invoiceCreateInvoiceTitleBarOptions(): { value: string; label: string }[] {
    const invoiceId = (this.invoiceCreateContext?.invoiceId || '').trim();
    if (!invoiceId) {
      return [];
    }

    return [{
      value: invoiceId,
      label: (this.invoiceCreateContext?.invoiceCode || '').trim() || invoiceId
    }];
  }

  isOwnerReportView(kind: AccountingShellOwnerKind): boolean {
    return kind === 'statements';
  }

captureOwnerStatementReturnContext(): void {
    if (this.isOwnerReportView(this.selectedOwnerKind)) {
      this.ownerStatementReturnOwnerKind = this.selectedOwnerKind;
      this.ownerStatementReturnReportKind = this.selectedOwnerStatementReportKind;
    }
  }

  get financialReportKind(): FinancialReportKind {
    return this.selectedReportKind === 'balanceSheet' ? 'balanceSheet' : 'profitLoss';
  }

  get reconcileAccountReportView(): 'summary' | 'detail' {
    return this.selectedReportKind === 'reconcileAccountDetail' ? 'detail' : 'summary';
  }

  get reconcileAccountReportStatementDate(): string | null {
    return this.utilityService.formatDateOnlyForApi(this.endDate);
  }

  usesFinancialReportTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabReports
      && this.selectedReportKind !== 'arAging'
      && !this.isApAgingReportKind(this.selectedReportKind)
      && !this.isReconcileAccountReportActive();
  }

  isReconcileAccountReportActive(): boolean {
    return this.selectedTabIndex === this.tabReports
      && (this.selectedReportKind === 'reconcileAccountSummary' || this.selectedReportKind === 'reconcileAccountDetail');
  }

  usesReconcileAccountReportTitleBarFilters(): boolean {
    return this.isReconcileAccountReportActive();
  }

  get showReconcileAccountReportChartOfAccountFilter(): boolean {
    return this.usesReconcileAccountReportTitleBarFilters();
  }

  get showAccountingShellStartDate(): boolean {
    if (this.isReconcileBankActivityActive || this.isReconcileAccountReportActive()) {
      return false;
    }

    return !this.usesAccountingShellAsOfDate;
  }

  get usesAccountingShellAsOfDate(): boolean {
    return this.isOwnerApAgingViewActive
      || (this.selectedTabIndex === this.tabOwners && this.selectedOwnerKind === 'escrow')
      || (this.selectedTabIndex === this.tabReports
        && (this.selectedReportKind === 'balanceSheet'
          || this.selectedReportKind === 'arAging'
          || this.isApAgingReportKind(this.selectedReportKind)));
  }

  get showAccountingShellRangeDates(): boolean {
    return this.showAccountingShellStartDate || this.showAccountingShellEndDate;
  }

  get showAccountingShellAsOfDate(): boolean {
    if (!this.showShellDateRange || !this.usesAccountingShellAsOfDate) {
      return false;
    }

    if (this.selectedTabIndex === this.tabReports
      && (this.selectedReportKind === 'arAging' || this.isApAgingReportKind(this.selectedReportKind))) {
      return this.showArAgingCustomAsOfDate;
    }

    return true;
  }

  get showAccountingShellEndDate(): boolean {
    if (this.isReconcileAccountReportActive()) {
      return false;
    }

    return !this.usesAccountingShellAsOfDate;
  }

  get accountingShellEndDateLabel(): string {
    return this.isReconcileBankActivityActive ? 'Statement Date' : 'End Date';
  }

  get asOfReportSearchDateRange(): { asOfStart: string | null; asOfDate: string | null } {
    return {
      asOfStart: this.utilityService.formatDateOnlyForApi(this.asOfStart),
      asOfDate: this.utilityService.formatDateOnlyForApi(this.asOfDate)
    };
  }

  get shellAsOfDateApi(): string | null {
    return this.utilityService.formatDateOnlyForApi(this.asOfDate);
  }

  get shellAsOfStartApi(): string | null {
    return this.utilityService.formatDateOnlyForApi(this.asOfStart);
  }

  get isReconcileBankActivityActive(): boolean {
    return this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'reconcile';
  }

  usesGeneralLedgerTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabGeneralLedger;
  }

  get showGeneralLedgerChartOfAccountFilter(): boolean {
    return this.usesGeneralLedgerTitleBarFilters()
      && this.selectedGeneralLedgerKind === 'ledger'
      && !this.isGeneralLedgerDetailActive;
  }

  get showReconcileChartOfAccountFilter(): boolean {
    return this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind === 'reconcile';
  }

  get showGeneralLedgerShellDateRange(): boolean {
    return this.showShellDateRange
      && this.usesGeneralLedgerTitleBarFilters()
      && !this.isGeneralLedgerDetailActive;
  }

  get generalLedgerPropertyNullOptionLabel(): string {
    return this.isGeneralLedgerDetailActive ? 'Company' : 'All Properties';
  }

  get showGeneralLedgerOfficeRequired(): boolean {
    return this.activeJournalEntryId === 'new';
  }

  get generalLedgerShellOfficeFieldClass(): string {
    const baseClass = 'titlebar-field-office';
    if (!this.showGeneralLedgerOfficeValidationError) {
      return baseClass;
    }
    return `${baseClass} invoice-required-field`;
  }

  get selectedGlContactId(): string | null {
    if (!this.selectedGlReservationId) {
      return null;
    }

    const reservation = this.glReservations.find(item => item.reservationId === this.selectedGlReservationId);
    return (reservation?.contactId || '').trim() || null;
  }

  usesReportTitleBarFilters(): boolean {
    return this.usesFinancialReportTitleBarFilters()
      || this.usesReconcileAccountReportTitleBarFilters()
      || this.usesArAgingTitleBarFilters()
      || this.usesGeneralLedgerTitleBarFilters();
  }

  get shellOfficeTitleBarOptions(): { value: number, label: string }[] {
    return this.getOfficeOptions(this.offices);
  }

  get shellChartOfAccountTitleBarOptions(): { value: number, label: string }[] {
    return this.buildShellChartOfAccountTitleBarOptions();
  }

  get shellReconcileChartOfAccountTitleBarOptions(): { value: number, label: string }[] {
    return this.buildShellChartOfAccountTitleBarOptions({ maxAccountNumberExclusive: 4000 });
  }

  get shellGlPropertyTitleBarOptions(): SearchableSelectOption[] {
    return this.availableGlProperties;
  }

  get shellGlReservationTitleBarOptions(): SearchableSelectOption[] {
    return this.availableGlReservations;
  }

  get shellFinancialReportClassTitleBarOptions(): { value: Class; label: string }[] {
    return ClassLabels.map(({ value, label }) => ({ value, label }));
  }

  get organizationTitleBarOptions(): { value: string, label: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || ''
    }));
  }

  get selectedOrganizationName(): string | null {
    if (!this.selectedOrganizationId) {
      return null;
    }
    return this.organizations.find(organization => organization.organizationId === this.selectedOrganizationId)?.name || null;
  }

  getInvoiceEditorOfficeFieldClass(): string {
    const baseClass = 'titlebar-field-office';
    if (!this.shellInvoiceEditor?.showOfficeValidationError) {
      return baseClass;
    }
    return `${baseClass} invoice-required-field`;
  }

  getInvoiceEditorReservationFieldClass(): string {
    return 'titlebar-field-reservation';
  }
  //#endregion

  //#region Form Response Methods
  onShellOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    const officeChanged = this.selectedOfficeId !== officeId;
    this.showGeneralLedgerOfficeValidationError = false;
    this.applyPageOfficeScope(officeId);
    if (officeChanged) {
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
    this.persistPinnedTopBarIfActive();
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === this.tabBillsReceipts) {
      this.refreshActiveBillsReceiptList();
    }
    if (this.selectedTabIndex === this.tabBankActivities) {
      this.onGeneralLedgerBack();
      this.refreshActiveBankActivityList();
    }
    if (this.selectedTabIndex === this.tabOwners) {
      this.onOwnersUtilityReceiptBack();
      this.onOwnersWorkOrderBack();
      this.refreshActiveOwnerView();
    }
    if (this.usesFinancialReportTitleBarFilters()) {
      this.financialReportsRefreshTrigger++;
    }
    if (this.isReconcileAccountReportActive()) {
      this.loadReconcileHistoryForSelectedAccount();
    }
    if (this.usesArAgingTitleBarFilters()) {
      this.financialReportsRefreshTrigger++;
    }
    if (this.usesGeneralLedgerTitleBarFilters()) {
      this.refreshPropertyOptions();
      this.refreshReservationOptions();
      this.clearInvalidChartOfAccountSelection();
      this.onGeneralLedgerBack();
      this.refreshGeneralLedgerListView();
    }
  }

  onShellFinancialReportClassDropdownChange(value: string | number | null): void {
    const reportClass = value == null || value === '' ? Class.TotalOnly : Number(value) as Class;
    if (this.selectedFinancialReportClass === reportClass) {
      return;
    }
    this.selectedFinancialReportClass = reportClass;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
    this.persistPinnedTopBarIfActive();
  }

  onAccountingOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? null : String(value);
    this.selectedOrganizationId = organizationId;
    this.persistPinnedTopBarIfActive();
  }

  applyQueryParamState(params: Record<string, string>): void {
    if (this.dateRangePinned) {
      return;
    }
    let tabIndex = getNumberQueryParam(params, 'tab', 0, this.tabMaxIndex + 3);
    if (tabIndex !== null) {
      if ('report' in params && params['report'] === 'ownerApAging') {
        tabIndex = this.tabOwners;
      } else if ('report' in params) {
        tabIndex = this.tabReports;
      } else if ('bankActivity' in params) {
        tabIndex = this.tabBankActivities;
      } else if ('ownerKind' in params) {
        tabIndex = this.tabOwners;
      } else if ('glView' in params) {
        tabIndex = this.tabGeneralLedger;
      } else if (tabIndex === 7) {
        tabIndex = this.tabGeneralLedger;
      } else if (tabIndex === 6) {
        tabIndex = this.tabReports;
        this.selectedReportKind = 'balanceSheet';
      } else if (tabIndex === 5) {
        tabIndex = this.tabReports;
      } else if (tabIndex === 4) {
        if ('chartOfAccountId' in params || 'propertyId' in params || 'glReservationId' in params) {
          tabIndex = this.tabGeneralLedger;
        } else {
          tabIndex = this.tabReports;
        }
      } else if (tabIndex === 3) {
        tabIndex = this.tabBankActivities;
        this.selectedBankActivityKind = 'printChecks';
      }
      tabIndex = Math.min(Math.max(tabIndex, 0), this.tabMaxIndex);
      if (this.selectedTabIndex !== tabIndex) {
        this.selectedTabIndex = tabIndex;
      }
      this.clampSelectedTabIndexForAccess();
    }

    if ('billsReceipt' in params) {
      const billsReceipt = params['billsReceipt'];
      if (billsReceipt === 'bills' || billsReceipt === 'receipts' || billsReceipt === 'rentRoll') {
        this.selectedBillsReceiptKind = billsReceipt;
      }
    }

    if ('bankActivity' in params) {
      const bankActivity = params['bankActivity'];
      if (
        bankActivity === 'undepositedFunds'
        || bankActivity === 'untransferredFunds'
        || bankActivity === 'transferReport'
        || bankActivity === 'deposits'
        || bankActivity === 'transfers'
        || bankActivity === 'printChecks'
        || bankActivity === 'securityDeposits'
        || bankActivity === 'reconcile'
      ) {
        this.selectedBankActivityKind = bankActivity;
      }
    }

    if ('ownerKind' in params) {
      const ownerKind = params['ownerKind'];
      if (ownerKind === 'securityDeposits') {
        this.selectedTabIndex = this.tabBankActivities;
        this.selectedBankActivityKind = 'securityDeposits';
      } else if (
        ownerKind === 'utilities'
        || ownerKind === 'workOrders'
        || ownerKind === 'statements'
        || ownerKind === 'ownerStatements'
        || ownerKind === 'apAging'
        || ownerKind === 'escrow'
      ) {
        this.selectedOwnerKind = ownerKind;
        if (ownerKind === 'statements') {
          this.selectedOwnerStatementReportKind = params['ownerReport'] === 'cash' ? 'cash' : 'accrual';
        }
      } else if (ownerKind === 'ownerAccrualReport') {
        this.selectedOwnerKind = 'statements';
        this.selectedOwnerStatementReportKind = 'accrual';
      } else if (ownerKind === 'ownerCashReport') {
        this.selectedOwnerKind = 'statements';
        this.selectedOwnerStatementReportKind = 'cash';
      } else if (ownerKind === 'ownerStatement' || ownerKind === 'owner-statements' || ownerKind === 'owner-statment') {
        this.selectedOwnerKind = 'ownerStatements';
      }
    } else if ('ownerReport' in params) {
      this.selectedOwnerKind = 'statements';
      this.selectedOwnerStatementReportKind = params['ownerReport'] === 'cash' ? 'cash' : 'accrual';
    }

    if ('report' in params) {
      const report = params['report'];
      if (report === 'ownerApAging') {
        this.selectedOwnerKind = 'apAging';
      } else if (
        report === 'profitLoss'
        || report === 'balanceSheet'
        || report === 'arAging'
        || report === 'apAging'
        || report === 'reconcileAccountSummary'
        || report === 'reconcileAccountDetail'
      ) {
        this.selectedReportKind = report;
      }
    }

    if ('glView' in params) {
      const glView = params['glView'];
      if (glView === 'ledger' || glView === 'recap') {
        this.selectedGeneralLedgerKind = glView;
      }
    }

    if ('officeId' in params && !this.dateRangePinned) {
      this.applyPageOfficeScope(getNumberQueryParam(params, 'officeId'));
    }

    if ('reservationId' in params) {
      const reservationId = params['reservationId'];
      this.selectedReservationId = reservationId ? String(reservationId) : null;
    }

    if ('companyId' in params) {
      const companyId = params['companyId'];
      this.selectedCompanyId = companyId ? String(companyId) : null;
    }

    if ('organizationId' in params) {
      const organizationId = params['organizationId'];
      this.selectedOrganizationId = organizationId ? String(organizationId) : null;
    }

    if (this.usesFinancialReportTitleBarFilters() && 'reportClass' in params) {
      const reportClass = getNumberQueryParam(params, 'reportClass', 0, Class.Account + 1);
      if (reportClass !== null) {
        this.selectedFinancialReportClass = reportClass;
      }
    }

    if (this.usesArAgingTitleBarFilters()
      || this.isOwnerApAgingViewActive
      || ('report' in params && (params['report'] === 'arAging' || params['report'] === 'apAging' || params['report'] === 'ownerApAging'))
      || ('ownerKind' in params && params['ownerKind'] === 'apAging')) {
      if ('arAgingDate' in params) {
        const datePreset = params['arAgingDate'] as ArAgingDatePreset;
        if (this.shellArAgingDatePresetOptions.some(option => option.value === datePreset)) {
          this.selectedArAgingDatePreset = datePreset;
        }
      }

      if ('arAgingInterval' in params) {
        const intervalDays = getNumberQueryParam(params, 'arAgingInterval');
        if (intervalDays != null && this.shellArAgingIntervalOptions.some(option => option.value === intervalDays)) {
          this.selectedArAgingIntervalDays = intervalDays;
        }
      }

      if ('arAgingThrough' in params) {
        const throughValue = getNumberQueryParam(params, 'arAgingThrough');
        if (throughValue != null && this.shellArAgingThroughOptions.some(option => option.value === throughValue)) {
          this.selectedArAgingThroughValue = throughValue;
        }
      }

      if ('arAgingSort' in params) {
        const sortBy = params['arAgingSort'] as ArAgingSortBy;
        if (this.shellArAgingSortByOptions.some(option => option.value === sortBy)) {
          this.selectedArAgingSortBy = sortBy;
        }
      }

      if ('apAgingSort' in params) {
        const sortBy = params['apAgingSort'] as ApAgingSortBy;
        if (this.shellApAgingSortByOptions.some(option => option.value === sortBy)) {
          this.selectedApAgingSortBy = sortBy;
        }
      }

      this.syncArAgingAsOfDateFromFilters();
    }

    this.syncArAgingReportFilters();

    if (this.usesGeneralLedgerTitleBarFilters() || this.usesReconcileAccountReportTitleBarFilters()) {
      if ('chartOfAccountId' in params) {
        this.selectedChartOfAccountId = getNumberQueryParam(params, 'chartOfAccountId');
      } else if (this.usesGeneralLedgerTitleBarFilters()) {
        this.selectedChartOfAccountId = null;
      }

      if ('propertyId' in params) {
        this.selectedGlPropertyId = params['propertyId'] ? String(params['propertyId']) : null;
      } else {
        this.selectedGlPropertyId = null;
      }

      if ('glReservationId' in params) {
        this.selectedGlReservationId = params['glReservationId'] ? String(params['glReservationId']) : null;
      } else if ('reservationId' in params) {
        this.selectedGlReservationId = params['reservationId'] ? String(params['reservationId']) : null;
      } else {
        this.selectedGlReservationId = null;
      }

      this.syncGlFiltersFromInvoiceContext();
      this.refreshPropertyOptions();
      this.refreshReservationOptions();

      if (this.isReconcileAccountReportActive()) {
        this.loadReconcileHistoryForSelectedAccount();
      }
    }

    const startDateParam = getStringQueryParam(params, 'startDate');
    const endDateParam = getStringQueryParam(params, 'endDate');
    const asOfDateParam = getStringQueryParam(params, 'asOfDate');
    const asOfStartParam = getStringQueryParam(params, 'asOfStart');
    if (startDateParam || endDateParam) {
      const previousStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
      const previousEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
      this.startDate = this.cloneShellDate(this.utilityService.parseDateOnlyStringToDate(startDateParam));
      this.endDate = this.cloneShellDate(this.utilityService.parseDateOnlyStringToDate(endDateParam));
      this.normalizeDateRangeValues();
      if (this.dateRangePinned) {
        this.persistPinnedDateRange();
      }
      const nextStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
      const nextEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
      const datesChanged = previousStartDate !== nextStartDate || previousEndDate !== nextEndDate;
      if (datesChanged) {
        this.syncInvoiceSearchDateRange();
        this.syncBillsSearchRequest();
        if (this.selectedTabIndex >= 1 && this.selectedTabIndex <= this.tabGeneralLedger) {
          queueMicrotask(() => {
            this.billsRefreshTrigger++;
            this.receiptsRefreshTrigger++;
            this.undepositedFundsRefreshTrigger++;
            this.untransferredFundsRefreshTrigger++;
            this.depositsRefreshTrigger++;
            this.transfersRefreshTrigger++;
            this.transferReportRefreshTrigger++;
            this.reconcileRefreshTrigger++;
            this.printChecksRefreshTrigger++;
            this.securityDepositsRefreshTrigger++;
            this.ownersUtilitiesRefreshTrigger++;
            this.ownersWorkOrdersRefreshTrigger++;
            if (this.selectedTabIndex === this.tabOwners && this.selectedOwnerKind === 'ownerStatements') {
              this.ownersStatementsRefreshTrigger++;
            }
            if (this.selectedTabIndex === this.tabOwners && this.isOwnerReportView(this.selectedOwnerKind) && this.showOwnerStatementJournalEntryLines) {
              this.ownerStatementJournalEntryLinesRefreshTrigger++;
            }
            this.financialReportsRefreshTrigger++;
            this.generalLedgerRefreshTrigger++;
          });
        }
      }
    }

    if (asOfDateParam) {
      const previousAsOfDate = this.utilityService.formatDateOnlyForApi(this.asOfDate);
      this.asOfDate = this.cloneShellDate(this.utilityService.parseDateOnlyStringToDate(asOfDateParam));
      this.normalizeAsOfDateValue();
      if (asOfStartParam) {
        this.asOfStart = this.utilityService.parseDateOnlyStringToDate(asOfStartParam);
        this.normalizeAsOfStartValue();
      } else {
        this.syncAsOfStartFromAsOfDate();
      }
      if (this.dateRangePinned) {
        this.persistPinnedDateRange();
      }
      if (previousAsOfDate !== this.utilityService.formatDateOnlyForApi(this.asOfDate)) {
        this.syncArAgingReportFilters();
        if (this.usesAccountingShellAsOfDate) {
          this.financialReportsRefreshTrigger++;
        }
      }
    } else if (!this.startDate && !this.endDate && !this.dateRangePinned) {
      if (this.selectedTabIndex === this.tabOwners && this.isOwnerReportView(this.selectedOwnerKind)) {
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        this.startDate = start;
        this.endDate = end;
      } else {
        this.setDefaultDateRange();
      }
      this.syncInvoiceSearchDateRange();
      this.syncBillsSearchRequest();
    }
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    if (this.dateRangePinned) {
      return;
    }
    const previousOfficeId = this.selectedOfficeId;
    const resolvedOfficeId = this.globalSelectionService.resolvePageOfficeId({
      topBarPinned: this.dateRangePinned,
      pageOfficeId: this.selectedOfficeId,
      offices: this.offices,
      globalOfficeId: officeId
    });
    const officeChanged = previousOfficeId !== resolvedOfficeId;
    this.applyPageOfficeScope(resolvedOfficeId);
    if (officeChanged && !this.dateRangePinned) {
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
  }

  applyPageOfficeScope(officeId: number | null): void {
    this.selectedOfficeId = officeId;
    this.refreshBillsPropertyOptions();
    this.syncBillsSearchRequest();
  }

  onShellBillsPropertyDropdownChange(value: string | number | null): void {
    const propertyId = value == null || value === '' ? null : String(value);
    if (this.selectedBillsPropertyId === propertyId) {
      return;
    }
    this.selectedBillsPropertyId = propertyId;
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === this.tabBillsReceipts) {
      this.refreshActiveBillsReceiptList();
      return;
    }
    if (this.selectedTabIndex === this.tabOwners) {
      this.onOwnersUtilityReceiptBack();
      this.onOwnersWorkOrderBack();
      this.refreshActiveOwnerView();
    }
    this.persistPinnedTopBarIfActive();
  }

  setDefaultDateRange(): void {
    if (this.dateRangePinned) {
      return;
    }

    this.setDefaultRangeDates();
    this.ensureDefaultAsOfDates();
  }

  setDefaultRangeDates(): void {
    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);

    this.endDate = end;
    this.startDate = start;
  }

  ensureDefaultAsOfDates(): void {
    if (this.asOfDate) {
      return;
    }

    const asOf = new Date();
    asOf.setHours(0, 0, 0, 0);
    this.asOfDate = asOf;
    this.syncAsOfStartFromAsOfDate();
  }

  cloneShellDate(value: Date | null | undefined): Date | null {
    if (!value || !(value instanceof Date) || isNaN(value.getTime())) {
      return null;
    }

    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  applyRentRollMonthDateRange(): boolean {
    if (this.dateRangePinned) {
      return false;
    }

    const changed = this.setCurrentMonthDateRange();
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
    return changed;
  }

  applyOwnerStatementsMonthDateRange(): boolean {
    if (this.dateRangePinned) {
      return false;
    }

    const changed = this.setCurrentMonthDateRange();
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
    return changed;
  }

  setCurrentMonthDateRange(): boolean {
    const previousStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const previousEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    this.startDate = start;
    this.endDate = end;
    const nextStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const nextEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    return previousStartDate !== nextStartDate || previousEndDate !== nextEndDate;
  }

  normalizeDateRangeValues(): void {
    if (this.dateRangePinned) {
      if (this.startDate) {
        this.startDate.setHours(0, 0, 0, 0);
      }
      if (this.endDate) {
        this.endDate.setHours(0, 0, 0, 0);
      }
      return;
    }

    if (this.usesAccountingShellAsOfDate && !this.showAccountingShellEndDate) {
      if (this.startDate) {
        this.startDate.setHours(0, 0, 0, 0);
      }
      if (this.endDate) {
        this.endDate.setHours(0, 0, 0, 0);
      }
      return;
    }

    if (!this.startDate && !this.endDate) {
      this.setDefaultDateRange();
      return;
    }
    if (this.startDate && !this.endDate) {
      const end = new Date(this.startDate);
      end.setHours(0, 0, 0, 0);
      this.endDate = end;
    } else if (!this.startDate && this.endDate) {
      const start = new Date(this.endDate);
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      this.startDate = start;
    }

    if (this.startDate) {
      this.startDate.setHours(0, 0, 0, 0);
    }
    if (this.endDate) {
      this.endDate.setHours(0, 0, 0, 0);
    }

    if (this.startDate && this.endDate && this.startDate.getTime() > this.endDate.getTime()) {
      const tmp = this.startDate;
      this.startDate = this.endDate;
      this.endDate = tmp;
    }
  }

  buildShellQueryParams(overrides: Record<string, string | null> = {}): Record<string, string | null> {
    return {
      tab: String(this.selectedTabIndex),
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate),
      asOfDate: this.utilityService.formatDateOnlyForApi(this.asOfDate),
      asOfStart: this.utilityService.formatDateOnlyForApi(this.asOfStart),
      billsReceipt: this.selectedTabIndex === this.tabBillsReceipts ? this.selectedBillsReceiptKind : null,
      bankActivity: this.selectedTabIndex === this.tabBankActivities ? this.selectedBankActivityKind : null,
      ownerKind: this.selectedTabIndex === this.tabOwners ? this.selectedOwnerKind : null,
      ownerReport: this.selectedTabIndex === this.tabOwners && this.isOwnerReportView(this.selectedOwnerKind)
        ? this.selectedOwnerStatementReportKind
        : null,
      report: this.selectedTabIndex === this.tabReports ? this.selectedReportKind : null,
      glView: this.selectedTabIndex === this.tabGeneralLedger ? this.selectedGeneralLedgerKind : null,
      reportClass: this.usesFinancialReportTitleBarFilters()
        ? String(this.selectedFinancialReportClass)
        : null,
      arAgingDate: this.usesArAgingTitleBarFilters() ? this.selectedArAgingDatePreset : null,
      arAgingInterval: this.usesArAgingTitleBarFilters() ? String(this.selectedArAgingIntervalDays) : null,
      arAgingThrough: this.usesArAgingTitleBarFilters() ? String(this.selectedArAgingThroughValue) : null,
      arAgingSort: this.selectedReportKind === 'arAging' ? this.selectedArAgingSortBy : null,
      apAgingSort: this.usesApAgingSortByOptions ? this.selectedApAgingSortBy : null,
      chartOfAccountId: (
        this.usesGeneralLedgerTitleBarFilters()
        || this.showReconcileChartOfAccountFilter
        || this.usesReconcileAccountReportTitleBarFilters()
      ) && this.selectedChartOfAccountId != null
        ? String(this.selectedChartOfAccountId)
        : null,
      propertyId: this.usesGeneralLedgerTitleBarFilters() ? this.selectedGlPropertyId : null,
      glReservationId: this.usesGeneralLedgerTitleBarFilters() ? this.selectedGlReservationId : null,
      ...overrides
    };
  }

  clearInvalidChartOfAccountSelection(): void {
    if (this.selectedChartOfAccountId == null) {
      return;
    }

    const options = this.showReconcileChartOfAccountFilter || this.showReconcileAccountReportChartOfAccountFilter
      ? this.shellReconcileChartOfAccountTitleBarOptions
      : this.shellChartOfAccountTitleBarOptions;
    const isValid = options.some(option => option.value === this.selectedChartOfAccountId);
    if (!isValid) {
      this.selectedChartOfAccountId = null;
    }
  }

buildShellChartOfAccountTitleBarOptions(options?: {
    maxAccountNumberExclusive?: number;
  }): { value: number; label: string }[] {
    const maxAccountNumberExclusive = options?.maxAccountNumberExclusive ?? null;
    const accounts = (this.chartOfAccounts || [])
      .filter(account => this.selectedOfficeId == null || account.officeId === this.selectedOfficeId)
      .filter(account => {
        if (maxAccountNumberExclusive == null) {
          return true;
        }

        const accountNumber = this.parseChartOfAccountNumber(account.accountNo);
        return accountNumber !== null && accountNumber < maxAccountNumberExclusive;
      })
      .sort((a, b) => a.accountNo.localeCompare(b.accountNo, undefined, { numeric: true, sensitivity: 'base' }));

    return accounts.map(account => ({
      value: account.accountId,
      label: this.utilityService.getChartOfAccountDropdownLabel(account)
    }));
  }

parseChartOfAccountNumber(accountNo: string | null | undefined): number | null {
    const match = String(accountNo ?? '').trim().match(/^(\d+)/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

clearInvoiceShellDetailState(): void {
    this.activeInvoiceId = null;
    this.selectedInvoice = null;
    this.showInvoiceCreate = false;
    this.invoiceCreateContext = null;
    this.invoiceCreateReturnToEditor = false;
    this.ownerStatementReturnAfterInvoiceDetail = false;
    this.cdr.markForCheck();
  }

navigateAccountingShellListUrl(queryParams: Record<string, string | null> = {}): void {
    const params = Object.entries(queryParams)
      .filter(([, value]) => value != null && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
    const url = params.length > 0
      ? `${RouterUrl.AccountingList}?${params.join('&')}`
      : RouterUrl.AccountingList;
    this.router.navigateByUrl(url);
  }

  closeEmbeddedInvoiceEditor(): void {
    if (this.ownerStatementReturnAfterInvoiceDetail) {
      this.ownerStatementReturnAfterInvoiceDetail = false;
      this.activeInvoiceId = null;
      this.selectedInvoice = null;
      this.selectedTabIndex = this.tabOwners;
      this.selectedOwnerKind = this.ownerStatementReturnOwnerKind;
      if (this.isOwnerReportView(this.selectedOwnerKind)) {
        this.selectedOwnerStatementReportKind = this.ownerStatementReturnReportKind;
      }
      if (this.selectedOwnerKind === 'ownerStatements') {
        this.ownersStatementsRefreshTrigger++;
      }
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({
          tab: String(this.tabOwners),
          ownerKind: this.ownerStatementReturnOwnerKind
        }),
        queryParamsHandling: 'merge'
      });
      return;
    }

    this.activeInvoiceId = null;
    this.selectedInvoice = null;
    this.selectedTabIndex = 0;
    this.cdr.markForCheck();

    // Deep-link detail route (accounting/:id) → return to list URL.
    // In-shell opens already live on AccountingList, so only refresh query params.
    if (this.route.snapshot.paramMap.get('id')) {
      this.navigateAccountingShellListUrl(this.buildShellQueryParams({ tab: '0' }));
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ tab: '0' }),
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    if (!this.organizationId) {
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(
            o => o.organizationId === this.organizationId && o.isActive
          );

          if (!this.initialOfficeScopeApplied) {
            this.initialOfficeScopeApplied = true;
            if (this.dateRangePinned) {
              if (this.selectedOfficeId != null && !this.offices.some(office => office.officeId === this.selectedOfficeId)) {
                this.selectedOfficeId = null;
              }
              this.applyPageOfficeScope(this.selectedOfficeId);
            } else {
              this.applyOfficeFromGlobal(this.globalSelectionService.getSelectedOfficeIdValue());
            }
            this.syncBillsSearchRequest();
            this.refreshListsForActiveTab();
          }
        });
      },
      error: () => {
        this.offices = [];
      }
    });
  }
  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.clearInvalidChartOfAccountSelection();
      });
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.loadPropertyCodes().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.glProperties = properties || [];
            this.refreshBillsPropertyOptions();
            this.refreshPropertyOptions();
          },
          error: () => {
            this.glProperties = [];
            this.shellBillsPropertyTitleBarOptions = [];
            this.selectedBillsPropertyId = null;
            this.availableGlProperties = [];
            this.selectedGlPropertyId = null;
          }
        });
      }
    });
  }

  refreshBillsPropertyOptions(): void {
    const filteredProperties = this.selectedOfficeId == null
      ? this.glProperties
      : this.glProperties.filter(property => property.officeId === this.selectedOfficeId);
    this.shellBillsPropertyTitleBarOptions = filteredProperties.map(property => ({
      value: property.propertyId,
      label: property.propertyCode
    }));
    if (this.selectedBillsPropertyId && !filteredProperties.some(property => property.propertyId === this.selectedBillsPropertyId)) {
      this.selectedBillsPropertyId = null;
    }
  }

  loadReservationCodes(): void {
    this.reservationService.getReservationCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: reservations => {
        this.glReservations = reservations || [];
        this.refreshReservationOptions();
      },
      error: () => {
        this.glReservations = [];
        this.availableGlReservations = [];
        this.selectedGlReservationId = null;
      }
    });
  }

  refreshPropertyOptions(): void {
    const filteredProperties = this.selectedOfficeId == null
      ? this.glProperties
      : this.glProperties.filter(property => property.officeId === this.selectedOfficeId);
    this.availableGlProperties = filteredProperties.map(property => ({
      value: property.propertyId,
      label: property.propertyCode
    }));

    if (this.selectedGlPropertyId && !filteredProperties.some(property => property.propertyId === this.selectedGlPropertyId)) {
      this.selectedGlPropertyId = null;
    }
  }

  refreshReservationOptions(): void {
    const officeFilteredReservations = this.selectedOfficeId == null
      ? this.glReservations
      : this.glReservations.filter(reservation => reservation.officeId === this.selectedOfficeId);
    const filteredReservations = this.selectedGlPropertyId == null
      ? officeFilteredReservations
      : officeFilteredReservations.filter(reservation => reservation.propertyId === this.selectedGlPropertyId);
    this.availableGlReservations = filteredReservations.map(reservation => ({
      value: reservation.reservationId,
      label: this.utilityService.getReservationDropdownLabel(reservation, null)
    }));

    if (this.selectedGlReservationId && !filteredReservations.some(reservation => reservation.reservationId === this.selectedGlReservationId)) {
      this.selectedGlReservationId = null;
    }
  }

  syncGlFiltersFromInvoiceContext(): void {
    if (!this.usesGeneralLedgerTitleBarFilters()) {
      return;
    }

    if (!this.selectedGlReservationId && this.selectedReservationId) {
      this.selectedGlReservationId = this.selectedReservationId;
    }

    if (!this.selectedGlPropertyId && this.selectedGlReservationId) {
      const reservation = this.glReservations.find(item => item.reservationId === this.selectedGlReservationId);
      if (reservation?.propertyId) {
        this.selectedGlPropertyId = reservation.propertyId;
      }
    }
  }
  //#endregion

  //#region Utility Methods
  refreshSecurityDepositsOwedBadge(): void {
    this.securityDepositService.refreshSecurityDepositsOutstanding();
  }

  ngOnDestroy(): void {
    this.releaseRentRollTransitionLock();
    window.removeEventListener(this.clearPinsEventName, this.onClearPins);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClearPins = (): void => {
    if (!this.dateRangePinned) {
      return;
    }
    this.dateRangePinned = false;
    this.cdr.markForCheck();
  };
  //#endregion
}
