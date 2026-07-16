import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, catchError, firstValueFrom, forkJoin, map, of, Subject, switchMap, take, takeUntil } from 'rxjs';
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
import { ContactService } from '../../../contacts/services/contact.service';
import { PropertyResponse } from '../../../properties/models/property.model';
import { PropertyService } from '../../../properties/services/property.service';
import { ReceiptResponse } from '../../../maintenance/models/receipt.model';
import { ReceiptComponent } from '../../../maintenance/receipt/receipt.component';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import {
  ApAgingBillDetail,
  ApAgingBucketId,
  ApAgingDetailReportResult,
  ApAgingDetailRow,
  ApAgingDrillDownView,
  ApAgingReportFilters,
  ApAgingReportResult,
  ApAgingVisibleRow
} from '../../models/ap-aging-report.model';
import { AccountType, PostingStatus, SourceType, isJournalEntrySourceNavigable } from '../../models/accounting-enum';
import { InvoiceComponent } from '../../invoices/invoice/invoice.component';
import { InvoiceResponse } from '../../models/invoice.model';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from '../../models/journal-entry.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { InvoiceService } from '../../services/invoice.service';
import { JournalEntrySourceService } from '../../services/journal-entry-source.service';
import { ReportHtmlBuilderService } from '../../services/report-html-builder.service';
import { WorkOrderComponent } from '../../../maintenance/work-order/work-order.component';
import { WorkOrderResponse } from '../../../maintenance/models/work-order.model';
import { WorkOrderService } from '../../../maintenance/services/work-order.service';

