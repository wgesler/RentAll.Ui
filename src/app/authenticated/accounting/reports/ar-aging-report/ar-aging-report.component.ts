import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, catchError, finalize, firstValueFrom, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { DocumentExportService } from '../../../../services/document-export.service';
import { DocumentHtmlService } from '../../../../services/document-html.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { DocumentService } from '../../../documents/services/document.service';
import { EmailService } from '../../../email/services/email.service';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig } from '../../../shared/base-document.component';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { InvoiceResponse } from '../../models/invoice.model';
import { ArAgingBucketId, ArAgingDetailReportResult, ArAgingDetailRow, ArAgingDrillDownView, ArAgingInvoiceDetail, ArAgingReportFilters, ArAgingReportResult, ArAgingVisibleRow } from '../../models/ar-aging-report.model';
import { AccountType, PostingStatus, SourceType, isJournalEntrySourceNavigable } from '../../models/accounting-enum';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { InvoiceService } from '../../services/invoice.service';
import { JournalEntrySourceService } from '../../services/journal-entry-source.service';
import { ReportHtmlBuilderService } from '../../services/report-html-builder.service';
import { InvoiceComponent } from '../../invoices/invoice/invoice.component';
import { ContactService } from '../../../contacts/services/contact.service';
import { PropertyService } from '../../../properties/services/property.service';
import { PropertyResponse } from '../../../properties/models/property.model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { ReservationCodeResponse } from '../../../reservations/models/reservation-model';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ReceiptResponse } from '../../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../../maintenance/receipt/receipt.component';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import { WorkOrderComponent } from '../../../maintenance/work-order/work-order.component';
import { WorkOrderResponse } from '../../../maintenance/models/work-order.model';
import { WorkOrderService } from '../../../maintenance/services/work-order.service';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from '../../models/journal-entry.model';

