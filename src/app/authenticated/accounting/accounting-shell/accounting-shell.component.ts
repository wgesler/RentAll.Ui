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
import { WorkOrderListComponent, WorkOrderSelection } from '../../maintenance/work-order-list/work-order-list.component';
import { ReceiptsListComponent } from '../../maintenance/receipts-list/receipts-list.component';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { InvoiceComponent } from '../invoice/invoice.component';
import { InvoiceListComponent } from '../invoice-list/invoice-list.component';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { GeneralLedgerListComponent } from '../general-ledger-list/general-ledger-list.component';
import { FinancialReportComponent } from '../financial-report/financial-report.component';
import { ArAgingReportComponent } from '../ar-aging-report/ar-aging-report.component';
import { AR_AGING_DATE_PRESET_OPTIONS, AR_AGING_INTERVAL_OPTIONS, AR_AGING_SORT_BY_OPTIONS, AR_AGING_THROUGH_ALL_VALUE, AR_AGING_THROUGH_OPTIONS, ArAgingDatePreset, ArAgingReportFilters, ArAgingSortBy, normalizeArAgingThroughDays, resolveArAgingAsOfDate } from '../models/ar-aging-report.model';
import { RentRollComponent } from '../rent-roll/rent-roll.component';
import { AccountingShellBankActivityKind, AccountingShellBillsReceiptKind, AccountingShellOwnerKind, AccountingShellReportKind } from '../models/accounting-shell.model';
import { WorkOrderType } from '../../maintenance/models/maintenance-enums';
import { FinancialReportKind } from '../models/financial-report.model';
import { RentRollCreateBillRequest } from '../models/rent-roll.model';
import { CostCodesService } from '../services/cost-codes.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { Class, ClassLabels } from '../models/accounting-enum';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { JournalEntrySyncResult } from '../models/journal-entry.model';