@Component({
  selector: 'app-ap-aging-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, ReceiptComponent, InvoiceComponent, WorkOrderComponent],
  templateUrl: './ap-aging-report.component.html',
  styleUrls: ['./ap-aging-report.component.scss', '../financial-report/financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApAgingReportComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {

  @Input() officeId: number | null = null;
  @Input() reportFilters: ApAgingReportFilters | null = null;
  @Input() refreshTrigger = 0;
  @Input() payableAccountMode: 'standard' | 'owner' = 'standard';
  @Output() drillDownActiveChange = new EventEmitter<boolean>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  formatter = inject(FormatterService);
  private receiptService = inject(ReceiptService);
  private invoiceService = inject(InvoiceService);
  private workOrderService = inject(WorkOrderService);
  private journalEntrySourceService = inject(JournalEntrySourceService);
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private generalLedgerService = inject(GeneralLedgerService);
  private contactService = inject(ContactService);
  private commonService = inject(CommonService);
  private utilityService = inject(UtilityService);
  private propertyService = inject(PropertyService);
  private reportHtmlBuilder = inject(ReportHtmlBuilderService);
  private documentReloadService = inject(DocumentReloadService);
  private cdr = inject(ChangeDetectorRef);
  override toastr: ToastrService;
  @ViewChild('drillDownReceiptEditor') drillDownReceiptEditor?: ReceiptComponent;
  @ViewChild('drillDownInvoiceEditor') drillDownInvoiceEditor?: InvoiceComponent;

  isServiceError = false;
  noDataMessage = 'No open payables for the selected filters and as-of date.';

  get isOwnerPayableMode(): boolean {
    return this.payableAccountMode === 'owner';
  }

  get reportDisplayTitle(): string {
    return this.isOwnerPayableMode ? 'Owner AP Aging Summary' : 'A/P Aging Summary';
  }

  get emptyPayablesMessage(): string {
    return this.isOwnerPayableMode
      ? 'No open owner AP balances for the selected filters and as-of date.'
      : 'No open payables for the selected filters and as-of date.';
  }
  reportResult: ApAgingReportResult | null = null;
  visibleRows: ApAgingVisibleRow[] = [];
  previewIframeHtml = '';
  previewIframeStyles = '';
  isDownloading = false;
  isSubmitting = false;
  expandedVendorKeys = new Set<string>();
  drillDownView: ApAgingDrillDownView | null = null;
  detailReport: ApAgingDetailReportResult | null = null;
  activeReceiptId: string | null = null;
  activeReceiptOfficeId: number | null = null;
  selectedReceipt: ReceiptResponse | null = null;
  drillDownReceiptProperty: PropertyResponse | null = null;
  activeInvoiceId: string | null = null;
  activeInvoiceOfficeId: number | null = null;
  activeInvoiceReservationId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
  activeWorkOrderId: string | null = null;
  selectedWorkOrder: WorkOrderResponse | null = null;
  drillDownWorkOrderProperty: PropertyResponse | null = null;

  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  allReceipts: ReceiptResponse[] = [];
  allOwnerApLines: JournalEntryLineSearchResponse[] = [];
  paymentTermsByContactId = new Map<string, number | null>();
  contactNameByContactId = new Map<string, string>();
  propertyCodeByPropertyId = new Map<string, string>();

  readonly detailDisplayedColumns: ColumnSet = {
    name: { displayAs: 'Name', maxWidth: '24ch', sort: false },
    classLabel: { displayAs: 'Property', maxWidth: '12ch', sort: false },
    referenceNo: { displayAs: 'Ref No', maxWidth: '16ch', sort: false, sortType: 'natural' },
    transactionDate: { displayAs: 'Date', maxWidth: '15ch', alignment: 'center', headerAlignment: 'center', sort: false },
    terms: { displayAs: 'Terms', maxWidth: '12ch', sort: false },
    dueDate: { displayAs: 'Due Date', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
    aging: { displayAs: 'Aging', maxWidth: '10ch', alignment: 'center', headerAlignment: 'center', sort: false },
    openBalance: { displayAs: 'Balance Due', maxWidth: '16ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'propertyCodes']));
  destroy$ = new Subject<void>();

  //#region AP-Aging-Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      const wasReady = this.isPageReady;
      this.isPageReady = items.size === 0;
      if (!wasReady && this.isPageReady) {
        this.loadReportSourceData();
      }
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

    if (reportFiltersChanged && !this.isOwnerPayableMode) {
      this.applyReportDisplay();
      this.markViewForCheck();
    }

    const shouldReload =
      (changes['officeId'] && !changes['officeId'].firstChange)
      || reportFiltersChanged
      || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)
      || (changes['payableAccountMode'] && !changes['payableAccountMode'].firstChange);

    if (shouldReload) {
      this.loadReportSourceData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
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
      this.loadReportSourceData();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: offices => {
            this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.loadReportSourceData();
            this.markViewForCheck();
          },
          error: () => {
            this.offices = [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.loadReportSourceData();
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.loadReportSourceData();
        this.markViewForCheck();
      }
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.loadPropertyCodes().pipe(take(1)).subscribe({
      next: () => {
        this.propertyCodeByPropertyId = new Map(
          this.propertyService.getAllPropertyCodesValue().map(property => [property.propertyId, property.propertyCode])
        );
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyCodes');
        this.applyReportDisplay();
        this.markViewForCheck();
      },
      error: () => {
        this.propertyCodeByPropertyId.clear();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyCodes');
        this.applyReportDisplay();
        this.markViewForCheck();
      }
    });
  }

  loadReportSourceData(): void {
    if (this.isOwnerPayableMode) {
      this.loadOwnerApLines();
      return;
    }

    this.loadReceipts();
  }

  loadReceipts(): void {
    if (!this.isPageReady) {
      return;
    }

    const officeIds = this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.allReceipts = [];
      this.allOwnerApLines = [];
      this.isServiceError = false;
      this.applyReportDisplay();
      this.markViewForCheck();
      return;
    }

    this.contactService.ensureContactsLoaded().pipe(
      take(1),
      switchMap(() => {
        const contacts = this.contactService.getAllContactsValue();
        this.contactNameByContactId = this.mappingService.buildContactDisplayNameById(contacts);
        this.paymentTermsByContactId = new Map<string, number | null>(
          contacts
            .map((contact): [string, number | null] => [String(contact.contactId || '').trim(), contact.paymentTermsId ?? null])
            .filter((entry): entry is [string, number | null] => !!entry[0])
        );
        return this.receiptService.searchReceipts({
          officeIds,
          includeInactive: true,
          startDate: null,
          endDate: null,
          receiptKind: 1
        });
      }),
      take(1)
    ).subscribe({
      next: receipts => {
        this.allReceipts = receipts || [];
        this.allOwnerApLines = [];
        this.isServiceError = false;
        this.applyReportDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.allReceipts = [];
        this.allOwnerApLines = [];
        this.contactNameByContactId = new Map();
        this.isServiceError = true;
        this.reportResult = null;
        const message = typeof error?.error === 'string' ? error.error : 'Unable to load bills for AP Aging.';
        this.toastr.error(message, 'AP Aging');
        this.markViewForCheck();
      }
    });
  }

  loadOwnerApLines(): void {
    if (!this.isPageReady) {
      return;
    }

    const officeIds = this.resolveOfficeIds();
    const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
    if (officeIds.length === 0) {
      this.allOwnerApLines = [];
      this.allReceipts = [];
      this.isServiceError = false;
      this.applyReportDisplay();
      this.markViewForCheck();
      return;
    }

    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(
      take(1),
      switchMap(() => this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1))),
      switchMap(() => this.contactService.ensureContactsLoaded().pipe(take(1))),
      switchMap(() => {
        const contacts = this.contactService.getAllContactsValue();
        this.contactNameByContactId = this.mappingService.buildContactDisplayNameById(contacts);
        this.paymentTermsByContactId = new Map<string, number | null>(
          contacts
            .map((contact): [string, number | null] => [String(contact.contactId || '').trim(), contact.paymentTermsId ?? null])
            .filter((entry): entry is [string, number | null] => !!entry[0])
        );

        const accountRequests: Array<{ officeId: number; chartOfAccountId: number }> = [];
        officeIds.forEach(officeId => {
          this.resolveOwnerApAccountIds(officeId).forEach(chartOfAccountId => {
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
            includeCashOnly: true,
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
      take(1)
    ).subscribe({
      next: lines => {
        this.allOwnerApLines = lines || [];
        this.allReceipts = [];
        this.isServiceError = false;
        this.applyReportDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.allOwnerApLines = [];
        this.allReceipts = [];
        this.paymentTermsByContactId = new Map();
        this.contactNameByContactId = new Map();
        this.isServiceError = true;
        this.reportResult = null;
        const message = typeof error?.error === 'string' ? error.error : 'Unable to load Owner AP journal lines.';
        this.toastr.error(message, 'Owner AP Aging');
        this.markViewForCheck();
      }
    });
  }

  /** Default Owner A/P (accounting office) plus chart account No 2001 when present. */
  resolveOwnerApAccountIds(officeId: number): number[] {
    const accountIds = new Set<number>();

    const accountingOffice = this.accountingOfficeService.getAllAccountingOfficesValue()
      .find(office => Number(office.officeId) === officeId);
    const configuredAccountId = Number(accountingOffice?.defaultOwnActPayableAccountId ?? 0);
    if (configuredAccountId > 0) {
      accountIds.add(configuredAccountId);
    }

    const officeAccounts = this.chartOfAccountsService.getChartOfAccountsForOffice(officeId);
    officeAccounts.forEach(account => {
      const accountId = Number(account.accountId ?? 0);
      if (accountId <= 0) {
        return;
      }

      const accountNo = String(account.accountNo || '').trim().replace(/^0+/, '');
      if (accountNo === '2001') {
        accountIds.add(accountId);
      }
    });

    if (accountIds.size === 0) {
      const ownerApAccount = officeAccounts.find(account =>
        Number(account.accountTypeId) === AccountType.AccountsPayable
        && /owner/i.test((account.name || account.accountNo || '').trim())
      );
      const fallbackAccountId = Number(ownerApAccount?.accountId ?? 0);
      if (fallbackAccountId > 0) {
        accountIds.add(fallbackAccountId);
      }
    }

    return [...accountIds];
  }

  resolveOwnerApAccountId(officeId: number): number | null {
    return this.resolveOwnerApAccountIds(officeId)[0] ?? null;
  }
  //#endregion

  //#region Report Display Methods
  applyReportDisplay(): void {
    try {
      const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
      this.noDataMessage = this.emptyPayablesMessage;
      this.reportResult = this.isOwnerPayableMode
        ? this.mappingService.buildOwnerApAgingReport({
          lines: this.allOwnerApLines,
          propertyCodeByPropertyId: this.propertyCodeByPropertyId,
          paymentTermsByContactId: this.paymentTermsByContactId,
          contactNameByContactId: this.contactNameByContactId,
          asOfDate,
          intervalDays: this.reportFilters?.intervalDays ?? 30,
          throughDays: this.reportFilters?.throughDays !== undefined ? this.reportFilters.throughDays : 90,
          sortBy: this.reportFilters?.sortBy ?? 'default',
          companyName: this.companyName,
          officeName: this.displayOfficeName,
          reportTitle: this.reportDisplayTitle
        })
        : this.mappingService.buildApAgingReport({
          receipts: this.allReceipts || [],
          propertyCodeByPropertyId: this.propertyCodeByPropertyId,
          contactNameByContactId: this.contactNameByContactId,
          paymentTermsByContactId: this.paymentTermsByContactId,
          asOfDate,
          intervalDays: this.reportFilters?.intervalDays ?? 30,
          throughDays: this.reportFilters?.throughDays !== undefined ? this.reportFilters.throughDays : 90,
          sortBy: this.reportFilters?.sortBy ?? 'default',
          companyName: this.companyName,
          officeName: this.displayOfficeName,
          reportTitle: this.reportDisplayTitle
        });
      this.initializeExpandedVendors();
      this.rebuildVisibleRows();
      this.isServiceError = false;
      this.refreshPrintableHtml();

      if (this.drillDownView) {
        this.refreshDetailReport();
      }
    } catch (error) {
      console.error('AP Aging - error building report display:', error);
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

  hasBucketAmount(source: Record<ApAgingBucketId, number>, bucketId: ApAgingBucketId): boolean {
    return Number(source[bucketId] || 0) > 0.005;
  }

  hasPositiveAmount(amount: number | null | undefined): boolean {
    return Number(amount || 0) > 0.005;
  }
  //#endregion

  //#region Expand All Methods
  initializeExpandedVendors(): void {
    this.expandedVendorKeys = new Set((this.reportResult?.vendorRows || []).map(row => row.vendorKey));
  }

  rebuildVisibleRows(): void {
    const rows: ApAgingVisibleRow[] = [];
    (this.reportResult?.vendorRows || []).forEach(vendorRow => {
      const propertyRows = vendorRow.propertyRows ?? [];
      const expandable = propertyRows.length > 0;
      const expanded = expandable && this.expandedVendorKeys.has(vendorRow.vendorKey);

      rows.push({
        rowId: `vendor:${vendorRow.vendorKey}`,
        label: vendorRow.vendorLabel,
        kind: 'vendor',
        vendorKey: vendorRow.vendorKey,
        propertyKey: null,
        bucketAmounts: vendorRow.bucketAmounts,
        total: vendorRow.total,
        depth: 0,
        expandable,
        expanded
      });

      if (!expanded) {
        return;
      }

      vendorRow.propertyRows?.forEach(propertyRow => {
        rows.push({
          rowId: `property:${vendorRow.vendorKey}:${propertyRow.propertyKey}`,
          label: propertyRow.propertyLabel,
          kind: 'property',
          vendorKey: vendorRow.vendorKey,
          propertyKey: propertyRow.propertyKey,
          bucketAmounts: propertyRow.bucketAmounts,
          total: propertyRow.total,
          depth: 1,
          expandable: false,
          expanded: false
        });
      });

    });

    this.visibleRows = rows;
  }

  toggleVendorExpansion(vendorKey: string): void {
    if (this.expandedVendorKeys.has(vendorKey)) {
      this.expandedVendorKeys.delete(vendorKey);
    } else {
      this.expandedVendorKeys.add(vendorKey);
    }
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  toggleExpandAll(): void {
    if (this.isAllExpanded) {
      this.expandedVendorKeys.clear();
    } else {
      this.initializeExpandedVendors();
    }
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  get isAllExpanded(): boolean {
    const vendorKeys = (this.reportResult?.vendorRows || []).map(row => row.vendorKey);
    return vendorKeys.length > 0 && vendorKeys.every(vendorKey => this.expandedVendorKeys.has(vendorKey));
  }

  getExpandAllIcon(): string {
    return this.isAllExpanded ? 'expand_less' : 'expand_more';
  }

  getRowExpandIcon(row: ApAgingVisibleRow): string {
    return row.expanded ? 'expand_less' : 'expand_more';
  }
  //#endregion

  //#region Drill-Down
  openDrillDown(vendorKey: string | null, bucketId: ApAgingBucketId | null, propertyKey: string | null = null): void {
    if (!this.reportResult) {
      return;
    }

    const bills = this.filterDrillDownBills(vendorKey, bucketId, propertyKey);
    if (bills.length === 0) {
      return;
    }

    const vendorRow = vendorKey
      ? this.reportResult.vendorRows.find(row => row.vendorKey === vendorKey)
      : null;
    const propertyLabel = propertyKey
      ? vendorRow?.propertyRows.find(row => row.propertyKey === propertyKey)?.propertyLabel
      : null;
    const vendorLabel = vendorRow?.vendorLabel || vendorKey || (this.isOwnerPayableMode ? 'All Owners' : 'All Vendors');
    const title = propertyLabel || vendorLabel;
    const bucketLabel = bucketId
      ? this.reportResult.bucketColumns.find(column => column.id === bucketId)?.label || bucketId
      : 'All Buckets';

    this.drillDownView = {
      title,
      subtitle: `${bucketLabel} · ${this.reportResult.periodLabel}`,
      vendorKey,
      propertyKey,
      bucketId,
      bills
    };
    this.refreshDetailReport();
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  openDrillDownFromRow(row: ApAgingVisibleRow, bucketId: ApAgingBucketId | null): void {
    this.openDrillDown(row.vendorKey, bucketId, row.propertyKey);
  }

  closeDrillDown(): void {
    this.closeReceiptDetail();
    this.closeInvoiceDetail();
    this.closeWorkOrderDetail();
    this.drillDownView = null;
    this.detailReport = null;
    this.drillDownActiveChange.emit(false);
    this.markViewForCheck();
  }

  drillDownBack(): void {
    if (this.activeReceiptId) {
      this.closeReceiptDetail();
      this.markViewForCheck();
      return;
    }

    if (this.activeInvoiceId) {
      this.closeInvoiceDetail();
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

  onDetailRowClick(row: ApAgingDetailRow): void {
    if (row.kind !== 'transaction') {
      return;
    }

    if (this.isOwnerPayableMode) {
      this.openOwnerSourceDocument(row);
      return;
    }

    if (!row.receiptId) {
      return;
    }

    const prefetchedReceipt = this.allReceipts.find(item => item.receiptId === row.receiptId) ?? null;
    this.openReceiptDetail(prefetchedReceipt);
  }

  filterDrillDownBills(vendorKey: string | null, bucketId: ApAgingBucketId | null, propertyKey: string | null = null): ApAgingBillDetail[] {
    if (!this.reportResult) {
      return [];
    }

    return this.reportResult.billDetails.filter(bill => {
      if (vendorKey && bill.vendorKey !== vendorKey) {
        return false;
      }
      if (propertyKey && bill.propertyKey !== propertyKey) {
        return false;
      }
      if (bucketId && bill.bucketId !== bucketId) {
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
    if (this.isOwnerPayableMode) {
      this.detailReport = this.mappingService.buildOwnerApAgingDetailReport({
        billDetails: this.drillDownView.bills,
        asOfDate,
        bucketColumns: this.reportResult.bucketColumns,
        bucketFilter: this.drillDownView.bucketId,
        scopeLabel: this.drillDownView.title,
        companyName: this.companyName,
        officeName: this.displayOfficeName
      });
      return;
    }

    const receiptsById = new Map(this.allReceipts.map(receipt => [receipt.receiptId, receipt]));
    this.detailReport = this.mappingService.buildApAgingDetailReport({
      billDetails: this.drillDownView.bills,
      receiptsById,
      asOfDate,
      bucketColumns: this.reportResult.bucketColumns,
      bucketFilter: this.drillDownView.bucketId,
      scopeLabel: this.drillDownView.title,
      companyName: this.companyName,
      officeName: this.displayOfficeName
    });
  }

  openReceiptDetail(receipt: ReceiptResponse | null): void {
    if (!receipt) {
      return;
    }

    const propertyId = (receipt.propertyIds?.[0] || '').trim();
    if (propertyId) {
      this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)).subscribe({
        next: property => this.setActiveReceipt(receipt, property),
        error: () => this.setActiveReceipt(receipt, this.buildReceiptPropertyStub(receipt))
      });
      return;
    }

    this.setActiveReceipt(receipt, this.buildReceiptPropertyStub(receipt));
  }

  closeReceiptDetail(): void {
    this.activeReceiptId = null;
    this.activeReceiptOfficeId = null;
    this.selectedReceipt = null;
    this.drillDownReceiptProperty = null;
    this.markViewForCheck();
  }

  closeInvoiceDetail(): void {
    this.activeInvoiceId = null;
    this.activeInvoiceOfficeId = null;
    this.activeInvoiceReservationId = null;
    this.selectedInvoice = null;
    this.markViewForCheck();
  }

  closeWorkOrderDetail(): void {
    this.activeWorkOrderId = null;
    this.selectedWorkOrder = null;
    this.drillDownWorkOrderProperty = null;
    this.markViewForCheck();
  }

  onReceiptSaved(): void {
    this.closeReceiptDetail();
    this.journalEntriesChanged.emit();
    this.loadReportSourceData();
  }

  onInvoiceSaved(): void {
    this.closeInvoiceDetail();
    this.journalEntriesChanged.emit();
    this.loadReportSourceData();
  }

  onWorkOrderSaved(): void {
    this.closeWorkOrderDetail();
    this.journalEntriesChanged.emit();
    this.loadReportSourceData();
  }

  isDetailRowClickable(row: ApAgingDetailRow): boolean {
    if (row.kind !== 'transaction' || !(row.referenceNo || '').trim()) {
      return false;
    }

    if (this.isOwnerPayableMode) {
      return isJournalEntrySourceNavigable(row.sourceTypeId)
        || row.sourceTypeId === SourceType.WorkOrder
        || /^WO/i.test(row.referenceNo || '')
        || /^RC/i.test(row.referenceNo || '')
        || /^R-\d+/i.test(row.referenceNo || '');
    }

    return !!row.receiptId;
  }

  isDetailRefNoLinkable(row: ApAgingDetailRow): boolean {
    return this.isDetailRowClickable(row);
  }

  onDetailRefNoClick(row: ApAgingDetailRow, event: Event): void {
    event.stopPropagation();
    this.onDetailRowClick(row);
  }

  openOwnerSourceDocument(row: ApAgingDetailRow): void {
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

          this.resolveOwnerSourceByCode(row);
        },
        error: () => this.resolveOwnerSourceByCode(row)
      });
      return;
    }

    this.resolveOwnerSourceByCode(row);
  }

  resolveOwnerSourceByCode(row: ApAgingDetailRow): void {
    const referenceNo = (row.referenceNo || '').trim();
    const officeId = Number(row.officeId) || 0;
    const officeIds = officeId > 0 ? [officeId] : this.resolveOfficeIds();

    if (/^WO/i.test(referenceNo)) {
      if (officeIds.length === 0) {
        this.toastr.error('Unable to resolve work order office scope.', 'Owner AP Aging');
        return;
      }

      this.workOrderService.searchWorkOrders({
        officeIds,
        isActive: null,
        startDate: null,
        endDate: null
      }).pipe(take(1)).subscribe({
        next: workOrders => {
          const matched = (workOrders || []).find(workOrder =>
            (workOrder.workOrderCode || '').trim().toLowerCase() === referenceNo.toLowerCase()
          );
          if (!matched?.workOrderId) {
            this.toastr.error('Unable to locate work order by Ref No.', 'Owner AP Aging');
            return;
          }
          this.openWorkOrderDetail(matched);
        },
        error: () => this.toastr.error('Unable to locate work order by Ref No.', 'Owner AP Aging')
      });
      return;
    }

    if (/^RC/i.test(referenceNo)) {
      this.receiptService.searchReceipts({
        officeIds,
        includeInactive: true,
        startDate: null,
        endDate: null,
        receiptKind: 1
      }).pipe(take(1)).subscribe({
        next: receipts => {
          const matched = (receipts || []).find(receipt =>
            (receipt.receiptCode || '').trim().toLowerCase() === referenceNo.toLowerCase()
            || (receipt.billNumber || '').trim().toLowerCase() === referenceNo.toLowerCase()
          );
          if (!matched?.receiptId) {
            this.toastr.error('Unable to locate receipt by Ref No.', 'Owner AP Aging');
            return;
          }
          this.openReceiptDetail(matched);
        },
        error: () => this.toastr.error('Unable to locate receipt by Ref No.', 'Owner AP Aging')
      });
      return;
    }

    if (/^R-\d+/i.test(referenceNo)) {
      if (officeIds.length === 0) {
        this.toastr.error('Unable to resolve invoice office scope.', 'Owner AP Aging');
        return;
      }

      this.invoiceService.getInvoiceByCode(referenceNo, officeIds).pipe(take(1)).subscribe({
        next: invoice => {
          if (!invoice?.invoiceId) {
            this.toastr.error('Unable to locate invoice by Ref No.', 'Owner AP Aging');
            return;
          }
          this.openInvoiceDetail(invoice);
        },
        error: () => this.toastr.error('Unable to locate invoice by Ref No.', 'Owner AP Aging')
      });
      return;
    }

    this.toastr.error('Unable to open supporting document for this Ref No.', 'Owner AP Aging');
  }

  openWorkOrderById(workOrderId: string, row: ApAgingDetailRow): void {
    this.workOrderService.getWorkOrderById(workOrderId).pipe(take(1)).subscribe({
      next: workOrder => {
        if (!workOrder?.workOrderId) {
          this.resolveOwnerSourceByCode(row);
          return;
        }
        this.openWorkOrderDetail(workOrder);
      },
      error: () => this.resolveOwnerSourceByCode(row)
    });
  }

  openWorkOrderDetail(workOrder: WorkOrderResponse): void {
    this.closeReceiptDetail();
    this.closeInvoiceDetail();
    this.selectedWorkOrder = workOrder;
    this.activeWorkOrderId = workOrder.workOrderId;
    const propertyId = (workOrder.propertyId || '').trim();
    this.drillDownWorkOrderProperty = propertyId
      ? this.buildWorkOrderPropertyStub(workOrder)
      : null;
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  openInvoiceDetail(invoice: InvoiceResponse): void {
    this.closeReceiptDetail();
    this.closeWorkOrderDetail();
    this.selectedInvoice = invoice;
    this.activeInvoiceId = invoice.invoiceId;
    this.activeInvoiceOfficeId = invoice.officeId ?? null;
    this.activeInvoiceReservationId = invoice.reservationId ?? null;
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  private setActiveReceipt(receipt: ReceiptResponse, property: PropertyResponse | null): void {
    this.closeInvoiceDetail();
    this.closeWorkOrderDetail();
    this.selectedReceipt = receipt;
    this.activeReceiptId = receipt.receiptId;
    this.activeReceiptOfficeId = receipt.officeId;
    this.drillDownReceiptProperty = property;
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  private buildReceiptPropertyStub(receipt: ReceiptResponse): PropertyResponse {
    return {
      propertyId: receipt.propertyIds?.[0] || '',
      organizationId: this.organizationId,
      propertyCode: this.propertyCodeByPropertyId.get(receipt.propertyIds?.[0] || '') || '',
      officeId: receipt.officeId,
      officeName: receipt.officeName,
      isActive: true
    } as PropertyResponse;
  }

  private buildWorkOrderPropertyStub(workOrder: WorkOrderResponse): PropertyResponse {
    const propertyId = (workOrder.propertyId || '').trim();
    return {
      propertyId,
      organizationId: this.organizationId,
      propertyCode: this.propertyCodeByPropertyId.get(propertyId) || '',
      officeId: workOrder.officeId,
      isActive: true
    } as PropertyResponse;
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
    return this.reportResult?.reportTitle?.trim() || (this.isOwnerPayableMode ? 'Owner A/P Aging' : 'AP Aging');
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
    super.onPrint('No AP aging report is available to print.');
  }

  override async onDownload(): Promise<void> {
    const downloadConfig: DownloadConfig = {
      fileName: this.buildReportFileName(),
      documentType: DocumentType.ApAging,
      noPreviewMessage: 'No AP aging report is available to download.',
      noSelectionMessage: 'Organization or office is not available.'
    };
    await super.onDownload(downloadConfig);
  }

  exportReportToExcel(): void {
    if (!this.canUseReportDocuments || !this.reportResult) {
      this.toastr.warning('No AP aging report is available to export.', 'No Preview');
      return;
    }

    const printableDocument = this.mappingService.mapApAgingReportToPrintableDocument(this.reportResult);
    this.documentExportService.exportExcelTableDocument(printableDocument, this.buildReportFileName());
  }

  async saveReportDocument(): Promise<void> {
    if (!this.canUseReportDocuments) {
      this.toastr.warning('No AP aging report is available to save.', 'No Preview');
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
        documentTypeId: Number(DocumentType.ApAging),
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

  private buildReportFileName(): string {
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.displayOfficeName || 'Office');
    const dateStamp = this.utilityService.sanitizeFileNameSegment(
      this.reportFilters?.asOfDate || this.utilityService.todayAsCalendarDateString()
    );
    return `${officeSegment}_ApAging_${dateStamp}.pdf`;
  }

  private resolveDocumentOfficeId(): number | null {
    if (this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    if (this.offices.length === 1) {
      return this.offices[0].officeId;
    }
    return null;
  }

  private refreshPrintableHtml(): void {
    if (!this.reportResult || this.reportResult.vendorRows.length === 0) {
      this.clearPrintableHtml();
      return;
    }

    const printableDocument = this.mappingService.mapApAgingReportToPrintableDocument(this.reportResult);
    const preview = this.reportHtmlBuilder.buildPreviewContent(printableDocument);
    this.previewIframeHtml = preview.previewIframeHtml;
    this.previewIframeStyles = preview.previewIframeStyles;
  }

  private clearPrintableHtml(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
  }

  get hasMultipleAmountColumns(): boolean {
    return ((this.reportResult?.bucketColumns.length ?? 0) + 1) > 1;
  }

  /** Multi-column panels size to content and cap at the viewport. */
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

    // Floor only so headers/values can grow without clipping titles.
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

  getDetailCellDisplay(row: ApAgingDetailRow, columnKey: string): string {
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
    const previous = change.previousValue as ApAgingReportFilters | null;
    const current = change.currentValue as ApAgingReportFilters | null;
    return previous?.asOfDate !== current?.asOfDate
      || previous?.datePreset !== current?.datePreset
      || previous?.intervalDays !== current?.intervalDays
      || previous?.throughDays !== current?.throughDays
      || previous?.sortBy !== current?.sortBy;
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion
}