@Component({
  selector: 'app-ar-aging-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, InvoiceComponent, ReceiptComponent, WorkOrderComponent],
  templateUrl: './ar-aging-report.component.html',
  styleUrls: ['./ar-aging-report.component.scss', '../financial-report/financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArAgingReportComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {

  @Input() officeId: number | null = null;
  @Input() reportFilters: ArAgingReportFilters | null = null;
  @Input() refreshTrigger = 0;
  @Output() drillDownActiveChange = new EventEmitter<boolean>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  formatter = inject(FormatterService);
  private invoiceService = inject(InvoiceService);
  private receiptService = inject(ReceiptService);
  private workOrderService = inject(WorkOrderService);
  private journalEntrySourceService = inject(JournalEntrySourceService);
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private generalLedgerService = inject(GeneralLedgerService);
  private propertyService = inject(PropertyService);
  private commonService = inject(CommonService);
  private utilityService = inject(UtilityService);
  private contactService = inject(ContactService);
  private reservationService = inject(ReservationService);
  private reportHtmlBuilder = inject(ReportHtmlBuilderService);
  private documentReloadService = inject(DocumentReloadService);
  private cdr = inject(ChangeDetectorRef);
  override toastr: ToastrService;
  @ViewChild('drillDownInvoiceEditor') drillDownInvoiceEditor?: InvoiceComponent;

  isServiceError = false;
  noDataMessage = 'No open receivables for the selected filters and as-of date.';
  reportResult: ArAgingReportResult | null = null;
  visibleRows: ArAgingVisibleRow[] = [];
  previewIframeHtml = '';
  previewIframeStyles = '';
  isDownloading = false;
  isSubmitting = false;
  expandedCustomerKeys = new Set<string>();
  drillDownView: ArAgingDrillDownView | null = null;
  detailReport: ArAgingDetailReportResult | null = null;
  activeInvoiceId: string | null = null;
  activeInvoiceOfficeId: number | null = null;
  activeInvoiceReservationId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
  activeReceiptId: string | null = null;
  activeReceiptOfficeId: number | null = null;
  drillDownReceiptProperty: PropertyResponse | null = null;
  activeWorkOrderId: string | null = null;
  selectedWorkOrder: WorkOrderResponse | null = null;
  drillDownWorkOrderProperty: PropertyResponse | null = null;

  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  allArLines: JournalEntryLineSearchResponse[] = [];
  contactNameByContactId = new Map<string, string>();
  contactsByContactId = new Map<string, ContactResponse>();
  reservationsByReservationId = new Map<string, ReservationCodeResponse>();
  paymentTermsByContactId = new Map<string, number | null>();
  propertyCodeByPropertyId = new Map<string, string>();

  detailDisplayedColumns: ColumnSet = {
    name: { displayAs: 'Name', maxWidth: '24ch', sort: false },
    classLabel: { displayAs: 'Property', maxWidth: '12ch', sort: false },
    referenceNo: { displayAs: 'Ref No', maxWidth: '16ch', sort: false, sortType: 'natural' },
    transactionDate: { displayAs: 'Date', maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', sort: false },
    terms: { displayAs: 'Terms', maxWidth: '12ch', sort: false },
    dueDate: { displayAs: 'Due Date', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
    aging: { displayAs: 'Aging', maxWidth: '10ch', alignment: 'center', headerAlignment: 'center', sort: false },
    openBalance: { displayAs: 'Balance Owned', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['reportData']));
  destroy$ = new Subject<void>();
  private readonly reportDataLoadKey = 'reportData';

  //#region AR-Aging-Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOrganization();
    this.loadOffices();
    this.loadPropertyCodes();
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
      this.loadArLines();
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
      this.loadArLines();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: offices => {
            this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
            this.loadArLines();
            this.markViewForCheck();
          },
          error: () => {
            this.offices = [];
            this.loadArLines();
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.loadArLines();
        this.markViewForCheck();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.propertyCodeByPropertyId = new Map(
              (properties || []).map(property => [property.propertyId, property.propertyCode])
            );
            this.applyReportDisplay();
            this.markViewForCheck();
          },
          error: () => {
            this.propertyCodeByPropertyId.clear();
            this.applyReportDisplay();
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.propertyCodeByPropertyId.clear();
        this.applyReportDisplay();
        this.markViewForCheck();
      }
    });
  }

  loadArLines(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, this.reportDataLoadKey);

    const officeIds = this.resolveOfficeIds();
    const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
    if (officeIds.length === 0) {
      this.allArLines = [];
      this.isServiceError = false;
      this.applyReportDisplay();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey);
      this.markViewForCheck();
      return;
    }

    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
      take(1),
      switchMap(() => this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1))),
      switchMap(() => this.contactService.ensureContactsLoaded().pipe(take(1))),
      switchMap(() => this.reservationService.ensureReservationCodesLoaded().pipe(take(1))),
      switchMap(() => {
        const contacts = this.contactService.getAllContactsValue();
        this.contactsByContactId = new Map<string, ContactResponse>(
          contacts
            .map((contact): [string, ContactResponse] => [String(contact.contactId || '').trim(), contact])
            .filter((entry): entry is [string, ContactResponse] => !!entry[0])
        );
        this.contactNameByContactId = this.mappingService.buildContactDisplayNameById(contacts);
        this.paymentTermsByContactId = new Map<string, number | null>(
          contacts
            .map((contact): [string, number | null] => [String(contact.contactId || '').trim(), contact.paymentTermsId ?? null])
            .filter((entry): entry is [string, number | null] => !!entry[0])
        );
        this.reservationsByReservationId = new Map<string, ReservationCodeResponse>(
          this.reservationService.getAllReservationCodesValue()
            .map((reservation): [string, ReservationCodeResponse] => [String(reservation.reservationId || '').trim(), reservation])
            .filter((entry): entry is [string, ReservationCodeResponse] => !!entry[0])
        );

        const accountRequests: Array<{ officeId: number; chartOfAccountId: number }> = [];
        officeIds.forEach(officeId => {
          this.resolveArAccountIds(officeId).forEach(chartOfAccountId => {
            accountRequests.push({ officeId, chartOfAccountId });
          });
        });

        if (accountRequests.length === 0) {
          return of([] as JournalEntryLineSearchResponse[]);
        }

        const requests = accountRequests.map(({ officeId, chartOfAccountId }) =>
          this.generalLedgerService.searchJournalEntryLines({
            officeIds: [officeId],
            chartOfAccountId,
            includeVoided: false,
            includeUnposted: true,
            startDate: null,
            endDate: asOfDate
          }).pipe(catchError(() => of([] as JournalEntryLineSearchResponse[])))
        );

        return forkJoin(requests).pipe(
          map(results => {
            const seen = new Set<string>();
            return results.flatMap(lines => lines || []).filter(line => {
              const lineId = String(line.journalEntryLineId || '').trim();
              if (!lineId || seen.has(lineId)) {
                return false;
              }
              seen.add(lineId);
              return true;
            });
          })
        );
      }),
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey))
    ).subscribe({
      next: lines => {
        this.allArLines = lines || [];
        this.isServiceError = false;
        this.applyReportDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.allArLines = [];
        this.paymentTermsByContactId = new Map();
        this.contactNameByContactId = new Map();
        this.contactsByContactId = new Map();
        this.reservationsByReservationId = new Map();
        this.isServiceError = true;
        this.reportResult = null;
        const message = typeof error?.error === 'string' ? error.error : 'Unable to load AR journal lines.';
        this.toastr.error(message, 'AR Aging');
        this.markViewForCheck();
      }
    });
  }

  /** Default A/R from accounting office. */
  resolveArAccountIds(officeId: number): number[] {
    const accountIds = new Set<number>();
    const accountingOffice = this.accountingOfficeService.getAllAccountingOfficesValue()
      .find(office => Number(office.officeId) === officeId);
    const configuredAccountId = Number(accountingOffice?.defaultActRcvableAccountId ?? 0);
    if (configuredAccountId > 0) {
      accountIds.add(configuredAccountId);
    }

    if (accountIds.size === 0) {
      const officeAccounts = this.chartOfAccountsService.getChartOfAccountsForOffice(officeId);
      const arAccount = officeAccounts.find(account =>
        Number(account.accountTypeId) === AccountType.AccountsReceivable
      );
      const fallbackAccountId = Number(arAccount?.accountId ?? 0);
      if (fallbackAccountId > 0) {
        accountIds.add(fallbackAccountId);
      }
    }

    return [...accountIds];
  }
  //#endregion

  //#region Report Display Methods
  applyReportDisplay(): void {
    try {
      const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
      this.reportResult = this.mappingService.buildArAgingReport({
        lines: this.allArLines,
        propertyCodeByPropertyId: this.propertyCodeByPropertyId,
        contactNameByContactId: this.contactNameByContactId,
        contactsByContactId: this.contactsByContactId,
        reservationsByReservationId: this.reservationsByReservationId,
        paymentTermsByContactId: this.paymentTermsByContactId,
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
      this.refreshPrintableHtml();

      if (this.drillDownView) {
        this.refreshDetailReport();
      }
    } catch (error) {
      console.error('AR Aging - error building report display:', error);
      this.isServiceError = true;
      this.reportResult = null;
      this.visibleRows = [];
      this.clearPrintableHtml();
    }
  }

  formatBucketAmount(amount: number | null | undefined): string {
    return this.formatter.currency(Number(amount || 0));
  }

  formatDetailAmount(amount: number | null | undefined): string {
    if (amount == null) {
      return '';
    }
    return this.formatter.currency(amount);
  }

  formatDetailDate(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return this.formatter.formatDateTimeOffsetAsDateOnly(value) || '';
  }

  hasBucketAmount(source: Record<ArAgingBucketId, number>, bucketId: ArAgingBucketId): boolean {
    return Math.abs(Number(source[bucketId] || 0)) > 0.005;
  }

  hasPositiveAmount(amount: number | null | undefined): boolean {
    return Math.abs(Number(amount || 0)) > 0.005;
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
    this.refreshDetailReport();
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  openDrillDownFromRow(row: ArAgingVisibleRow, bucketId: ArAgingBucketId | null): void {
    if (bucketId != null) {
      if (!this.hasBucketAmount(row.bucketAmounts, bucketId)) {
        return;
      }
    } else if (!this.hasPositiveAmount(row.total)) {
      return;
    }

    this.openDrillDown(row.customerKey, bucketId, row.reservationKey);
  }

  closeDrillDown(): void {
    this.closeInvoiceDetail();
    this.closeReceiptDetail();
    this.closeWorkOrderDetail();
    this.drillDownView = null;
    this.detailReport = null;
    this.drillDownActiveChange.emit(false);
    this.markViewForCheck();
  }

  drillDownBack(): void {
    if (this.activeInvoiceId) {
      this.closeInvoiceDetail();
      this.markViewForCheck();
      return;
    }

    if (this.activeReceiptId) {
      this.closeReceiptDetail();
      this.markViewForCheck();
      return;
    }

    if (this.activeWorkOrderId) {
      this.closeWorkOrderDetail();
      this.markViewForCheck();
      return;
    }

    this.closeDrillDown();
  }

  onDetailRowClick(row: ArAgingDetailRow): void {
    if (row.kind !== 'transaction') {
      return;
    }

    this.openJeSourceDocument(row);
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

  refreshDetailReport(): void {
    if (!this.drillDownView || !this.reportResult) {
      this.detailReport = null;
      return;
    }

    const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
    this.detailReport = this.mappingService.buildArAgingJeDetailReport({
      invoiceDetails: this.drillDownView.invoices,
      asOfDate,
      bucketColumns: this.reportResult.bucketColumns,
      bucketFilter: this.drillDownView.bucketId,
      scopeLabel: this.drillDownView.title,
      companyName: this.companyName,
      officeName: this.displayOfficeName
    });
  }

  openJeSourceDocument(row: ArAgingDetailRow): void {
    const referenceNo = (row.referenceNo || '').trim();
    if (!referenceNo) {
      return;
    }

    if (row.sourceTypeId === SourceType.WorkOrder && (row.sourceId || '').trim()) {
      this.openWorkOrderById(row.sourceId!.trim(), row);
      return;
    }

    if (isJournalEntrySourceNavigable(row.sourceTypeId) && (row.sourceId || '').trim()) {
      const sourceRow: JournalEntryLineListDisplay = {
        journalEntryLineId: '',
        journalEntryId: '',
        officeId: Number(row.officeId) || 0,
        transactionDate: row.transactionDate || '',
        journalEntryCode: '',
        source: '',
        sourceTypeId: row.sourceTypeId,
        sourceId: row.sourceId,
        sourceLinkable: true,
        propertyId: null,
        propertyCode: '',
        reservationId: row.reservationId ?? null,
        reservationCode: '',
        contactId: null,
        contactName: '',
        account: '',
        description: '',
        journalEntryMemo: '',
        debit: '',
        credit: '',
        balance: '',
        debitValue: 0,
        creditValue: 0,
        balanceValue: 0,
        postingStatusId: PostingStatus.Posted,
        sortDateValue: 0
      };

      this.journalEntrySourceService.resolveSource(sourceRow).pipe(take(1)).subscribe({
        next: target => {
          if (target?.kind === 'invoice' && target.invoice?.invoiceId) {
            this.openInvoiceDetail(target.invoice);
            return;
          }

          if (target?.kind === 'receipt' && target.receipt?.receiptId) {
            this.openReceiptDetail(target.receipt);
            return;
          }

          this.openInvoiceByReference(referenceNo, row);
        },
        error: () => this.openInvoiceByReference(referenceNo, row)
      });
      return;
    }

    if (/^WO/i.test(referenceNo)) {
      this.openWorkOrderByReference(referenceNo, row);
      return;
    }

    if (/^RC/i.test(referenceNo) || /^R-\d+/i.test(referenceNo)) {
      this.openReceiptByReference(referenceNo, row);
      return;
    }

    this.openInvoiceByReference(referenceNo, row);
  }

  openInvoiceDetail(invoice: InvoiceResponse): void {
    this.closeReceiptDetail();
    this.closeWorkOrderDetail();
    this.selectedInvoice = invoice;
    this.activeInvoiceId = invoice.invoiceId;
    this.activeInvoiceOfficeId = invoice.officeId ?? this.officeId;
    this.activeInvoiceReservationId = invoice.reservationId ?? null;
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  openReceiptDetail(receipt: ReceiptResponse | null): void {
    if (!receipt) {
      return;
    }

    const propertyId = (receipt.propertyIds?.[0] || '').trim();
    if (propertyId) {
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: property => this.setActiveReceipt(receipt, property),
        error: () => this.setActiveReceipt(receipt, null)
      });
      return;
    }

    this.setActiveReceipt(receipt, null);
  }

  setActiveReceipt(receipt: ReceiptResponse, property: PropertyResponse | null): void {
    this.closeInvoiceDetail();
    this.closeWorkOrderDetail();
    this.activeReceiptId = receipt.receiptId;
    this.activeReceiptOfficeId = receipt.officeId;
    this.drillDownReceiptProperty = property;
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  closeReceiptDetail(): void {
    this.activeReceiptId = null;
    this.activeReceiptOfficeId = null;
    this.drillDownReceiptProperty = null;
    this.markViewForCheck();
  }

  closeWorkOrderDetail(): void {
    this.activeWorkOrderId = null;
    this.selectedWorkOrder = null;
    this.drillDownWorkOrderProperty = null;
    this.markViewForCheck();
  }

  openInvoiceByReference(referenceNo: string, row: ArAgingDetailRow): void {
    const officeIds = row.officeId ? [Number(row.officeId)] : this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.toastr.error('Unable to resolve invoice office scope.', 'AR Aging');
      return;
    }

    this.invoiceService.getInvoiceByCode(referenceNo, officeIds).pipe(take(1)).subscribe({
      next: invoice => {
        if (invoice?.invoiceId) {
          this.openInvoiceDetail(invoice);
          return;
        }
        this.toastr.error('Unable to locate invoice by Ref No.', 'AR Aging');
      },
      error: () => this.toastr.error('Unable to locate invoice by Ref No.', 'AR Aging')
    });
  }

  openReceiptByReference(referenceNo: string, row: ArAgingDetailRow): void {
    const officeIds = row.officeId ? [Number(row.officeId)] : this.resolveOfficeIds();
    this.receiptService.searchReceipts({
      officeIds,
      includeInactive: true,
      startDate: null,
      endDate: null,
      receiptKind: 1
    }).pipe(take(1)).subscribe({
      next: receipts => {
        const receipt = (receipts || []).find(item => (item.receiptCode || '').trim() === referenceNo) ?? null;
        if (receipt) {
          this.openReceiptDetail(receipt);
          return;
        }
        this.toastr.error('Unable to locate receipt by Ref No.', 'AR Aging');
      },
      error: () => this.toastr.error('Unable to locate receipt by Ref No.', 'AR Aging')
    });
  }

  openWorkOrderByReference(referenceNo: string, row: ArAgingDetailRow): void {
    const officeIds = row.officeId ? [Number(row.officeId)] : this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.toastr.error('Unable to resolve work order office scope.', 'AR Aging');
      return;
    }

    this.workOrderService.searchWorkOrders({
      officeIds,
      isActive: null,
      startDate: null,
      endDate: null
    }).pipe(take(1)).subscribe({
      next: workOrders => {
        const workOrder = (workOrders || []).find(item =>
          (item.workOrderCode || '').trim().toLowerCase() === referenceNo.toLowerCase()
        ) ?? null;
        if (workOrder?.workOrderId) {
          this.openWorkOrderDetail(workOrder);
          return;
        }
        this.toastr.error('Unable to locate work order by Ref No.', 'AR Aging');
      },
      error: () => this.toastr.error('Unable to locate work order by Ref No.', 'AR Aging')
    });
  }

  openWorkOrderById(workOrderId: string, row: ArAgingDetailRow): void {
    this.workOrderService.getWorkOrderById(workOrderId).pipe(take(1)).subscribe({
      next: workOrder => {
        if (!workOrder?.workOrderId) {
          this.openInvoiceByReference((row.referenceNo || '').trim(), row);
          return;
        }
        this.openWorkOrderDetail(workOrder);
      },
      error: () => this.openInvoiceByReference((row.referenceNo || '').trim(), row)
    });
  }

  openWorkOrderDetail(workOrder: WorkOrderResponse): void {
    this.closeReceiptDetail();
    this.closeInvoiceDetail();
    this.selectedWorkOrder = workOrder;
    this.activeWorkOrderId = workOrder.workOrderId;
    this.drillDownWorkOrderProperty = null;
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  closeInvoiceDetail(): void {
    this.activeInvoiceId = null;
    this.activeInvoiceOfficeId = null;
    this.activeInvoiceReservationId = null;
    this.selectedInvoice = null;
    this.markViewForCheck();
  }

  onInvoiceSaved(): void {
    this.closeInvoiceDetail();
    this.journalEntriesChanged.emit();
    this.loadArLines();
  }

  onReceiptSaved(): void {
    this.closeReceiptDetail();
    this.journalEntriesChanged.emit();
    this.loadArLines();
  }

  onWorkOrderSaved(): void {
    this.closeWorkOrderDetail();
    this.journalEntriesChanged.emit();
    this.loadArLines();
  }

  isDetailRowClickable(row: ArAgingDetailRow): boolean {
    if (row.kind !== 'transaction' || !(row.referenceNo || '').trim()) {
      return false;
    }

    return isJournalEntrySourceNavigable(row.sourceTypeId)
      || row.sourceTypeId === SourceType.WorkOrder
      || /^WO/i.test(row.referenceNo || '')
      || /^RC/i.test(row.referenceNo || '')
      || /^R-\d+/i.test(row.referenceNo || '');
  }

  isDetailRefNoLinkable(row: ArAgingDetailRow): boolean {
    return this.isDetailRowClickable(row);
  }

  onDetailRefNoClick(row: ArAgingDetailRow, event: Event): void {
    event.stopPropagation();
    this.onDetailRowClick(row);
  }
  //#endregion

  //#region Get Methods
  get displayOfficeName(): string {
    if (this.officeId == null) {
      return 'All Offices';
    }
    return this.offices.find(office => office.officeId === this.officeId)?.name || '';
  }

  get entityLineLabel(): string {
    return [this.companyName, this.displayOfficeName].filter(label => !!label).join(' ');
  }

  get shellReportTitle(): string {
    return this.reportResult?.reportTitle?.trim() || 'AR Aging';
  }

  get shellReportEntityLine(): string {
    return this.reportResult?.entityLineLabel?.trim() || this.entityLineLabel;
  }

  get shellReportPeriodLine(): string {
    return this.reportResult?.periodLabel?.trim() || '';
  }

  get canUseReportDocuments(): boolean {
    return true;
  }

  override onPrint(): void {
    super.onPrint('No AR aging report is available to print.');
  }

  override async onDownload(): Promise<void> {
    const downloadConfig: DownloadConfig = {
      fileName: this.buildReportFileName(),
      documentType: DocumentType.ArAging,
      noPreviewMessage: 'No AR aging report is available to download.',
      noSelectionMessage: 'Organization or office is not available.'
    };
    await super.onDownload(downloadConfig);
  }

  exportReportToExcel(): void {
    if (!this.canUseReportDocuments || !this.reportResult) {
      this.toastr.warning('No AR aging report is available to export.', 'No Preview');
      return;
    }

    const printableDocument = this.mappingService.mapArAgingReportToPrintableDocument(this.reportResult);
    this.documentExportService.exportExcelTableDocument(printableDocument, this.buildReportFileName());
  }

  async saveReportDocument(): Promise<void> {
    if (!this.canUseReportDocuments) {
      this.toastr.warning('No AR aging report is available to save.', 'No Preview');
      return;
    }

    this.isSubmitting = true;
    this.markViewForCheck();
    try {
      const config = this.getDocumentConfig();
      if (!config.organizationId || !config.selectedOfficeId) {
        this.toastr.warning('Organization or office is not available.', 'Missing Data');
        return;
      }

      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        config.previewIframeHtml,
        config.previewIframeStyles
      );

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: config.organizationId,
        officeId: config.selectedOfficeId,
        officeName: config.selectedOfficeName || '',
        propertyId: null,
        reservationId: null,
        documentTypeId: Number(DocumentType.ArAging),
        fileName: this.buildReportFileName(),
        generatePdf: true
      };

      await firstValueFrom(this.documentService.generate(generateDto).pipe(take(1)));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
    } catch (error) {
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(
        detail ? `Document generation failed. ${detail}` : 'Document generation failed. Please try again.',
        'Error'
      );
    } finally {
      this.isSubmitting = false;
      this.markViewForCheck();
    }
  }

  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organizationId || null,
      selectedOfficeId: this.resolveDocumentOfficeId(),
      selectedOfficeName: this.displayOfficeName,
      propertyId: null,
      selectedReservationId: null,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
    this.markViewForCheck();
  }

