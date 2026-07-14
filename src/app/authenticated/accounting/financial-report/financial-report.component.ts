import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, filter, finalize, firstValueFrom, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentService } from '../../documents/services/document.service';
import { EmailService } from '../../email/services/email.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig } from '../../shared/base-document.component';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { Class, SourceTypeLabels } from '../models/accounting-enum';
import {
  FINANCIAL_REPORT_TOTAL_COLUMN_ID,
  FinancialReportColumn,
  FinancialReportDrillDownView,
  FinancialReportKind,
  FinancialReportResult,
  FinancialReportTreeNode
} from '../models/financial-report.model';
import { buildJournalEntryFromSearchLines, JournalEntryLineListDisplay, JournalEntryLineSearchResponse, JournalEntryResponse } from '../models/journal-entry.model';
import { InvoiceResponse } from '../models/invoice.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { JournalEntrySourceService } from '../services/journal-entry-source.service';
import { ReportHtmlBuilderService } from '../services/report-html-builder.service';
import { GeneralLedgerComponent } from '../general-ledger/general-ledger.component';
import { InvoiceComponent } from '../invoice/invoice.component';
import { ReceiptComponent } from '../../maintenance/receipt/receipt.component';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';

interface FinancialReportVisibleRow {
  nodeId: string;
  label: string;
  columnAmountDisplays: Record<string, string>;
  depth: number;
  rowKind: FinancialReportTreeNode['rowKind'];
  expandable: boolean;
  expanded: boolean;
  showDoubleUnderlineBeforeTotal: boolean;
}

