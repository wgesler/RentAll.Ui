import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceResponse } from '../models/invoice.model';
import { ArAgingBucketId, ArAgingDrillDownRow, ArAgingDrillDownView, ArAgingInvoiceDetail, ArAgingReportFilters, ArAgingReportResult, ArAgingVisibleRow } from '../models/ar-aging-report.model';
import { CostCodesService } from '../services/cost-codes.service';
import { InvoiceService } from '../services/invoice.service';
import { InvoiceComponent } from '../invoice/invoice.component';

@Component({
  selector: 'app-ar-aging-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective, InvoiceComponent],
  templateUrl: './ar-aging-report.component.html',
  styleUrls: ['./ar-aging-report.component.scss', '../financial-report/financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArAgingReportComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null;
  @Input() reportFilters: ArAgingReportFilters | null = null;
  @Input() refreshTrigger = 0;
  @Output() drillDownActiveChange = new EventEmitter<boolean>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  @ViewChild('drillDownInvoiceEditor') drillDownInvoiceEditor?: InvoiceComponent;

  isServiceError = false;
  noDataMessage = 'No open receivables for the selected filters and as-of date.';
  reportResult: ArAgingReportResult | null = null;
  visibleRows: ArAgingVisibleRow[] = [];
  expandedCustomerKeys = new Set<string>();
  drillDownView: ArAgingDrillDownView | null = null;
  drillDownInvoices: ArAgingDrillDownRow[] = [];
  activeInvoiceId: string | null = null;
  activeInvoiceOfficeId: number | null = null;
  activeInvoiceReservationId: string | null = null;

  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  allInvoices: InvoiceResponse[] = [];
  allCostCodes: CostCodesResponse[] = [];
  drillDownColumns: ColumnSet = {
    invoiceCode: { displayAs: 'Invoice No', maxWidth: '14ch', sortType: 'natural' },
    customerLabel: { displayAs: 'Customer', maxWidth: '24ch' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '12ch' },
    dueDate: { displayAs: 'Due Date', maxWidth: '12ch' },
    daysPastDue: { displayAs: 'Days Past Due', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right' },
    balanceDueDisplay: { displayAs: 'Balance Due', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '14ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '14ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'costCodes']));
  destroy$ = new Subject<void>();

  constructor(
    public formatter: FormatterService,
    private invoiceService: InvoiceService,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private costCodesService: CostCodesService,
    private authService: AuthService,
    private commonService: CommonService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
  }

  //#region AR-Aging-Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      const wasReady = this.isPageReady;
      this.isPageReady = items.size === 0;
      if (!wasReady && this.isPageReady) {
        this.loadInvoices();
      }
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOrganization();
    this.loadOffices();
    this.loadCostCodes();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const reportFiltersChanged = !!changes['reportFilters']
      && !changes['reportFilters'].firstChange
      && this.hasReportFiltersChanged(changes['reportFilters']);

    if (reportFiltersChanged) {
      this.applyReportDisplay();
      this.markViewForCheck();
    }

    const shouldReload =
      (changes['officeId'] && !changes['officeId'].firstChange)
      || reportFiltersChanged
      || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange);

    if (shouldReload) {
      this.loadInvoices();
    }
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganization(): void {
    const cachedOrganization = this.commonService.getOrganizationValue();
    if (cachedOrganization?.name) {
      this.companyName = cachedOrganization.name.trim();
    }

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(organization => {
      this.companyName = organization?.name?.trim() || '';
      this.applyReportDisplay();
      this.markViewForCheck();
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.loadInvoices();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: offices => {
            this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.loadInvoices();
            this.markViewForCheck();
          },
          error: () => {
            this.offices = [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.loadInvoices();
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.loadInvoices();
        this.markViewForCheck();
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.costCodesService.getAllCostCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: costCodes => {
            this.allCostCodes = costCodes || [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
            this.applyReportDisplay();
            this.markViewForCheck();
          },
          error: () => {
            this.allCostCodes = [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
            this.applyReportDisplay();
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.allCostCodes = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
        this.applyReportDisplay();
        this.markViewForCheck();
      }
    });
  }

  loadInvoices(): void {
    if (!this.isPageReady) {
      return;
    }

    const officeIds = this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.allInvoices = [];
      this.isServiceError = false;
      this.applyReportDisplay();
      this.markViewForCheck();
      return;
    }

    this.invoiceService.searchInvoices({
      officeIds,
      includeInactive: true,
      includePaid: true,
      startDate: null,
      endDate: null
    }).pipe(take(1)).subscribe({
      next: invoices => {
        this.allInvoices = invoices || [];
        this.isServiceError = false;
        this.applyReportDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.allInvoices = [];
        this.isServiceError = true;
        this.reportResult = null;
        const message = typeof error?.error === 'string' ? error.error : 'Unable to load invoices for AR Aging.';
        this.toastr.error(message, 'AR Aging');
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Report Display Methods
  applyReportDisplay(): void {
    try {
      const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
      this.reportResult = this.mappingService.buildArAgingReport({
        invoices: this.allInvoices,
        costCodes: this.allCostCodes,
        asOfDate,
        intervalDays: this.reportFilters?.intervalDays ?? 30,
        throughDays: this.reportFilters?.throughDays !== undefined ? this.reportFilters.throughDays : 90,
        sortBy: this.reportFilters?.sortBy ?? 'default',
        companyName: this.companyName,
        officeName: this.displayOfficeName
      });
      this.initializeExpandedCustomers();
      this.rebuildVisibleRows();
      this.isServiceError = false;

      if (this.drillDownView) {
        this.refreshDrillDownRows();
      }
    } catch (error) {
      console.error('AR Aging - error building report display:', error);
      this.isServiceError = true;
      this.reportResult = null;
      this.visibleRows = [];
    }
  }

  formatBucketAmount(amount: number | null | undefined): string {
    return this.formatter.currency(Number(amount || 0));
  }

  hasBucketAmount(source: Record<ArAgingBucketId, number>, bucketId: ArAgingBucketId): boolean {
    return Number(source[bucketId] || 0) > 0.005;
  }

  hasPositiveAmount(amount: number | null | undefined): boolean {
    return Number(amount || 0) > 0.005;
  }
  //#endregion

  //#region Expand All Methods
  initializeExpandedCustomers(): void {
    this.expandedCustomerKeys = new Set((this.reportResult?.customerRows || []).map(row => row.customerKey));
  }

  rebuildVisibleRows(): void {
    const rows: ArAgingVisibleRow[] = [];
    (this.reportResult?.customerRows || []).forEach(customerRow => {
      const reservationRows = customerRow.reservationRows ?? [];
      const expandable = reservationRows.length > 0;
      const expanded = expandable && this.expandedCustomerKeys.has(customerRow.customerKey);

      rows.push({
        rowId: `customer:${customerRow.customerKey}`,
        label: customerRow.customerLabel,
        kind: 'customer',
        customerKey: customerRow.customerKey,
        reservationKey: null,
        bucketAmounts: customerRow.bucketAmounts,
        total: customerRow.total,
        depth: 0,
        expandable,
        expanded
      });

      if (!expanded) {
        return;
      }

      customerRow.reservationRows?.forEach(reservationRow => {
        rows.push({
          rowId: `reservation:${customerRow.customerKey}:${reservationRow.reservationKey}`,
          label: reservationRow.reservationLabel,
          kind: 'reservation',
          customerKey: customerRow.customerKey,
          reservationKey: reservationRow.reservationKey,
          bucketAmounts: reservationRow.bucketAmounts,
          total: reservationRow.total,
          depth: 1,
          expandable: false,
          expanded: false
        });
      });

      rows.push({
        rowId: `customer-total:${customerRow.customerKey}`,
        label: `Total ${customerRow.customerLabel}`,
        kind: 'customerTotal',
        customerKey: customerRow.customerKey,
        reservationKey: null,
        bucketAmounts: customerRow.bucketAmounts,
        total: customerRow.total,
        depth: 1,
        expandable: false,
        expanded: false
      });
    });

    this.visibleRows = rows;
  }

  toggleCustomerExpansion(customerKey: string): void {
    if (this.expandedCustomerKeys.has(customerKey)) {
      this.expandedCustomerKeys.delete(customerKey);
    } else {
      this.expandedCustomerKeys.add(customerKey);
    }
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  toggleExpandAll(): void {
    if (this.isAllExpanded) {
      this.expandedCustomerKeys.clear();
    } else {
      this.initializeExpandedCustomers();
    }
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  get isAllExpanded(): boolean {
    const customerKeys = (this.reportResult?.customerRows || []).map(row => row.customerKey);
    return customerKeys.length > 0 && customerKeys.every(customerKey => this.expandedCustomerKeys.has(customerKey));
  }

  getExpandAllIcon(): string {
    return this.isAllExpanded ? 'expand_less' : 'expand_more';
  }

  getRowExpandIcon(row: ArAgingVisibleRow): string {
    return row.expanded ? 'expand_less' : 'expand_more';
  }
  //#endregion

  //#region Drill-Down
  openDrillDown(customerKey: string | null, bucketId: ArAgingBucketId | null, reservationKey: string | null = null): void {
    if (!this.reportResult) {
      return;
    }

    const invoices = this.filterDrillDownInvoices(customerKey, bucketId, reservationKey);
    if (invoices.length === 0) {
      return;
    }

    const customerRow = customerKey
      ? this.reportResult.customerRows.find(row => row.customerKey === customerKey)
      : null;
    const reservationLabel = reservationKey
      ? customerRow?.reservationRows.find(row => row.reservationKey === reservationKey)?.reservationLabel
      : null;
    const customerLabel = customerRow?.customerLabel || customerKey || 'All Customers';
    const title = reservationLabel || customerLabel;
    const bucketLabel = bucketId
      ? this.reportResult.bucketColumns.find(column => column.id === bucketId)?.label || bucketId
      : 'All Buckets';

    this.drillDownView = {
      title,
      subtitle: `${bucketLabel} · ${this.reportResult.periodLabel}`,
      customerKey,
      reservationKey,
      bucketId,
      invoices
    };
    this.refreshDrillDownRows();
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  openDrillDownFromRow(row: ArAgingVisibleRow, bucketId: ArAgingBucketId | null): void {
    this.openDrillDown(row.customerKey, bucketId, row.reservationKey);
  }

  closeDrillDown(): void {
    if (!this.drillDownView) {
      return;
    }

    this.closeInvoiceDetail();
    this.drillDownView = null;
    this.drillDownInvoices = [];
    this.drillDownActiveChange.emit(false);
    this.markViewForCheck();
  }

  drillDownBack(): void {
    if (this.activeInvoiceId) {
      this.closeInvoiceDetail();
      return;
    }

    this.closeDrillDown();
  }

  onDrillDownInvoiceClick(row: ArAgingDrillDownRow): void {
    if (!row?.invoiceId) {
      return;
    }

    const invoice = this.reportResult?.invoiceDetails.find(item => item.invoiceId === row.invoiceId);
    this.activeInvoiceId = row.invoiceId;
    this.activeInvoiceOfficeId = invoice?.officeId ?? this.officeId;
    this.activeInvoiceReservationId = invoice?.reservationId ?? null;
    this.markViewForCheck();
  }

  filterDrillDownInvoices(customerKey: string | null, bucketId: ArAgingBucketId | null, reservationKey: string | null = null): ArAgingInvoiceDetail[] {
    if (!this.reportResult) {
      return [];
    }

    return this.reportResult.invoiceDetails.filter(invoice => {
      if (customerKey && invoice.customerKey !== customerKey) {
        return false;
      }
      if (reservationKey && invoice.reservationKey !== reservationKey) {
        return false;
      }
      if (bucketId && invoice.bucketId !== bucketId) {
        return false;
      }
      return true;
    });
  }

  refreshDrillDownRows(): void {
    if (!this.drillDownView) {
      this.drillDownInvoices = [];
      return;
    }

    this.drillDownInvoices = this.drillDownView.invoices.map(invoice => ({
      invoiceId: invoice.invoiceId,
      invoiceCode: invoice.invoiceCode,
      customerLabel: invoice.customerLabel,
      invoiceDate: this.formatter.formatDateTimeOffsetAsDateOnly(invoice.invoiceDate) || '-',
      dueDate: this.formatter.formatDateTimeOffsetAsDateOnly(invoice.dueDate) || '-',
      daysPastDue: invoice.daysPastDue,
      balanceDueDisplay: '$' + this.formatter.currency(invoice.balanceDue),
      reservationCode: invoice.reservationCode || '-',
      propertyCode: invoice.propertyCode || '-'
    }));
  }

  closeInvoiceDetail(): void {
    this.activeInvoiceId = null;
    this.activeInvoiceOfficeId = null;
    this.activeInvoiceReservationId = null;
    this.markViewForCheck();
  }

  onInvoiceSaved(): void {
    this.closeInvoiceDetail();
    this.journalEntriesChanged.emit();
    this.loadInvoices();
  }
  //#endregion

  //#region Get Methods
  get displayOfficeName(): string {
    if (this.officeId == null) {
      return 'All Offices';
    }
    return this.offices.find(office => office.officeId === this.officeId)?.name || '';
  }

  /** Panel max-width grows with column count and caps at the viewport. */
  get panelMaxWidthCss(): string {
    const count = (this.reportResult?.bucketColumns.length ?? 0) + 1;
    if (count <= 1) {
      return '48rem';
    }

    const labelWidthRem = 14;
    const amountColumnWidthRem = 10;
    const chromeRem = 3;
    const calculatedRem = labelWidthRem + (count * amountColumnWidthRem) + chromeRem;
    return `min(100%, ${Math.ceil(calculatedRem)}rem)`;
  }
  //#endregion

  //#region Utility Methods
  resolveOfficeIds(): number[] {
    if (this.officeId != null && this.officeId > 0) {
      return [this.officeId];
    }
    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  hasReportFiltersChanged(change: { previousValue: unknown; currentValue: unknown }): boolean {
    const previous = change.previousValue as ArAgingReportFilters | null;
    const current = change.currentValue as ArAgingReportFilters | null;
    return previous?.asOfDate !== current?.asOfDate
      || previous?.datePreset !== current?.datePreset
      || previous?.intervalDays !== current?.intervalDays
      || previous?.throughDays !== current?.throughDays
      || previous?.sortBy !== current?.sortBy;
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