buildReportFileName(): string {
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.displayOfficeName || 'Office');
    const dateStamp = this.utilityService.sanitizeFileNameSegment(
      this.reportFilters?.asOfDate || this.utilityService.todayAsCalendarDateString()
    );
    return `${officeSegment}_ArAging_${dateStamp}.pdf`;
  }

resolveDocumentOfficeId(): number | null {
    if (this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    if (this.offices.length === 1) {
      return this.offices[0].officeId;
    }
    return null;
  }

refreshPrintableHtml(): void {
    if (!this.reportResult || this.reportResult.customerRows.length === 0) {
      this.clearPrintableHtml();
      return;
    }

    const printableDocument = this.mappingService.mapArAgingReportToPrintableDocument(this.reportResult);
    const preview = this.reportHtmlBuilder.buildPreviewContent(printableDocument);
    this.previewIframeHtml = preview.previewIframeHtml;
    this.previewIframeStyles = preview.previewIframeStyles;
  }

clearPrintableHtml(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
  }

  get hasMultipleAmountColumns(): boolean {
    return ((this.reportResult?.bucketColumns.length ?? 0) + 1) > 1;
  }

  get panelMaxWidthCss(): string {
    return this.hasMultipleAmountColumns ? '100%' : '48rem';
  }

  get detailPanelMaxWidthCss(): string {
    return 'min(100%, 96rem)';
  }

  get detailColumnNames(): string[] {
    return Object.keys(this.detailDisplayedColumns);
  }

  getDetailColumnStyle(columnKey: string): { width?: string; minWidth?: string; maxWidth?: string } | null {
    const maxWidth = this.detailDisplayedColumns[columnKey]?.maxWidth;
    if (!maxWidth || maxWidth === 'auto') {
      return null;
    }
    return { minWidth: maxWidth };
  }

  isDetailAmountColumn(columnKey: string): boolean {
    const column = this.detailDisplayedColumns[columnKey];
    return column?.alignment === 'right' || column?.headerAlignment === 'right';
  }

  getDetailHeaderAlign(columnKey: string): string | null {
    const column = this.detailDisplayedColumns[columnKey];
    return column?.headerAlignment || column?.alignment || null;
  }

  getDetailCellAlign(columnKey: string): string | null {
    return this.detailDisplayedColumns[columnKey]?.alignment || null;
  }

  getDetailCellDisplay(row: ArAgingDetailRow, columnKey: string): string {
    switch (columnKey) {
      case 'transactionType':
        return row.transactionType || '';
      case 'transactionDate':
        return this.formatDetailDate(row.transactionDate);
      case 'num':
        return row.num || '';
      case 'referenceNo':
        return row.referenceNo || '-';
      case 'name':
        return row.name || '';
      case 'terms':
        return row.terms || '-';
      case 'dueDate':
        return this.formatDetailDate(row.dueDate);
      case 'classLabel':
        return row.classLabel || '-';
      case 'aging':
        return row.aging == null ? '' : String(row.aging);
      case 'openBalance':
        return this.formatDetailAmount(row.openBalance);
      default:
        return '';
    }
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
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey);
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
