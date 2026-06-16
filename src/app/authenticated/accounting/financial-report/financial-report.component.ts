import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, filter, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { Class } from '../models/accounting-enum';
import {
  FINANCIAL_REPORT_TOTAL_COLUMN_ID,
  FinancialReportColumn,
  FinancialReportKind,
  FinancialReportResult,
  FinancialReportTreeNode
} from '../models/financial-report.model';
import { JournalEntryLineSearchResponse } from '../models/journal-entry.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../services/general-ledger.service';

interface FinancialReportVisibleRow {
  nodeId: string;
  label: string;
  amount: number;
  amountDisplay: string;
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
  imports: [CommonModule, MaterialModule],
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

  reportResult: FinancialReportResult | null = null;
  visibleRows: FinancialReportVisibleRow[] = [];
  expandedNodeIds = new Set<string>();
  isServiceError = false;
  noActivityMessage = 'No activity for the selected filters and date range.';
  companyName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allLines: JournalEntryLineSearchResponse[] = [];

  isPageReady = false;
  isLoadingLines = false;
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

  toggleNodeExpansion(nodeId: string): void {
    if (this.expandedNodeIds.has(nodeId)) {
      this.expandedNodeIds.delete(nodeId);
    } else {
      this.expandedNodeIds.add(nodeId);
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
  //#endregion

  //#region Data Loading Methods
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
      this.isLoadingLines = false;
      this.applyReportDisplay();
      this.markViewForCheck();
      return;
    }

    this.isLoadingLines = true;
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
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoadingLines = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: lines => {
        this.allLines = lines || [];
        this.noActivityMessage = this.reportKind === 'balanceSheet'
          ? 'No balance sheet activity for the selected filters.'
          : 'No profit and loss activity for the selected filters and date range.';
        this.applyReportDisplay();
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

  //#region Utility Methods
  applyReportDisplay(): void {
    try {
      const scopedAccounts = this.getChartOfAccountsForOfficeIds(this.resolveOfficeIds());
      this.reportResult = this.mappingService.buildFinancialReport({
        reportKind: this.reportKind,
        accounts: scopedAccounts,
        lines: this.allLines,
        startDate: this.searchDateRange?.startDate ?? null,
        endDate: this.searchDateRange?.endDate ?? null,
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

  initializeExpandedNodes(sections: FinancialReportTreeNode[]): void {
    this.expandedNodeIds = new Set(this.collectExpandableNodeIds(sections));
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
    rows.push({
      nodeId: node.nodeId,
      label: node.label,
      amount: node.amount,
      amountDisplay: this.formatAmountDisplay(node.amount, node.rowKind),
      columnAmountDisplays: this.formatColumnAmountDisplays(node.columnAmounts, node.rowKind),
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

  formatAmountDisplay(amount: number, rowKind: FinancialReportTreeNode['rowKind']): string {
    if (rowKind === 'section') {
      return '';
    }
    return this.formatter.currencyUsd(amount);
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

  get amountColumnHeaderLabel(): string {
    if (this.reportResult?.columns?.length === 1 && !this.reportResult.showTotalColumn) {
      return this.reportResult.columns[0].label;
    }
    return this.mappingService.buildFinancialReportColumnHeaderLabel(
      this.searchDateRange?.startDate ?? null,
      this.searchDateRange?.endDate ?? null,
      this.reportKind === 'balanceSheet'
    );
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

  resolveOfficeIds(): number[] {
    if (this.officeId != null && this.officeId > 0) {
      return [this.officeId];
    }
    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
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

  get hasVisibleRows(): boolean {
    return this.visibleRows.some(row => row.rowKind !== 'section' || row.expandable || row.amount !== 0);
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

  get isAllExpanded(): boolean {
    const expandableNodeIds = this.collectExpandableNodeIds(this.reportResult?.sections || []);
    return expandableNodeIds.length > 0 && expandableNodeIds.every(nodeId => this.expandedNodeIds.has(nodeId));
  }

  hasSearchDateRangeChanged(change: SimpleChanges['searchDateRange']): boolean {
    const previous = change?.previousValue as { startDate: string | null; endDate: string | null } | null | undefined;
    const current = change?.currentValue as { startDate: string | null; endDate: string | null } | null | undefined;
    return (previous?.startDate ?? null) !== (current?.startDate ?? null)
      || (previous?.endDate ?? null) !== (current?.endDate ?? null);
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
