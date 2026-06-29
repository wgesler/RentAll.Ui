import { CommonModule } from '@angular/common';
import { SelectionModel } from '@angular/cdk/collections';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, EMPTY, Subject, concatMap, filter, finalize, from, map, switchMap, take, takeUntil } from 'rxjs';
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
import { BankCardResponse } from '../../organizations/models/bank.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { NewContactDialogService } from '../../shared/contacts/new-contact-dialog.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { BillPaymentRequest, BillPaymentResponse, ReceiptDisplayList, ReceiptResponse, ReceiptSelection, Split } from '../models/receipt.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';

@Component({
  standalone: true,
  selector: 'app-receipts-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  templateUrl: './receipts-list.component.html',
  styleUrl: './receipts-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptsListComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild(DataTableComponent) billsDataTable?: DataTableComponent;
  @Input() property: PropertyResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() embeddedInMaintenance = false;
  @Input() embeddedInAccounting = false;
  @Input() accountingListMode: 'all' | 'bills' | 'receipts' | 'utilities' = 'all';
  @Input() refreshTrigger: number = 0;
  @Output() receiptSelect = new EventEmitter<ReceiptSelection>();
  @Output() payableEvent = new EventEmitter<ReceiptDisplayList>();
  @Output() workOrderSelect = new EventEmitter<{ workOrderId: string | null; propertyId: string | null }>();
  @Output() journalEntriesChanged = new EventEmitter<void>();

  isPageReady = false;
  isServiceError: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['receipts']));
  destroy$ = new Subject<void>();
  accountingOffices: AccountingOfficeResponse[] = [];
  showInactive: boolean = false;
  receipts: ReceiptResponse[] = [];
  receiptsDisplay: ReceiptDisplayList[] = [];
  allReceipts: ReceiptDisplayList[] = [];
  propertyCodeLookup = new Map<string, string>();
  bankCardOptionsByOfficeId = new Map<number, Array<{ bankCardId: number; label: string }>>();
  vendorOptionsByOfficeId = new Map<number, Array<{ contactId: string; label: string }>>();
  chartOfAccountsByOfficeId = new Map<number, Map<number, ChartOfAccountResponse>>();
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

  get receiptDisplayedColumns(): ColumnSet {
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
      return stripIsUtilityColumn(this.maintenanceReceiptDisplayedColumns);
    }
    const accountingColumns = this.accountingListMode === 'receipts'
      ? this.accountingNonBillReceiptDisplayedColumns
      : this.accountingReceiptDisplayedColumns;
    if (!this.isManualApplyMode) {
      const { applyAmount, ...columnsWithoutApply } = accountingColumns;
      return stripIsUtilityColumn(columnsWithoutApply);
    }
    return stripIsUtilityColumn(accountingColumns);
  }

  get showBillsTableSelections(): boolean {
    return this.embeddedInAccounting && this.accountingListMode === 'bills';
  }

  constructor(
    private receiptService: ReceiptService,
    private mappingService: MappingService,
    private propertyService: PropertyService,
    private accountingOfficeService: AccountingOfficeService,
    private contactService: ContactService,
    private newContactDialogService: NewContactDialogService,
    private workOrderService: WorkOrderService,
    private chartOfAccountsService: ChartOfAccountsService,
    private authService: AuthService,
    private formatter: FormatterService,
    private utilityService: UtilityService,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {}


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
    this.loadPropertyLookup();
    this.loadChartOfAccountsForAccounting();
    this.loadReceiptsForCurrentSearchCriteria();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      const propertyId = this.property?.propertyId || null;
      if (propertyId !== this.selectedPropertyId) {
        this.selectedPropertyId = propertyId;
        if (!changes['property'].firstChange) {
          this.loadReceiptsForCurrentSearchCriteria();
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
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadReceiptsForCurrentSearchCriteria(true);
    }

    if (changes['searchRequest'] && this.embeddedInMaintenance) {
      if (!changes['searchRequest'].firstChange) {
        this.loadReceiptsForCurrentSearchCriteria();
      }
    }
  }

  getReceipts(force = false): void {
    if (this.embeddedInMaintenance && !this.canRunMaintenanceSearch(this.searchRequest)) {
      this.lastReceiptSearchKey = null;
      this.receiptSearchInFlightKey = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
      this.markViewForCheck();
      return;
    }

    let searchKey: string | null = null;
    if (this.embeddedInMaintenance) {
      searchKey = this.buildReceiptSearchKey();
      if (!force && searchKey === this.lastReceiptSearchKey) {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
        this.markViewForCheck();
        return;
      }
      if (!force && searchKey === this.receiptSearchInFlightKey) {
        return;
      }
      this.receiptSearchInFlightKey = searchKey;
    }

    const loadId = ++this.receiptsLoadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'receipts');
    const load$ = this.embeddedInMaintenance
      ? this.receiptService.searchReceipts(this.buildMaintenanceSearchRequest())
      : this.receiptService.getReceipts(this.property?.propertyId ?? null, this.officeId ?? null);

    load$.pipe(take(1), takeUntil(this.destroy$), finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'receipts');
        if (this.embeddedInMaintenance && searchKey != null && this.receiptSearchInFlightKey === searchKey) {
          this.receiptSearchInFlightKey = null;
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: (receipts: ReceiptResponse[]) => {
        if (this.receiptsLoadId !== loadId) {
          return;
        }
        if (this.embeddedInMaintenance && searchKey != null) {
          this.lastReceiptSearchKey = searchKey;
        }
        this.receipts = receipts || [];
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

  addReceipt(): void {
    if (this.embeddedInMaintenance) {
      this.receiptSelect.emit({
        receiptId: null,
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
    this.receiptService.deleteReceipt(event.receiptId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Receipt deleted successfully', CommonMessage.Success);
        this.receipts = this.receipts.filter(receipt => receipt.receiptId !== event.receiptId);
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
      const selectedPropertyId = (event.propertyIds || [])
        .map(propertyId => (propertyId || '').trim())
        .find(propertyId => propertyId.length > 0) || null;
      this.receiptSelect.emit({
        receiptId: event.receiptId,
        officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
        propertyId: selectedPropertyId,
        autoSaveValidationAttempt: true
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
    if (this.embeddedInMaintenance) {
      const selectedPropertyId = (event.propertyIds || [])
        .map(propertyId => (propertyId || '').trim())
        .find(propertyId => propertyId.length > 0) || null;
      this.receiptSelect.emit({
        receiptId: event.receiptId,
        officeId: Number.isFinite(Number(event.officeId)) ? Number(event.officeId) : null,
        propertyId: selectedPropertyId
      });
      return;
    }
    if (!this.property) return;
    const url = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceReceipt, [String(event.receiptId)]);
    this.router.navigate([url], { queryParams: { propertyId: this.property.propertyId }, state: { property: this.property } });
  }

  goToWorkOrderFromCode(event: { rowItem?: ReceiptDisplayList; workOrderCode?: string }): void {
    const rowItem = event?.rowItem;
    const targetWorkOrderCode = (event?.workOrderCode || '').trim();
    if (!rowItem || !targetWorkOrderCode) {
      return;
    }

    const propertyId =
      (rowItem.propertyIds || []).map(id => (id || '').trim()).find(id => id.length > 0)
      || (this.property?.propertyId || '').trim()
      || (this.selectedPropertyId || '').trim()
      || null;
    const officeId = Number(rowItem.officeId || this.officeId || 0) || null;

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
            propertyId: resolvedPropertyId
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
  //#endregion

  //#region Data Load Methods
  loadPropertyLookup(): void {
    this.propertyService.getPropertyCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
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
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    if (this.usesMaintenanceSearch()) {
      this.loadReceiptsForCurrentSearchCriteria();
      return;
    }
    this.applyFilters();
  }

  onShowPaidToggleChange(checked: boolean): void {
    this.showPaid = checked;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.filterAccountingReceiptsByMode(this.allReceipts);
    if (!this.authService.hasAccountingNavAccess()) {
      filtered = filtered.filter(receipt => receipt.isUtility !== true);
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
        return {
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
        } as ReceiptDisplayList;
      });
    }

    this.receiptsDisplay = this.showInactive
      ? filtered.filter(receipt => receipt.isActive === false)
      : filtered.filter(receipt => receipt.isActive !== false);
    this.focusPendingApplyAmountInput();
    this.markViewForCheck();
  }

  filterAccountingReceiptsByMode(receipts: ReceiptDisplayList[]): ReceiptDisplayList[] {
    if (!this.embeddedInAccounting) {
      return receipts;
    }
    if (this.accountingListMode === 'bills') {
      return receipts.filter(receipt => this.isBillReceipt(receipt));
    }
    if (this.accountingListMode === 'utilities') {
      return receipts.filter(receipt => this.isBillReceipt(receipt) && receipt.isUtility === true);
    }
    if (this.accountingListMode === 'receipts') {
      return receipts.filter(receipt => !this.isBillReceipt(receipt));
    }
    return receipts;
  }

  isBillReceipt(receipt: Pick<ReceiptDisplayList, 'bankCardId'>): boolean {
    return Number(receipt.bankCardId ?? 0) === 0;
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
    const request = this.searchRequest ?? { officeIds: [] };
    return {
      ...request,
      officeIds: this.resolveMaintenanceSearchOfficeIds(request),
      isActive: !this.showInactive,
      includeInactive: this.showInactive,
      propertyId: this.embeddedInMaintenance
        ? (request.propertyId ?? null)
        : (request.propertyId ?? this.property?.propertyId ?? null),
      receiptKind: this.resolveReceiptKindForSearch()
    };
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
    const request = this.buildMaintenanceSearchRequest();
    return JSON.stringify({
      officeIds: [...(request.officeIds || [])].sort((a, b) => a - b),
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null,
      isActive: request.isActive ?? null,
      includeInactive: request.includeInactive ?? false,
      receiptKind: request.receiptKind ?? null
    });
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

    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(
      filter(loaded => loaded === true),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.refreshChartOfAccountsLookups();
      this.refreshPaymentChartOfAccountsForResolvedOffice();
      this.applyAccountDisplayToDisplays();
      this.applyFilters();
      this.markViewForCheck();
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
      const accounts = this.chartOfAccountsService.getChartOfAccountsForOffice(officeId) || [];
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

    this.paymentChartOfAccounts = (this.chartOfAccountsService.getChartOfAccountsForOffice(officeId) || [])
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
    let value = input.value.replace(/[^0-9.-]/g, '');
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

    this.isSubmittingPayment = true;
    const selectedChartOfAccountId = this.resolveSelectedPaymentChartOfAccountId();
    if (!selectedChartOfAccountId) {
      this.isSubmittingPayment = false;
      this.toastr.warning('Unable to apply payment: missing payment account.');
      return;
    }
    let appliedPaymentCount = 0;
    from(paymentData)
      .pipe(
        concatMap(({ billId, paidAmount }) => {
          const paymentRequest: BillPaymentRequest = {
            paymentDate:
              this.utilityService.toDateOnlyJsonString(this.paymentDate) ?? this.utilityService.todayAsCalendarDateString(),
            chartOfAccountId: selectedChartOfAccountId,
            paymentTypeId: this.selectedPaymentTypeId,
            description: paymentDescription,
            amount: paidAmount,
            bills: [billId]
          };
          return this.receiptService.applyBillPayment(paymentRequest).pipe(
            take(1),
            map((response: BillPaymentResponse) => ({ response, paidAmount }))
          );
        }),
        finalize(() => {
          this.isSubmittingPayment = false;
          this.clearPaymentForm();
          if (appliedPaymentCount > 0) {
            this.journalEntriesChanged.emit();
          }
          this.markViewForCheck();
        })
      )
      .subscribe({
        next: ({ response, paidAmount }) => {
          appliedPaymentCount++;
          const updatedBills = response?.bills ?? [];
          updatedBills.forEach(bill => {
            this.syncReceiptRowFromServer(this.mappingService.mapReceiptResponse(bill));
          });
          this.toastr.success(`Payment of $${this.formatter.currency(paidAmount)} applied`, CommonMessage.Success);
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
