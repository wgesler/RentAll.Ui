import { CommonModule } from '@angular/common';
import { SelectionModel } from '@angular/cdk/collections';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, TemplateRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, EMPTY, Subject, filter, finalize, forkJoin, map, switchMap, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { MappingService } from '../../../services/mapping.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { ChartOfAccountResponse } from '../../accounting/models/chart-of-accounts.model';
import { AccountType, PaymentType, PaymentTypeLabels } from '../../accounting/models/accounting-enum';
import { ChartOfAccountsService } from '../../accounting/services/chart-of-accounts.service';
import { JournalEntryService } from '../../accounting/services/journal-entry.service';
import { PaymentService } from '../../accounting/services/payment.service';
import { BankCardResponse } from '../../organizations/models/bank.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { NewContactDialogService } from '../../shared/contacts/new-contact-dialog.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReceiptType } from '../models/maintenance-enums';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { ReceiptDisplayList, ReceiptResponse, ReceiptSelection, ReceiptSplitDetailLineDisplay, Split, buildBillSplitLineDescription, isReceiptCompanyPropertyId, resolveFirstRealReceiptPropertyId } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';
import { WorkOrderSelection } from '../work-order-list/work-order-list.component';
import { ThreeWayToggleComponent, ThreeWayToggleValue } from '../../shared/three-way-toggle/three-way-toggle.component';

