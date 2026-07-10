import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, skip, take, takeUntil, filter, finalize, firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
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
import { ReceiptPrefill, ReceiptRequest, ReceiptSelection } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { WorkOrderComponent } from '../../maintenance/work-order/work-order.component';
import { WorkOrderCreateComponent } from '../../maintenance/work-order-create/work-order-create.component';
import { WorkOrderListComponent, WorkOrderSelection } from '../../maintenance/work-order-list/work-order-list.component';
import { WorkOrderPreviewSelection } from '../../maintenance/models/work-order.model';
import { ReceiptsListComponent } from '../../maintenance/receipts-list/receipts-list.component';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { WorkOrderService } from '../../maintenance/services/work-order.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { InvoiceComponent } from '../invoice/invoice.component';
import { InvoiceCreateComponent } from '../invoice-create/invoice-create.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { InvoiceService } from '../services/invoice.service';
import { InvoicePreviewSelection } from '../models/invoice.model';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { GeneralLedgerListComponent } from '../general-ledger-list/general-ledger-list.component';
import { FinancialReportComponent } from '../financial-report/financial-report.component';
import { ArAgingReportComponent } from '../ar-aging-report/ar-aging-report.component';
import { AR_AGING_DATE_PRESET_OPTIONS, AR_AGING_INTERVAL_OPTIONS, AR_AGING_SORT_BY_OPTIONS, AR_AGING_THROUGH_ALL_VALUE, AR_AGING_THROUGH_OPTIONS, ArAgingDatePreset, ArAgingReportFilters, ArAgingSortBy, normalizeArAgingThroughDays, resolveArAgingAsOfDate } from '../models/ar-aging-report.model';
import { RentRollComponent } from '../rent-roll/rent-roll.component';
import { OwnerReportComponent } from '../owner-report/owner-report.component';
import { OwnerStatementCreateComponent } from '../owner-statement-create/owner-statement-create.component';
import { OwnerStatementListComponent } from '../owner-statement-list/owner-statement-list.component';
import { AccountingShellBankActivityKind, AccountingShellBillsReceiptKind, AccountingShellGeneralLedgerKind, AccountingShellOwnerKind, AccountingShellReportKind } from '../models/accounting-shell.model';
import { JournalEntryRecapComponent } from '../journal-entry-recap/journal-entry-recap.component';
import { TransferReportComponent } from '../transfer-report/transfer-report.component';
import { FinancialReportKind } from '../models/financial-report.model';
import { RentRollCreateBillRequest } from '../models/rent-roll.model';
import { CostCodesService } from '../services/cost-codes.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { Class, ClassLabels } from '../models/accounting-enum';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { JournalEntrySyncResult } from '../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection, OwnerStatementJournalEntryLineSearchRequest, OwnerStatementListViewState, OwnerStatementMonthLineListDisplay, OwnerStatementReportKind } from '../models/owner-statement.model';
import { OwnerReportDetailsComponent } from '../owner-report-details/owner-report-details.component';
import { OwnerReportsCacheService } from '../services/owner-reports-cache.service';

type JournalEntrySyncProgressKey =
  | 'invoice'
  | 'bill'
  | 'receipt'
  | 'workOrder'
  | 'departureFee'
  | 'linenAndTowelFee';

