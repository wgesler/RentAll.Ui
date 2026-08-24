import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, finalize, firstValueFrom, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig } from '../../../shared/base-document.component';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { Class, getClass, SourceTypeLabels } from '../../models/accounting-enum';
import {
  AsOfReportDateRange,
  FINANCIAL_REPORT_TOTAL_COLUMN_ID,
  FinancialReportColumn,
  FinancialReportDrillDownView,
  FinancialReportKind,
  FinancialReportResult,
  FinancialReportTreeNode
} from '../../models/financial-report.model';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from '../../models/journal-entry.model';
import { InvoiceResponse } from '../../models/invoice.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { JournalEntrySourceService } from '../../services/journal-entry-source.service';
import { ReportHtmlBuilderService } from '../../services/report-html-builder.service';
import { GeneralLedgerComponent } from '../../general-ledger/general-ledger/general-ledger.component';
import { InvoiceComponent } from '../../invoices/invoice/invoice.component';
import { ReceiptComponent } from '../../../maintenance/receipt/receipt.component';
import { ReceiptResponse } from '../../../maintenance/models/receipt.model';
import { PropertyResponse } from '../../../properties/models/property.model';
import { PropertyService } from '../../../properties/services/property.service';

interface FinancialReportVisibleRow {
  nodeId: string;
  label: string;
  columnAmountDisplays: Record<string, string>;
  depth: number;
  rowKind: FinancialReportTreeNode['rowKind'];
  displayKind: 'node' | 'supportingLine';
  expandable: boolean;
  expanded: boolean;
  showDoubleUnderlineBeforeTotal: boolean;
  supportingLine?: JournalEntryLineListDisplay;
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
  @Input() asOfDateRange: AsOfReportDateRange | null = null;
  @Input() refreshTrigger = 0;
  @Output() drillDownActiveChange = new EventEmitter<boolean>();
  @Output() journalEntryDetailActiveChange = new EventEmitter<boolean>();
  @Output() journalEntriesChanged = new EventEmitter<void>();
  @Output() shellTitleBarRefresh = new EventEmitter<void>();
  formatter = inject(FormatterService);
  private generalLedgerService = inject(GeneralLedgerService);
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private commonService = inject(CommonService);
  private utilityService = inject(UtilityService);
  private journalEntrySourceService = inject(JournalEntrySourceService);
  private propertyService = inject(PropertyService);
  private reportHtmlBuilder = inject(ReportHtmlBuilderService);
  private documentReloadService = inject(DocumentReloadService);
  private cdr = inject(ChangeDetectorRef);
  override toastr: ToastrService;
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
  activeInvoiceId: string | null = null;
  activeInvoiceOfficeId: number | null = null;
  activeInvoiceReservationId: string | null = null;
  selectedInvoice: InvoiceResponse | null = null;
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
  expandedSupportingLineNodeIds = new Set<string>();
  nestedExpansionPhases = new Map<string, number>();
  isServiceError = false;
  noActivityMessage = 'No activity for the selected filters and date range.';
  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allLines: JournalEntryLineSearchResponse[] = [];

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['reportData']));
  destroy$ = new Subject<void>();
  private readonly reportDataLoadKey = 'reportData';

  //#region Financial-Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOrganization();
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadChartOfAccounts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const reportClassChanged = !!changes['reportClass']
      && !changes['reportClass'].firstChange;
    const searchDateRangeChanged = !!changes['searchDateRange']
      && !changes['searchDateRange'].firstChange
      && this.hasSearchDateRangeChanged(changes['searchDateRange']);
    const asOfDateRangeChanged = !!changes['asOfDateRange']
      && !changes['asOfDateRange'].firstChange
      && this.hasAsOfDateRangeChanged(changes['asOfDateRange']);

    if (reportClassChanged || searchDateRangeChanged || asOfDateRangeChanged) {
      this.applyReportDisplay();
    }

    const shouldReloadLines =
      (changes['officeId'] && !changes['officeId'].firstChange)
      || searchDateRangeChanged
      || asOfDateRangeChanged
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
      this.loadJournalEntryLines();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
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

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.accountingOffices = offices || [];
          this.applyReportDisplay();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.accountingOffices = [];
        this.applyReportDisplay();
        this.markViewForCheck();
      }
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyReportDisplay();
        this.markViewForCheck();
      });
    });
  }

  loadJournalEntryLines(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, this.reportDataLoadKey);

    const officeIds = this.resolveOfficeIds();
    if (officeIds.length === 0) {
      this.allLines = [];
      this.isServiceError = false;
      this.applyReportDisplay();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey);
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;

    const { startDate, endDate } = this.resolveJournalEntryLineSearchDates();

    this.generalLedgerService.searchJournalEntryLines({
      officeIds,
      chartOfAccountId: null,
      propertyId: null,
      reservationId: null,
      includeUnposted: true,
      showAll: this.reportKind !== 'balanceSheet',
      startDate,
      endDate
    }).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey))
    ).subscribe({
      next: lines => {
        this.allLines = lines || [];
        this.noActivityMessage = this.reportKind === 'balanceSheet'
          ? 'No balance sheet activity for the selected filters.'
          : 'No profit and loss activity for the selected filters and date range.';
        this.applyReportDisplay();
        this.refreshDrillDownView();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey);
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        const validationErrors = error.error?.errors;
        console.error('Financial Report - error loading journal entry lines:', error, validationErrors ?? error.error);
        this.isServiceError = true;
        this.allLines = [];
        this.reportResult = null;
        this.visibleRows = [];
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : this.formatApiValidationMessage(error.error) || error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load financial report data: ${apiMessage}`
          : 'Unable to load financial report data.';
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Expand All Methods
  isTotalOrSummaryRowKind(rowKind: FinancialReportTreeNode['rowKind']): boolean {
    return rowKind === 'total' || rowKind === 'summary';
  }

  isTotalOrSummaryTreeNode(node: FinancialReportTreeNode): boolean {
    return this.isTotalOrSummaryRowKind(node.rowKind);
  }

  isTotalOrSummaryVisibleRow(row: FinancialReportVisibleRow): boolean {
    return this.isTotalOrSummaryRowKind(row.rowKind);
  }

  usesNestedExpansionCycle(nodeId: string): boolean {
    const node = this.findFinancialReportNodeById(this.reportResult?.sections || [], nodeId);
    if (!node?.childNodes.length) {
      return false;
    }
    if (node.rowKind === 'section') {
      return true;
    }
    return node.childNodes.some(child => child.childNodes.length > 0);
  }

  toggleRowExpansion(row: FinancialReportVisibleRow): void {
    if (this.usesNestedExpansionCycle(row.nodeId)) {
      this.toggleNestedExpansion(row.nodeId);
      return;
    }
    this.toggleNodeExpansion(row.nodeId);
  }

  collectDescendantLeafDrillDownNodeIds(node: FinancialReportTreeNode): string[] {
    const nodeIds: string[] = [];
    const visit = (current: FinancialReportTreeNode) => {
      if (this.isTotalOrSummaryTreeNode(current)) {
        return;
      }
      if (current.childNodes.length === 0) {
        const hasAmount = Object.values(current.columnAmounts || {}).some(amount => Number(amount) !== 0);
        if (hasAmount) {
          nodeIds.push(current.nodeId);
        }
        return;
      }
      current.childNodes.forEach(visit);
    };
    node.childNodes.forEach(visit);
    return nodeIds;
  }

  collectDirectChildExpandableNodeIds(node: FinancialReportTreeNode): string[] {
    return (node.childNodes || [])
      .filter(child => child.childNodes.length > 0)
      .map(child => child.nodeId);
  }

  collectDirectChildLeafDrillDownNodeIds(node: FinancialReportTreeNode): string[] {
    return (node.childNodes || [])
      .filter(child => !this.isTotalOrSummaryTreeNode(child))
      .filter(child => child.childNodes.length === 0)
      .filter(child => Object.values(child.columnAmounts || {}).some(amount => Number(amount) !== 0))
      .map(child => child.nodeId);
  }

  clearNestedDescendantExpansion(_nodeId: string, descendantNodeIds: string[], supportingLineNodeIds: string[]): void {
    descendantNodeIds.forEach(descendantId => this.expandedNodeIds.delete(descendantId));
    supportingLineNodeIds.forEach(supportingNodeId => this.expandedSupportingLineNodeIds.delete(supportingNodeId));
  }

  toggleNestedExpansion(nodeId: string): void {
    const node = this.findFinancialReportNodeById(this.reportResult?.sections || [], nodeId);
    if (!node) {
      return;
    }

    const allDescendantNodeIds = this.collectDescendantNodeIds(nodeId);
    const allSupportingLineNodeIds = this.collectDescendantLeafDrillDownNodeIds(node);
    const directChildExpandableIds = this.collectDirectChildExpandableNodeIds(node);
    const directChildLeafSupportingIds = this.collectDirectChildLeafDrillDownNodeIds(node);
    const phase = this.nestedExpansionPhases.get(nodeId) ?? 0;

    switch (phase) {
      case 0:
        // 1. Open this row.
        this.expandedNodeIds.add(nodeId);
        this.clearNestedDescendantExpansion(nodeId, allDescendantNodeIds, allSupportingLineNodeIds);
        break;
      case 1:
        // 2. Open direct child rows and their leaf supporting lines.
        this.expandedNodeIds.add(nodeId);
        this.clearNestedDescendantExpansion(nodeId, allDescendantNodeIds, allSupportingLineNodeIds);
        directChildExpandableIds.forEach(descendantId => this.expandedNodeIds.add(descendantId));
        if (this.supportsInlineSupportingLineExpansion) {
          directChildLeafSupportingIds.forEach(supportingNodeId => this.expandedSupportingLineNodeIds.add(supportingNodeId));
        }
        break;
      case 2:
        // 3. Close child rows while this row stays open.
        this.expandedNodeIds.add(nodeId);
        this.clearNestedDescendantExpansion(nodeId, allDescendantNodeIds, allSupportingLineNodeIds);
        break;
      case 3:
        // 4. Close this row.
        this.expandedNodeIds.delete(nodeId);
        this.clearNestedDescendantExpansion(nodeId, allDescendantNodeIds, allSupportingLineNodeIds);
        break;
    }

    this.nestedExpansionPhases.set(nodeId, (phase + 1) % 4);
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  toggleNodeExpansion(nodeId: string): void {
    const descendantNodeIds = this.collectDescendantNodeIds(nodeId);
    if (this.expandedNodeIds.has(nodeId)) {
      this.expandedNodeIds.delete(nodeId);
      descendantNodeIds.forEach(descendantId => this.expandedNodeIds.delete(descendantId));
    } else {
      this.expandedNodeIds.add(nodeId);
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
    (this.reportResult?.sections || []).forEach(section => this.expandNodeFully(section));
    this.nestedExpansionPhases.clear();
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  expandNodeFully(node: FinancialReportTreeNode): void {
    if (node.childNodes.length > 0) {
      this.expandedNodeIds.add(node.nodeId);
      node.childNodes.forEach(childNode => this.expandNodeFully(childNode));
      return;
    }

    if (this.isTotalOrSummaryTreeNode(node)) {
      return;
    }

    const hasAmount = Object.values(node.columnAmounts || {}).some(amount => Number(amount) !== 0);
    if (hasAmount && this.supportsInlineSupportingLineExpansion) {
      this.expandedSupportingLineNodeIds.add(node.nodeId);
    }
  }

  collapseAllNodes(): void {
    this.expandedNodeIds.clear();
    this.expandedSupportingLineNodeIds.clear();
    this.nestedExpansionPhases.clear();
    this.rebuildVisibleRows();
    this.markViewForCheck();
  }

  initializeExpandedNodes(sections: FinancialReportTreeNode[]): void {
    this.expandedNodeIds = new Set();
    this.expandedSupportingLineNodeIds.clear();
    this.nestedExpansionPhases.clear();
    if (this.reportKind === 'balanceSheet') {
      (sections || []).forEach(section => this.expandSectionNodes(section));
      return;
    }

    (sections || []).forEach(section => {
      if (section.childNodes.length > 0) {
        this.expandedNodeIds.add(section.nodeId);
      }
    });
  }

  expandSectionNodes(node: FinancialReportTreeNode): void {
    if (node.rowKind === 'section' && node.childNodes.length > 0) {
      this.expandedNodeIds.add(node.nodeId);
    }
    (node.childNodes || []).forEach(childNode => this.expandSectionNodes(childNode));
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
  get supportsInlineSupportingLineExpansion(): boolean {
    return false;
  }

  getRowTreeNode(row: FinancialReportVisibleRow): FinancialReportTreeNode | null {
    return this.findFinancialReportNodeById(this.reportResult?.sections || [], row.nodeId);
  }

  getRowColumnAmount(row: FinancialReportVisibleRow, columnId: string): number {
    const node = this.getRowTreeNode(row);
    return Number(node?.columnAmounts?.[columnId]) || 0;
  }

  canDrillDownAmount(row: FinancialReportVisibleRow, columnId: string): boolean {
    return row.displayKind === 'node'
      && !this.isTotalOrSummaryVisibleRow(row)
      && this.getRowColumnAmount(row, columnId) !== 0
      && !!row.columnAmountDisplays[columnId]?.trim();
  }

  getDrillDownColumnId(row: FinancialReportVisibleRow): string | null {
    for (const columnId of this.getAmountColumnIds()) {
      if (this.canDrillDownAmount(row, columnId)) {
        return columnId;
      }
    }
    return null;
  }

  isDrillDownExpander(row: FinancialReportVisibleRow): boolean {
    if (!this.supportsInlineSupportingLineExpansion) {
      return false;
    }

    return row.displayKind === 'node'
      && !this.isTotalOrSummaryVisibleRow(row)
      && !row.expandable
      && this.getDrillDownColumnId(row) != null;
  }

  isSupportingLinesExpanded(nodeId: string): boolean {
    return this.expandedSupportingLineNodeIds.has(nodeId);
  }

  getDrillDownExpanderIcon(row: FinancialReportVisibleRow): string {
    return this.isSupportingLinesExpanded(row.nodeId) ? 'expand_less' : 'chevron_right';
  }

  toggleSupportingLinesExpansion(nodeId: string): void {
    if (this.expandedSupportingLineNodeIds.has(nodeId)) {
      this.expandedSupportingLineNodeIds.delete(nodeId);
    } else {
      this.expandedSupportingLineNodeIds.add(nodeId);
    }
    this.rebuildVisibleRows();
    this.markViewForCheck();
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

scheduleShellTitleBarRefresh(attempt = 0): void {
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
    this.selectedInvoice = null;
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

emitDrillDownChildDetailActive(): void {
    const active = !!(this.activeJournalEntryId || this.activeInvoiceId || this.activeReceiptId);
    this.journalEntryDetailActiveChange.emit(active);
  }

buildDrillDownReceiptPropertyStub(officeId: number | null): PropertyResponse {
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

buildDrillDownExcelFileName(): string {
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

refreshDrillDownView(): void {
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
      const { yearEndMonth, yearEndDay } = this.resolveAccountingYearEnd();
      this.reportResult = this.mappingService.buildFinancialReport({
        reportKind: this.reportKind,
        accounts: scopedAccounts,
        lines: this.allLines,
        startDate: this.resolveReportStartDate(),
        endDate: this.resolveReportEndDate(),
        chartOfAccountId: null,
        reportClass: this.mappingService.normalizeFinancialReportClass(this.reportClass),
        yearEndMonth,
        yearEndDay
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
    } finally {
      this.markViewForCheck();
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
      displayKind: 'node',
      expandable,
      expanded,
      showDoubleUnderlineBeforeTotal: false
    });

    this.appendSupportingLineRows(node, rows);

    if (!expandable || !expanded) {
      return;
    }

    node.childNodes.forEach(childNode => this.appendVisibleRows(childNode, rows));
  }

  appendSupportingLineRows(node: FinancialReportTreeNode, rows: FinancialReportVisibleRow[]): void {
    if (!this.supportsInlineSupportingLineExpansion) {
      return;
    }

    if (this.isTotalOrSummaryTreeNode(node) || node.childNodes.length > 0 || !this.expandedSupportingLineNodeIds.has(node.nodeId)) {
      return;
    }

    const columnId = this.resolvePrimaryDrillDownColumnId(node);
    if (!columnId || !this.reportResult?.drillDownContext) {
      return;
    }

    const filteredLines = this.mappingService.filterFinancialReportDrillDownLines(
      this.allLines,
      node.nodeId,
      columnId,
      this.reportResult.drillDownContext,
      this.reportResult.sections
    );
    const chartOfAccounts = this.getChartOfAccountsForOfficeIds(this.resolveOfficeIds());
    const linesDisplay = this.mappingService.mapJournalEntryLineListDisplay(
      filteredLines,
      chartOfAccounts,
      SourceTypeLabels
    );
    const lineById = new Map(filteredLines.map(line => [line.journalEntryLineId, line]));

    linesDisplay.forEach(line => {
      const sourceLine = lineById.get(line.journalEntryLineId);
      rows.push({
        nodeId: `${node.nodeId}::supporting::${line.journalEntryLineId}`,
        label: this.formatSupportingLineLabel(line),
        columnAmountDisplays: sourceLine
          ? this.formatSupportingLineAmountDisplays(sourceLine, line, chartOfAccounts)
          : {},
        depth: node.depth + 1,
        rowKind: 'account',
        displayKind: 'supportingLine',
        expandable: false,
        expanded: false,
        showDoubleUnderlineBeforeTotal: false,
        supportingLine: line
      });
    });
  }

  resolvePrimaryDrillDownColumnId(node: FinancialReportTreeNode): string | null {
    for (const columnId of this.getAmountColumnIds()) {
      const amount = Number(node.columnAmounts?.[columnId]) || 0;
      if (amount !== 0) {
        return columnId;
      }
    }
    return null;
  }

  formatSupportingLineLabel(line: JournalEntryLineListDisplay): string {
    return (line.description || line.journalEntryMemo || '').trim();
  }

  formatSupportingLineAmountDisplays(
    sourceLine: JournalEntryLineSearchResponse,
    line: JournalEntryLineListDisplay,
    chartOfAccounts: ChartOfAccountResponse[]
  ): Record<string, string> {
    if (!this.reportResult?.drillDownContext) {
      return {};
    }

    const accountTypeId = chartOfAccounts.find(account => account.accountId === sourceLine.chartOfAccountId)?.accountTypeId;
    const signedAmount = accountTypeId === undefined
      ? (line.debitValue || 0) - (line.creditValue || 0)
      : this.mappingService.signedFinancialReportAmount(accountTypeId, line.debitValue, line.creditValue);
    const displays: Record<string, string> = {};
    const columnContext = this.reportResult.drillDownContext.columnContext;

    this.getAmountColumnIds().forEach(columnId => {
      if (columnId === FINANCIAL_REPORT_TOTAL_COLUMN_ID) {
        displays[columnId] = this.formatter.currencyUsd(signedAmount);
        return;
      }

      const resolvedColumnId = this.mappingService.resolveFinancialReportLineColumnId(
        sourceLine,
        columnContext,
        chartOfAccounts
      );
      displays[columnId] = resolvedColumnId === columnId ? this.formatter.currencyUsd(signedAmount) : '';
    });
    return displays;
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

  get panelMaxWidthCss(): string {
    return this.hasMultipleAmountColumns ? '100%' : '48rem';
  }

  /** Months and other wide period sets fill the page; quarters stay content-width. */
  get fillsAvailableWidth(): boolean {
    return this.amountColumnCount > 4;
  }

  get reportTableMinWidth(): string {
    const labelMinRem = 22;
    const amountMinRem = 10;
    const minRem = Math.max(48, labelMinRem + this.amountColumnCount * amountMinRem);
    return `${minRem}rem`;
  }

  get frameMinWidth(): string | null {
    if (this.fillsAvailableWidth || !this.hasMultipleAmountColumns) {
      return null;
    }
    return this.reportTableMinWidth;
  }

  isTotalColumn(columnId: string): boolean {
    return columnId === FINANCIAL_REPORT_TOTAL_COLUMN_ID;
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
    return true;
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

  exportReportToExcel(): void {
    if (!this.canUseReportDocuments || !this.reportResult) {
      this.toastr.warning(this.buildNoPreviewMessage(), 'No Preview');
      return;
    }

    const printableDocument = this.mappingService.mapFinancialReportToPrintableDocument(
      this.reportResult,
      this.entityLineLabel
    );
    this.documentExportService.exportExcelTableDocument(printableDocument, this.buildReportFileName());
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

buildNoPreviewMessage(): string {
    return this.reportKind === 'balanceSheet'
      ? 'No balance sheet is available to print.'
      : 'No profit and loss report is available to print.';
  }

buildReportFileName(): string {
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.displayOfficeName || 'Office');
    if (this.reportKind === 'balanceSheet') {
      const classSegment = this.utilityService.sanitizeFileNameSegment(
        getClass(this.reportClass) || 'TotalOnly'
      );
      const dateStamp = this.utilityService.sanitizeFileNameSegment(
        this.asOfDateRange?.asOfDate || this.utilityService.todayAsCalendarDateString()
      );
      return `${officeSegment}_BalanceSheetBy${classSegment}_${dateStamp}.pdf`;
    }

    const classSegment = this.utilityService.sanitizeFileNameSegment(
      getClass(this.reportClass) || 'TotalOnly'
    );
    const startDate = this.utilityService.sanitizeFileNameSegment(
      this.searchDateRange?.startDate || 'Start'
    );
    const endDate = this.utilityService.sanitizeFileNameSegment(
      this.searchDateRange?.endDate || 'End'
    );
    return `${officeSegment}_ProfitLoss_${classSegment}_${startDate}_${endDate}.pdf`;
  }

resolveReportDocumentType(): DocumentType {
    return this.reportKind === 'balanceSheet'
      ? DocumentType.BalanceSheet
      : DocumentType.ProfitLoss;
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

clearPrintableHtml(): void {
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

  resolveReportStartDate(): string | null {
    if (this.reportKind === 'balanceSheet') {
      return null;
    }

    return this.searchDateRange?.startDate ?? null;
  }

  resolveReportEndDate(): string | null {
    if (this.reportKind === 'balanceSheet') {
      return this.asOfDateRange?.asOfDate ?? this.utilityService.formatDateOnlyForApi(new Date());
    }

    return this.searchDateRange?.endDate ?? null;
  }

  resolveJournalEntryLineSearchDates(): { startDate: string | null; endDate: string | null } {
    if (this.reportKind === 'balanceSheet') {
      return {
        startDate: null,
        endDate: this.asOfDateRange?.asOfDate ?? null
      };
    }

    return {
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    };
  }

  resolveOfficeIds(): number[] {
    if (this.officeId != null && Number(this.officeId) > 0) {
      return [Number(this.officeId)];
    }
    return (this.offices || [])
      .map(office => Number(office.officeId))
      .filter(id => Number.isFinite(id) && id > 0);
  }

  resolveAccountingYearEnd(): { yearEndMonth: number; yearEndDay: number } {
    const officeIds = this.resolveOfficeIds();
    const accountingOffice = officeIds.length === 1
      ? (this.accountingOffices || []).find(office => Number(office.officeId) === officeIds[0])
      : null;
    return {
      yearEndMonth: accountingOffice?.yearEndMonth ?? 12,
      yearEndDay: accountingOffice?.yearEndDay ?? 31
    };
  }

  hasSearchDateRangeChanged(change: SimpleChanges['searchDateRange']): boolean {
    const previous = change?.previousValue as { startDate: string | null; endDate: string | null } | null | undefined;
    const current = change?.currentValue as { startDate: string | null; endDate: string | null } | null | undefined;
    return (previous?.startDate ?? null) !== (current?.startDate ?? null)
      || (previous?.endDate ?? null) !== (current?.endDate ?? null);
  }

  hasAsOfDateRangeChanged(change: SimpleChanges['asOfDateRange']): boolean {
    const previous = change?.previousValue as AsOfReportDateRange | null | undefined;
    const current = change?.currentValue as AsOfReportDateRange | null | undefined;
    if (this.reportKind === 'balanceSheet') {
      return (previous?.asOfDate ?? null) !== (current?.asOfDate ?? null);
    }

    return (previous?.asOfStart ?? null) !== (current?.asOfStart ?? null)
      || (previous?.asOfDate ?? null) !== (current?.asOfDate ?? null);
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  private formatApiValidationMessage(errorBody: unknown): string | null {
    if (!errorBody || typeof errorBody !== 'object') {
      return null;
    }

    const errors = (errorBody as { errors?: Record<string, string[] | string> }).errors;
    if (!errors) {
      return null;
    }

    const messages = Object.entries(errors).flatMap(([field, value]) => {
      const items = Array.isArray(value) ? value : [value];
      return items.filter(Boolean).map(message => `${field}: ${message}`);
    });

    return messages.length > 0 ? messages.join('; ') : null;
  }

  ngOnDestroy(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, this.reportDataLoadKey);
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