@Component({
  standalone: true,
  selector: 'app-receipts-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective, ThreeWayToggleComponent],
  templateUrl: './receipts-list.component.html',
  styleUrl: './receipts-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptsListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() embeddedInMaintenance = false;
  @Input() shellContext: 'maintenance' | 'accounting' | null = null;
  @Input() embeddedInAccounting = false;
  @Input() accountingListMode: 'all' | 'bills' | 'receipts' | 'utilities' = 'all';
  @Input() refreshTrigger: number = 0;
  @Output() receiptSelect = new EventEmitter<ReceiptSelection>();
  @Output() payableEvent = new EventEmitter<ReceiptDisplayList>();
  @Output() workOrderSelect = new EventEmitter<WorkOrderSelection>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  private receiptService = inject(ReceiptService);
  private mappingService = inject(MappingService);
  private propertyService = inject(PropertyService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private contactService = inject(ContactService);
  private newContactDialogService = inject(NewContactDialogService);
  private workOrderService = inject(WorkOrderService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private authService = inject(AuthService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private journalEntryService = inject(JournalEntryService);
  private paymentService = inject(PaymentService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild(DataTableComponent) billsDataTable?: DataTableComponent;
  @ViewChild('receiptSplitsTemplate') receiptSplitsTemplate?: TemplateRef<unknown>;

  isPageReady = false;
  isServiceError: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['receipts']));
  destroy$ = new Subject<void>();
  accountingOffices: AccountingOfficeResponse[] = [];
  readonly activeFilterLabels = ['Active', 'Inactive', 'Both'] as const;
  activeFilterIndex: ThreeWayToggleValue = 0;
  activeListCache: ReceiptResponse[] | null = null;
  inactiveListCache: ReceiptResponse[] | null = null;
  listCacheBaseKey: string | null = null;
  receipts: ReceiptResponse[] = [];
  receiptsDisplay: ReceiptDisplayList[] = [];
  allReceipts: ReceiptDisplayList[] = [];
  expandedReceipts: Set<string> = new Set();
  isAllExpanded = false;
  propertyCodeLookup = new Map<string, string>();
  bankCardOptionsByOfficeId = new Map<number, Array<{ bankCardId: number; label: string }>>();
  vendorOptionsByOfficeId = new Map<number, Array<{ contactId: string; label: string }>>();
  chartOfAccountsByOfficeId = new Map<number, Map<number, ChartOfAccountResponse>>();
  allChartOfAccounts: ChartOfAccountResponse[] = [];
  paymentChartOfAccounts: { value: number; label: string }[] = [];
  paymentCreditCardOptions: { value: number; label: string; chartOfAccountId: number }[] = [];
  paymentTypeOptions = PaymentTypeLabels;

  showPaymentForm: boolean = false;
  showPaid = true;
  selectedBillReceiptIds = new Set<string>();
  isManualApplyMode: boolean = false;
  selectedPaymentChartOfAccountId: number | null = null;
  selectedPaymentCreditCardId: number | null = null;
  selectedPaymentTypeId: number = PaymentType.Check;
  paymentDescription: string = '';
  paymentDate: Date | null = new Date();
  paymentAmount: number = 0;
  paymentAmountDisplay: string = '$0.00';
  remainingAmount: number = 0;
  remainingAmountDisplay: string = '$0.00';
  paymentOfficeId: number | null = null;
  isSubmittingPayment: boolean = false;
  paymentTargetInvoiceId: string | null = null;
  manualApplyEditableReceiptId: string | null = null;
  pendingApplyAmountFocusReceiptId: string | null = null;

  isAdmin = false;
  canEditIsActiveCheckbox = false;

  selectedPropertyId: string | null = null;
  receiptsLoadId = 0;
  lastReceiptSearchKey: string | null = null;
  receiptSearchInFlightKey: string | null = null;

  readonly maintenanceReceiptDisplayedColumns: ColumnSet = {
    receiptCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    receipt: { displayAs: 'Receipt', wrap: false, sort: false, maxWidth: '12ch', alignment: 'center' },
    receiptDate: { displayAs: 'Receipt Date', wrap: false, maxWidth: '22ch', alignment: 'center', editableType: 'date', suppressRowClick: true },
    amountDisplay: { displayAs: 'Amount', wrap: false, maxWidth: '12ch', alignment: 'center'  },
    vendorDisplay: { displayAs: 'Vendor', wrap: false, maxWidth: '25ch', editableType: 'text', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter vendors...' },
    bankCardDropdown: { displayAs: 'Bank Card', wrap: true, maxWidth: '25ch', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter bank cards...' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderDisplay: { displayAs: 'Work Order', wrap: true, maxWidth: '15ch' },
    descriptionDisplay: { displayAs: 'Description', wrap: true, maxWidth: '25ch' },
    receiptTypeDisplay: { displayAs: 'Type', wrap: true, maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
    createdBy: { displayAs: 'Created By', wrap: false, maxWidth: '20ch' },
    isUtility: { displayAs: 'IsUtility', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '12ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  readonly accountingReceiptDisplayedColumns: ColumnSet = {
    receiptCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderDisplay: { displayAs: 'Work Order', wrap: true, maxWidth: '15ch' },
    receiptTypeDisplay: { displayAs: 'Type', wrap: true, maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
    receipt: { displayAs: 'Receipt', wrap: false, maxWidth: '12ch', alignment: 'center' },
    vendorDisplay: { displayAs: 'Vendor', wrap: false, maxWidth: '25ch', editableType: 'text', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter vendors...' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    receiptDate: { displayAs: 'Bill Date', wrap: false, maxWidth: '15ch', alignment: 'center' },
    dueDate: { displayAs: 'Due Date', maxWidth: '15ch', alignment: 'center' },
    amountDisplay: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    paidAmount: { displayAs: 'Paid', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    dueAmount: { displayAs: 'Due', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    applyAmount: { displayAs: 'Apply', maxWidth: '20ch', alignment: 'right', headerAlignment: 'right' },
    isUtility: { displayAs: 'IsUtility', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '12ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  readonly receiptSplitDetailDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '5ch', wrap: false, alignment: 'left' },
    lineDate: { displayAs: 'Date', maxWidth: '15ch', wrap: false, alignment: 'center' },
    receiptType: { displayAs: 'Type', maxWidth: '12ch', wrap: false },
    account: { displayAs: 'Account', maxWidth: '25ch', wrap: false },
    workOrder: { displayAs: 'Work Order', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '20ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '12ch', wrap: false, alignment: 'right' }
  };

  readonly accountingNonBillReceiptDisplayedColumns: ColumnSet = {
    receiptCode: { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural', wrap: false },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch' },
    workOrderDisplay: { displayAs: 'Work Order', wrap: true, maxWidth: '15ch' },
    receiptTypeDisplay: { displayAs: 'Type', wrap: true, maxWidth: '12ch', alignment: 'center', headerAlignment: 'center' },
    receipt: { displayAs: 'Receipt', wrap: false, maxWidth: '12ch', alignment: 'center' },
    vendorDisplay: { displayAs: 'Vendor', wrap: false, maxWidth: '25ch', editableType: 'text', suppressRowClick: true, searchableDropdown: true, dropdownSearchPlaceholder: 'Type to filter vendors...' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    receiptDate: { displayAs: 'Receipt Date', wrap: false, maxWidth: '15ch', alignment: 'center' },
    dueDate: { displayAs: 'Due Date', maxWidth: '15ch', alignment: 'center' },
    amountDisplay: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    paidAmount: { displayAs: 'Paid', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    dueAmount: { displayAs: 'Due', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    applyAmount: { displayAs: 'Apply', maxWidth: '20ch', alignment: 'right', headerAlignment: 'right' },
    isUtility: { displayAs: 'IsUtility', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '12ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '10ch' }
  };

  private cachedReceiptDisplayedColumns: ColumnSet | null = null;
  private cachedReceiptDisplayedColumnsKey = '';

  get receiptDisplayedColumns(): ColumnSet {
    const cacheKey = [
      this.embeddedInAccounting ? '1' : '0',
      this.accountingListMode ?? '',
      this.isManualApplyMode ? '1' : '0',
      this.authService.hasAccountingNavAccess() ? '1' : '0'
    ].join('|');

    if (this.cachedReceiptDisplayedColumns && this.cachedReceiptDisplayedColumnsKey === cacheKey) {
      return this.cachedReceiptDisplayedColumns;
    }

    const accountingNavAccess = this.authService.hasAccountingNavAccess();
    const hideIsUtilityColumn = !accountingNavAccess;

    const stripIsUtilityColumn = (columns: ColumnSet): ColumnSet => {
      if (!hideIsUtilityColumn) {
        return columns;
      }
      const { isUtility, ...columnsWithoutIsUtility } = columns;
      return columnsWithoutIsUtility;
    };

    if (!this.embeddedInAccounting) {
      this.cachedReceiptDisplayedColumns = stripIsUtilityColumn(this.maintenanceReceiptDisplayedColumns);
      this.cachedReceiptDisplayedColumnsKey = cacheKey;
      return this.cachedReceiptDisplayedColumns;
    }
    const accountingColumns = this.accountingListMode === 'receipts'
      ? this.accountingNonBillReceiptDisplayedColumns
      : this.accountingReceiptDisplayedColumns;
    let columns = accountingColumns;
    if (!this.isManualApplyMode) {
      const { applyAmount, ...columnsWithoutApply } = accountingColumns;
      columns = columnsWithoutApply;
    }
    columns = stripIsUtilityColumn(columns);
    if (this.accountingListMode === 'bills') {
      columns = {
        expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
        ...columns
      };
    }
    this.cachedReceiptDisplayedColumns = columns;
    this.cachedReceiptDisplayedColumnsKey = cacheKey;
    return this.cachedReceiptDisplayedColumns;
  }

  get showBillsTableSelections(): boolean {
    return this.embeddedInAccounting && this.accountingListMode === 'bills';
  }

  get showBillsDetailRows(): boolean {
    return this.embeddedInAccounting && this.accountingListMode === 'bills';
  }


  //#region Receipts List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.loadAccountingOffices();
    this.loadVendors();
    this.loadPropertyCodes();
    this.loadChartOfAccountsForAccounting();
    if (!this.embeddedInMaintenance) {
      this.loadReceiptsForCurrentSearchCriteria();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchRequest'] && this.embeddedInMaintenance) {
      const previousPropertyId = changes['searchRequest'].firstChange
        ? undefined
        : this.normalizeSearchPropertyId(changes['searchRequest'].previousValue?.propertyId);
      const currentPropertyId = this.getSearchPropertyId();
      const propertyScopeChanged = previousPropertyId !== currentPropertyId;
      const previousKey = changes['searchRequest'].firstChange
        ? null
        : this.buildReceiptSearchKeyFromRequest(changes['searchRequest'].previousValue);
      const currentKey = this.buildReceiptSearchKey();
      const searchCriteriaChanged = previousKey !== currentKey;

      if (propertyScopeChanged) {
        this.invalidateActiveFilterCaches();
      }

      this.applyFilters();
      if (changes['searchRequest'].firstChange || propertyScopeChanged || searchCriteriaChanged) {
        this.loadReceiptsForCurrentSearchCriteria(propertyScopeChanged);
      }
    }

    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (propertyId !== this.selectedPropertyId) {
        this.selectedPropertyId = propertyId;
        if (!this.embeddedInMaintenance && !changes['property'].firstChange) {
          this.loadReceiptsForCurrentSearchCriteria(true);
        }
      }
    }

    if (changes['officeId'] && !changes['officeId'].firstChange) {
      if (!this.property?.propertyId) {
        this.loadReceiptsForCurrentSearchCriteria();
      }
      this.applyReceiptDisplayMappings();
      this.applyFilters();
    }

    if (changes['embeddedInAccounting']) {
      this.loadChartOfAccountsForAccounting();
      this.applyReceiptDisplayMappings();
      this.applyFilters();
    }
    if (changes['accountingListMode'] && !changes['accountingListMode'].firstChange) {
      this.applyFilters();
      if (this.embeddedInAccounting && this.usesMaintenanceSearch()) {
        this.loadReceiptsForCurrentSearchCriteria(true);
      }
    }
    if (changes['refreshTrigger']) {
      const previousTrigger = Number(changes['refreshTrigger'].previousValue ?? -1);
      const currentTrigger = Number(changes['refreshTrigger'].currentValue ?? 0);
      const triggerChanged = currentTrigger !== previousTrigger;
      const skipInitialDuplicate = changes['refreshTrigger'].firstChange && !!changes['searchRequest']?.firstChange;
      if (triggerChanged && !skipInitialDuplicate) {
        this.invalidateActiveFilterCaches();
        this.loadReceiptsForCurrentSearchCriteria(true);
      }
    }
  }

  normalizeSearchPropertyId(propertyId: string | null | undefined): string | null {
    const normalized = (propertyId || '').trim();
    if (!normalized || isReceiptCompanyPropertyId(normalized)) {
      return null;
    }
    return normalized;
  }

  getSearchPropertyId(): string | null {
    return this.normalizeSearchPropertyId(this.searchRequest?.propertyId);
  }

  buildReceiptSearchKeyFromRequest(request?: MaintenanceListSearchRequest | null): string {
    return this.buildListCacheBaseKeyFromRequest(request);
  }

  buildListCacheBaseKeyFromRequest(request?: MaintenanceListSearchRequest | null): string {
    const resolvedRequest = request ?? { officeIds: [] };
    return JSON.stringify({
      officeIds: [...this.resolveMaintenanceSearchOfficeIds(resolvedRequest)].sort((a, b) => a - b),
      propertyId: this.normalizeSearchPropertyId(resolvedRequest.propertyId),
      startDate: resolvedRequest.startDate ?? null,
      endDate: resolvedRequest.endDate ?? null,
      receiptKind: this.resolveReceiptKindForSearch(),
      vendorId: resolvedRequest.vendorId ?? null
    });
  }

  buildListCacheBaseKey(): string {
    return this.buildListCacheBaseKeyFromRequest(this.searchRequest);
  }

  invalidateActiveFilterCaches(): void {
    this.activeListCache = null;
    this.inactiveListCache = null;
    this.listCacheBaseKey = null;
    this.lastReceiptSearchKey = null;
    this.receiptSearchInFlightKey = null;
  }

  hasRequiredActiveFilterCache(): boolean {
    if (this.activeFilterIndex === 0) {
      return this.activeListCache !== null;
    }
    if (this.activeFilterIndex === 1) {
      return this.inactiveListCache !== null;
    }
    return this.activeListCache !== null && this.inactiveListCache !== null;
  }

  getReceipts(force = false): void {
    if (this.embeddedInMaintenance && !this.canRunMaintenanceSearch(this.searchRequest)) {
      this.invalidateActiveFilterCaches();
      this.receipts = [];
      this.allReceipts = [];
      this.receiptsDisplay = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
      this.markViewForCheck();
      return;
    }

    if (this.embeddedInMaintenance) {
      const baseKey = this.buildListCacheBaseKey();
      if (force) {
        this.invalidateActiveFilterCaches();
      } else if (baseKey === this.lastReceiptSearchKey && this.hasRequiredActiveFilterCache()) {
        this.applyActiveFilterFromCache();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
        this.markViewForCheck();
        return;
      }
      if (!force && baseKey === this.receiptSearchInFlightKey) {
        return;
      }
      this.ensureActiveFilterCachesThen(() => {
        this.lastReceiptSearchKey = baseKey;
        this.applyActiveFilterFromCache();
      }, force);
      return;
    }

    const loadId = ++this.receiptsLoadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'receipts');
    this.receiptService.getReceipts(this.property?.propertyId ?? null, this.officeId ?? null).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
        this.markViewForCheck();
      })
    ).subscribe({
      next: (receipts: ReceiptResponse[]) => {
        if (this.receiptsLoadId !== loadId) {
          return;
        }
        this.receipts = this.excludeBusinessPrivateWhenMaintenanceShell(receipts || []);
        this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
        this.applyReceiptDisplayMappings();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        if (this.receiptsLoadId !== loadId) {
          return;
        }
        this.isServiceError = true;
        this.receipts = [];
        this.allReceipts = [];
        this.receiptsDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  ensureActiveFilterCachesThen(onReady: () => void, force = false): void {
    const baseKey = this.buildListCacheBaseKey();
    if (this.listCacheBaseKey !== baseKey || force) {
      this.activeListCache = null;
      this.inactiveListCache = null;
      this.listCacheBaseKey = baseKey;
    }

    const needActive = this.activeFilterIndex === 0 || this.activeFilterIndex === 2;
    const needInactive = this.activeFilterIndex === 1 || this.activeFilterIndex === 2;
    const hasActive = this.activeListCache !== null;
    const hasInactive = this.inactiveListCache !== null;

    if ((!needActive || hasActive) && (!needInactive || hasInactive)) {
      onReady();
      return;
    }

    const loadId = ++this.receiptsLoadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'receipts');
    this.receiptSearchInFlightKey = baseKey;

    const fetchActive = needActive && !hasActive;
    const fetchInactive = needInactive && !hasInactive;
    const completeLoad = () => {
      if (this.receiptsLoadId !== loadId) {
        return;
      }
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
      if (this.receiptSearchInFlightKey === baseKey) {
        this.receiptSearchInFlightKey = null;
      }
      onReady();
      this.markViewForCheck();
    };

    if (fetchActive && fetchInactive) {
      forkJoin({
        active: this.receiptService.searchReceipts(this.buildMaintenanceSearchRequestForSide(true)),
        inactive: this.receiptService.searchReceipts(this.buildMaintenanceSearchRequestForSide(false))
      }).pipe(take(1), takeUntil(this.destroy$)).subscribe({
        next: ({ active, inactive }) => {
          if (this.receiptsLoadId !== loadId) {
            return;
          }
          this.activeListCache = active ?? [];
          this.inactiveListCache = inactive ?? [];
          completeLoad();
        },
        error: () => {
          if (this.receiptsLoadId !== loadId) {
            return;
          }
          this.isServiceError = true;
          this.receipts = [];
          this.allReceipts = [];
          this.receiptsDisplay = [];
          completeLoad();
        }
      });
      return;
    }

    const side = fetchActive;
    this.receiptService.searchReceipts(this.buildMaintenanceSearchRequestForSide(side)).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: (receipts: ReceiptResponse[]) => {
        if (this.receiptsLoadId !== loadId) {
          return;
        }
        if (side) {
          this.activeListCache = receipts ?? [];
        } else {
          this.inactiveListCache = receipts ?? [];
        }
        completeLoad();
      },
      error: () => {
        if (this.receiptsLoadId !== loadId) {
          return;
        }
        this.isServiceError = true;
        this.receipts = [];
        this.allReceipts = [];
        this.receiptsDisplay = [];
        completeLoad();
      }
    });
  }

  applyActiveFilterFromCache(): void {
    let rows: ReceiptResponse[];
    switch (this.activeFilterIndex) {
      case 1:
        rows = this.inactiveListCache ?? [];
        break;
      case 2:
        rows = this.mergeReceiptListsById(this.activeListCache ?? [], this.inactiveListCache ?? []);
        break;
      default:
        rows = this.activeListCache ?? [];
    }
    this.receipts = this.excludeBusinessPrivateWhenMaintenanceShell(rows);
    this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
    this.applyReceiptDisplayMappings();
    this.applyFilters();
  }

  mergeReceiptListsById(active: ReceiptResponse[], inactive: ReceiptResponse[]): ReceiptResponse[] {
    const merged = new Map<string, ReceiptResponse>();
    for (const row of [...active, ...inactive]) {
      const id = String(row.receiptId || '').trim();
      if (id) {
        merged.set(id, row);
      }
    }
    return Array.from(merged.values());
  }

  buildMaintenanceSearchRequestForSide(isActive: boolean): MaintenanceListSearchRequest {
    const request = this.searchRequest ?? { officeIds: [] };
    return {
      ...request,
      officeIds: this.resolveMaintenanceSearchOfficeIds(request),
      isActive,
      includeInactive: !isActive,
      propertyId: this.embeddedInMaintenance
        ? (request.propertyId ?? null)
        : (request.propertyId ?? this.property?.propertyId ?? null),
      receiptKind: this.resolveReceiptKindForSearch()
    };
  }

  filterRowsByActiveFilter<T extends { isActive?: boolean }>(rows: T[]): T[] {
    switch (this.activeFilterIndex) {
      case 1:
        return rows.filter(row => row.isActive === false);
      case 2:
        return rows;
      default:
        return rows.filter(row => row.isActive !== false);
    }
  }

  addReceipt(): void {
    if (this.embeddedInMaintenance) {
      this.receiptSelect.emit({
        receiptId: 'new',
        officeId: this.property?.officeId ?? this.officeId ?? null,
        propertyId: (this.property?.propertyId || '').trim() || null
      });
      return;
    }
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, ['new']);
    const propertyId = (this.property?.propertyId || '').trim();
    this.router.navigate([url], {
      queryParams: propertyId ? { propertyId } : {},
      state: this.property ? { property: this.property } : undefined
    });
  }

  deleteReceipt(event: ReceiptDisplayList): void {
    const receipt = this.receipts.find(item => item.receiptId === event.receiptId);
    this.journalEntryService.confirmDeleteIfAllowed(receipt?.postingStatusId, 'Receipt').pipe(
      take(1),
      switchMap(canProceed => {
        if (!canProceed) {
          return EMPTY;
        }

        return this.receiptService.deleteReceipt(event.receiptId).pipe(take(1));
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Receipt deleted successfully', CommonMessage.Success);
        this.receipts = this.receipts.filter(item => item.receiptId !== event.receiptId);
        this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
        this.applyReceiptDisplayMappings();
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  onPayable(event: ReceiptDisplayList): void {
    if (!this.embeddedInAccounting || event?.payableDisabled) {
      return;
    }
    if (this.isBillMissingReceiptAttachment(event)) {
      const selectedPropertyId = resolveFirstRealReceiptPropertyId(event.propertyIds);
      const receipt = this.receipts.find(item => item.receiptId === event.receiptId) ?? null;
      this.receiptSelect.emit({
        receiptId: event.receiptId,
        officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
        propertyId: selectedPropertyId,
        autoSaveValidationAttempt: true,
        receipt
      });
      return;
    }
    const receiptOfficeId = Number(event?.officeId ?? 0);
    this.paymentOfficeId = Number.isFinite(receiptOfficeId) && receiptOfficeId > 0 ? receiptOfficeId : null;
    this.pendingApplyAmountFocusReceiptId = String(event?.receiptId ?? '').trim() || null;
    this.openApplyPaymentDialog(event?.receiptId ?? null);
    this.payableEvent.emit(event);
  }

  goToReceipt(event: ReceiptDisplayList): void {
    if (this.embeddedInMaintenance || this.embeddedInAccounting) {
      const selectedPropertyId = resolveFirstRealReceiptPropertyId(event.propertyIds);
      const receipt = this.receipts.find(item => item.receiptId === event.receiptId) ?? null;
      this.receiptSelect.emit({
        receiptId: event.receiptId,
        officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
        propertyId: selectedPropertyId,
        receipt
      });
      return;
    }
    if (!this.property) return;
    const receipt = this.receipts.find(item => item.receiptId === event.receiptId) ?? null;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, [String(event.receiptId)]);
    this.router.navigate([url], {
      queryParams: { propertyId: this.property.propertyId },
      state: { property: this.property, prefetchedReceipt: receipt }
    });
  }

  goToWorkOrderFromCode(event: { rowItem?: ReceiptDisplayList; workOrderCode?: string }): void {
    const rowItem = event?.rowItem;
    const targetWorkOrderCode = (event?.workOrderCode || '').trim();
    if (!rowItem || !targetWorkOrderCode) {
      return;
    }

    const propertyId =
      resolveFirstRealReceiptPropertyId(rowItem.propertyIds)
      || resolveFirstRealReceiptPropertyId(this.property?.propertyId ? [this.property.propertyId] : null)
      || resolveFirstRealReceiptPropertyId(this.selectedPropertyId ? [this.selectedPropertyId] : null)
      || null;
    const officeId = Number(rowItem.officeId || this.officeId || 0) || null;
    const receiptListReturnSelection = this.buildReceiptListWorkOrderReturnSelection();

    if (this.mappingService.isReceiptWorkOrderMissingDisplay(targetWorkOrderCode)) {
      const missingSplit = this.mappingService.resolveFirstMissingWorkOrderSplit(rowItem);
      if (!missingSplit) {
        this.toastr.warning('Unable to locate missing work order split.', 'Work Order');
        this.markViewForCheck();
        return;
      }

      if (this.embeddedInMaintenance) {
        this.workOrderSelect.emit({
          workOrderId: 'new',
          propertyId,
          officeId,
          prefilledReceiptId: missingSplit.receiptId,
          prefilledReceiptSplitKey: missingSplit.splitKey,
          ...receiptListReturnSelection
        });
        return;
      }

      if (!propertyId) {
        this.toastr.error('Unable to open work order: missing property context.', 'Work Order');
        return;
      }

      const maintenanceUrl = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId]);
      this.router.navigate([maintenanceUrl], {
        queryParams: {
          tab: 3,
          workOrderId: 'new',
          receiptId: missingSplit.receiptId,
          receiptSplitKey: missingSplit.splitKey
        }
      });
      this.markViewForCheck();
      return;
    }

    this.workOrderService.getWorkOrders(propertyId, officeId).pipe(take(1)).subscribe({
      next: workOrders => {
        const matchingWorkOrder = (workOrders || []).find(
          workOrder => (workOrder.workOrderCode || '').trim().toLowerCase() === targetWorkOrderCode.toLowerCase()
        );
        if (!matchingWorkOrder) {
          this.toastr.warning(`Unable to locate ${targetWorkOrderCode}.`, 'Work Order');
          this.markViewForCheck();
          return;
        }

        const workOrderId = String(matchingWorkOrder.workOrderId || '').trim();
        const resolvedPropertyId = (matchingWorkOrder.propertyId || propertyId || '').trim();
        if (!workOrderId || !resolvedPropertyId) {
          this.toastr.error('Unable to open work order: missing work order context.', 'Work Order');
          return;
        }

        if (this.embeddedInMaintenance) {
          this.workOrderSelect.emit({
            workOrderId,
            propertyId: resolvedPropertyId,
            ...receiptListReturnSelection
          });
          return;
        }

        const maintenanceUrl = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [resolvedPropertyId]);
        this.router.navigate([maintenanceUrl], {
          queryParams: {
            tab: 3,
            workOrderId
          }
        });
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Unable to load work order.', 'Work Order');
        this.markViewForCheck();
      }
    });
  }

  private buildReceiptListWorkOrderReturnSelection(): Pick<WorkOrderSelection, 'returnToReceiptList' | 'returnReceiptListKind'> {
    if (this.embeddedInAccounting) {
      return {
        returnToReceiptList: true,
        returnReceiptListKind: this.accountingListMode === 'receipts' ? 'receipts' : 'bills'
      };
    }
    if (this.embeddedInMaintenance) {
      return { returnToReceiptList: true };
    }
    return {};
  }
  //#endregion

  //#region Data Load Methods
  loadPropertyCodes(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.propertyCodeLookup = new Map(
              (properties || []).map(property => [
                this.utilityService.normalizeId(property.propertyId),
                (property.propertyCode || '').trim()
              ])
            );
            this.applyPropertyCodesToDisplays();
            this.applyFilters();
            this.markViewForCheck();
          },
          error: () => {
            this.markViewForCheck();
          }
        });
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          this.applyBankCardOptionsFromAccountingOffices();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.bankCardOptionsByOfficeId = new Map();
        this.markViewForCheck();
      }
    });
  }

  loadVendors(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.applyVendorOptionsFromContacts(contacts || []);
        });
      },
      error: () => {
        this.vendorOptionsByOfficeId = new Map();
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Inline Receipt Edits
  onReceiptCheckboxChange(event: ReceiptDisplayList): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }
    const changedCheckboxColumn = (event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive' && changedCheckboxColumn !== 'isUtility') {
      return;
    }
    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyReceiptCheckboxValue(event.receiptId, changedCheckboxColumn, nextValue);

    this.receiptService
      .getReceiptById(event.receiptId)
      .pipe(
        take(1),
        switchMap(receipt => {
          const currentValue = changedCheckboxColumn === 'isUtility'
            ? receipt.isUtility === true
            : receipt.isActive === true;
          if (currentValue === nextValue) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          return this.receiptService.updateReceipt(
            this.mappingService.mapReceiptUpdateRequest(
              receipt,
              changedCheckboxColumn === 'isUtility'
                ? { isUtility: nextValue }
                : { isActive: nextValue }
            )
          );
        }),
        finalize(() => {
          this.applyFilters();
          this.markViewForCheck();
        })
      )
      .subscribe({
        next: saved => {
          if (this.usesMaintenanceSearch()) {
            this.loadReceiptsForCurrentSearchCriteria(true);
          } else {
            this.syncReceiptRowFromServer(saved);
          }
          this.toastr.success('Receipt updated.', CommonMessage.Success);
        },
        error: () => {
          this.applyReceiptCheckboxValue(event.receiptId, changedCheckboxColumn, previousValue);
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
        }
      });
  }

  onReceiptDropdownChange(event: ReceiptDisplayList & { __changedDropdownColumn?: string }): void {
    if (!this.isAdmin) {
      return;
    }
    const changedColumn = event.__changedDropdownColumn || '';
    if (changedColumn !== 'bankCardDropdown' && changedColumn !== 'vendorDisplay') {
      return;
    }
    if (changedColumn === 'bankCardDropdown') {
      const selectedLabel = String(event.bankCardDropdown?.value || '').trim();
      if (!selectedLabel) {
        return;
      }
      const selectedBankCardId = this.resolveBankCardIdFromLabel(event.officeId, selectedLabel);
      if (selectedBankCardId === null) {
        return;
      }

      this.receiptService
        .getReceiptById(event.receiptId)
        .pipe(
          take(1),
          switchMap(receipt => {
          const currentBankCardId = Number(receipt.bankCardId ?? 0);
            if (currentBankCardId === selectedBankCardId) {
              this.syncReceiptRowFromServer(receipt);
              return EMPTY;
            }
            const payload = Number(selectedBankCardId) === 0
              ? this.mappingService.mapReceiptUpdateRequest(receipt, { bankCardId: selectedBankCardId, vendorName: null })
              : this.mappingService.mapReceiptUpdateRequest(receipt, { bankCardId: selectedBankCardId, vendorId: null });
            return this.receiptService.updateReceipt(payload);
          })
        )
        .subscribe({
          next: saved => {
            this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyReceiptDisplayMappings();
            this.applyFilters();
            this.toastr.success('Receipt updated.', CommonMessage.Success);
            this.markViewForCheck();
          },
          error: () => {
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyReceiptDisplayMappings();
            this.applyFilters();
            this.toastr.error('Unable to update receipt.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      return;
    }

    const selectedVendorLabel = this.normalizeVendorDisplayText((event.vendorDisplay as { value?: string } | undefined)?.value || '');
    if (!selectedVendorLabel) {
      return;
    }
    if (this.newContactDialogService.isNewContactLabel(selectedVendorLabel, EntityType.Vendor)) {
      this.applyVendorCellsToDisplays();
      this.markViewForCheck();
      this.openNewVendorForReceiptRow(event);
      return;
    }
    const selectedVendorId = this.resolveVendorIdFromLabel(event.officeId, selectedVendorLabel);
    if (this.newContactDialogService.isNewContactOptionValue(selectedVendorId, EntityType.Vendor)) {
      return;
    }
    if (!selectedVendorId) {
      return;
    }

    this.receiptService
      .getReceiptById(event.receiptId)
      .pipe(
        take(1),
        switchMap(receipt => {
          const isBill = Number(receipt.bankCardId ?? 0) === 0;
          if (!isBill) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          const currentVendorId = String(receipt.vendorId || '').trim();
          if (currentVendorId === selectedVendorId) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          const payload = this.mappingService.mapReceiptUpdateRequest(receipt, {
            vendorId: selectedVendorId,
            vendorName: null
          });
          return this.receiptService.updateReceipt(payload);
        })
      )
      .subscribe({
        next: saved => {
          this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyReceiptDisplayMappings();
          this.applyFilters();
          this.toastr.success('Receipt updated.', CommonMessage.Success);
          this.markViewForCheck();
        },
        error: () => {
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyReceiptDisplayMappings();
          this.applyFilters();
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
          this.markViewForCheck();
        }
      });
  }

  onReceiptInlineEditChange(event: ReceiptDisplayList & { __changedInlineColumn?: string; __inlineValue?: string }): void {
    if (!this.isAdmin) {
      return;
    }
    const changedInlineColumn = event.__changedInlineColumn || '';
    if (changedInlineColumn !== 'vendorDisplay' && changedInlineColumn !== 'receiptDate') {
      return;
    }
    if (changedInlineColumn === 'receiptDate') {
      const nextReceiptDate = this.normalizeDateInputValue(event.__inlineValue);

      this.receiptService
        .getReceiptById(event.receiptId)
        .pipe(
          take(1),
          switchMap(receipt => {
            const currentReceiptDate = this.normalizeDateInputValue(receipt.receiptDate);
            if (!nextReceiptDate || nextReceiptDate === currentReceiptDate) {
              this.syncReceiptRowFromServer(receipt);
              return EMPTY;
            }
            const payload = this.mappingService.mapReceiptUpdateRequest(receipt, { receiptDate: nextReceiptDate });
            return this.receiptService.updateReceipt(payload);
          })
        )
        .subscribe({
          next: saved => {
            this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyReceiptDisplayMappings();
            this.applyFilters();
            this.toastr.success('Receipt updated.', CommonMessage.Success);
            this.markViewForCheck();
          },
          error: () => {
            this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
            this.applyReceiptDisplayMappings();
            this.applyFilters();
            this.toastr.error('Unable to update receipt.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      return;
    }

    if (event.vendorDisplayReadOnly) {
      return;
    }
    const nextVendorName = this.normalizeVendorDisplayText(event.__inlineValue);
    let previousVendorName = '';

    this.receiptService
      .getReceiptById(event.receiptId)
      .pipe(
        take(1),
        switchMap(receipt => {
          const isBill = Number(receipt.bankCardId ?? 0) === 0;
          if (isBill) {
            this.syncReceiptRowFromServer(receipt);
            return EMPTY;
          }
          previousVendorName = String(receipt.vendorName ?? '').trim();
          if (nextVendorName === previousVendorName) {
            return EMPTY;
          }
          const payload = this.mappingService.mapReceiptUpdateRequest(receipt, {
            vendorName: nextVendorName || null,
            vendorId: null
          });
          return this.receiptService.updateReceipt(payload);
        })
      )
      .subscribe({
        next: saved => {
          this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
          this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
          this.applyReceiptDisplayMappings();
          this.applyFilters();
          this.toastr.success('Receipt updated.', CommonMessage.Success);
          this.markViewForCheck();
        },
        error: () => {
          this.applyReceiptVendorDisplayValue(event.receiptId, previousVendorName);
          this.toastr.error('Unable to update receipt.', CommonMessage.Error);
          this.markViewForCheck();
        }
      });
  }

  onReceiptInfo(event: ReceiptDisplayList): void {
    const notes = String(event?.notes ?? (event as ReceiptDisplayList & { agreementLineNotes?: string | null })?.agreementLineNotes ?? '').trim();
    this.toastr.info(notes || 'No notes', 'Agreement Line Notes');
  }

  openReceiptDialog(item: ReceiptDisplayList): void {
    const receiptWindow = window.open('', '_blank');
    if (!receiptWindow) {
      this.toastr.warning('Please allow pop-ups to open receipts in a new tab.', 'Receipt');
      return;
    }

    receiptWindow.document.title = 'Receipt';
    receiptWindow.document.body.innerHTML = '<p style="font-family: Arial, sans-serif; padding: 12px;">Loading receipt...</p>';

    this.receiptService.getReceiptById(item.receiptId).pipe(take(1)).subscribe({
      next: (receipt: ReceiptResponse) => {
        const fd = receipt?.fileDetails;
        const imageSrc =
          fd?.dataUrl ||
          (fd?.file && fd?.contentType ? `data:${fd.contentType};base64,${fd.file}` : null);
        if (!imageSrc) {
          receiptWindow.close();
          this.toastr.warning('Receipt file is not available.', 'Receipt');
          this.markViewForCheck();
          return;
        }
        this.renderReceiptInWindow(receiptWindow, imageSrc);
        this.markViewForCheck();
      },
      error: () => {
        receiptWindow.close();
        this.toastr.error('Unable to load receipt.', 'Receipt');
        this.markViewForCheck();
      }
    });
  }

  renderReceiptInWindow(receiptWindow: Window, imageSrc: string): void {
    const isPdf = /^data:application\/pdf/i.test(imageSrc);
    const renderSrc = this.toBlobObjectUrl(imageSrc) ?? imageSrc;
    const receiptDocument = receiptWindow.document;
    receiptDocument.open();
    receiptDocument.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt</title>
          <style>
            html, body { height: 100%; margin: 0; background: #f5f6f8; }
            .receipt-frame { width: 100%; height: 100%; border: 0; background: #fff; }
            .receipt-image-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
            .receipt-image { max-width: 100%; max-height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          ${isPdf
            ? '<iframe id="receipt-frame" class="receipt-frame" title="Receipt PDF"></iframe>'
            : '<div class="receipt-image-wrap"><img id="receipt-image" class="receipt-image" alt="Receipt image" /></div>'}
        </body>
      </html>
    `);
    receiptDocument.close();

    const releaseUrl = () => {
      if (renderSrc.startsWith('blob:')) {
        URL.revokeObjectURL(renderSrc);
      }
    };
    receiptWindow.addEventListener('beforeunload', releaseUrl);

    if (isPdf) {
      const frame = receiptDocument.getElementById('receipt-frame') as HTMLIFrameElement | null;
      if (frame) {
        frame.src = renderSrc;
      }
      return;
    }

    const image = receiptDocument.getElementById('receipt-image') as HTMLImageElement | null;
    if (image) {
      image.src = renderSrc;
      image.addEventListener('load', releaseUrl, { once: true });
      image.addEventListener('error', releaseUrl, { once: true });
    }
  }

  toBlobObjectUrl(src: string): string | null {
    if (!src || !src.startsWith('data:')) {
      return null;
    }
    try {
      const dataUrlParts = src.split(',');
      if (dataUrlParts.length < 2) {
        return null;
      }
      const header = dataUrlParts[0];
      const data = dataUrlParts.slice(1).join(',');
      const mimeMatch = header.match(/^data:([^;]+)/i);
      const mimeType = mimeMatch?.[1] || 'application/octet-stream';
      const isBase64 = /;base64/i.test(header);
      const binaryString = isBase64 ? atob(data) : decodeURIComponent(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index++) {
        bytes[index] = binaryString.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }
  //#endregion

  //#region Filter Methods
  onActiveFilterChange(index: ThreeWayToggleValue): void {
    if (index === this.activeFilterIndex) {
      return;
    }
    this.activeFilterIndex = index;
    if (this.usesMaintenanceSearch()) {
      this.ensureActiveFilterCachesThen(() => this.applyActiveFilterFromCache());
      return;
    }
    this.applyFilters();
  }

  onShowPaidToggleChange(checked: boolean): void {
    this.showPaid = checked;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.filterAccountingReceiptsByMode(this.excludeBusinessPrivateWhenMaintenanceShell(this.allReceipts));
    if (!this.authService.hasAccountingNavAccess()) {
      filtered = filtered.filter(receipt => receipt.isUtility !== true);
    }

    const vendorId = String(this.searchRequest?.vendorId || '').trim().toLowerCase();
    if (vendorId) {
      filtered = filtered.filter(receipt => String(receipt.vendorId || '').trim().toLowerCase() === vendorId);
    }

    if (this.showBillsTableSelections && !this.showPaid) {
      filtered = filtered.filter(receipt => Math.abs(Number(receipt.dueAmountValue ?? 0)) > 0.005);
    }

    if (this.embeddedInAccounting) {
      filtered = filtered.map(receipt => {
        const receiptAny = receipt as ReceiptDisplayList & Record<string, unknown>;
        const applyAmountValue = this.isManualApplyMode ? Number(receiptAny['applyAmountValue'] ?? 0) : 0;
        const applyAmountEditable =
          this.manualApplyEditableReceiptId == null || this.manualApplyEditableReceiptId === receipt.receiptId;
        const mapped: ReceiptDisplayList = {
          ...receipt,
          selected: this.showBillsTableSelections && this.selectedBillReceiptIds.has(receipt.receiptId),
          applyAmountValue,
          applyAmountDisplay: this.isManualApplyMode
            ? (applyAmountValue < 0
              ? '-$' + this.formatter.currency(-applyAmountValue)
              : '$' + this.formatter.currency(applyAmountValue))
            : '',
          applyAmount: this.isManualApplyMode
            ? (applyAmountValue < 0
              ? '-$' + this.formatter.currency(-applyAmountValue)
              : '$' + this.formatter.currency(applyAmountValue))
            : '',
          applyAmountEditable
        };
        if (!this.showBillsDetailRows) {
          return mapped;
        }
        return {
          ...mapped,
          expand: receipt.receiptId,
          expanded: this.expandedReceipts.has(receipt.receiptId),
          detailLines: this.mappingService.mapReceiptSplitDetailLines(receipt),
          expandClick: (event: Event, item: ReceiptDisplayList) => {
            event.stopPropagation();
            if (this.expandedReceipts.has(item.receiptId)) {
              this.expandedReceipts.delete(item.receiptId);
            } else {
              this.expandedReceipts.add(item.receiptId);
            }
            this.applyFilters();
          }
        };
      });
    }

    if (!this.usesMaintenanceSearch()) {
      filtered = this.filterRowsByActiveFilter(filtered);
    }

    this.receiptsDisplay = filtered;
    if (this.showBillsDetailRows) {
      this.updateIsAllExpanded();
    }
    this.focusPendingApplyAmountInput();
    this.markViewForCheck();
  }

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      this.receiptsDisplay.forEach(receipt => {
        if (receipt.receiptId) {
          this.expandedReceipts.add(receipt.receiptId);
        }
      });
    } else {
      this.expandedReceipts.clear();
    }
    this.applyFilters();
  }

  updateIsAllExpanded(): void {
    if (this.receiptsDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }
    this.isAllExpanded = this.receiptsDisplay.every(
      receipt => !!receipt.receiptId && this.expandedReceipts.has(receipt.receiptId)
    );
  }

  getReceiptSplitDetailColumnNames(): string[] {
    return Object.keys(this.receiptSplitDetailDisplayedColumns);
  }

  getReceiptSplitDetailColumnValue(
    line: ReceiptSplitDetailLineDisplay,
    columnName: string,
    lineIndex?: number
  ): string | number {
    switch (columnName) {
      case 'lineNo':
        return lineIndex !== undefined ? lineIndex + 1 : '—';
      case 'lineDate':
        return line.lineDate || '—';
      case 'receiptType':
        return line.receiptType || '—';
      case 'account':
        return line.account || '—';
      case 'workOrder':
        return line.workOrder || '—';
      case 'description':
        return line.description || '—';
      case 'amount': {
        const amountValue = Number(line.amount) || 0;
        const formattedAmount = this.formatter.currency(amountValue < 0 ? -amountValue : amountValue);
        return amountValue < 0 ? '-$' + formattedAmount : '$' + formattedAmount;
      }
      default:
        return '—';
    }
  }

  filterAccountingReceiptsByMode(receipts: ReceiptDisplayList[]): ReceiptDisplayList[] {
    if (!this.embeddedInAccounting) {
      return receipts;
    }
    if (this.accountingListMode === 'bills') {
      return receipts.filter(receipt => this.isBillReceipt(receipt));
    }
    if (this.accountingListMode === 'utilities') {
      return receipts.filter(receipt => this.isBillReceipt(receipt) && (receipt.isUtility === true || this.hasOwnerSplit(receipt)));
    }
    if (this.accountingListMode === 'receipts') {
      return receipts.filter(receipt => !this.isBillReceipt(receipt));
    }
    return receipts;
  }

  isBillReceipt(receipt: Pick<ReceiptDisplayList, 'bankCardId'>): boolean {
    return Number(receipt.bankCardId ?? 0) === 0;
  }

  excludeBusinessPrivateWhenMaintenanceShell<T extends { businessPrivate?: boolean }>(items: T[]): T[] {
    if (this.shellContext !== 'maintenance') {
      return items;
    }
    return (items || []).filter(item => item.businessPrivate !== true);
  }

  hasOwnerSplit(receipt: Pick<ReceiptDisplayList, 'splits'>): boolean {
    return (receipt.splits || []).some(split => Number(split.receiptTypeId) === ReceiptType.Owner);
  }

  isBillMissingReceiptAttachment(event: ReceiptDisplayList): boolean {
    const receiptId = String(event?.receiptId || '').trim();
    if (!receiptId) {
      return false;
    }
    const receipt = this.receipts.find(item => item.receiptId === receiptId);
    if (!receipt) {
      return false;
    }
    const hasUploadedFile = !!receipt.fileDetails?.file;
    const hasReceiptPath = String(receipt.receiptPath || '').trim().length > 0;
    return !hasUploadedFile && !hasReceiptPath;
  }
  //#endregion

  //#region Search Criteria Methods
  loadReceiptsForCurrentSearchCriteria(force = false): void {
    if (!this.embeddedInMaintenance) {
      this.getReceipts(force);
      return;
    }

    queueMicrotask(() => {
      if (!this.canRunMaintenanceSearch(this.searchRequest)) {
        this.lastReceiptSearchKey = null;
        this.receiptSearchInFlightKey = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
        this.markViewForCheck();
        return;
      }
      this.getReceipts(force);
    });
  }

  usesMaintenanceSearch(): boolean {
    return this.embeddedInMaintenance && this.canRunMaintenanceSearch(this.searchRequest);
  }

  canRunMaintenanceSearch(request?: MaintenanceListSearchRequest | null): boolean {
    if (!this.embeddedInMaintenance || request == null) {
      return false;
    }

    return !!(request.startDate && request.endDate && this.resolveMaintenanceSearchOfficeIds(request).length > 0);
  }

  resolveMaintenanceSearchOfficeIds(request?: MaintenanceListSearchRequest | null): number[] {
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

  buildMaintenanceSearchRequest(): MaintenanceListSearchRequest {
    return this.buildMaintenanceSearchRequestForSide(this.activeFilterIndex !== 1);
  }

  resolveReceiptKindForSearch(): 1 | 2 | null {
    if (!this.embeddedInAccounting) {
      return null;
    }
    if (this.accountingListMode === 'bills') {
      return 1;
    }
    if (this.accountingListMode === 'utilities') {
      return 1;
    }
    if (this.accountingListMode === 'receipts') {
      return 2;
    }
    return null;
  }

  buildReceiptSearchKey(): string {
    return this.buildListCacheBaseKey();
  }
  //#endregion

  //#region Dropdown Options Methods
  isAllOfficesScope(): boolean {
    const scopedOfficeId = Number(this.officeId ?? 0);
    return !Number.isFinite(scopedOfficeId) || scopedOfficeId <= 0;
  }

  getAllOfficesBankCardOptions(): Array<{ bankCardId: number; label: string }> {
    const merged = new Map<number, { bankCardId: number; label: string }>();
    merged.set(0, { bankCardId: 0, label: 'Bill' });
    this.bankCardOptionsByOfficeId.forEach(options => {
      options.forEach(option => {
        if (!merged.has(option.bankCardId)) {
          merged.set(option.bankCardId, option);
        }
      });
    });
    return Array.from(merged.values()).sort((a, b) => {
      if (a.bankCardId === 0) {
        return -1;
      }
      if (b.bankCardId === 0) {
        return 1;
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  }

  getAllOfficesVendorOptions(): Array<{ contactId: string; label: string }> {
    const merged = new Map<string, { contactId: string; label: string }>();
    this.vendorOptionsByOfficeId.forEach(options => {
      options.forEach(option => {
        const contactId = String(option.contactId || '').trim();
        if (!contactId || merged.has(contactId)) {
          return;
        }
        merged.set(contactId, option);
      });
    });
    return Array.from(merged.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    );
  }

  getBankCardOptionsForReceiptScope(receiptOfficeId: number): Array<{ bankCardId: number; label: string }> {
    if (this.isAllOfficesScope()) {
      return this.getAllOfficesBankCardOptions();
    }
    const officeId = Number(receiptOfficeId ?? 0);
    return this.bankCardOptionsByOfficeId.get(officeId) || [{ bankCardId: 0, label: 'Bill' }];
  }

  getVendorOptionsForReceiptScope(receiptOfficeId: number): Array<{ contactId: string; label: string }> {
    const baseOptions = this.isAllOfficesScope()
      ? this.getAllOfficesVendorOptions()
      : (this.vendorOptionsByOfficeId.get(Number(receiptOfficeId ?? 0)) || []);
    return this.newContactDialogService.prependNewContactListOption(EntityType.Vendor, baseOptions);
  }

  openNewVendorForReceiptRow(event: ReceiptDisplayList): void {
    const receiptOfficeId = Number(event.officeId ?? 0);
    this.newContactDialogService
      .openNewContactDialog({
        entityTypeId: EntityType.Vendor,
        preselectPropertyOfficeId: Number.isFinite(receiptOfficeId) && receiptOfficeId > 0 ? receiptOfficeId : null
      })
      .pipe(take(1))
      .subscribe(result => {
        if (!result?.saved || !result.contactId) {
          return;
        }
        this.receiptService
          .getReceiptById(event.receiptId)
          .pipe(
            take(1),
            switchMap(receipt => {
              const isBill = Number(receipt.bankCardId ?? 0) === 0;
              if (!isBill) {
                this.syncReceiptRowFromServer(receipt);
                return EMPTY;
              }
              return this.receiptService.updateReceipt(
                this.mappingService.mapReceiptUpdateRequest(receipt, {
                  vendorId: result.contactId!,
                  vendorName: null
                })
              );
            })
          )
          .subscribe({
            next: saved => {
              this.receipts = this.receipts.map(r => (r.receiptId === saved.receiptId ? saved : r));
              this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
              this.applyReceiptDisplayMappings();
              this.applyFilters();
              this.toastr.success('Receipt updated.', CommonMessage.Success);
              this.markViewForCheck();
            },
            error: () => {
              this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
              this.applyReceiptDisplayMappings();
              this.applyFilters();
              this.toastr.error('Unable to update receipt.', CommonMessage.Error);
              this.markViewForCheck();
            }
          });
      });
  }
  //#endregion

  //#region Display Mapping Methods
   applyBankCardOptionsFromAccountingOffices(): void {
    const officeMap = new Map<number, Array<{ bankCardId: number; label: string }>>();
    (this.accountingOffices || []).forEach(office => {
      const officeId = Number(office.officeId);
      if (!Number.isFinite(officeId) || officeId <= 0) {
        return;
      }
      const mappedCards = this.mappingService.mapBankCardsFromResponse(office.bankCards as BankCardResponse[]);
      const cardOptions = [
        { bankCardId: 0, label: 'Bill' },
        ...mappedCards
          .filter(card => Number(card.bankCardId) > 0)
          .map(card => ({
            bankCardId: Number(card.bankCardId),
            label: this.toBankCardOptionLabel(card)
          }))
      ];
      officeMap.set(officeId, cardOptions);
    });
    this.bankCardOptionsByOfficeId = officeMap;
    this.applyReceiptDisplayMappings();
    this.applyFilters();
    this.markViewForCheck();
  }

  applyVendorOptionsFromContacts(contacts: ContactResponse[]): void {
    const officeMap = new Map<number, Array<{ contactId: string; label: string }>>();
    contacts
      .filter(contact => contact.entityTypeId === EntityType.Vendor)
      .forEach(contact => {
        const contactId = String(contact.contactId || '').trim();
        if (contactId.length === 0) {
          return;
        }

        const label = this.normalizeVendorDisplayText(this.utilityService.getVendorDropdownLabel(contact));
        const officeIds = new Set<number>();
        const primaryOfficeId = Number(contact.officeId);
        if (Number.isFinite(primaryOfficeId) && primaryOfficeId > 0) {
          officeIds.add(primaryOfficeId);
        }
        (contact.officeAccess || []).forEach(id => {
          const parsedOfficeId = Number(id);
          if (Number.isFinite(parsedOfficeId) && parsedOfficeId > 0) {
            officeIds.add(parsedOfficeId);
          }
        });

        officeIds.forEach(officeId => {
          const rows = officeMap.get(officeId) || [];
          if (!rows.some(row => row.contactId === contactId)) {
            rows.push({ contactId, label });
          }
          officeMap.set(officeId, rows);
        });
      });
    this.vendorOptionsByOfficeId = officeMap;
    this.applyVendorCellsToDisplays();
    this.applyFilters();
    this.markViewForCheck();
  }
  
  applyReceiptDisplayMappings(): void {
    this.applyBankCardDropdownsToDisplays();
    this.applyVendorCellsToDisplays();
    this.applyPropertyCodesToDisplays();
    if (this.embeddedInAccounting) {
      this.refreshChartOfAccountsLookups();
      this.applyAccountDisplayToDisplays();
      this.applyPayableActionFlagsToDisplays();
    }
  }

  applyPropertyCodesToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => ({
      ...receipt,
      propertyCode: this.buildPropertyCodesDisplay(receipt.propertyIds)
    }));
  }

  buildPropertyCodesDisplay(propertyIds: string[] | null | undefined): string {
    return (propertyIds || [])
      .map(propertyId => this.resolvePropertyCode(propertyId))
      .filter(code => code.length > 0)
      .join(', ');
  }

  resolvePropertyCode(propertyId: string | null | undefined): string {
    if (isReceiptCompanyPropertyId(propertyId)) {
      return 'Company';
    }
    const normalizedPropertyId = this.utilityService.normalizeId(propertyId);
    if (!normalizedPropertyId) {
      return '';
    }
    return (this.propertyCodeLookup.get(normalizedPropertyId) || '').trim();
  }

  applyBankCardDropdownsToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => {
      const officeId = Number(receipt.officeId ?? 0);
      const bankCardId = Number(receipt.bankCardId ?? 0);
      const optionsForOffice = this.getBankCardOptionsForReceiptScope(officeId);
      const optionLabels = optionsForOffice.map(option => option.label);
      const preferredLabel =
        optionsForOffice.find(option => option.bankCardId === bankCardId)?.label
        || (receipt.bankCardDisplayName || '').trim()
        || 'Bill';
      const selectedLabel = this.resolveDropdownLabelFromOptions(optionLabels, preferredLabel);
      const displayOptions = this.ensureDropdownOptionLabels(optionLabels, selectedLabel);
      return {
        ...receipt,
        receiptDateReadOnly: !this.isAdmin,
        bankCardDropdown: {
          value: selectedLabel,
          isOverridable: this.isAdmin,
          options: displayOptions,
          toString: () => selectedLabel
        }
      };
    });
  }

  applyVendorCellsToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => {
      const officeId = Number(receipt.officeId ?? 0);
      const isBill = Number(receipt.bankCardId ?? 0) === 0;
      const vendorOptionsForOffice = this.getVendorOptionsForReceiptScope(officeId);
      const matchedVendorOption = this.findVendorOptionForReceipt(vendorOptionsForOffice, receipt);

      if (isBill) {
        const vendorLabels = vendorOptionsForOffice.map(option => option.label);
        const preferredLabel = this.normalizeVendorDisplayText(matchedVendorOption?.label || receipt.vendorName);
        const selectedVendorLabel = this.resolveDropdownLabelFromOptions(vendorLabels, preferredLabel);
        const displayOptions = this.ensureDropdownOptionLabels(vendorLabels, selectedVendorLabel);
        return {
          ...receipt,
          vendorDisplay: {
            value: selectedVendorLabel,
            isOverridable: this.isAdmin,
            options: displayOptions,
            toString: () => selectedVendorLabel
          },
          vendorDisplayReadOnly: true
        };
      }

      const cardVendorName = this.normalizeVendorDisplayText(receipt.vendorName);
      return {
        ...receipt,
        vendorDisplay: cardVendorName,
        vendorDisplayReadOnly: !this.isAdmin,
        vendorDisplayClickToEdit: this.isAdmin,
        vendorDisplayEditing: false
      };
    });
  }
  //#endregion

  //#region Accounting Display Methods
  loadChartOfAccountsForAccounting(): void {
    if (!this.embeddedInAccounting) {
      this.chartOfAccountsByOfficeId.clear();
      return;
    }

    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.allChartOfAccounts = accounts || [];
        this.refreshChartOfAccountsLookups();
        this.refreshPaymentChartOfAccountsForResolvedOffice();
        this.applyAccountDisplayToDisplays();
        this.applyFilters();
        this.markViewForCheck();
      });
    });
  }

  refreshChartOfAccountsLookups(): void {
    if (!this.embeddedInAccounting) {
      this.chartOfAccountsByOfficeId.clear();
      return;
    }

    const officeIds = new Set<number>();
    (this.allReceipts || []).forEach(receipt => {
      const officeId = Number(receipt.officeId ?? 0);
      if (Number.isFinite(officeId) && officeId > 0) {
        officeIds.add(officeId);
      }
    });

    this.chartOfAccountsByOfficeId.clear();
    officeIds.forEach(officeId => {
      const accounts = this.allChartOfAccounts.filter(account => account.officeId === officeId);
      this.chartOfAccountsByOfficeId.set(
        officeId,
        new Map(accounts.map(account => [Number(account.accountId), account]))
      );
    });
  }

  applyAccountDisplayToDisplays(): void {
    if (!this.embeddedInAccounting) {
      return;
    }

    this.allReceipts = (this.allReceipts || []).map(receipt => ({
      ...receipt,
      accountDisplay: this.buildAccountDisplayFromSplits(receipt)
    }));
  }

  buildAccountDisplayFromSplits(receipt: ReceiptDisplayList): string {
    const officeId = Number(receipt.officeId ?? 0);
    const accountLabels = Array.from(new Set(
      (receipt.splits || [])
        .map(split => this.resolveSplitAccountLabel(split, officeId))
        .filter(label => label.length > 0)
    ));
    return accountLabels.join(', ');
  }

  resolveSplitAccountLabel(split: Split, officeId: number): string {
    const rawSplit = split as Split & Record<string, unknown>;
    const displayName = String(
      rawSplit.chartOfAccountDisplayName ?? rawSplit['ChartOfAccountDisplayName'] ?? ''
    ).trim();
    if (displayName) {
      return displayName;
    }

    const accountId = this.mappingService.readSplitChartOfAccountId(split);
    if (!accountId) {
      return '';
    }

    const account = this.chartOfAccountsByOfficeId.get(officeId)?.get(accountId);
    return this.utilityService.getChartOfAccountDropdownLabel(account, accountId);
  }

  applyPayableActionFlagsToDisplays(): void {
    this.allReceipts = (this.allReceipts || []).map(receipt => ({
      ...receipt,
      payableDisabled: Number(receipt.bankCardId ?? 0) !== 0
    }));
  }
  //#endregion

  //#region Inline Update Request Methods
  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    [
      this.maintenanceReceiptDisplayedColumns,
      this.accountingReceiptDisplayedColumns,
      this.accountingNonBillReceiptDisplayedColumns
    ].forEach(columns => {
      const isActiveColumn = columns['isActive'];
      if (isActiveColumn) {
        isActiveColumn.checkboxEditable = this.canEditIsActiveCheckbox;
      }
      const isUtilityColumn = columns['isUtility'];
      if (isUtilityColumn) {
        isUtilityColumn.checkboxEditable = this.canEditIsActiveCheckbox;
      }
    });
  }

  syncReceiptRowFromServer(receipt: ReceiptResponse): void {
    this.receipts = this.receipts.map(r => (r.receiptId === receipt.receiptId ? receipt : r));
    this.allReceipts = this.mappingService.mapReceiptDisplays(this.receipts);
    this.applyReceiptDisplayMappings();
    this.applyFilters();
  }

  applyReceiptCheckboxValue(receiptId: string, columnName: 'isActive' | 'isUtility', checked: boolean): void {
    this.allReceipts = (this.allReceipts || []).map(r => (r.receiptId === receiptId ? { ...r, [columnName]: checked } : r));
    this.receipts = (this.receipts || []).map(r => (r.receiptId === receiptId ? { ...r, [columnName]: checked } : r));
    this.applyFilters();
  }

  applyReceiptVendorDisplayValue(receiptId: string, vendorDisplay: string): void {
    this.allReceipts = (this.allReceipts || []).map(r => (
      r.receiptId === receiptId ? { ...r, vendorDisplay: this.normalizeVendorDisplayText(vendorDisplay) } : r
    ));
    this.applyFilters();
  }

  resolveBankCardIdFromLabel(officeId: number | null | undefined, label: string): number | null {
    const normalizedLabel = String(label || '').trim().toLowerCase();
    const options = this.getBankCardOptionsForReceiptScope(Number(officeId ?? 0));
    const matchingOption = options.find(option => option.label.trim().toLowerCase() === normalizedLabel);
    return matchingOption ? matchingOption.bankCardId : null;
  }

  resolveVendorIdFromLabel(officeId: number | null | undefined, label: string): string | null {
    const normalizedLabel = this.normalizeVendorDisplayText(label).toLowerCase();
    const options = this.getVendorOptionsForReceiptScope(Number(officeId ?? 0));
    const matchingOption = options.find(option => this.normalizeVendorDisplayText(option.label).toLowerCase() === normalizedLabel);
    return matchingOption ? matchingOption.contactId : null;
  }

  toBankCardOptionLabel(card: BankCardResponse): string {
    return (card?.displayName || '').trim() || this.mappingService.mapBankCardDisplay(card);
  }

  findVendorOptionForReceipt(
    vendorOptionsForOffice: Array<{ contactId: string; label: string }>,
    receipt: Pick<ReceiptDisplayList, 'vendorId' | 'vendorName'>
  ): { contactId: string; label: string } | undefined {
    const vendorId = String(receipt.vendorId || '').trim().toLowerCase();
    if (vendorId) {
      const byId = vendorOptionsForOffice.find(
        option => option.contactId.trim().toLowerCase() === vendorId
      );
      if (byId) {
        return byId;
      }
    }

    const normalizedName = this.normalizeVendorDisplayText(receipt.vendorName).toLowerCase();
    if (!normalizedName) {
      return undefined;
    }

    return vendorOptionsForOffice.find(
      option => this.normalizeVendorDisplayText(option.label).toLowerCase() === normalizedName
    );
  }

  resolveDropdownLabelFromOptions(optionLabels: string[], preferredLabel: string): string {
    const normalizedPreferred = this.normalizeVendorDisplayText(preferredLabel).toLowerCase();
    if (!normalizedPreferred) {
      return '';
    }

    const exactMatch = optionLabels.find(
      label => this.normalizeVendorDisplayText(label).toLowerCase() === normalizedPreferred
    );
    return exactMatch || this.normalizeVendorDisplayText(preferredLabel);
  }

  ensureDropdownOptionLabels(optionLabels: string[], selectedLabel: string): string[] {
    const normalizedSelected = this.normalizeVendorDisplayText(selectedLabel).toLowerCase();
    if (!normalizedSelected) {
      return optionLabels;
    }

    const alreadyPresent = optionLabels.some(
      label => this.normalizeVendorDisplayText(label).toLowerCase() === normalizedSelected
    );
    if (alreadyPresent) {
      return optionLabels;
    }

    return [...optionLabels, this.normalizeVendorDisplayText(selectedLabel)];
  }

  normalizeVendorDisplayText(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    const withoutQuotes = raw.replace(/['"]/g, '').replace(/\s{2,}/g, ' ').trim();
    return withoutQuotes || '';
  }

  normalizeDateInputValue(value: unknown): string {
    return this.utilityService.toDateOnlyJsonString(value) || '';
  }
  //#endregion

  //#region Payment Methods
  get resolvedPaymentOfficeId(): number | null {
    return this.paymentOfficeId ?? this.officeId ?? null;
  }

  get isRowScopedPaymentMode(): boolean {
    return this.manualApplyEditableReceiptId != null;
  }

  get isBillSelectionPaymentMode(): boolean {
    return this.showPaymentForm && this.showBillsTableSelections && !this.isRowScopedPaymentMode;
  }

  getReceiptDueAmountValue(receiptId: string): number {
    const receipt =
      this.allReceipts.find(row => row.receiptId === receiptId) ??
      this.receiptsDisplay.find(row => row.receiptId === receiptId);
    return this.roundCurrencyValue(Number(receipt?.dueAmountValue ?? 0));
  }

  formatPaymentAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  formatApplyAmountDisplay(amount: number): string {
    return amount < 0
      ? '-$' + this.formatter.currency(-amount)
      : '$' + this.formatter.currency(amount);
  }

  setReceiptApplyAmount(receipt: ReceiptDisplayList, amount: number): void {
    const value = this.roundCurrencyValue(amount);
    (receipt as ReceiptDisplayList & { applyAmountValue?: number }).applyAmountValue = value;
    const display = this.formatApplyAmountDisplay(value);
    (receipt as ReceiptDisplayList & { applyAmountDisplay?: string; applyAmount?: string }).applyAmountDisplay = display;
    (receipt as ReceiptDisplayList & { applyAmount?: string }).applyAmount = display;
  }

  syncPaymentAmountFromBillSelection(): void {
    this.receiptsDisplay.forEach(row => {
      const isSelected = this.selectedBillReceiptIds.has(row.receiptId);
      row.selected = isSelected;
      const dueAmount = isSelected ? this.getReceiptDueAmountValue(row.receiptId) : 0;
      this.setReceiptApplyAmount(row, dueAmount);
      const sourceReceipt = this.allReceipts.find(receipt => receipt.receiptId === row.receiptId);
      if (sourceReceipt) {
        this.setReceiptApplyAmount(sourceReceipt, dueAmount);
      }
    });

    this.syncPaymentHeaderFromAppliedBillAmounts();
    this.refreshBillsTableDisplay();
    this.markViewForCheck();
  }

  syncPaymentHeaderFromAppliedBillAmounts(): void {
    if (!this.isManualApplyMode || !this.showPaymentForm) {
      return;
    }

    if (this.isRowScopedPaymentMode && this.manualApplyEditableReceiptId != null) {
      const row = this.receiptsDisplay.find(
        receipt => receipt.receiptId === this.manualApplyEditableReceiptId
      );
      const amount = this.roundCurrencyValue(Number((row as any)?.applyAmountValue || 0));
      this.paymentAmount = amount;
      this.paymentAmountDisplay = this.formatPaymentAmountDisplay(amount);
    } else {
      const total = this.receiptsDisplay.reduce(
        (sum, row) => this.roundCurrencyValue(sum + Number((row as any).applyAmountValue || 0)),
        0
      );
      this.paymentAmount = total;
      this.paymentAmountDisplay = this.formatPaymentAmountDisplay(total);
    }

    this.updateRemainingAmount();
  }

  refreshBillsTableDisplay(): void {
    this.billsDataTable?.refreshDisplayedData();
  }

  ensureBillApplyLineSelected(receipt: ReceiptDisplayList, applyAmount: number): void {
    if (!this.isManualApplyMode || !this.showPaymentForm || this.isRowScopedPaymentMode) {
      return;
    }

    const receiptId = String(receipt?.receiptId ?? '').trim();
    if (!receiptId) {
      return;
    }

    const value = this.roundCurrencyValue(applyAmount);

    if (Math.abs(value) <= 0.005) {
      this.selectedBillReceiptIds.delete(receiptId);
      receipt.selected = false;
      this.refreshBillsTableDisplay();
      return;
    }

    if (!this.selectedBillReceiptIds.has(receiptId)) {
      this.selectedBillReceiptIds.add(receiptId);
      receipt.selected = true;
      this.refreshBillsTableDisplay();
    }
  }

  get isPaymentFormValid(): boolean {
    const hasPaymentDate = this.utilityService.toDateOnlyJsonString(this.paymentDate) !== null;
    const hasPaymentAccount = this.resolveSelectedPaymentChartOfAccountId() != null;
    const baseValid = hasPaymentDate && hasPaymentAccount && this.paymentAmount !== 0;

    if (this.isRowScopedPaymentMode) {
      return baseValid;
    }

    if (this.isManualApplyMode && this.accountingListMode !== 'bills') {
      return baseValid && this.isRemainingAmountZero();
    }

    return baseValid;
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  isRemainingAmountZero(): boolean {
    return this.remainingAmount > -0.005 && this.remainingAmount < 0.005;
  }

  hasNegativeRemainingAmount(): boolean {
    return this.remainingAmount < -0.005;
  }

  updateRemainingAmount(): void {
    if (!this.isManualApplyMode) {
      this.remainingAmount = 0;
      this.remainingAmountDisplay = '$' + this.formatter.currency(0);
      return;
    }

    const totalApplied = this.roundCurrencyValue(
      this.receiptsDisplay.reduce((sum, receipt) => sum + Number((receipt as any).applyAmountValue || 0), 0)
    );

    const remaining = this.roundCurrencyValue(this.roundCurrencyValue(this.paymentAmount) - totalApplied);
    this.remainingAmount = remaining > -0.005 && remaining < 0.005 ? 0 : remaining;
    this.remainingAmountDisplay = '$' + this.formatter.currency(this.remainingAmount);
  }

  get isCreditCardPaymentTypeSelected(): boolean {
    return Number(this.selectedPaymentTypeId) === PaymentType.CreditCard;
  }

  refreshPaymentChartOfAccountsForResolvedOffice(): void {
    const officeId = this.resolvedPaymentOfficeId;
    if (!officeId) {
      this.paymentChartOfAccounts = [];
      if (this.selectedPaymentChartOfAccountId != null) {
        this.selectedPaymentChartOfAccountId = null;
      }
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

    if (this.paymentChartOfAccounts.length > 0) {
      const hasValidSelection =
        this.selectedPaymentChartOfAccountId != null &&
        this.paymentChartOfAccounts.some(account => account.value === this.selectedPaymentChartOfAccountId);

      if (!hasValidSelection) {
        this.selectedPaymentChartOfAccountId = this.paymentChartOfAccounts[0].value;
      }
    } else {
      this.selectedPaymentChartOfAccountId = null;
    }
  }

  refreshPaymentCreditCardOptionsForResolvedOffice(): void {
    const officeId = this.resolvedPaymentOfficeId;
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
            label: this.toBankCardOptionLabel(card),
            chartOfAccountId
          });
        }
      });
    };

    if (officeId && Number.isFinite(Number(officeId)) && Number(officeId) > 0) {
      addOfficeCards(Number(officeId));
    } else {
      (this.accountingOffices || []).forEach(office => addOfficeCards(Number(office.officeId)));
    }

    this.paymentCreditCardOptions = Array.from(options.values())
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));

    const hasValidSelection =
      this.selectedPaymentCreditCardId != null
      && this.paymentCreditCardOptions.some(option => option.value === this.selectedPaymentCreditCardId);

    if (!hasValidSelection) {
      this.selectedPaymentCreditCardId = this.paymentCreditCardOptions[0]?.value ?? null;
    }
  }

  onPaymentTypeChange(paymentTypeId: number): void {
    this.selectedPaymentTypeId = Number(paymentTypeId);
    if (this.isCreditCardPaymentTypeSelected) {
      this.refreshPaymentCreditCardOptionsForResolvedOffice();
    }
  }

  resolveSelectedPaymentChartOfAccountId(): number | null {
    if (this.isCreditCardPaymentTypeSelected) {
      const selectedCard = this.paymentCreditCardOptions.find(option => option.value === this.selectedPaymentCreditCardId) || null;
      return selectedCard?.chartOfAccountId ?? null;
    }
    return this.selectedPaymentChartOfAccountId ?? null;
  }

  onPaymentChartOfAccountChange(accountId: number | null): void {
    this.selectedPaymentChartOfAccountId = accountId;
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

    if (this.isRowScopedPaymentMode) {
      const parsed = parseFloat(input.value.replace(/[^0-9.-]/g, '').trim());
      this.paymentAmount = isNaN(parsed) ? 0 : parsed;
      this.syncRowApplyAmountFromDialog();
    }
  }

  onPaymentAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const parsed = rawValue ? parseFloat(rawValue) : NaN;
    this.paymentAmount = isNaN(parsed) ? 0 : parsed;
    this.paymentAmountDisplay =
      this.paymentAmount < 0
        ? '-$' + this.formatter.currency(-this.paymentAmount)
        : '$' + this.formatter.currency(this.paymentAmount);
    input.value = this.paymentAmountDisplay;
    this.syncRowApplyAmountFromDialog();
    this.updateRemainingAmount();
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

  openApplyPaymentDialog(targetReceiptId: string | null = null): void {
    const isRowScopedApply = targetReceiptId != null;

    if (!isRowScopedApply) {
      this.paymentOfficeId = null;
      if (!this.officeId) {
        this.toastr.warning('Please select an office first');
        return;
      }
      this.paymentOfficeId = this.officeId;
    } else if (!this.paymentOfficeId) {
      this.toastr.warning('Unable to determine office for selected bill.');
      return;
    }

    this.paymentTargetInvoiceId = null;
    this.manualApplyEditableReceiptId = targetReceiptId;
    this.isManualApplyMode = true;
    this.paymentDate = this.paymentDate ?? new Date();
    this.refreshPaymentChartOfAccountsForResolvedOffice();
    this.refreshPaymentCreditCardOptionsForResolvedOffice();
    this.updateRemainingAmount();
    this.showPaymentForm = true;
    this.applyFilters();
    if (!isRowScopedApply && this.selectedBillReceiptIds.size > 0) {
      this.syncPaymentAmountFromBillSelection();
    } else if (isRowScopedApply && targetReceiptId != null) {
      const dueAmount = this.getReceiptDueAmountValue(targetReceiptId);
      this.paymentAmount = dueAmount;
      this.paymentAmountDisplay = this.formatPaymentAmountDisplay(dueAmount);
      this.syncRowApplyAmountFromDialog();
      this.refreshBillsTableDisplay();
      this.updateRemainingAmount();
    } else {
      this.syncRowApplyAmountFromDialog();
    }
    this.focusPendingApplyAmountInput();
    this.markViewForCheck();
  }

  cancelPaymentForm(): void {
    this.showPaymentForm = false;
    this.isManualApplyMode = false;
    this.clearPaymentForm();
    this.applyFilters();
    this.markViewForCheck();
  }

  submitPayment(): void {
    if (this.isSubmittingPayment) {
      return;
    }
    if (!this.resolveSelectedPaymentChartOfAccountId()) {
      this.toastr.warning(this.isCreditCardPaymentTypeSelected ? 'Please select a credit card' : 'Please select a bank account');
      return;
    }
    if (!this.utilityService.toDateOnlyJsonString(this.paymentDate)) {
      this.toastr.warning('Please select a payment date');
      return;
    }
    if (this.paymentAmount === 0) {
      this.toastr.warning('Please enter an amount');
      return;
    }
    if (!this.resolveSelectedPaymentChartOfAccountId()) {
      this.toastr.warning(this.isCreditCardPaymentTypeSelected
        ? 'Selected credit card is missing a linked chart of account.'
        : 'Please select a bank account');
      return;
    }
    this.submitManualPayments();
  }

  submitManualPayments(): void {
    if (this.isSubmittingPayment) {
      return;
    }

    const receiptsWithPayments = this.receiptsDisplay.filter(receipt => {
      const applyAmountValue = Number((receipt as any).applyAmountValue || 0);
      return applyAmountValue !== 0;
    });

    if (receiptsWithPayments.length === 0) {
      this.toastr.warning('No payments have been applied to any bills');
      return;
    }

    if (
      this.accountingListMode !== 'bills' &&
      !this.isRowScopedPaymentMode &&
      !this.isRemainingAmountZero()
    ) {
      this.toastr.warning(
        `Remaining amount must be $0.00 before submitting. Current remaining: ${this.remainingAmountDisplay}`
      );
      return;
    }

    const paymentDescription = (this.paymentDescription || '').trim() || `Payment ${new Date().toISOString()}`;
    const paymentData = receiptsWithPayments
      .map(receipt => {
        return {
          receipt,
          billId: String(receipt.receiptId || '').trim(),
          paidAmount: Number((receipt as any).applyAmountValue || 0)
        };
      })
      .filter(item => item.billId.length > 0);

    if (paymentData.length === 0) {
      this.toastr.warning('Unable to apply payment: no bill id found for selected bill(s).');
      return;
    }

    const selectedChartOfAccountId = this.resolveSelectedPaymentChartOfAccountId();
    if (!selectedChartOfAccountId) {
      this.toastr.warning('Unable to apply payment: missing payment account.');
      return;
    }

    const officeId = this.resolvedPaymentOfficeId;
    if (officeId == null || officeId <= 0) {
      this.toastr.warning('Unable to apply payment: office is required.');
      return;
    }

    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.toastr.warning('Unable to apply payment: organization is required.');
      return;
    }

    const paymentDateValue =
      this.utilityService.toDateOnlyJsonString(this.paymentDate) ?? this.utilityService.todayAsCalendarDateString();
    const totalApplied = this.utilityService.sumCurrencyAmounts(paymentData.map(item => item.paidAmount));
    if (!this.utilityService.areCurrencyAmountsEqual(totalApplied, this.paymentAmount)) {
      this.toastr.warning('Applied bill amounts must equal the payment amount.');
      return;
    }

    const postingStatusIds = paymentData.map(({ receipt }) =>
      this.receipts.find(item => item.receiptId === receipt.receiptId)?.postingStatusId
    );

    this.journalEntryService.confirmPaymentIfAllowed(postingStatusIds, 'Receipt').pipe(
      take(1),
      switchMap(canProceed => {
        if (!canProceed) {
          return EMPTY;
        }

        this.isSubmittingPayment = true;
        return this.paymentService.createPaymentWithBillAllocations({
          organizationId,
          officeId,
          paymentDate: paymentDateValue,
          amount: totalApplied,
          description: paymentDescription,
          paymentTypeId: this.selectedPaymentTypeId,
          chartOfAccountId: selectedChartOfAccountId,
          isActive: true,
          allocations: paymentData.map(({ billId, paidAmount, receipt }) => {
            const bill = this.receipts.find(item => item.receiptId === receipt.receiptId) ?? receipt;
            return {
              receiptId: billId,
              amount: paidAmount,
              description: buildBillSplitLineDescription(bill) || paymentDescription
            };
          })
        }).pipe(
          take(1),
          finalize(() => {
            this.isSubmittingPayment = false;
            this.clearPaymentForm();
            this.markViewForCheck();
          })
        );
      })
    ).subscribe({
      next: () => {
        this.toastr.success(`Payment of $${this.formatter.currency(totalApplied)} saved`, CommonMessage.Success);
        this.journalEntriesChanged.emit();
        this.loadReceiptsForCurrentSearchCriteria(true);
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Failed to apply payment', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  clearPaymentForm(): void {
    this.showPaymentForm = false;
    this.isManualApplyMode = false;
    this.selectedPaymentChartOfAccountId = null;
    this.selectedPaymentCreditCardId = null;
    this.paymentCreditCardOptions = [];
    this.selectedPaymentTypeId = PaymentType.Check;
    this.paymentDescription = '';
    this.paymentDate = new Date();
    this.paymentAmount = 0;
    this.paymentAmountDisplay = '$' + this.formatter.currency(0);
    this.updateRemainingAmount();
    this.paymentOfficeId = null;
    this.paymentTargetInvoiceId = null;
    this.manualApplyEditableReceiptId = null;
    this.pendingApplyAmountFocusReceiptId = null;
    this.selectedBillReceiptIds.clear();
    this.receiptsDisplay.forEach(receipt => {
      (receipt as any).applyAmountValue = 0;
      (receipt as any).applyAmount = '';
      (receipt as any).applyAmountDisplay = '';
    });
  }

  onApplyAmountInput(receipt: ReceiptDisplayList, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^0-9.\-]/g, '');
    value = value.replace(/(?!^)-/g, '');
    const parts = value.split('.');
    input.value = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : value;
    (receipt as any).applyAmountDisplay = input.value;
  }

  onApplyAmountChange(receipt: ReceiptDisplayList, newValue: string): void {
    (receipt as any).applyAmountDisplay = newValue;
  }

  onApplyAmountBlur(receipt: ReceiptDisplayList, event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitizedValue = input.value.replace(/[^0-9.-]/g, '').trim();
    const parsed = sanitizedValue === '' || sanitizedValue === '-' ? NaN : parseFloat(sanitizedValue);
    const finalValue = isNaN(parsed) ? 0 : parsed;
    (receipt as any).applyAmountValue = finalValue;
    (receipt as any).applyAmountDisplay =
      finalValue < 0 ? '-$' + this.formatter.currency(-finalValue) : '$' + this.formatter.currency(finalValue);
    (receipt as any).applyAmount = (receipt as any).applyAmountDisplay;
    input.value = (receipt as any).applyAmountDisplay;
    this.ensureBillApplyLineSelected(receipt, finalValue);
    this.syncPaymentHeaderFromAppliedBillAmounts();
    this.markViewForCheck();
  }

  onApplyAmountFocus(receipt: ReceiptDisplayList, event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = String(Number((receipt as any).applyAmountValue || 0));
    input.select();
  }

  onApplyAmountEnter(_receipt: ReceiptDisplayList, event: Event): void {
    const input = event.target as HTMLInputElement;
    input.blur();
  }

  onBillSelectionSet(selection: SelectionModel<unknown>): void {
    if (!this.showBillsTableSelections) {
      return;
    }

    const selectedRows = (selection?.selected ?? []) as ReceiptDisplayList[];
    let nextSelectedIds: Set<string>;

    if (selectedRows.length > 0) {
      nextSelectedIds = new Set(
        selectedRows
          .map(row => String(row.receiptId ?? '').trim())
          .filter(receiptId => receiptId.length > 0)
      );
    } else {
      const idsFromDisplay = this.receiptsDisplay
        .filter(row => row.selected && row.receiptId)
        .map(row => String(row.receiptId).trim());
      nextSelectedIds = idsFromDisplay.length > 0 ? new Set(idsFromDisplay) : new Set<string>();
    }

    this.selectedBillReceiptIds = nextSelectedIds;

    if (this.isManualApplyMode && this.showPaymentForm && !this.isRowScopedPaymentMode) {
      this.syncPaymentAmountFromBillSelection();
    } else {
      this.receiptsDisplay.forEach(row => {
        row.selected = this.selectedBillReceiptIds.has(row.receiptId);
      });
    }

    this.markViewForCheck();
  }

  syncRowApplyAmountFromDialog(): void {
    if (this.manualApplyEditableReceiptId == null) {
      return;
    }

    const amountValue = Number(this.paymentAmount || 0);
    const amountDisplay =
      amountValue < 0 ? '-$' + this.formatter.currency(-amountValue) : '$' + this.formatter.currency(amountValue);

    const row = this.receiptsDisplay.find(receipt => receipt.receiptId === this.manualApplyEditableReceiptId);
    if (!row) {
      return;
    }
    (row as any).applyAmountValue = amountValue;
    (row as any).applyAmountDisplay = amountDisplay;
    (row as any).applyAmount = amountDisplay;
    this.refreshBillsTableDisplay();
  }

  getApplyAmountInputId(receiptId: string): string {
    return `apply-amount-1-${receiptId}`;
  }

  focusPendingApplyAmountInput(): void {
    const receiptId = this.pendingApplyAmountFocusReceiptId;
    if (!receiptId || !this.isManualApplyMode || !this.showPaymentForm) {
      return;
    }

    const inputId = this.getApplyAmountInputId(receiptId);
    queueMicrotask(() => {
      setTimeout(() => {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!input) {
          return;
        }
        input.focus();
        input.select();
        this.pendingApplyAmountFocusReceiptId = null;
      }, 0);
    });
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
