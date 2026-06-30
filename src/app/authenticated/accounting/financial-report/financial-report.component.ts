import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, filter, finalize, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { DocumentExportService } from '../../../services/document-export.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
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
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from '../models/journal-entry.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { JournalEntrySourceService } from '../services/journal-entry-source.service';
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
export class FinancialReportComponent implements OnInit, OnDestroy, OnChanges {
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
  drillDownView: FinancialReportDrillDownView | null = null;
  activeJournalEntryId: string | null = null;
  selectedJournalEntryLineId: string | null = null;
  activeInvoiceId: string | null = null;
  activeInvoiceOfficeId: number | null = null;
  activeInvoiceReservationId: string | null = null;
  activeReceiptId: string | null = null;
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
    private authService: AuthService,
    private commonService: CommonService,
    private utilityService: UtilityService,
    private documentExportService: DocumentExportService,
    private journalEntrySourceService: JournalEntrySourceService,
    private propertyService: PropertyService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
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
    this.chartOfAccountsService.ensureChartOfAccountsLoaded();
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(
      filter(loaded => loaded === true),
      take(1),
      takeUntil(this.destroy$),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts'))
    ).subscribe({
      next: () => {
        this.chartOfAccountsService.getAllChartOfAccounts().pipe(take(1), takeUntil(this.destroy$)).subscribe(accounts => {
          this.chartOfAccounts = accounts || [];
          this.applyReportDisplay();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.chartOfAccounts = [];
        this.applyReportDisplay();
        this.markViewForCheck();
      }
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
            target.invoice.reservationId ?? row.reservationId ?? null
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

  openDrillDownInvoice(invoiceId: string, officeId: number, reservationId: string | null): void {
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
    this.activeReceiptId = null;
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
    } catch (error) {
      console.error('Financial Report - error building report display:', error);
      this.isServiceError = true;
      this.reportResult = null;
      this.visibleRows = [];
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

  getChartOfAccountsForOfficeIds(officeIds: number[]): ChartOfAccountResponse[] {
    if (officeIds.length === 1) {
      return this.chartOfAccountsService.getChartOfAccountsForOffice(officeIds[0]) || [];
    }

    const allAccounts = this.chartOfAccounts.length > 0
      ? this.chartOfAccounts
      : (this.chartOfAccountsService.getAllChartOfAccountsValue() || []);
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
