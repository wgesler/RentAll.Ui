import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, catchError, firstValueFrom, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
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
import { CostCodesResponse } from '../../models/cost-codes.model';
import { InvoiceResponse } from '../../models/invoice.model';
import { ArAgingBucketId, ArAgingDetailReportResult, ArAgingDetailRow, ArAgingDrillDownView, ArAgingInvoiceDetail, ArAgingReportFilters, ArAgingReportResult, ArAgingReservationContext, ArAgingVisibleRow, buildArAgingReservationContext } from '../../models/ar-aging-report.model';
import { CostCodesService } from '../../services/cost-codes.service';
import { InvoiceService } from '../../services/invoice.service';
import { ReportHtmlBuilderService } from '../../services/report-html-builder.service';
import { InvoiceComponent } from '../../invoices/invoice/invoice.component';
import { ContactService } from '../../../contacts/services/contact.service';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { ReservationResponse } from '../../../reservations/models/reservation-model';

@Component({
  selector: 'app-ar-aging-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, InvoiceComponent],
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
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private costCodesService = inject(CostCodesService);
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

  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  allInvoices: InvoiceResponse[] = [];
  allCostCodes: CostCodesResponse[] = [];
  contactNameByContactId = new Map<string, string>();
  reservationContextByReservationId = new Map<string, ArAgingReservationContext>();

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
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'costCodes']));
  destroy$ = new Subject<void>();

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
      this.reservationContextByReservationId.clear();
      this.isServiceError = false;
      this.applyReportDisplay();
      this.markViewForCheck();
      return;
    }

    this.contactService.ensureContactsLoaded().pipe(
      take(1),
      switchMap(() => {
        this.contactNameByContactId = this.mappingService.buildContactDisplayNameById(this.contactService.getAllContactsValue());
        return this.invoiceService.searchInvoices({
          officeIds,
          includeInactive: true,
          includePaid: true,
          startDate: null,
          endDate: null
        });
      }),
      take(1)
    ).subscribe({
      next: invoices => {
        this.allInvoices = invoices || [];
        this.isServiceError = false;
        this.applyReportDisplay();
        this.loadReservationContexts();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.allInvoices = [];
        this.contactNameByContactId = new Map();
        this.reservationContextByReservationId.clear();
        this.isServiceError = true;
        this.reportResult = null;
        const message = typeof error?.error === 'string' ? error.error : 'Unable to load invoices for AR Aging.';
        this.toastr.error(message, 'AR Aging');
        this.markViewForCheck();
      }
    });
  }

  loadReservationContexts(): void {
    const reservationIds = [...new Set(
      this.allInvoices
        .map(invoice => invoice.reservationId?.trim())
        .filter((reservationId): reservationId is string => !!reservationId)
    )];

    if (reservationIds.length === 0) {
      this.reservationContextByReservationId.clear();
      if (this.drillDownView) {
        this.refreshDetailReport();
      }
      return;
    }

    this.contactService.ensureContactsLoaded().pipe(
      take(1),
      switchMap(() => {
        const contactsById = new Map(
          this.contactService.getAllContactsValue().map(contact => [contact.contactId, contact])
        );
        return forkJoin(
          reservationIds.map(reservationId =>
            this.reservationService.getReservationByGuid(reservationId).pipe(
              catchError(() => of(null as ReservationResponse | null))
            )
          )
        ).pipe(map(reservations => ({ contactsById, reservations })));
      }),
      takeUntil(this.destroy$)
    ).subscribe(({ contactsById, reservations }) => {
      this.reservationContextByReservationId = new Map(
        reservations
          .filter((reservation): reservation is ReservationResponse => reservation != null)
          .map(reservation => [
            reservation.reservationId,
            buildArAgingReservationContext(reservation, contactsById)
          ])
      );
      if (this.drillDownView) {
        this.refreshDetailReport();
      }
      this.markViewForCheck();
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
        contactNameByContactId: this.contactNameByContactId,
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
    this.openDrillDown(row.customerKey, bucketId, row.reservationKey);
  }

  closeDrillDown(): void {
    this.closeInvoiceDetail();
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

    this.closeDrillDown();
  }

  onDetailRowClick(row: ArAgingDetailRow): void {
    if (row.kind !== 'transaction' || !row.invoiceId) {
      return;
    }

    const prefetchedInvoice = this.allInvoices.find(item => item.invoiceId === row.invoiceId) ?? null;
    this.selectedInvoice = prefetchedInvoice;
    this.activeInvoiceId = row.invoiceId;
    this.activeInvoiceOfficeId = prefetchedInvoice?.officeId ?? this.officeId;
    this.activeInvoiceReservationId = prefetchedInvoice?.reservationId ?? null;
    this.drillDownActiveChange.emit(true);
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

  refreshDetailReport(): void {
    if (!this.drillDownView || !this.reportResult) {
      this.detailReport = null;
      return;
    }

    const asOfDate = this.reportFilters?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
    const invoicesById = new Map(this.allInvoices.map(invoice => [invoice.invoiceId, invoice]));
    this.detailReport = this.mappingService.buildArAgingDetailReport({
      invoiceDetails: this.drillDownView.invoices,
      invoicesById,
      reservationContextByReservationId: this.reservationContextByReservationId,
      costCodes: this.allCostCodes,
      asOfDate,
      bucketColumns: this.reportResult.bucketColumns,
      bucketFilter: this.drillDownView.bucketId,
      scopeLabel: this.drillDownView.title,
      companyName: this.companyName,
      officeName: this.displayOfficeName
    });
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
    this.loadInvoices();
  }

  isDetailRowClickable(row: ArAgingDetailRow): boolean {
    return row.kind === 'transaction' && !!row.invoiceId;
  }

  isDetailRefNoLinkable(row: ArAgingDetailRow): boolean {
    return this.isDetailRowClickable(row) && !!(row.referenceNo || '').trim();
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

  private buildReportFileName(): string {
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.displayOfficeName || 'Office');
    const dateStamp = this.utilityService.sanitizeFileNameSegment(
      this.reportFilters?.asOfDate || this.utilityService.todayAsCalendarDateString()
    );
    return `${officeSegment}_ArAging_${dateStamp}.pdf`;
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
    if (!this.reportResult || this.reportResult.customerRows.length === 0) {
      this.clearPrintableHtml();
      return;
    }

    const printableDocument = this.mappingService.mapArAgingReportToPrintableDocument(this.reportResult);
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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