interface JournalEntrySyncProgressRow {
  key: JournalEntrySyncProgressKey;
  label: string;
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  status: string;
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
    WorkOrderListComponent,
    WorkOrderComponent,
    WorkOrderCreateComponent,
    GeneralLedgerListComponent,
    JournalEntryRecapComponent,
    TransferReportComponent,
    GeneralLedgerComponent,
    FinancialReportComponent,
    ArAgingReportComponent,
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
  private readonly clearPinsEventName = 'rentall-clear-pins';
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingInvoiceEditor') accountingInvoiceEditor?: InvoiceComponent;
  @ViewChild('financialReport') financialReport?: FinancialReportComponent;
  @ViewChild('arAgingReport') arAgingReport?: ArAgingReportComponent;
  @ViewChild('billsReceiptsMenuTrigger') billsReceiptsMenuTrigger?: MatMenuTrigger;
  @ViewChild('bankActivitiesMenuTrigger') bankActivitiesMenuTrigger?: MatMenuTrigger;
  @ViewChild('ownersMenuTrigger') ownersMenuTrigger?: MatMenuTrigger;
  @ViewChild('reportsMenuTrigger') reportsMenuTrigger?: MatMenuTrigger;
  @ViewChild('generalLedgerMenuTrigger') generalLedgerMenuTrigger?: MatMenuTrigger;

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
    { kind: 'transferReport', label: 'Transfer Report' },
    { kind: 'deposits', label: 'Deposits' },
    { kind: 'printChecks', label: 'Print Checks' },
    { kind: 'reconcile', label: 'Reconcile' }
  ];
  readonly shellOwnerMenuOptions: { kind: AccountingShellOwnerKind; label: string }[] = [
    { kind: 'workOrders', label: 'Work Orders' },
    { kind: 'utilities', label: 'Utilities & Bills' },
    { kind: 'statements', label: 'Accrual & Cash' },
    { kind: 'ownerStatements', label: 'Owner Statements' }
  ];
  readonly shellReportMenuOptions: { kind: AccountingShellReportKind; label: string }[] = [
    { kind: 'profitLoss', label: 'Profit & Loss' },
    { kind: 'balanceSheet', label: 'Balance Sheet' },
    { kind: 'arAging', label: 'AR Aging' }
  ];
  readonly shellGeneralLedgerMenuOptions: { kind: AccountingShellGeneralLedgerKind; label: string }[] = [
    { kind: 'ledger', label: 'General Ledger' },
    { kind: 'recap', label: 'Journal Entry Recap' }
  ];
  selectedBillsReceiptKind: AccountingShellBillsReceiptKind = 'bills';
  selectedBankActivityKind: AccountingShellBankActivityKind = 'deposits';
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
  userId = '';
  startDate: Date | null = null;
  endDate: Date | null = null;
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
  selectedChartOfAccountId: number | null = null;
  selectedFinancialReportClass: Class = Class.TotalOnly;
  selectedArAgingDatePreset: ArAgingDatePreset = 'today';
  selectedArAgingIntervalDays = 30;
  selectedArAgingThroughValue = 90;
  selectedArAgingSortBy: ArAgingSortBy = 'default';
  arAgingReportFilters: ArAgingReportFilters = this.buildArAgingReportFilters();
  readonly shellArAgingDatePresetOptions = AR_AGING_DATE_PRESET_OPTIONS;
  readonly shellArAgingIntervalOptions = AR_AGING_INTERVAL_OPTIONS;
  readonly shellArAgingThroughOptions = AR_AGING_THROUGH_OPTIONS;
  readonly shellArAgingSortByOptions = AR_AGING_SORT_BY_OPTIONS;
  selectedGlPropertyId: string | null = null;
  selectedGlReservationId: string | null = null;
  selectedBillsPropertyId: string | null = null;
  shellBillsPropertyTitleBarOptions: SearchableSelectOption[] = [];
  glProperties: PropertyCodeResponse[] = [];
  glReservations: ReservationCodeResponse[] = [];
  availableGlProperties: SearchableSelectOption[] = [];
  availableGlReservations: SearchableSelectOption[] = [];
  showGeneralLedgerDetail = false;
  activeJournalEntryId: string | null = null;
  selectedJournalEntryLineId: string | null = null;
  generalLedgerRefreshTrigger = 0;
  financialReportsRefreshTrigger = 0;
  depositsRefreshTrigger = 0;
  printChecksRefreshTrigger = 0;
  transferReportRefreshTrigger = 0;
  ownersUtilitiesRefreshTrigger = 0;
  ownersWorkOrdersRefreshTrigger = 0;
  ownersStatementsRefreshTrigger = 0;
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
  showOwnersWorkOrderDetail = false;
  selectedOwnersWorkOrderId: string | null = null;
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

  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private organizationService: OrganizationService,
    private costCodesService: CostCodesService,
    private chartOfAccountsService: ChartOfAccountsService,
    private generalLedgerService: GeneralLedgerService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private receiptService: ReceiptService,
    private workOrderService: WorkOrderService,
    private invoiceService: InvoiceService,
    private ownerReportsCacheService: OwnerReportsCacheService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
  }

  //#region Accounting
  ngOnInit(): void {
    window.addEventListener(this.clearPinsEventName, this.onClearPins);
    this.userId = this.authService.getUser()?.userId || '';
    this.applyPinnedDateRangeFromStorage();
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe();
    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.loadChartOfAccounts();
    this.loadPropertyCodes();
    this.loadReservationCodes();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.initializeSuperAdminFilters();
    if (!this.isSuperAdmin) {
      this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      this.loadOffices();
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
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
      if (invoiceId && this.selectedTabIndex !== 0) {
        this.selectedTabIndex = 0;
      }
    });
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
  }

  onAccountingInvoiceReservationDropdownChange(value: string | number | null): void {
    const reservationId = value == null || value === '' ? null : String(value);
    if (!reservationId && !this.selectedReservationId) {
      return;
    }
    this.selectedReservationId = reservationId;
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
  onGeneralLedgerLineSelect(event: { journalEntryId: string; journalEntryLineId: string }): void {
    this.activeJournalEntryId = event.journalEntryId;
    this.selectedJournalEntryLineId = event.journalEntryLineId;
    this.showGeneralLedgerDetail = true;
  }

  onGeneralLedgerBack(): void {
    const shouldRefreshOwnerStatements = this.selectedTabIndex === this.tabOwners
      && this.isOwnerReportView(this.selectedOwnerKind)
      && this.showOwnerStatementJournalEntryLines;
    this.showGeneralLedgerDetail = false;
    this.activeJournalEntryId = null;
    this.selectedJournalEntryLineId = null;
    if (shouldRefreshOwnerStatements) {
      this.ownersStatementsRefreshTrigger++;
    }
  }

  onOwnerStatementJournalEntryLineSelect(event: { journalEntryId: string; journalEntryLineId: string }): void {
    this.activeJournalEntryId = event.journalEntryId;
    this.selectedJournalEntryLineId = event.journalEntryLineId;
    this.showGeneralLedgerDetail = true;
  }

  onShellChartOfAccountDropdownChange(value: string | number | null): void {
    const chartOfAccountId = value == null || value === '' ? null : Number(value);
    if (this.selectedChartOfAccountId === chartOfAccountId) {
      return;
    }
    this.selectedChartOfAccountId = chartOfAccountId;
    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    this.refreshGeneralLedgerListView();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
  }

  onShellGlPropertyDropdownChange(value: string | number | null): void {
    const propertyId = value == null || value === '' ? null : String(value);
    if (this.selectedGlPropertyId === propertyId) {
      return;
    }
    this.selectedGlPropertyId = propertyId;
    this.refreshReservationOptions();
    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    this.refreshGeneralLedgerListView();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
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
    }
    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    this.refreshGeneralLedgerListView();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Financial Report Drill-Down
  onFinancialReportDrillDownBack(): void {
    if (this.isArAgingDrillDownActive) {
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
    if (this.selectedTabIndex === this.tabReports && this.selectedReportKind !== 'arAging') {
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
  onArAgingDrillDownActiveChange(active: boolean): void {
    this.isArAgingDrillDownActive = active;
    this.cdr.markForCheck();
  }

  onArAgingJournalEntriesChanged(): void {
    this.onJournalEntriesChanged();
  }

  usesArAgingTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabReports && this.selectedReportKind === 'arAging';
  }

  get showArAgingCustomAsOfDate(): boolean {
    return this.selectedArAgingDatePreset === 'custom';
  }

  buildArAgingReportFilters(): ArAgingReportFilters {
    return {
      datePreset: this.selectedArAgingDatePreset,
      asOfDate: resolveArAgingAsOfDate(
        this.selectedArAgingDatePreset,
        this.utilityService.formatDateOnlyForApi(this.endDate)
      ),
      intervalDays: this.selectedArAgingIntervalDays,
      throughDays: normalizeArAgingThroughDays(this.selectedArAgingThroughValue),
      sortBy: this.selectedArAgingSortBy
    };
  }

  syncArAgingReportFilters(): void {
    this.arAgingReportFilters = this.buildArAgingReportFilters();
  }

  onShellArAgingDatePresetChange(value: string | number | null): void {
    const datePreset = String(value ?? '') as ArAgingDatePreset;
    if (!this.shellArAgingDatePresetOptions.some(option => option.value === datePreset)) {
      return;
    }

    this.selectedArAgingDatePreset = datePreset;
    this.syncArAgingAsOfDateFromFilters();
    this.publishArAgingFilterState();
  }

  onShellArAgingIntervalChange(value: string | number | null): void {
    const intervalDays = Number(value);
    if (!Number.isFinite(intervalDays) || !this.shellArAgingIntervalOptions.some(option => option.value === intervalDays)) {
      return;
    }

    this.selectedArAgingIntervalDays = intervalDays;
    this.publishArAgingFilterState();
  }

  onShellArAgingThroughChange(value: string | number | null): void {
    const throughValue = Number(value);
    if (!Number.isFinite(throughValue) || !this.shellArAgingThroughOptions.some(option => option.value === throughValue)) {
      return;
    }

    this.selectedArAgingThroughValue = throughValue;
    this.publishArAgingFilterState();
  }

  onShellArAgingSortByChange(value: string | number | null): void {
    const sortBy = String(value ?? '') as ArAgingSortBy;
    if (!this.shellArAgingSortByOptions.some(option => option.value === sortBy)) {
      return;
    }

    this.selectedArAgingSortBy = sortBy;
    this.publishArAgingFilterState();
  }

  syncArAgingAsOfDateFromFilters(): void {
    const asOfDate = this.utilityService.parseDateOnlyStringToDate(
      resolveArAgingAsOfDate(
        this.selectedArAgingDatePreset,
        this.utilityService.formatDateOnlyForApi(this.endDate)
      )
    );
    if (!asOfDate) {
      return;
    }

    this.endDate = asOfDate;
    this.syncInvoiceSearchDateRange();
    this.syncArAgingReportFilters();
  }

  publishArAgingFilterState(): void {
    this.syncArAgingAsOfDateFromFilters();
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
      this.syncBillsSearchRequest();
    }
    this.selectedBillsPropertyId = propertyId;
    this.syncBillsSearchRequest();

    const openReceiptDetail = (property: PropertyResponse | null) => {
      this.selectedTabIndex = this.tabBillsReceipts;
      this.selectedBillsReceiptKind = 'bills';
      this.billsReceiptOrigin = origin;
      this.billsReceiptProperty = property;
      this.billsReceiptAgreementLineId = this.toAgreementLineId(selection?.agreementLineId);
      this.billsReceiptAgreementLineNotes = (selection?.notes || '').trim() || null;
      this.billsReceiptAutoSaveAttemptToken = selection?.autoSaveValidationAttempt ? Date.now() : 0;
      this.selectedBillsReceiptId = receiptId;
      this.billsReceiptPrefill = null;
      this.showBillsReceiptDetail = true;
    };

    if (propertyId) {
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: (property: PropertyResponse) => openReceiptDetail(property),
        error: () => {
          this.toastr.warning('Unable to load property details for this bill. Opening bill anyway.', 'Warning');
          openReceiptDetail(this.buildBillsReceiptPropertyStub(officeId));
        }
      });
      return;
    }

    openReceiptDetail(this.buildBillsReceiptPropertyStub(officeId));
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
      this.selectedBillsReceiptId = null;
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
    this.depositsRefreshTrigger++;
    this.printChecksRefreshTrigger++;
    this.transferReportRefreshTrigger++;
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
      this.syncBillsSearchRequest();
    }
    this.selectedBillsPropertyId = propertyId;
    this.syncBillsSearchRequest();

    const openReceiptDetail = (property: PropertyResponse | null) => {
      this.selectedTabIndex = this.tabBillsReceipts;
      this.selectedBillsReceiptKind = 'receipts';
      this.receiptsReceiptProperty = property;
      this.selectedReceiptsReceiptId = receiptId;
      this.showReceiptsReceiptDetail = true;
    };

    if (propertyId) {
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: (property: PropertyResponse) => openReceiptDetail(property),
        error: () => this.toastr.error('Unable to load property for receipt.', 'Error')
      });
      return;
    }

    openReceiptDetail(this.buildBillsReceiptPropertyStub(officeId));
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

    const openReceiptDetail = (property: PropertyResponse | null) => {
      this.selectedTabIndex = this.tabOwners;
      this.selectedOwnerKind = 'utilities';
      this.ownersUtilityReceiptProperty = property;
      this.selectedOwnersUtilityReceiptId = receiptId;
      this.showOwnersUtilityReceiptDetail = true;
    };

    if (propertyId) {
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: (property: PropertyResponse) => openReceiptDetail(property),
        error: () => this.toastr.error('Unable to load property for utility bill.', 'Error')
      });
      return;
    }

    openReceiptDetail(this.buildBillsReceiptPropertyStub(officeId));
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

    const openWorkOrderDetail = (property: PropertyResponse | null) => {
      this.selectedTabIndex = this.tabOwners;
      this.selectedOwnerKind = 'workOrders';
      this.ownersWorkOrderProperty = property;
      this.selectedOwnersWorkOrderId = workOrderId;
      this.ownersWorkOrderDetailInstance++;
      this.showOwnersWorkOrderDetail = true;
      this.cdr.detectChanges();
    };

    if (propertyId) {
      openWorkOrderDetail(this.buildOwnersWorkOrderPropertyStub(resolvedOfficeId, propertyId));
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: (property: PropertyResponse) => {
          this.ownersWorkOrderProperty = property;
          this.cdr.detectChanges();
        },
        error: () => this.toastr.error('Unable to load property for work order.', 'Error')
      });
      return;
    }

    openWorkOrderDetail(this.buildBillsReceiptPropertyStub(resolvedOfficeId));
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

  private clearWorkOrderCreateState(): void {
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

  private openOwnerStatementJournalEntryByCode(journalEntryCode: string, journalEntryLineId: string | null): void {
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

  private openOwnerStatementInvoice(activityId: string, invoiceCode: string, officeId: number | null): void {
    const openInvoice = (invoiceId: string) => {
      this.captureOwnerStatementReturnContext();
      this.ownerStatementReturnAfterInvoiceDetail = true;
      this.selectedTabIndex = 0;
      this.activeInvoiceId = invoiceId;
      this.selectedOfficeId = officeId;
      this.syncBillsSearchRequest();
    };

    if (activityId) {
      openInvoice(activityId);
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

        openInvoice(invoice.invoiceId);
      },
      error: () => this.toastr.error('Unable to locate invoice by code.', 'Error')
    });
  }

  private openOwnerStatementReceipt(activityId: string, receiptCode: string, officeId: number | null, propertyId: string | null): void {
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
        this.onOwnersUtilityReceiptSelect({ receiptId: matched.receiptId, officeId, propertyId });
      },
      error: () => this.toastr.error('Unable to locate receipt by code.', 'Error')
    });
  }

  private openOwnerStatementWorkOrder(activityId: string, workOrderCode: string, propertyId: string | null): void {
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

  onTabChange(event: { index: number }): void {
    if (!this.hasAccountingFullAccess && event.index > this.tabMaxIndexLimited) {
      this.selectedTabIndex = 0;
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
    }
    if (event.index !== this.tabReports) {
      this.isFinancialReportDrillDownActive = false;
      this.isFinancialReportJournalEntryDetailActive = false;
      this.isArAgingDrillDownActive = false;
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
    if (this.usesFinancialReportTitleBarFilters()) {
      this.financialReportsRefreshTrigger++;
      queueMicrotask(() => this.syncFinancialReportDrillDownActiveState());
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
  }

  selectBankActivity(kind: AccountingShellBankActivityKind): void {
    this.bankActivitiesMenuTrigger?.closeMenu();
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedBankActivityKind !== kind;

    if (kindChanged) {
      this.onGeneralLedgerBack();
    }

    this.selectedBankActivityKind = kind;

    if (previousTab !== this.tabBankActivities) {
      this.onTabChange({ index: this.tabBankActivities });
      return;
    }

    if (kindChanged) {
      this.refreshActiveBankActivityList();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ bankActivity: kind }),
        queryParamsHandling: 'merge'
      });
    }
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

    if (kindChanged) {
      if (kind !== 'recap') {
        this.refreshGeneralLedgerListView();
      }
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.buildShellQueryParams({ glView: kind }),
        queryParamsHandling: 'merge'
      });
    }
  }

  selectReport(kind: AccountingShellReportKind): void {
    this.reportsMenuTrigger?.closeMenu();
    const previousTab = this.selectedTabIndex;
    const kindChanged = this.selectedReportKind !== kind;
    this.selectedReportKind = kind;

    if (previousTab !== this.tabReports) {
      this.onTabChange({ index: this.tabReports });
      return;
    }

    if (kind === 'arAging') {
      this.isFinancialReportDrillDownActive = false;
      this.isFinancialReportJournalEntryDetailActive = false;
      this.isArAgingDrillDownActive = false;
      this.syncArAgingAsOfDateFromFilters();
      if (kindChanged) {
        this.financialReportsRefreshTrigger++;
      }
    } else if (kindChanged) {
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
    if (this.selectedBankActivityKind === 'transferReport') {
      this.transferReportRefreshTrigger++;
      return;
    }
    this.depositsRefreshTrigger++;
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
    if (!this.showOwnerReportGoButton) {
      return;
    }
    this.syncOwnerReportsBundleSearchRequest();
    this.ownerReportsCacheService.load(this.billsSearchRequest).pipe(take(1)).subscribe({
      next: () => {
        this.ownersStatementsRefreshTrigger++;
        this.generalLedgerRefreshTrigger++;
        this.cdr.markForCheck();
      },
      error: () => {
        this.ownerReportsCacheService.clear();
        this.ownersStatementsRefreshTrigger++;
        this.generalLedgerRefreshTrigger++;
        this.cdr.markForCheck();
      }
    });
  }

  syncOwnerReportsBundleSearchRequest(): void {
    this.syncInvoiceSearchDateRange();
    const propertyId = this.selectedTabIndex === this.tabGeneralLedger && this.selectedGeneralLedgerKind === 'recap'
      ? this.selectedGlPropertyId
      : this.selectedBillsPropertyId;
    this.billsSearchRequest = {
      officeIds: this.resolveOfficeIdsForBillsSearch(),
      propertyId: propertyId || null,
      startDate: this.utilityService.formatDateOnlyForApi(this.startDate),
      endDate: this.utilityService.formatDateOnlyForApi(this.endDate)
    };
  }

  private refreshGeneralLedgerListView(): void {
    if (this.selectedTabIndex !== this.tabGeneralLedger || this.selectedGeneralLedgerKind !== 'ledger') {
      return;
    }
    this.generalLedgerRefreshTrigger++;
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
    if (this.usesFinancialReportTitleBarFilters()) {
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
      queryParams: this.buildShellQueryParams(),
      queryParamsHandling: 'merge'
    });
  }
  //#endregion

  //#region Pinned Date Range
  toggleDateRangePin(): void {
    this.dateRangePinned = !this.dateRangePinned;
    if (this.dateRangePinned) {
      this.onDateRangeChange();
      this.persistPinnedDateRange();
      return;
    }
    this.clearPinnedDateRangeStorage();
    this.setDefaultDateRange();
    this.publishDateRangeState();
  }

  applyPinnedDateRangeFromStorage(): void {
    const stored = this.readPinnedDateRangeFromStorage();
    if (stored?.enabled && stored.startDate && stored.endDate) {
      const start = this.utilityService.parseCalendarDateInput(stored.startDate);
      const end = this.utilityService.parseCalendarDateInput(stored.endDate);
      if (start && end) {
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        this.dateRangePinned = true;
        this.startDate = start;
        this.endDate = end;
        this.syncInvoiceSearchDateRange();
        this.syncBillsSearchRequest();
        return;
      }
      this.clearPinnedDateRangeStorage();
    }

    this.dateRangePinned = false;
    this.setDefaultDateRange();
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
  }

  persistPinnedDateRange(): void {
    if (!this.dateRangePinned || !this.startDate || !this.endDate) {
      return;
    }

    const startDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const endDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    if (!startDate || !endDate) {
      return;
    }

    localStorage.setItem(this.getPinnedDateRangeStorageKey(), JSON.stringify({
      enabled: true,
      startDate,
      endDate
    }));
  }

  readPinnedDateRangeFromStorage(): { enabled: boolean; startDate: string; endDate: string } | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const rawValue = localStorage.getItem(this.getPinnedDateRangeStorageKey());
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as { enabled?: boolean; startDate?: string; endDate?: string };
      if (parsed?.enabled !== true || !parsed.startDate || !parsed.endDate) {
        return null;
      }
      return {
        enabled: true,
        startDate: String(parsed.startDate),
        endDate: String(parsed.endDate)
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
      && !this.isOwnersUtilityReceiptDetailActive
      && !this.isOwnersWorkOrderDetailActive
      && !this.isWorkOrderCreateActive
      && !this.isFinancialReportDrillDownActive
      && !this.isArAgingDrillDownActive;
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

  private beginJournalEntrySyncTools(): void {
    this.isJournalEntrySyncInProgress = true;
    this.cdr.detectChanges();
  }

  private finishJournalEntrySyncTools(markSyncProgressComplete: boolean = false): void {
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
      { key: 'departureFee', label: 'Departure Fees', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' },
      { key: 'linenAndTowelFee', label: 'Linen & Towel Fees', total: 0, processed: 0, skipped: 0, errors: 0, status: 'Pending' }
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
      this.selectedBankActivityKind = 'deposits';
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

  get showOwnerReportGoButton(): boolean {
    if (this.isOwnerStatementCreateActive) {
      return false;
    }

    if (this.selectedTabIndex === this.tabOwners
      && (this.isOwnerReportView(this.selectedOwnerKind) || this.selectedOwnerKind === 'ownerStatements')) {
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

  private captureOwnerStatementReturnContext(): void {
    if (this.isOwnerReportView(this.selectedOwnerKind)) {
      this.ownerStatementReturnOwnerKind = this.selectedOwnerKind;
      this.ownerStatementReturnReportKind = this.selectedOwnerStatementReportKind;
    }
  }

  usesFinancialReportTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabReports && this.selectedReportKind !== 'arAging';
  }

  get showAccountingShellStartDate(): boolean {
    return !(this.selectedTabIndex === this.tabReports && (this.selectedReportKind === 'balanceSheet' || this.selectedReportKind === 'arAging'));
  }

  get accountingShellEndDateLabel(): string {
    return this.selectedTabIndex === this.tabReports && (this.selectedReportKind === 'balanceSheet' || this.selectedReportKind === 'arAging')
      ? 'As of'
      : 'End Date';
  }

  usesGeneralLedgerTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabGeneralLedger;
  }

  get showGeneralLedgerChartOfAccountFilter(): boolean {
    return this.usesGeneralLedgerTitleBarFilters() && this.selectedGeneralLedgerKind === 'ledger';
  }

  usesReportTitleBarFilters(): boolean {
    return this.usesFinancialReportTitleBarFilters() || this.usesArAgingTitleBarFilters() || this.usesGeneralLedgerTitleBarFilters();
  }

  get shellOfficeTitleBarOptions(): { value: number, label: string }[] {
    return this.getOfficeOptions(this.offices);
  }

  get shellChartOfAccountTitleBarOptions(): { value: number, label: string }[] {
    const accounts = (this.chartOfAccounts || [])
      .filter(account => this.selectedOfficeId == null || account.officeId === this.selectedOfficeId)
      .sort((a, b) => a.accountNo.localeCompare(b.accountNo, undefined, { numeric: true, sensitivity: 'base' }));

    return accounts.map(account => ({
      value: account.accountId,
      label: this.utilityService.getChartOfAccountDropdownLabel(account)
    }));
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
    this.applyPageOfficeScope(officeId);
    if (officeChanged) {
      this.selectedCompanyId = null;
      this.selectedReservationId = null;
    }
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
  }

  onAccountingOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? null : String(value);
    this.selectedOrganizationId = organizationId;
  }

  applyQueryParamState(params: Record<string, string>): void {
    let tabIndex = getNumberQueryParam(params, 'tab', 0, this.tabMaxIndex + 3);
    if (tabIndex !== null) {
      if ('report' in params) {
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
      if (bankActivity === 'transferReport' || bankActivity === 'deposits' || bankActivity === 'printChecks' || bankActivity === 'reconcile') {
        this.selectedBankActivityKind = bankActivity;
      }
    }

    if ('ownerKind' in params) {
      const ownerKind = params['ownerKind'];
      if (
        ownerKind === 'utilities'
        || ownerKind === 'workOrders'
        || ownerKind === 'statements'
        || ownerKind === 'ownerStatements'
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
      if (report === 'profitLoss' || report === 'balanceSheet' || report === 'arAging') {
        this.selectedReportKind = report;
      }
    }

    if ('glView' in params) {
      const glView = params['glView'];
      if (glView === 'ledger' || glView === 'recap') {
        this.selectedGeneralLedgerKind = glView;
      }
    }

    if ('officeId' in params) {
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

    if (this.usesArAgingTitleBarFilters() || ('report' in params && params['report'] === 'arAging')) {
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

      this.syncArAgingAsOfDateFromFilters();
    }

    this.syncArAgingReportFilters();

    if (this.usesGeneralLedgerTitleBarFilters()) {
      if ('chartOfAccountId' in params) {
        this.selectedChartOfAccountId = getNumberQueryParam(params, 'chartOfAccountId');
      } else {
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
    }

    const startDateParam = getStringQueryParam(params, 'startDate');
    const endDateParam = getStringQueryParam(params, 'endDate');
    if (startDateParam || endDateParam) {
      const previousStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
      const previousEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
      this.startDate = this.utilityService.parseDateOnlyStringToDate(startDateParam);
      this.endDate = this.utilityService.parseDateOnlyStringToDate(endDateParam);
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
            this.depositsRefreshTrigger++;
            this.printChecksRefreshTrigger++;
            this.transferReportRefreshTrigger++;
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
    let resolvedOfficeId: number | null = officeId;
    if (this.offices.length === 1) {
      resolvedOfficeId = this.offices[0].officeId;
    } else if (this.offices.length > 1) {
      resolvedOfficeId = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
    }
    const officeChanged = this.selectedOfficeId !== resolvedOfficeId;
    this.applyPageOfficeScope(resolvedOfficeId);
    if (officeChanged) {
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
  }

  setDefaultDateRange(): void {
    if (this.dateRangePinned) {
      return;
    }

    const end = new Date();
    end.setHours(0, 0, 0, 0);

    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);

    this.endDate = end;
    this.startDate = start;
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
      arAgingSort: this.usesArAgingTitleBarFilters() ? this.selectedArAgingSortBy : null,
      chartOfAccountId: this.usesGeneralLedgerTitleBarFilters() && this.selectedChartOfAccountId != null
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

    const isValid = this.shellChartOfAccountTitleBarOptions.some(option => option.value === this.selectedChartOfAccountId);
    if (!isValid) {
      this.selectedChartOfAccountId = null;
    }
  }

  private clearInvoiceShellDetailState(): void {
    this.activeInvoiceId = null;
    this.showInvoiceCreate = false;
    this.invoiceCreateContext = null;
    this.invoiceCreateReturnToEditor = false;
    this.ownerStatementReturnAfterInvoiceDetail = false;
    this.cdr.markForCheck();
  }

  private navigateAccountingShellListUrl(queryParams: Record<string, string | null> = {}): void {
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

    const currentQueryParams = this.route.snapshot.queryParams || {};
    const editorFormValue = this.accountingInvoiceEditor?.form?.getRawValue?.() || {};
    const officeIdFromEditor = editorFormValue?.officeId;
    const reservationIdFromEditor = editorFormValue?.reservationId;
    const reservationIdFromEditorSelection = this.accountingInvoiceEditor?.selectedReservation?.reservationId ?? null;

    const officeIdToUse = this.selectedOfficeId
      ?? getNumberQueryParam(currentQueryParams, 'officeId')
      ?? (officeIdFromEditor != null && officeIdFromEditor !== '' ? Number(officeIdFromEditor) : null);
    const reservationIdToUse = (reservationIdFromEditor ? String(reservationIdFromEditor) : null)
      ?? (reservationIdFromEditorSelection ? String(reservationIdFromEditorSelection) : null)
      ?? this.selectedReservationId
      ?? (currentQueryParams['reservationId'] ? String(currentQueryParams['reservationId']) : null);
    const companyIdToUse = this.selectedCompanyId
      ?? (currentQueryParams['companyId'] ? String(currentQueryParams['companyId']) : null);
    const organizationIdToUse = this.selectedOrganizationId
      ?? (currentQueryParams['organizationId'] ? String(currentQueryParams['organizationId']) : null);

    this.selectedOfficeId = officeIdToUse;
    this.selectedReservationId = reservationIdToUse;
    this.selectedCompanyId = companyIdToUse;
    this.selectedOrganizationId = organizationIdToUse;

    const params: string[] = ['tab=0'];
    if (officeIdToUse !== null && officeIdToUse !== undefined) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    if (companyIdToUse) {
      params.push(`companyId=${companyIdToUse}`);
    }
    if (organizationIdToUse) {
      params.push(`organizationId=${organizationIdToUse}`);
    }

    const url = params.length > 0
      ? `${RouterUrl.AccountingList}?${params.join('&')}`
      : RouterUrl.AccountingList;
    this.router.navigateByUrl(url);
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
            if (this.offices.length === 1) {
              this.applyPageOfficeScope(this.offices[0].officeId);
            } else {
              this.applyOfficeFromGlobal(
                this.selectedOfficeId ?? this.globalSelectionService.getSelectedOfficeIdValue()
              );
            }
            this.syncBillsSearchRequest();
          }
        });
      },
      error: () => {
        this.offices = [];
      }
    });
  }
  loadChartOfAccounts(): void {
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1), takeUntil(this.destroy$)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.clearInvalidChartOfAccountSelection();
      });
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
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
