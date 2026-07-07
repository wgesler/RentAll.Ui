import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { BehaviorSubject, finalize, map, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { OwnerReportActivityLinkSelection, OwnerReportAmountDrillDownSelection, OwnerReportDescriptionSegment, OwnerReportDrillDownMetric, OwnerReportKind, OwnerReportListViewState, OwnerReportOfficeGroup, OwnerReportPropertyActivityLineDisplay, OwnerReportPropertyActivityLineResponse, OwnerReportResponse, OwnerReportSearchResponse, OwnerReportVisibleRow } from '../models/owner-report.model';
import { OwnerReportService } from '../services/owner-report.service';
import { ReportService } from '../services/report.service';

@Component({
  selector: 'app-owner-report',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './owner-report.component.html',
  styleUrl: './owner-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerReportComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('ownerReportTableWrap') ownerReportTableWrap?: ElementRef<HTMLElement>;
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Input() reportKind: OwnerReportKind = 'accrual';
  @Input() viewState: OwnerReportListViewState | null = null;
  @Output() activityLinkSelect = new EventEmitter<OwnerReportActivityLinkSelection>();
  @Output() amountDrillDownSelect = new EventEmitter<OwnerReportAmountDrillDownSelection>();
  @Output() viewStateChange = new EventEmitter<OwnerReportListViewState>();

  isPageReady = false;
  isServiceError = false;
  companyName = '';
  ownerReports: OwnerReportResponse[] = [];
  ownerReportOfficeGroups: OwnerReportOfficeGroup[] = [];
  visibleRows: OwnerReportVisibleRow[] = [];
  expandedRowIds = new Set<string>();
  officeReadyToCloseRowIds = new Set<string>();
  noActivityPropertyRowIds = new Set<string>();
  propertyActivityLinesByPropertyRowId = new Map<string, OwnerReportPropertyActivityLineDisplay[]>();
  private propertyActivityLinesRaw: OwnerReportPropertyActivityLineResponse[] = [];
  ownerReportFixedHeightPx = 0;
  dimensionsUpdateScheduled = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerReports']));
  destroy$ = new Subject<void>();

  constructor(
    private ownerReportService: OwnerReportService,
    private reportService: ReportService,
    private commonService: CommonService,
    private formatter: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Owner Report List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOrganization();
    this.loadOwnerReports();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchRequest'] && !changes['searchRequest'].firstChange) {
      this.loadOwnerReports();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadOwnerReports();
    }

    if (changes['reportKind'] && !changes['reportKind'].firstChange) {
      this.loadOwnerReports();
      return;
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
      this.markViewForCheck();
    });
  }

  loadOwnerReports(): void {
    const request = this.mappingService.mapOwnerReportSearchRequest(this.searchRequest);
    if (request.officeIds.length === 0) {
      this.ownerReports = [];
      this.ownerReportOfficeGroups = [];
      this.visibleRows = [];
      this.expandedRowIds.clear();
      this.officeReadyToCloseRowIds.clear();
      this.noActivityPropertyRowIds.clear();
      this.clearPropertyActivityState();
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerReports');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerReports');
    const search$ = this.reportKind === 'cash'
      ? this.reportService.searchOwnerCashReport(request).pipe(
          map(report => this.mappingService.mapOwnerCashReportToOwnerReportSearchResponse(report))
        )
      : this.ownerReportService.searchOwnerReports(request);

    search$.pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerReports'))).subscribe({
      next: response => {
        this.ownerReports = response?.summaries || [];
        this.ownerReportOfficeGroups = this.mappingService.mapOwnerReportOfficeGroups(this.ownerReports);
        this.applyPropertyActivityLines(response?.propertyActivityLines || []);
        this.restoreViewState(this.ownerReportOfficeGroups, this.viewState);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.ownerReports = [];
        this.ownerReportOfficeGroups = [];
        this.visibleRows = [];
        this.expandedRowIds.clear();
        this.officeReadyToCloseRowIds.clear();
        this.noActivityPropertyRowIds.clear();
        this.clearPropertyActivityState();
        this.emitViewStateChange();
        this.markViewForCheck();
      }
    });
  }

  applyPropertyActivityLines(lines: OwnerReportPropertyActivityLineResponse[]): void {
    this.propertyActivityLinesRaw = lines || [];
    this.propertyActivityLinesByPropertyRowId = this.mappingService.mapOwnerReportPropertyActivityByPropertyRowId(this.propertyActivityLinesRaw, this.reportKind);
    this.noActivityPropertyRowIds.clear();
    (this.ownerReportOfficeGroups || []).forEach(office => {
      (office.properties || []).forEach(property => {
        if (!property.propertyId) {
          return;
        }
        const propertyRowId = `property:${office.officeId}:${property.propertyId || property.propertyCode}`;
        if (!this.propertyActivityLinesByPropertyRowId.has(propertyRowId)) {
          this.noActivityPropertyRowIds.add(propertyRowId);
        }
      });
    });
  }

  //#endregion

  //#region Build Form 
  initializeExpandedRows(officeGroups: OwnerReportOfficeGroup[]): void {
    this.expandedRowIds.clear();
    (officeGroups || []).forEach(office => this.expandedRowIds.add(office.rowId));
  }

  rebuildVisibleRows(): void {
    const rows: OwnerReportVisibleRow[] = [];
    (this.ownerReportOfficeGroups || []).forEach(office => {
      const officeExpanded = this.expandedRowIds.has(office.rowId);
      rows.push({
        rowId: office.rowId,
        kind: 'office',
        depth: 0,
        officeId: office.officeId,
        primaryLabel: office.officeName,
        propertyCode: '',
        itemDescription: '',
        activityCode: '',
        expected: this.formatter.currencyUsd(office.expected),
        expectedValue: office.expected,
        prePaid: this.formatter.currencyUsd(office.prePaid),
        prePaidValue: office.prePaid,
        paidIncome: this.formatter.currencyUsd(office.paidIncome),
        paidIncomeValue: office.paidIncome,
        outstanding: this.formatter.currencyUsd(office.outstanding),
        outstandingValue: office.outstanding,
        income: this.formatter.currencyUsd(office.income),
        incomeValue: office.income,
        expenses: this.formatter.currencyUsd(office.expenses),
        expensesValue: office.expenses,
        balance: this.formatter.currencyUsd(office.balance),
        balanceValue: office.balance,
        startingBalance: this.formatter.currencyUsd(office.startingBalance),
        startingBalanceValue: office.startingBalance,
        workingCapital: this.formatter.currencyUsd(office.workingCapital),
        workingCapitalValue: office.workingCapital,
        workingCapitalBalanceDue: this.formatter.currencyUsd(office.workingCapitalBalanceDue),
        workingCapitalBalanceDueValue: office.workingCapitalBalanceDue,
        ownerPayment: this.formatter.currencyUsd(office.ownerPayment),
        ownerPaymentValue: office.ownerPayment,
        endingBalance: this.formatter.currencyUsd(office.endingBalance),
        endingBalanceValue: office.endingBalance,
        expandable: office.properties.length > 0,
        expanded: officeExpanded
      });

      if (!officeExpanded) {
        return;
      }

      office.properties.forEach(property => {
        const propertyRowId = `property:${office.officeId}:${property.propertyId || property.propertyCode}`;
        const propertyExpanded = this.expandedRowIds.has(propertyRowId);
        rows.push({
          rowId: propertyRowId,
          kind: 'property',
          depth: 1,
          ownerId: property.ownerId,
          officeId: office.officeId,
          propertyId: property.propertyId,
          primaryLabel: property.propertyCode || 'Property',
          propertyCode: property.propertyCode || '',
          itemDescription: property.ownerName || '',
          activityCode: '',
          expected: this.formatter.currencyUsd(property.expected),
          expectedValue: property.expected,
          prePaid: this.formatter.currencyUsd(property.prePaid),
          prePaidValue: property.prePaid,
          paidIncome: this.formatter.currencyUsd(property.paidIncome),
          paidIncomeValue: property.paidIncome,
          outstanding: this.formatter.currencyUsd(property.outstanding),
          outstandingValue: property.outstanding,
          income: this.formatter.currencyUsd(property.income),
          incomeValue: property.income,
          expenses: this.formatter.currencyUsd(property.expenses),
          expensesValue: property.expenses,
          balance: this.formatter.currencyUsd(property.balance),
          balanceValue: property.balance,
          startingBalance: this.formatter.currencyUsd(property.startingBalance),
          startingBalanceValue: property.startingBalance,
          workingCapital: this.formatter.currencyUsd(property.workingCapital),
          workingCapitalValue: property.workingCapital,
          workingCapitalBalanceDue: this.formatter.currencyUsd(property.workingCapitalBalanceDue),
          workingCapitalBalanceDueValue: property.workingCapitalBalanceDue,
          ownerPayment: this.formatter.currencyUsd(property.ownerPayment),
          ownerPaymentValue: property.ownerPayment,
          endingBalance: this.formatter.currencyUsd(property.endingBalance),
          endingBalanceValue: property.endingBalance,
          expandable: !!property.propertyId && !this.noActivityPropertyRowIds.has(propertyRowId),
          expanded: propertyExpanded
        });

        if (!propertyExpanded) {
          return;
        }

        const activityRows = this.propertyActivityLinesByPropertyRowId.get(propertyRowId) || [];
        if (activityRows.length === 0) {
          return;
        }

        activityRows.forEach(activity => {
          rows.push({
            rowId: activity.rowId,
            kind: 'propertyActivity',
            depth: 2,
            officeId: office.officeId,
            propertyId: property.propertyId,
            primaryLabel: activity.activityDate,
            propertyCode: property.propertyCode || '',
            itemDescription: activity.description,
            activityCode: activity.documentCode,
            expected: activity.expectedIncome,
            expectedValue: Number(activity.expectedIncome) || 0,
            prePaid: '',
            prePaidValue: 0,
            paidIncome: '',
            paidIncomeValue: 0,
            outstanding: '',
            outstandingValue: 0,
            income: activity.receivedIncome,
            incomeValue: Number(activity.receivedIncome) || 0,
            expenses: activity.expenses,
            expensesValue: Number(activity.expenses) || 0,
            balance: '',
            balanceValue: 0,
            startingBalance: '',
            startingBalanceValue: 0,
            workingCapital: '',
            workingCapitalValue: 0,
            workingCapitalBalanceDue: '',
            workingCapitalBalanceDueValue: 0,
            ownerPayment: activity.ownerPayment || '',
            ownerPaymentValue: Number(activity.ownerPayment) || 0,
            endingBalance: '',
            endingBalanceValue: 0,
            expandable: false,
            expanded: false
          });
        });
      });
    });

    this.visibleRows = rows;
  }

  //#endregion

  //#region Form Response Methods
  toggleRowExpansion(row: OwnerReportVisibleRow): void {
    if (!row.expandable) {
      return;
    }

    if (row.kind === 'property') {
      if (this.expandedRowIds.has(row.rowId)) {
        this.expandedRowIds.delete(row.rowId);
      } else {
        this.expandedRowIds.add(row.rowId);
      }
      this.rebuildVisibleRows();
      this.emitViewStateChange();
      this.markViewForCheck();
      return;
    }

    if (row.kind === 'office') {
      const propertyRows = this.getPropertyRowsForOffice(row.rowId);
      const propertyRowIds = propertyRows.map(property => property.rowId);
      const isOfficeExpanded = this.expandedRowIds.has(row.rowId);
      const hasExpandedSubordinates = propertyRowIds.some(propertyRowId => this.expandedRowIds.has(propertyRowId));
      const isReadyToCloseOffice = this.officeReadyToCloseRowIds.has(row.rowId);

      if (!isOfficeExpanded) {
        this.expandedRowIds.add(row.rowId);
        this.officeReadyToCloseRowIds.delete(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      if (isReadyToCloseOffice && !hasExpandedSubordinates) {
        this.expandedRowIds.delete(row.rowId);
        this.officeReadyToCloseRowIds.delete(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      if (hasExpandedSubordinates) {
        propertyRowIds.forEach(propertyRowId => this.expandedRowIds.delete(propertyRowId));
        this.officeReadyToCloseRowIds.add(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      propertyRowIds.forEach(propertyRowId => this.expandedRowIds.add(propertyRowId));
      this.officeReadyToCloseRowIds.delete(row.rowId);
      this.rebuildVisibleRows();
      this.emitViewStateChange();
      this.markViewForCheck();
      return;
    }

    if (this.expandedRowIds.has(row.rowId)) {
      this.expandedRowIds.delete(row.rowId);
    } else {
      this.expandedRowIds.add(row.rowId);
    }
    this.rebuildVisibleRows();
    this.emitViewStateChange();
    this.markViewForCheck();
  }

  toggleAllOfficeRows(): void {
    const officeRowIds = (this.ownerReportOfficeGroups || []).map(group => group.rowId);
    if (officeRowIds.length === 0) {
      return;
    }

    if (this.areAllOfficeRowsExpanded) {
      officeRowIds.forEach(rowId => this.expandedRowIds.delete(rowId));
      officeRowIds.forEach(rowId => this.officeReadyToCloseRowIds.delete(rowId));
    } else {
      officeRowIds.forEach(rowId => this.expandedRowIds.add(rowId));
      officeRowIds.forEach(rowId => this.officeReadyToCloseRowIds.delete(rowId));
    }

    this.rebuildVisibleRows();
    this.emitViewStateChange();
    this.markViewForCheck();
  }

  onAmountCellClick(row: OwnerReportVisibleRow, metric: OwnerReportDrillDownMetric): void {
    if (!this.canDrillDownAmount(row, metric)) {
      return;
    }

    this.amountDrillDownSelect.emit({
      officeIds: [row.officeId!],
      ownerId: row.ownerId!,
      propertyId: row.kind === 'property' ? row.propertyId ?? null : null,
      metric
    });
  }

  canDrillDownAmount(row: OwnerReportVisibleRow, metric: OwnerReportDrillDownMetric): boolean {
    if (row.kind !== 'property') {
      return false;
    }
    if (!row.officeId || !row.ownerId) {
      return false;
    }
    if (metric === 'outstanding') {
      return row.outstandingValue > 0;
    }
    if (metric === 'balance') {
      return row.incomeValue !== 0 || row.expensesValue !== 0;
    }
    if (metric === 'expected') {
      return row.expectedValue !== 0;
    }
    if (metric === 'prePaid') {
      return row.prePaidValue !== 0;
    }
    if (metric === 'paidIncome') {
      return row.paidIncomeValue !== 0;
    }
    if (metric === 'income') {
      return row.incomeValue !== 0;
    }
    return row.expensesValue !== 0;
  }

  clearPropertyActivityState(): void {
    this.propertyActivityLinesByPropertyRowId.clear();
    this.propertyActivityLinesRaw = [];
  }

  restoreViewState(officeGroups: OwnerReportOfficeGroup[], viewState: OwnerReportListViewState | null): void {
    const expandableRowIds = this.collectExpandableRowIds(officeGroups);
    const nextExpanded = new Set<string>();
    (viewState?.expandedRowIds || []).forEach(rowId => {
      if (expandableRowIds.has(rowId)) {
        nextExpanded.add(rowId);
      }
    });

    if (nextExpanded.size === 0) {
      this.initializeExpandedRows(officeGroups);
    } else {
      this.expandedRowIds = nextExpanded;
    }

    this.officeReadyToCloseRowIds.clear();
  }

  collectExpandableRowIds(officeGroups: OwnerReportOfficeGroup[]): Set<string> {
    const ids = new Set<string>();
    (officeGroups || []).forEach(office => {
      ids.add(office.rowId);
      (office.properties || []).forEach(property => {
        if (property.propertyId) {
          ids.add(`property:${office.officeId}:${property.propertyId || property.propertyCode}`);
        }
      });
    });

    return ids;
  }

  emitViewStateChange(): void {
    this.viewStateChange.emit({
      expandedRowIds: Array.from(this.expandedRowIds)
    });
  }

  onActivityCodeClick(row: OwnerReportVisibleRow): void {
    const selection = this.getActivityLinkSelection(row, 'journal');
    if (!selection) {
      return;
    }
    this.activityLinkSelect.emit(selection);
  }

  onItemDescriptionCodeClick(row: OwnerReportVisibleRow, code: string): void {
    const selection = this.getActivityLinkSelection(row, 'source');
    if (!selection) {
      return;
    }

    const normalizedCode = (code || '').trim();
    if (!normalizedCode) {
      return;
    }

    this.activityLinkSelect.emit({
      ...selection,
      activityCode: normalizedCode
    });
  }

  scheduleOwnerReportDimensionLockUpdate(): void {
    if (this.dimensionsUpdateScheduled) {
      return;
    }

    this.dimensionsUpdateScheduled = true;
    requestAnimationFrame(() => {
      this.dimensionsUpdateScheduled = false;
      const tableWrap = this.ownerReportTableWrap?.nativeElement;
      if (!tableWrap) {
        return;
      }

      const measuredHeight = Math.ceil(tableWrap.offsetHeight);
      if (measuredHeight > this.ownerReportFixedHeightPx) {
        this.ownerReportFixedHeightPx = measuredHeight;
      }
    });
  }
  //#endregion

  //#region Get Methods
  getItemDescriptionSegments(row: OwnerReportVisibleRow): OwnerReportDescriptionSegment[] {
    if (row.kind !== 'propertyActivity') {
      return [{ text: row.itemDescription, code: null }];
    }

    const text = row.itemDescription || '';
    if (!text) {
      return [{ text: '', code: null }];
    }

    const segments: OwnerReportDescriptionSegment[] = [];
    const codeRegex = /\b(?:WO-[A-Za-z0-9-]+|R-\d+(?:-\d+)*|RC[A-Za-z0-9-]*)\b|(?:Owner|Invoice|Payment|Prepayment|Bill|Receipt)\s*:\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/ig;
    let startIndex = 0;
    let matched = codeRegex.exec(text);
    while (matched) {
      const matchIndex = matched.index;
      const matchedCode = (matched[1] ?? matched[0]).trim();
      const matchedLength = matched[0].length;
      if (matchIndex > startIndex) {
        segments.push({ text: text.slice(startIndex, matchIndex), code: null });
      }

      segments.push({ text: matchedCode, code: matchedCode });
      startIndex = matchIndex + matchedLength;
      matched = codeRegex.exec(text);
    }

    if (startIndex < text.length) {
      segments.push({ text: text.slice(startIndex), code: null });
    }

    if (segments.length === 0) {
      return [{ text, code: null }];
    }

    return segments;
  }

  getActivityLinkSelection(row: OwnerReportVisibleRow, clickKind: 'source' | 'journal'): OwnerReportActivityLinkSelection | null {
    if (row.kind !== 'propertyActivity' || !row.officeId || !row.propertyId) {
      return null;
    }

    const allActivityRows = Array.from(this.propertyActivityLinesByPropertyRowId.values())
      .reduce((acc, next) => acc.concat(next), [] as OwnerReportPropertyActivityLineDisplay[]);
    const matchedActivity = allActivityRows.find(line => line.rowId === row.rowId);
    if (!matchedActivity) {
      return null;
    }

    const journalEntryCode = (matchedActivity.documentCode || '').trim();
    return {
      activityId: clickKind === 'journal'
        ? (matchedActivity.journalEntryLineId || matchedActivity.activityId)
        : (matchedActivity.sourceId || matchedActivity.activityId),
      activityCode: journalEntryCode,
      activityType: matchedActivity.activityType,
      officeId: row.officeId,
      propertyId: row.propertyId
    };
  }

  get areAllOfficeRowsExpanded(): boolean {
    const officeRowIds = (this.ownerReportOfficeGroups || []).map(group => group.rowId);
    return officeRowIds.length > 0 && officeRowIds.every(rowId => this.expandedRowIds.has(rowId));
  }

  getAllOfficeRowsExpandIcon(): string {
    return this.areAllOfficeRowsExpanded ? 'expand_less' : 'expand_more';
  }

  getRowExpandIcon(row: OwnerReportVisibleRow): string {
    if (row.kind === 'property') {
      return row.expanded ? 'expand_more' : 'expand_less';
    }

    if (row.kind !== 'office') {
      return 'chevron_right';
    }

    if (!row.expanded) {
      return 'expand_more';
    }

    if (this.hasExpandedPropertyRowsForOfficeRow(row.rowId)) {
      return 'chevron_left';
    }

    if (this.officeReadyToCloseRowIds.has(row.rowId)) {
      return 'expand_less';
    }

    return 'chevron_right';
  }

  get headerEntityLine(): string {
    const officeLabel = this.getHeaderOfficeLabel();
    return [this.companyName, officeLabel].filter(label => !!label).join(' ');
  }

  get reportTitle(): string {
    return this.reportKind === 'cash'
      ? 'Owner Cash Report'
      : 'Owner Accual Report';
  }

  getHeaderOfficeLabel(): string {
    const officeNames = (this.ownerReportOfficeGroups || [])
      .map(group => (group.officeName || '').trim())
      .filter(name => !!name);
    if (officeNames.length === 1) {
      return officeNames[0];
    }
    if (officeNames.length > 1) {
      return 'All Offices';
    }
    const requestedOfficeCount = (this.searchRequest?.officeIds || []).filter(id => id > 0).length;
    if (requestedOfficeCount > 1) {
      return 'All Offices';
    }
    return '';
  }

  get headerPeriodLine(): string {
    const startDate = this.searchRequest?.startDate ?? null;
    const endDate = this.searchRequest?.endDate ?? null;
    const periodLabel = this.mappingService.buildFinancialReportPeriodLabel(startDate, endDate, false);
    return periodLabel || 'All Dates';
  }

  getPropertyRowsForOffice(officeRowId: string): { rowId: string; officeId: number; propertyId: string }[] {
    const officeGroup = (this.ownerReportOfficeGroups || []).find(group => group.rowId === officeRowId);
    if (!officeGroup) {
      return [];
    }
    return (officeGroup.properties || [])
      .filter(property => !!property.propertyId)
      .map(property => ({
        rowId: `property:${officeGroup.officeId}:${property.propertyId || property.propertyCode}`,
        officeId: officeGroup.officeId,
        propertyId: property.propertyId
      }));
  }

  hasExpandedPropertyRowsForOfficeRow(officeRowId: string): boolean {
    const propertyRows = this.getPropertyRowsForOffice(officeRowId);
    return propertyRows.some(property => this.expandedRowIds.has(property.rowId));
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
    this.scheduleOwnerReportDimensionLockUpdate();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