@Component({
    selector: 'app-accounting-shell',
    standalone: true,
    imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    InvoiceComponent,
    InvoiceListComponent,
    ReceiptsListComponent,
    ReceiptComponent,
    WorkOrderListComponent,
    WorkOrderComponent,
    GeneralLedgerListComponent,
    GeneralLedgerComponent,
    FinancialReportComponent,
    ArAgingReportComponent,
    RentRollComponent,
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

  private readonly pinnedDateRangeStorageKeyPrefix = 'rentall-accounting-shell-pinned-dates';
  readonly tabBillsReceipts = 1;
  readonly tabBankActivities = 2;
  readonly tabOwners = 3;
  readonly tabMaxIndexLimited = 1;
  readonly tabReports = 4;
  readonly tabGeneralLedger = 5;
  readonly tabMaxIndex = 5;
  readonly ownerWorkOrderTypeId = WorkOrderType.Owner;
  readonly shellBillsReceiptMenuOptions: { kind: AccountingShellBillsReceiptKind; label: string }[] = [
    { kind: 'bills', label: 'Bills' },
    { kind: 'receipts', label: 'Receipts' },
    { kind: 'rentRoll', label: 'Rent Roll' }
  ];
  readonly shellBankActivityMenuOptions: { kind: AccountingShellBankActivityKind; label: string }[] = [
    { kind: 'deposits', label: 'Deposits' },
    { kind: 'printChecks', label: 'Print Checks' },
    { kind: 'reconcile', label: 'Reconcile' }
  ];
  readonly shellOwnerMenuOptions: { kind: AccountingShellOwnerKind; label: string }[] = [
    { kind: 'utilities', label: 'Utilities' },
    { kind: 'workOrders', label: 'Work Orders' },
    { kind: 'statements', label: 'Statements' }
  ];
  readonly shellReportMenuOptions: { kind: AccountingShellReportKind; label: string }[] = [
    { kind: 'profitLoss', label: 'Profit & Loss' },
    { kind: 'balanceSheet', label: 'Balance Sheet' },
    { kind: 'arAging', label: 'AR Aging' }
  ];
  selectedBillsReceiptKind: AccountingShellBillsReceiptKind = 'bills';
  selectedBankActivityKind: AccountingShellBankActivityKind = 'deposits';
  selectedOwnerKind: AccountingShellOwnerKind = 'utilities';
  selectedReportKind: AccountingShellReportKind = 'profitLoss';

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
  ownersUtilitiesRefreshTrigger = 0;
  ownersWorkOrdersRefreshTrigger = 0;
  showOwnersUtilityReceiptDetail = false;
  selectedOwnersUtilityReceiptId: string | null = null;
  ownersUtilityReceiptProperty: PropertyResponse | null = null;
  showOwnersWorkOrderDetail = false;
  selectedOwnersWorkOrderId: string | null = null;
  ownersWorkOrderProperty: PropertyResponse | null = null;
  ownersWorkOrderDetailInstance = 0;
  chartOfAccounts: ChartOfAccountResponse[] = [];
  isJournalEntrySyncInProgress = false;
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
            this.generalLedgerRefreshTrigger++;
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
    this.showGeneralLedgerDetail = false;
    this.activeJournalEntryId = null;
    this.selectedJournalEntryLineId = null;
  }

  onShellChartOfAccountDropdownChange(value: string | number | null): void {
    const chartOfAccountId = value == null || value === '' ? null : Number(value);
    if (this.selectedChartOfAccountId === chartOfAccountId) {
      return;
    }
    this.selectedChartOfAccountId = chartOfAccountId;
    this.onGeneralLedgerBack();
    this.financialReportsRefreshTrigger++;
    this.generalLedgerRefreshTrigger++;
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
    this.generalLedgerRefreshTrigger++;
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
    this.generalLedgerRefreshTrigger++;
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
    if (this.activeInvoiceId) {
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
      this.syncBillsSearchRequest();
    }

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
    this.ownersUtilitiesRefreshTrigger++;
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
      this.syncBillsSearchRequest();
    }

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
  }

  onOwnersUtilityReceiptSaved(): void {
    this.onOwnersUtilityReceiptBack();
    this.ownersUtilitiesRefreshTrigger++;
  }

  onOwnersWorkOrderSelect(selection: WorkOrderSelection): void {
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
  }

  onOwnersWorkOrderSaved(): void {
    this.onOwnersWorkOrderBack();
    this.ownersWorkOrdersRefreshTrigger++;
  }
  //#endregion

  //#region Tab Selection
  onTabChange(event: { index: number }): void {
    if (!this.hasAccountingFullAccess && event.index > this.tabMaxIndexLimited) {
      this.selectedTabIndex = 0;
      return;
    }

    if (event.index !== this.tabBillsReceipts) {
      this.onBillsReceiptBack();
      this.onReceiptsReceiptBack();
    }
    if (event.index !== this.tabOwners) {
      this.onOwnersUtilityReceiptBack();
      this.onOwnersWorkOrderBack();
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
      this.generalLedgerRefreshTrigger++;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.buildShellQueryParams({ tab: String(event.index) }),
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

    if (kindChanged) {
      this.onOwnersUtilityReceiptBack();
      this.onOwnersWorkOrderBack();
    }

    this.selectedOwnerKind = kind;

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
    this.depositsRefreshTrigger++;
  }

  refreshActiveOwnerView(): void {
    if (this.selectedOwnerKind === 'workOrders') {
      this.ownersWorkOrdersRefreshTrigger++;
      return;
    }
    if (this.selectedOwnerKind === 'utilities') {
      this.ownersUtilitiesRefreshTrigger++;
    }
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
      this.generalLedgerRefreshTrigger++;
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
      && !this.isFinancialReportDrillDownActive
      && !this.isArAgingDrillDownActive;
  }

  resolveOfficeIdsForJournalEntrySync(): number[] {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      return [this.selectedOfficeId];
    }

    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  async syncJournalEntries(): Promise<void> {
    const officeIds = this.resolveOfficeIdsForJournalEntrySync();
    if (officeIds.length === 0) {
      this.toastr.warning('Select at least one office before syncing journal entries.', 'Sync');
      return;
    }

    this.isJournalEntrySyncInProgress = true;
    let anySyncSucceeded = false;

    try {
      try {
        const invoiceResult = await firstValueFrom(this.generalLedgerService.syncInvoiceJournalEntries(officeIds));
        this.showJournalEntrySyncResult('Invoice sync', invoiceResult);
        anySyncSucceeded = true;
      } catch (error) {
        this.showJournalEntrySyncError('Invoice sync', error);
      }

      try {
        const billResult = await firstValueFrom(this.generalLedgerService.syncBillJournalEntries(officeIds));
        this.showJournalEntrySyncResult('Bill sync', billResult);
        anySyncSucceeded = true;
      } catch (error) {
        this.showJournalEntrySyncError('Bill sync', error);
      }

      try {
        const receiptResult = await firstValueFrom(this.generalLedgerService.syncReceiptJournalEntries(officeIds));
        this.showJournalEntrySyncResult('Receipt sync', receiptResult);
        anySyncSucceeded = true;
      } catch (error) {
        this.showJournalEntrySyncError('Receipt sync', error);
      }

      if (anySyncSucceeded) {
        this.onJournalEntriesChanged();
      }
    } finally {
      this.isJournalEntrySyncInProgress = false;
    }
  }

  clearJournalEntries(): void {
    if (!window.confirm('Delete all journal entries and journal entry lines for this organization?')) {
      return;
    }

    this.isJournalEntrySyncInProgress = true;
    this.generalLedgerService.clearAllJournalEntries().pipe(take(1), finalize(() => {
        this.isJournalEntrySyncInProgress = false;
      })
    ).subscribe({
      next: (result) => {
        this.showJournalEntrySyncResult('Journal entries cleared', result, true);
        this.onJournalEntriesChanged();
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.error(error?.error ?? 'Unable to clear journal entries.', CommonMessage.Error);
      }
    });
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

  get isGeneralLedgerDetailActive(): boolean {
    return (this.selectedTabIndex === this.tabBankActivities
      && this.selectedBankActivityKind !== 'reconcile'
      || this.selectedTabIndex === this.tabGeneralLedger)
      && this.showGeneralLedgerDetail;
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
      this.generalLedgerRefreshTrigger++;
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
      if (bankActivity === 'deposits' || bankActivity === 'printChecks' || bankActivity === 'reconcile') {
        this.selectedBankActivityKind = bankActivity;
      }
    }

    if ('ownerKind' in params) {
      const ownerKind = params['ownerKind'];
      if (ownerKind === 'utilities' || ownerKind === 'workOrders' || ownerKind === 'statements') {
        this.selectedOwnerKind = ownerKind;
      }
    }

    if ('report' in params) {
      const report = params['report'];
      if (report === 'profitLoss' || report === 'balanceSheet' || report === 'arAging') {
        this.selectedReportKind = report;
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
            this.ownersUtilitiesRefreshTrigger++;
            this.ownersWorkOrdersRefreshTrigger++;
            this.financialReportsRefreshTrigger++;
            this.generalLedgerRefreshTrigger++;
          });
        }
      }
    } else if (!this.startDate && !this.endDate && !this.dateRangePinned) {
      this.setDefaultDateRange();
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
    this.syncBillsSearchRequest();
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
    const previousStartDate = this.utilityService.formatDateOnlyForApi(this.startDate);
    const previousEndDate = this.utilityService.formatDateOnlyForApi(this.endDate);
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    this.startDate = start;
    this.endDate = end;
    if (this.dateRangePinned) {
      this.persistPinnedDateRange();
    }
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
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
      report: this.selectedTabIndex === this.tabReports ? this.selectedReportKind : null,
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

  closeEmbeddedInvoiceEditor(): void {
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
        this.refreshPropertyOptions();
      },
      error: () => {
        this.glProperties = [];
        this.availableGlProperties = [];
        this.selectedGlPropertyId = null;
      }
    });
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
