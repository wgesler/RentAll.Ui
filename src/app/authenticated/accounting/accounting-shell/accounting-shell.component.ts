import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { ReceiptSelection } from '../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { ReceiptsListComponent } from '../../maintenance/receipts-list/receipts-list.component';
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
    GeneralLedgerListComponent,
    GeneralLedgerComponent,
    FinancialReportComponent,
    TitleBarSelectComponent
],
    templateUrl: './accounting-shell.component.html',
    styleUrls: ['./accounting-shell.component.scss']
})
export class AccountingShellComponent implements OnInit, OnDestroy {
  @ViewChild(InvoiceListComponent) accountingInvoiceList?: InvoiceListComponent;
  @ViewChild('accountingInvoiceEditor') accountingInvoiceEditor?: InvoiceComponent;

  private readonly pinnedDateRangeStorageKeyPrefix = 'rentall-accounting-shell-pinned-dates';
  readonly tabReceipts = 2;
  readonly tabMaxIndexLimited = 2;
  readonly tabProfitLoss = 5;
  readonly tabBalanceSheet = 6;
  readonly tabGeneralLedger = 7;
  readonly tabMaxIndex = 7;

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
  showBillsReceiptDetail = false;
  selectedBillsReceiptId: number | null = null;
  billsReceiptProperty: PropertyResponse | null = null;
  showReceiptsReceiptDetail = false;
  selectedReceiptsReceiptId: number | null = null;
  receiptsReceiptProperty: PropertyResponse | null = null;
  selectedChartOfAccountId: number | null = null;
  selectedFinancialReportClass: Class = Class.TotalOnly;
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
  chartOfAccounts: ChartOfAccountResponse[] = [];
  isJournalEntrySyncInProgress = false;

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
    private toastr: ToastrService
  ) {
    this.syncInvoiceSearchDateRange();
    this.syncBillsSearchRequest();
  }

  //#region Accounting
  ngOnInit(): void {
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
        if (this.selectedTabIndex === 1) {
          this.billsRefreshTrigger++;
        }
        if (this.selectedTabIndex === 2) {
          this.receiptsRefreshTrigger++;
        }
        if (this.selectedTabIndex === 3) {
          this.depositsRefreshTrigger++;
        }
        if (this.selectedTabIndex === 4) {
          this.printChecksRefreshTrigger++;
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
        }
      });
    }
    this.applyQueryParamState(this.route.snapshot.queryParams);

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
    if (!this.accountingInvoiceEditor) {
      return;
    }
    this.accountingInvoiceEditor.onTitleBarOfficeChange(value);
  }

  onAccountingInvoiceEditorReservationDropdownChange(value: string | number | null): void {
    if (!this.accountingInvoiceEditor) {
      return;
    }
    this.accountingInvoiceEditor.onTitleBarReservationChange(value);
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

  //#region Bills Receipt Detail
  onBillsReceiptSelect(selection: ReceiptSelection): void {
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
      this.selectedTabIndex = 1;
      this.billsReceiptProperty = property;
      this.selectedBillsReceiptId = receiptId;
      this.showBillsReceiptDetail = true;
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

  onBillsReceiptBack(): void {
    this.showBillsReceiptDetail = false;
    this.selectedBillsReceiptId = null;
    this.billsReceiptProperty = null;
  }

  onBillsReceiptSaved(): void {
    this.onBillsReceiptBack();
    this.billsRefreshTrigger++;
  }

  onJournalEntriesChanged(): void {
    this.syncGlFiltersFromInvoiceContext();
    this.billsRefreshTrigger++;
    this.receiptsRefreshTrigger++;
    this.depositsRefreshTrigger++;
    this.printChecksRefreshTrigger++;
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
      this.selectedTabIndex = 2;
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
  //#endregion

  //#region Tab Selection
  onTabChange(event: { index: number }): void {
    if (!this.hasAccountingFullAccess && event.index > this.tabMaxIndexLimited) {
      this.selectedTabIndex = 0;
      return;
    }

    if (event.index !== 1) {
      this.onBillsReceiptBack();
    }
    if (event.index !== 2) {
      this.onReceiptsReceiptBack();
    }
    if (event.index !== 3 && event.index !== 4 && !this.usesReportTitleBarFilters()) {
      this.onGeneralLedgerBack();
    }
    this.selectedTabIndex = event.index;
    this.syncBillsSearchRequest();
    if (this.selectedTabIndex === 1) {
      this.billsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 2) {
      this.receiptsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 3) {
      this.depositsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 4) {
      this.printChecksRefreshTrigger++;
    }
    if (this.usesFinancialReportTitleBarFilters()) {
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
    if (this.selectedTabIndex === 1) {
      this.billsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 2) {
      this.receiptsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 3) {
      this.depositsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 4) {
      this.printChecksRefreshTrigger++;
    }
    if (this.usesFinancialReportTitleBarFilters()) {
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

  onPrintInvoice(event: { officeId: number | null, reservationId: string | null, invoiceId: string }): void {
    const params: string[] = [];
    params.push(`returnTo=accounting`);
    params.push(`autoPrint=true`);

    if (this.isSuperAdmin) {
      if (this.currentUserOrganizationId) {
        params.push(`organizationId=${this.currentUserOrganizationId}`);
        params.push(`reservationId=${this.selectedOrganizationId}`);
      }
    } else {
      if (event.officeId !== null && event.officeId !== undefined) {
        params.push(`officeId=${event.officeId}`);
      }
      if (this.selectedCompanyId) {
        params.push(`companyId=${this.selectedCompanyId}`);
      }
      if (event.reservationId !== null && event.reservationId !== undefined && event.reservationId !== '') {
        params.push(`reservationId=${event.reservationId}`);
      }
      if (event.invoiceId) {
        params.push(`invoiceId=${event.invoiceId}`);
      }
    }

    const url = params.length > 0
      ? `${RouterUrl.InvoiceCreate}?${params.join('&')}`
      : RouterUrl.InvoiceCreate;
    this.router.navigateByUrl(url);
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
      && !this.isReceiptsReceiptDetailActive;
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

  get isBillsReceiptDetailActive(): boolean {
    return this.selectedTabIndex === 1 && this.showBillsReceiptDetail;
  }

  get isReceiptsReceiptDetailActive(): boolean {
    return this.selectedTabIndex === 2 && this.showReceiptsReceiptDetail;
  }

  get isGeneralLedgerDetailActive(): boolean {
    return (this.selectedTabIndex === 3 || this.selectedTabIndex === 4 || this.selectedTabIndex === this.tabGeneralLedger) && this.showGeneralLedgerDetail;
  }

  usesFinancialReportTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabProfitLoss || this.selectedTabIndex === this.tabBalanceSheet;
  }

  usesGeneralLedgerTitleBarFilters(): boolean {
    return this.selectedTabIndex === this.tabGeneralLedger;
  }

  usesReportTitleBarFilters(): boolean {
    return this.usesFinancialReportTitleBarFilters() || this.usesGeneralLedgerTitleBarFilters();
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
    if (!this.accountingInvoiceEditor?.showOfficeValidationError) {
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
    if (this.selectedTabIndex === 1) {
      this.billsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 2) {
      this.receiptsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 3) {
      this.onGeneralLedgerBack();
      this.depositsRefreshTrigger++;
    }
    if (this.selectedTabIndex === 4) {
      this.onGeneralLedgerBack();
      this.printChecksRefreshTrigger++;
    }
    if (this.usesFinancialReportTitleBarFilters()) {
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
    let tabIndex = getNumberQueryParam(params, 'tab', 0, this.tabMaxIndex + 1);
    if (tabIndex !== null) {
      tabIndex = Math.min(Math.max(tabIndex, 0), this.tabMaxIndex);
      if (tabIndex === 4 && ('chartOfAccountId' in params || 'propertyId' in params || 'glReservationId' in params)) {
        tabIndex = this.tabGeneralLedger;
      }
      if (this.selectedTabIndex !== tabIndex) {
        this.selectedTabIndex = tabIndex;
      }
      this.clampSelectedTabIndexForAccess();
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
      reportClass: this.usesFinancialReportTitleBarFilters()
        ? String(this.selectedFinancialReportClass)
        : null,
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
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