@Component({
  selector: 'app-financial-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective, GeneralLedgerComponent, InvoiceComponent, ReceiptComponent],
  templateUrl: './financial-report.component.html',
  styleUrls: ['./financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinancialReportComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() reportKind: FinancialReportKind = 'profitLoss';
  @Input() officeId: number | null = null;
  @Input() reportClass: Class = Class.TotalOnly;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() drillDownActiveChange = new EventEmitter<boolean>();
  @Output() journalEntryDetailActiveChange = new EventEmitter<boolean>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  @Output() shellTitleBarRefresh = new EventEmitter<void>();
  @ViewChild('drillDownInvoiceEditor') drillDownInvoiceEditor?: InvoiceComponent;

  reportResult: FinancialReportResult | null = null;
  visibleRows: FinancialReportVisibleRow[] = [];
  previewIframeHtml = '';
  previewIframeStyles = '';
  isDownloading = false;
  isSubmitting = false;
  drillDownView: FinancialReportDrillDownView | null = null;
  activeJournalEntryId: string | null = null;
  selectedJournalEntryLineId: string | null = null;
  selectedJournalEntry: JournalEntryResponse | null = null;
  activeInvoiceId: string | null = null;
  activeInvoiceOfficeId: number | null = null;
  activeInvoiceReservationId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
  activeReceiptId: string | null = null;
  selectedReceipt: ReceiptResponse | null = null;
  drillDownReceiptProperty: PropertyResponse | null = null;
  drillDownReceiptOfficeId: number | null = null;
  drillDownColumns: ColumnSet = {
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    journalEntryCode: { displayAs: 'Entry No', maxWidth: '14ch', sortType: 'natural' },
    source: { displayAs: 'Source', maxWidth: '16ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    contactName: { displayAs: 'Contact', maxWidth: '20ch' },
    account: { displayAs: 'Account', maxWidth: '28ch' },
    description: { displayAs: 'Description', maxWidth: '32ch' },
    debit: { displayAs: 'Debit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    credit: { displayAs: 'Credit', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false },
    balance: { displayAs: 'Balance', maxWidth: '14ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };
  expandedNodeIds = new Set<string>();
  isServiceError = false;
  noActivityMessage = 'No activity for the selected filters and date range.';
  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allLines: JournalEntryLineSearchResponse[] = [];

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'chartOfAccounts']));
  destroy$ = new Subject<void>();

  constructor(
    public formatter: FormatterService,
    private generalLedgerService: GeneralLedgerService,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private chartOfAccountsService: ChartOfAccountsService,
    private commonService: CommonService,
    private utilityService: UtilityService,
    private journalEntrySourceService: JournalEntrySourceService,
    private propertyService: PropertyService,
    private reportHtmlBuilder: ReportHtmlBuilderService,
    private documentReloadService: DocumentReloadService,
    documentService: DocumentService,
    documentExportService: DocumentExportService,
    documentHtmlService: DocumentHtmlService,
    public override toastr: ToastrService,
    emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
  }

  //#region Financial-Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      const wasReady = this.isPageReady;
      this.isPageReady = items.size === 0;
      if (!wasReady && this.isPageReady) {
        this.loadJournalEntryLines();
      }
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOrganization();
    this.loadOffices();
    this.loadChartOfAccounts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const reportClassChanged = !!changes['reportClass']
      && !changes['reportClass'].firstChange;
    const searchDateRangeChanged = !!changes['searchDateRange']
      && !changes['searchDateRange'].firstChange
      && this.hasSearchDateRangeChanged(changes['searchDateRange']);

    if (reportClassChanged || searchDateRangeChanged) {
      this.applyReportDisplay();
      this.markViewForCheck();
    }

    const shouldReloadLines =
      (changes['officeId'] && !changes['officeId'].firstChange)
      || searchDateRangeChanged
      || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)
      || (changes['reportKind'] && !changes['reportKind'].firstChange);

    if (shouldReloadLines) {
      this.loadJournalEntryLines();
    }
  }
  //#endregion

  //#region Data Load Methods
  loadOrganization(): void {
    const cachedOrganization = this.commonService.getOrganizationValue();
    if (cachedOrganization?.name) {
      this.companyName = cachedOrganization.name.trim();
    }

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(organization => {
      this.companyName = organization?.name?.trim() || '';
      this.markViewForCheck();
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.loadJournalEntryLines();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))
    ).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
          this.loadJournalEntryLines();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.loadJournalEntryLines();
        this.markViewForCheck();
      }
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts'))
    ).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyReportDisplay();
        this.markViewForCheck();
      });
    });
  }

  loadJournalEntryLines(): void {
    if (!this.isPageReady) {
      return;
    }

    const officeIds = this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.allLines = [];
      this.isServiceError = false;
      this.applyReportDisplay();
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;

    this.generalLedgerService.searchJournalEntryLines({
      officeIds,
      chartOfAccountId: null,
      propertyId: null,
      reservationId: null,
      includeVoided: false,
      includeUnposted: true,
      startDate: this.reportKind === 'balanceSheet' ? null : (this.searchDateRange?.startDate ?? null),
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: lines => {
        this.allLines = lines || [];
        this.noActivityMessage = this.reportKind === 'balanceSheet'
          ? 'No balance sheet activity for the selected filters.'
          : 'No profit and loss activity for the selected filters and date range.';
        this.applyReportDisplay();
        this.refreshDrillDownView();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Financial Report - error loading journal entry lines:', error);
        this.isServiceError = true;
        this.allLines = [];
        this.reportResult = null;
        this.visibleRows = [];
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load financial report data: ${apiMessage}`
          : 'Unable to load financial report data.';
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Expand All Methods
  toggleNodeExpansion(nodeId: string): void {
    const descendantNodeIds = this.collectDescendantNodeIds(nodeId);
    const hasExpandedDescendants = descendantNodeIds.some(descendantId => this.expandedNodeIds.has(descendantId));
    if (this.expandedNodeIds.has(nodeId)) {
      if (hasExpandedDescendants) {
        // First click collapses descendants but keeps this node open.
        descendantNodeIds.forEach(descendantId => this.expandedNodeIds.delete(descendantId));
      } else {
        // Next click toggles this node closed.
        this.expandedNodeIds.delete(nodeId);
      }
    } else {
      this.expandedNodeIds.add(nodeId);
      // QuickBooks-style behavior: when opening a section, start with all descendants collapsed.
      descendantNodeIds.forEach(descendantId => this.expandedNodeIds.delete(descendantId));
    }
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  toggleExpandAll(): void {
    if (this.isAllExpanded) {
      this.collapseAllNodes();
      return;
    }
    this.expandAllNodes();
  }

  expandAllNodes(): void {
    this.collectExpandableNodeIds(this.reportResult?.sections || []).forEach(nodeId => this.expandedNodeIds.add(nodeId));
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  collapseAllNodes(): void {
    this.expandedNodeIds.clear();
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  initializeExpandedNodes(sections: FinancialReportTreeNode[]): void {
    const topLevelSectionNodeIds = (sections || [])
      .filter(node => node.rowKind === 'section' && node.childNodes.length > 0)
      .map(node => node.nodeId);
    this.expandedNodeIds = new Set(topLevelSectionNodeIds);
  }

  collectExpandableNodeIds(nodes: FinancialReportTreeNode[]): string[] {
    const nodeIds: string[] = [];
    (nodes || []).forEach(node => {
      if (node.childNodes.length > 0) {
        nodeIds.push(node.nodeId);
        nodeIds.push(...this.collectExpandableNodeIds(node.childNodes));
      }
    });
    return nodeIds;
  }

  collectDescendantNodeIds(nodeId: string): string[] {
    const rootNode = this.findFinancialReportNodeById(this.reportResult?.sections || [], nodeId);
    if (!rootNode) {
      return [];
    }
    return this.collectExpandableNodeIds(rootNode.childNodes);
  }

  findFinancialReportNodeById(nodes: FinancialReportTreeNode[], nodeId: string): FinancialReportTreeNode | null {
    for (const node of nodes || []) {
      if (node.nodeId === nodeId) {
        return node;
      }
      const found = this.findFinancialReportNodeById(node.childNodes || [], nodeId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  isTitleRowExpander(row: FinancialReportVisibleRow): boolean {
    return row.expandable && row.rowKind === 'section';
  }

  getRowExpandIcon(row: FinancialReportVisibleRow): string {
    if (this.isTitleRowExpander(row)) {
      return row.expanded ? 'expand_less' : 'expand_more';
    }
    return row.expanded ? 'chevron_left' : 'chevron_right';
  }

  getExpandAllIcon(): string {
    return this.isAllExpanded ? 'expand_less' : 'expand_more';
  }

  get isAllExpanded(): boolean {
    const expandableNodeIds = this.collectExpandableNodeIds(this.reportResult?.sections || []);
    return expandableNodeIds.length > 0 && expandableNodeIds.every(nodeId => this.expandedNodeIds.has(nodeId));
  }
  //#endregion

  //#region Drill-Down
  canDrillDownAmount(row: FinancialReportVisibleRow, columnId: string): boolean {
    return !!row.columnAmountDisplays[columnId]?.trim();
  }

  openDrillDown(row: FinancialReportVisibleRow, columnId: string): void {
    if (!this.canDrillDownAmount(row, columnId) || !this.reportResult?.drillDownContext) {
      return;
    }

    const filteredLines = this.mappingService.filterFinancialReportDrillDownLines(
      this.allLines,
      row.nodeId,
      columnId,
      this.reportResult.drillDownContext,
      this.reportResult.sections
    );
    const columnLabel = this.mappingService.getFinancialReportDrillDownColumnLabel(columnId, this.reportResult);
    const linesDisplay = this.mappingService.mapJournalEntryLineListDisplay(
      filteredLines,
      this.getChartOfAccountsForOfficeIds(this.resolveOfficeIds()),
      SourceTypeLabels
    );

    this.drillDownView = {
      title: row.label,
      subtitle: `${columnLabel} · ${this.reportResult.periodLabel}`,
      nodeId: row.nodeId,
      columnId,
      lines: linesDisplay
    };
    this.drillDownActiveChange.emit(true);
    this.markViewForCheck();
  }

  closeDrillDown(): void {
    if (!this.drillDownView) {
      return;
    }

    this.closeSourceDocumentDetail();
    this.closeJournalEntryDetail();
    this.drillDownView = null;
    this.drillDownActiveChange.emit(false);
    this.markViewForCheck();
  }

  drillDownBack(): void {
    if (this.activeInvoiceId || this.activeReceiptId) {
      this.closeSourceDocumentDetail();
      return;
    }

    if (this.activeJournalEntryId) {
      this.closeJournalEntryDetail();
      return;
    }

    this.closeDrillDown();
  }

  onDrillDownJournalEntryCodeClick(row: JournalEntryLineListDisplay): void {
    if (!row?.journalEntryId) {
      return;
    }

    this.selectedJournalEntry = buildJournalEntryFromSearchLines(
      row.journalEntryId,
      this.allLines,
      this.organizationId
    );
    this.activeJournalEntryId = row.journalEntryId;
    this.selectedJournalEntryLineId = row.journalEntryLineId;
    this.emitDrillDownChildDetailActive();
    this.markViewForCheck();
  }

  onDrillDownSourceClick(row: JournalEntryLineListDisplay): void {
    if (!row?.sourceLinkable || !row.sourceTypeId || !(row.sourceId || '').trim()) {
      return;
    }

    this.journalEntrySourceService.resolveSource(row).pipe(take(1)).subscribe({
      next: target => {
        if (!target) {
          this.toastr.error('Unable to load the source document.', 'Error');
          return;
        }

        if (target.kind === 'invoice' && target.invoice?.invoiceId) {
          this.openDrillDownInvoice(
            target.invoice.invoiceId,
            target.invoice.officeId ?? row.officeId,
            target.invoice.reservationId ?? row.reservationId ?? null,
            target.invoice
          );
          return;
        }

        if (target.kind === 'receipt' && target.receipt?.receiptId) {
          this.openDrillDownReceiptDetail(
            target.receipt,
            row.propertyId ?? target.receipt.propertyIds?.[0] ?? null
          );
        }
      },
      error: () => this.toastr.error('Unable to load the source document.', 'Error')
    });
  }

  openDrillDownInvoice(invoiceId: string, officeId: number, reservationId: string | null, invoice: InvoiceResponse | null = null): void {
    this.selectedInvoice = invoice;
    this.activeInvoiceId = invoiceId;
    this.activeInvoiceOfficeId = officeId;
    this.activeInvoiceReservationId = reservationId;
    this.emitDrillDownChildDetailActive();
    this.markViewForCheck();
    this.scheduleShellTitleBarRefresh();
  }

  private scheduleShellTitleBarRefresh(attempt = 0): void {
    if (this.drillDownInvoiceEditor?.form || attempt >= 40) {
      this.shellTitleBarRefresh.emit();
      this.markViewForCheck();
      return;
    }

    setTimeout(() => this.scheduleShellTitleBarRefresh(attempt + 1), 50);
  }

  openDrillDownReceiptDetail(receipt: ReceiptResponse, propertyId: string | null): void {
    const resolvedOfficeId = receipt.officeId ?? null;
    const resolvedPropertyId = (propertyId || receipt.propertyIds?.[0] || '').trim() || null;

    const openDetail = (property: PropertyResponse | null) => {
      this.selectedReceipt = receipt;
      this.activeReceiptId = receipt.receiptId;
      this.drillDownReceiptOfficeId = resolvedOfficeId;
      this.drillDownReceiptProperty = property;
      this.emitDrillDownChildDetailActive();
      this.markViewForCheck();
    };

    if (resolvedPropertyId) {
      this.propertyService.getPropertyByGuid(resolvedPropertyId).pipe(take(1)).subscribe({
        next: property => openDetail(property),
        error: () => openDetail(this.buildDrillDownReceiptPropertyStub(resolvedOfficeId))
      });
      return;
    }

    openDetail(this.buildDrillDownReceiptPropertyStub(resolvedOfficeId));
  }

  closeSourceDocumentDetail(): void {
    if (!this.activeInvoiceId && !this.activeReceiptId) {
      return;
    }

    this.activeInvoiceId = null;
    this.activeInvoiceOfficeId = null;
    this.activeInvoiceReservationId = null;
    this.selectedInvoice = null;
    this.activeReceiptId = null;
    this.selectedReceipt = null;
    this.drillDownReceiptProperty = null;
    this.drillDownReceiptOfficeId = null;
    this.emitDrillDownChildDetailActive();
    this.shellTitleBarRefresh.emit();
    this.markViewForCheck();
  }

  onDrillDownReceiptSaved(): void {
    this.closeSourceDocumentDetail();
    this.loadJournalEntryLines();
    this.journalEntriesChanged.emit();
  }

  closeJournalEntryDetail(): void {
    if (!this.activeJournalEntryId) {
      return;
    }

    this.activeJournalEntryId = null;
    this.selectedJournalEntryLineId = null;
    this.selectedJournalEntry = null;
    this.emitDrillDownChildDetailActive();
    this.markViewForCheck();
  }

  onJournalEntrySaved(): void {
    this.closeJournalEntryDetail();
    this.loadJournalEntryLines();
    this.journalEntriesChanged.emit();
  }

  private emitDrillDownChildDetailActive(): void {
    const active = !!(this.activeJournalEntryId || this.activeInvoiceId || this.activeReceiptId);
    this.journalEntryDetailActiveChange.emit(active);
  }

  private buildDrillDownReceiptPropertyStub(officeId: number | null): PropertyResponse {
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

  exportDrillDownToExcel(): void {
    if (!this.drillDownView) {
      return;
    }

    const headers = [
      'No',
      'Date',
      'Entry No',
      'Source',
      'Property',
      'Reservation',
      'Contact',
      'Account',
      'Description',
      'Debit',
      'Credit',
      'Balance'
    ];
    const rows = this.drillDownView.lines.map((line, index) => [
      String(index + 1),
      line.transactionDate || '',
      line.journalEntryCode || '',
      line.source || '',
      line.propertyCode || '',
      line.reservationCode || '',
      line.contactName || '',
      line.account || '',
      line.description || '',
      line.debit || '',
      line.credit || '',
      line.balance || ''
    ]);

    const fileName = this.buildDrillDownExcelFileName();
    this.documentExportService.exportExcelTable(fileName, headers, rows);
  }

  private buildDrillDownExcelFileName(): string {
    const reportLabel = this.reportKind === 'balanceSheet' ? 'Balance-Sheet' : 'Profit-Loss';
    const title = (this.drillDownView?.title || 'Ledger')
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
    const dateStamp = this.utilityService.formatDateOnlyForApi(new Date()) || 'export';
    return `${reportLabel}-${title}-${dateStamp}.xlsx`;
  }

  get drillDownNoDataMessage(): string {
    if (!this.drillDownView) {
      return 'No general ledger lines found for this amount.';
    }

    return `${this.drillDownView.title} · ${this.drillDownView.subtitle} — no general ledger lines found.`;
  }

  get drillDownTableName(): string {
    return this.reportKind === 'balanceSheet'
      ? 'financial-report-balance-sheet-journal-entries'
      : 'financial-report-profit-loss-journal-entries';
  }

  private refreshDrillDownView(): void {
    if (!this.drillDownView || !this.reportResult?.drillDownContext) {
      return;
    }

    const filteredLines = this.mappingService.filterFinancialReportDrillDownLines(
      this.allLines,
      this.drillDownView.nodeId,
      this.drillDownView.columnId,
      this.reportResult.drillDownContext,
      this.reportResult.sections
    );
    const linesDisplay = this.mappingService.mapJournalEntryLineListDisplay(
      filteredLines,
      this.getChartOfAccountsForOfficeIds(this.resolveOfficeIds()),
      SourceTypeLabels
    );

    this.drillDownView = {
      ...this.drillDownView,
      lines: linesDisplay
    };
  }
  //#endregion

  //#region Report Display Methods
  applyReportDisplay(): void {
    try {
      const scopedAccounts = this.getChartOfAccountsForOfficeIds(this.resolveOfficeIds());
      this.reportResult = this.mappingService.buildFinancialReport({
        reportKind: this.reportKind,
        accounts: scopedAccounts,
        lines: this.allLines,
        startDate: this.reportKind === 'balanceSheet' ? null : (this.searchDateRange?.startDate ?? null),
        endDate: this.resolveReportEndDate(),
        chartOfAccountId: null,
        reportClass: this.mappingService.normalizeFinancialReportClass(this.reportClass)
      });
      this.initializeExpandedNodes(this.reportResult.sections);
      this.rebuildVisibleRows();
      this.refreshPrintableHtml();
    } catch (error) {
      console.error('Financial Report - error building report display:', error);
      this.isServiceError = true;
      this.reportResult = null;
      this.visibleRows = [];
      this.clearPrintableHtml();
      this.noActivityMessage = 'Unable to build the financial report display.';
    }
  }

  rebuildVisibleRows(): void {
    const rows: FinancialReportVisibleRow[] = [];
    (this.reportResult?.sections || []).forEach(section => this.appendVisibleRows(section, rows));
    for (let index = 0; index < rows.length - 1; index++) {
      const nextRow = rows[index + 1];
      rows[index].showDoubleUnderlineBeforeTotal = nextRow.rowKind === 'total' || nextRow.rowKind === 'summary';
    }
    this.visibleRows = rows;
  }

  appendVisibleRows(node: FinancialReportTreeNode, rows: FinancialReportVisibleRow[]): void {
    const expandable = node.childNodes.length > 0;
    const expanded = expandable && this.expandedNodeIds.has(node.nodeId);
    const hideParentAmounts = expandable && expanded;
    const showCollapsedSectionTotal = node.rowKind === 'section' && expandable && !expanded;
    rows.push({
      nodeId: node.nodeId,
      label: node.label,
      columnAmountDisplays: hideParentAmounts
        ? {}
        : showCollapsedSectionTotal
          ? this.formatColumnAmountDisplays(node.columnAmounts, 'account')
          : this.formatColumnAmountDisplays(node.columnAmounts, node.rowKind),
      depth: node.depth,
      rowKind: node.rowKind,
      expandable,
      expanded,
      showDoubleUnderlineBeforeTotal: false
    });

    if (!expandable || !expanded) {
      return;
    }

    node.childNodes.forEach(childNode => this.appendVisibleRows(childNode, rows));
  }

  formatColumnAmountDisplays(
    columnAmounts: Record<string, number>,
    rowKind: FinancialReportTreeNode['rowKind']
  ): Record<string, string> {
    if (rowKind === 'section') {
      return {};
    }

    const displays: Record<string, string> = {};
    Object.entries(columnAmounts || {}).forEach(([columnId, amount]) => {
      displays[columnId] = this.formatter.currencyUsd(amount);
    });
    return displays;
  }
  //#endregion

  //#region Get Methods
  getAmountColumnIds(): string[] {
    const columns = this.reportResult?.columns || [];
    if (!this.reportResult?.showTotalColumn) {
      return columns.map(column => column.columnId);
    }
    return [...columns.map(column => column.columnId), FINANCIAL_REPORT_TOTAL_COLUMN_ID];
  }

  getAmountColumns(): FinancialReportColumn[] {
    const columns = this.reportResult?.columns || [];
    if (!this.reportResult?.showTotalColumn) {
      return columns;
    }
    return [...columns, { columnId: FINANCIAL_REPORT_TOTAL_COLUMN_ID, label: 'Total' }];
  }

  get amountColumnCount(): number {
    return this.getAmountColumnIds().length;
  }

  get hasMultipleAmountColumns(): boolean {
    return this.amountColumnCount > 1;
  }

  isTotalColumn(columnId: string): boolean {
    return columnId === FINANCIAL_REPORT_TOTAL_COLUMN_ID;
  }

  /** Panel max-width grows with column count and caps at the viewport. */
  get panelMaxWidthCss(): string {
    const count = this.amountColumnCount;
    if (count <= 1) {
      return '48rem';
    }

    const labelWidthRem = 14;
    const amountColumnWidthRem = 10;
    const chromeRem = 3;
    const calculatedRem = labelWidthRem + (count * amountColumnWidthRem) + chromeRem;
    return `min(100%, ${Math.ceil(calculatedRem)}rem)`;
  }

  get displayOfficeName(): string {
    if (this.officeId != null && this.officeId > 0) {
      return (this.offices.find(office => office.officeId === this.officeId)?.name || '').trim();
    }
    if (this.offices.length === 1) {
      return (this.offices[0]?.name || '').trim();
    }
    if (this.offices.length > 1) {
      return 'All Offices';
    }
    return '';
  }

  get entityLineLabel(): string {
    return [this.companyName, this.displayOfficeName].filter(label => !!label).join(' ');
  }

  get shellReportTitle(): string {
    if (this.reportResult?.reportTitle) {
      return this.reportResult.reportTitle;
    }

    return this.reportKind === 'balanceSheet' ? 'Balance Sheet' : 'Profit & Loss';
  }

  get shellReportEntityLine(): string {
    return this.entityLineLabel;
  }

  get shellReportPeriodLine(): string {
    return this.reportResult?.periodLabel?.trim() || '';
  }

  get canUseReportDocuments(): boolean {
    return !!this.reportResult
      && this.visibleRows.length > 0
      && !!this.previewIframeHtml
      && this.resolveDocumentOfficeId() != null;
  }

  override onPrint(): void {
    super.onPrint(this.buildNoPreviewMessage());
  }

  override async onDownload(): Promise<void> {
    const downloadConfig: DownloadConfig = {
      fileName: this.buildReportFileName(),
      documentType: this.resolveReportDocumentType(),
      noPreviewMessage: this.buildNoPreviewMessage(),
      noSelectionMessage: 'Organization or office is not available.'
    };
    await super.onDownload(downloadConfig);
  }

  async saveReportDocument(): Promise<void> {
    if (!this.canUseReportDocuments) {
      this.toastr.warning(this.buildNoPreviewMessage(), 'No Preview');
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
        documentTypeId: Number(this.resolveReportDocumentType()),
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

  private buildNoPreviewMessage(): string {
    return this.reportKind === 'balanceSheet'
      ? 'No balance sheet is available to print.'
      : 'No profit and loss report is available to print.';
  }

  private buildReportFileName(): string {
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.displayOfficeName || 'Office');
    const reportSegment = this.reportKind === 'balanceSheet' ? 'BalanceSheet' : 'ProfitLoss';
    const dateStamp = this.utilityService.sanitizeFileNameSegment(
      this.reportKind === 'balanceSheet'
        ? (this.searchDateRange?.endDate || this.utilityService.todayAsCalendarDateString())
        : `${this.searchDateRange?.startDate || 'Start'}_${this.searchDateRange?.endDate || 'End'}`
    );
    return `${officeSegment}_${reportSegment}_${dateStamp}.pdf`;
  }

  private resolveReportDocumentType(): DocumentType {
    return this.reportKind === 'balanceSheet'
      ? DocumentType.BalanceSheet
      : DocumentType.ProfitLoss;
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
    if (!this.reportResult || this.visibleRows.length === 0) {
      this.clearPrintableHtml();
      return;
    }

    const printableDocument = this.mappingService.mapFinancialReportToPrintableDocument(
      this.reportResult,
      this.entityLineLabel
    );
    const preview = this.reportHtmlBuilder.buildPreviewContent(printableDocument);
    this.previewIframeHtml = preview.previewIframeHtml;
    this.previewIframeStyles = preview.previewIframeStyles;
  }

  private clearPrintableHtml(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
  }

  getChartOfAccountsForOfficeIds(officeIds: number[]): ChartOfAccountResponse[] {
    if (officeIds.length === 1) {
      return this.chartOfAccounts.filter(account => account.officeId === officeIds[0]);
    }

    const allAccounts = this.chartOfAccounts.length > 0
      ? this.chartOfAccounts
      : this.chartOfAccounts;
    return allAccounts.filter(account => officeIds.includes(account.officeId));
  }

  resolveReportEndDate(): string | null {
    if (this.reportKind === 'balanceSheet') {
      return this.searchDateRange?.endDate ?? this.utilityService.formatDateOnlyForApi(new Date());
    }

    return this.searchDateRange?.endDate ?? null;
  }

  resolveOfficeIds(): number[] {
    if (this.officeId != null && this.officeId > 0) {
      return [this.officeId];
    }
    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  hasSearchDateRangeChanged(change: SimpleChanges['searchDateRange']): boolean {
    const previous = change?.previousValue as { startDate: string | null; endDate: string | null } | null | undefined;
    const current = change?.currentValue as { startDate: string | null; endDate: string | null } | null | undefined;
    return (previous?.startDate ?? null) !== (current?.startDate ?? null)
      || (previous?.endDate ?? null) !== (current?.endDate ?? null);
  }
  //#endregion

  //#region Utility Methods
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
