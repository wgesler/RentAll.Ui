import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { OwnerReportActivityLinkSelection, OwnerReportAmountDrillDownSelection, OwnerReportDescriptionSegment, OwnerReportDrillDownMetric, OwnerReportKind, OwnerReportListViewState, OwnerReportOfficeGroup, OwnerReportPropertyActivityLineDisplay, OwnerReportPropertyActivityLineResponse, OwnerReportPropertyRow, OwnerReportResponse, OwnerReportSearchRequest, OwnerReportVisibleRow } from '../models/owner-report.model';
import { OwnerReportService } from '../services/owner-report.service';

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
  @Output() reportKindChange = new EventEmitter<OwnerReportKind>();
  @Output() viewStateChange = new EventEmitter<OwnerReportListViewState>();

  isPageReady = false;
  isServiceError = false;
  companyName = '';
  ownerReports: OwnerReportResponse[] = [];
  ownerReportOfficeGroups: OwnerReportOfficeGroup[] = [];
  visibleRows: OwnerReportVisibleRow[] = [];
  expandedRowIds = new Set<string>();
  ownerCloseOnNextToggleRowIds = new Set<string>();
  officeCloseOnNextToggleRowIds = new Set<string>();
  propertyActivityLinesByPropertyRowId = new Map<string, OwnerReportPropertyActivityLineDisplay[]>();
  propertyActivityLoadingRowIds = new Set<string>();
  propertyActivityErrorRowIds = new Set<string>();
  ownerReportFixedHeightPx = 0;
  dimensionsUpdateScheduled = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerReports']));
  destroy$ = new Subject<void>();

  constructor(
    private ownerReportService: OwnerReportService,
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
    const request = this.buildOwnerReportSearchRequest();
    if (request.officeIds.length === 0) {
      this.ownerReports = [];
      this.ownerReportOfficeGroups = [];
      this.visibleRows = [];
      this.expandedRowIds.clear();
      this.ownerCloseOnNextToggleRowIds.clear();
      this.officeCloseOnNextToggleRowIds.clear();
      this.clearPropertyActivityState();
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerReports');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerReports');
    this.ownerReportService.searchOwnerReports(request).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerReports'))).subscribe({
      next: reports => {
        this.ownerReports = reports || [];
        this.ownerReportOfficeGroups = this.buildOwnerReportOfficeGroups(this.ownerReports);
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
        this.ownerCloseOnNextToggleRowIds.clear();
        this.officeCloseOnNextToggleRowIds.clear();
        this.clearPropertyActivityState();
        this.emitViewStateChange();
        this.markViewForCheck();
      }
    });
  }

  loadPropertyActivityRows(row: OwnerReportVisibleRow): void {
    if (row.kind !== 'property' || !row.propertyId || !row.officeId) {
      return;
    }

    const request = this.buildOwnerReportSearchRequest();
    this.propertyActivityLoadingRowIds.add(row.rowId);
    this.propertyActivityErrorRowIds.delete(row.rowId);
    this.rebuildVisibleRows();
    this.markViewForCheck();

    this.ownerReportService.searchOwnerReportPropertyActivityLines({
      officeIds: [row.officeId],
      propertyId: row.propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(take(1)).subscribe({
      next: lines => {
        this.propertyActivityLinesByPropertyRowId.set(row.rowId, this.mapPropertyActivityDisplays(row.rowId, lines || []));
        this.propertyActivityLoadingRowIds.delete(row.rowId);
        this.propertyActivityErrorRowIds.delete(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
      },
      error: () => {
        this.propertyActivityLinesByPropertyRowId.set(row.rowId, []);
        this.propertyActivityLoadingRowIds.delete(row.rowId);
        this.propertyActivityErrorRowIds.add(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
      }
    });
  }

  //#endregion

  //#region Build Form 
  initializeExpandedRows(officeGroups: OwnerReportOfficeGroup[]): void {
    this.expandedRowIds.clear();
    (officeGroups || []).forEach(office => this.expandedRowIds.add(office.rowId));
  }

  buildOwnerReportSearchRequest(): OwnerReportSearchRequest {
    return {
      officeIds: (this.searchRequest?.officeIds ?? []).filter(id => id > 0),
      propertyId: this.searchRequest?.propertyId ?? null,
      startDate: this.searchRequest?.startDate ?? null,
      endDate: this.searchRequest?.endDate ?? null
    };
  }

  buildOwnerReportOfficeGroups(reports: OwnerReportResponse[]): OwnerReportOfficeGroup[] {
    const officeMap = new Map<string, { officeId: number; officeName: string; ownerMap: Map<string, OwnerReportPropertyRow[]> }>();

    (reports || []).forEach(report => {
      const officeId = Number(report.officeId) || 0;
      const officeName = (report.officeName || '').trim();
      const officeKey = `${officeId}::${officeName.toLowerCase()}`;
      const ownerId = (report.ownerId || '').trim();
      const ownerName = (report.ownerName || '').trim() || 'Unassigned Owner';
      const ownerKey = ownerId || ownerName.toLowerCase();

      if (!officeMap.has(officeKey)) {
        officeMap.set(officeKey, { officeId, officeName, ownerMap: new Map<string, OwnerReportPropertyRow[]>() });
      }

      const office = officeMap.get(officeKey)!;
      if (!office.ownerMap.has(ownerKey)) {
        office.ownerMap.set(ownerKey, []);
      }

      office.ownerMap.get(ownerKey)!.push({
        propertyId: report.propertyId || '',
        ownerName,
        ownerId,
        propertyCode: report.propertyCode || '',
        expected: Number(report.expected) || 0,
        prePaid: Number(report.prePaid) || 0,
        outstanding: Number(report.outstanding) || 0,
        income: Number(report.income) || 0,
        expenses: Number(report.expenses) || 0,
        balance: Number(report.balance) || 0,
        workingCapital: Number(report.workingCapital) || 0,
        workingCapitalBalanceDue: Number(report.workingCapitalBalanceDue) || 0
      });
    });

    const officeGroups = Array.from(officeMap.values()).map(office => {
      const owners = Array.from(office.ownerMap.entries()).map(([ownerKey, properties]) => {
        const sortedProperties = [...properties].sort((a, b) => (a.propertyCode || '').localeCompare(b.propertyCode || ''));
        return {
          rowId: `owner:${office.officeId}:${ownerKey || 'unknown'}`,
          ownerId: sortedProperties[0]?.ownerId || '',
          ownerName: sortedProperties[0]?.ownerName || 'Unassigned Owner',
          properties: sortedProperties,
          expected: sortedProperties.reduce((sum, item) => sum + item.expected, 0),
          prePaid: sortedProperties.reduce((sum, item) => sum + item.prePaid, 0),
          outstanding: sortedProperties.reduce((sum, item) => sum + item.outstanding, 0),
          income: sortedProperties.reduce((sum, item) => sum + item.income, 0),
          expenses: sortedProperties.reduce((sum, item) => sum + item.expenses, 0),
          balance: sortedProperties.reduce((sum, item) => sum + item.balance, 0),
          workingCapital: sortedProperties.reduce((sum, item) => sum + item.workingCapital, 0),
          workingCapitalBalanceDue: sortedProperties.reduce((sum, item) => sum + item.workingCapitalBalanceDue, 0)
        };
      }).sort((a, b) => a.ownerName.localeCompare(b.ownerName));

      const resolvedOfficeName = office.officeName || `Office ${office.officeId}`;
      return {
        rowId: `office:${office.officeId}`,
        officeId: office.officeId,
        officeName: resolvedOfficeName,
        owners,
        expected: owners.reduce((sum, owner) => sum + owner.expected, 0),
        prePaid: owners.reduce((sum, owner) => sum + owner.prePaid, 0),
        outstanding: owners.reduce((sum, owner) => sum + owner.outstanding, 0),
        income: owners.reduce((sum, owner) => sum + owner.income, 0),
        expenses: owners.reduce((sum, owner) => sum + owner.expenses, 0),
        balance: owners.reduce((sum, owner) => sum + owner.balance, 0),
        workingCapital: owners.reduce((sum, owner) => sum + owner.workingCapital, 0),
        workingCapitalBalanceDue: owners.reduce((sum, owner) => sum + owner.workingCapitalBalanceDue, 0)
      };
    });

    return officeGroups.sort((a, b) => a.officeName.localeCompare(b.officeName));
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
        outstanding: this.formatter.currencyUsd(office.outstanding),
        outstandingValue: office.outstanding,
        income: this.formatter.currencyUsd(office.income),
        incomeValue: office.income,
        expenses: this.formatter.currencyUsd(office.expenses),
        expensesValue: office.expenses,
        balance: this.formatter.currencyUsd(office.balance),
        balanceValue: office.balance,
        workingCapital: this.formatter.currencyUsd(office.workingCapital),
        workingCapitalValue: office.workingCapital,
        workingCapitalBalanceDue: this.formatter.currencyUsd(office.workingCapitalBalanceDue),
        workingCapitalBalanceDueValue: office.workingCapitalBalanceDue,
        expandable: office.owners.length > 0,
        expanded: officeExpanded
      });

      if (!officeExpanded) {
        return;
      }

      office.owners.forEach(owner => {
        const ownerExpanded = this.expandedRowIds.has(owner.rowId);
        rows.push({
          rowId: owner.rowId,
          kind: 'owner',
          depth: 1,
          ownerId: owner.ownerId,
          officeId: office.officeId,
          primaryLabel: owner.ownerName,
          propertyCode: '',
          itemDescription: '',
          activityCode: '',
          expected: this.formatter.currencyUsd(owner.expected),
          expectedValue: owner.expected,
          prePaid: this.formatter.currencyUsd(owner.prePaid),
          prePaidValue: owner.prePaid,
          outstanding: this.formatter.currencyUsd(owner.outstanding),
          outstandingValue: owner.outstanding,
          income: this.formatter.currencyUsd(owner.income),
          incomeValue: owner.income,
          expenses: this.formatter.currencyUsd(owner.expenses),
          expensesValue: owner.expenses,
          balance: this.formatter.currencyUsd(owner.balance),
          balanceValue: owner.balance,
          workingCapital: this.formatter.currencyUsd(owner.workingCapital),
          workingCapitalValue: owner.workingCapital,
          workingCapitalBalanceDue: this.formatter.currencyUsd(owner.workingCapitalBalanceDue),
          workingCapitalBalanceDueValue: owner.workingCapitalBalanceDue,
          expandable: owner.properties.length > 0,
          expanded: ownerExpanded
        });

        if (!ownerExpanded) {
          return;
        }

        owner.properties.forEach(property => {
          const propertyRowId = `property:${office.officeId}:${owner.rowId}:${property.propertyId || property.propertyCode}`;
          const propertyExpanded = this.expandedRowIds.has(propertyRowId);
          rows.push({
            rowId: propertyRowId,
            kind: 'property',
            depth: 2,
            ownerId: property.ownerId,
            officeId: office.officeId,
            propertyId: property.propertyId,
            primaryLabel: property.ownerName,
            propertyCode: property.propertyCode || '',
            itemDescription: '',
            activityCode: '',
            expected: this.formatter.currencyUsd(property.expected),
            expectedValue: property.expected,
            prePaid: this.formatter.currencyUsd(property.prePaid),
            prePaidValue: property.prePaid,
            outstanding: this.formatter.currencyUsd(property.outstanding),
            outstandingValue: property.outstanding,
            income: this.formatter.currencyUsd(property.income),
            incomeValue: property.income,
            expenses: this.formatter.currencyUsd(property.expenses),
            expensesValue: property.expenses,
            balance: this.formatter.currencyUsd(property.balance),
            balanceValue: property.balance,
            workingCapital: this.formatter.currencyUsd(property.workingCapital),
            workingCapitalValue: property.workingCapital,
            workingCapitalBalanceDue: this.formatter.currencyUsd(property.workingCapitalBalanceDue),
            workingCapitalBalanceDueValue: property.workingCapitalBalanceDue,
            expandable: !!property.propertyId,
            expanded: propertyExpanded
          });

          if (!propertyExpanded) {
            return;
          }

          if (this.propertyActivityLoadingRowIds.has(propertyRowId)) {
            rows.push(this.buildPropertyActivityStateRow(propertyRowId, 'Loading property activity...'));
            return;
          }

          if (this.propertyActivityErrorRowIds.has(propertyRowId)) {
            rows.push(this.buildPropertyActivityStateRow(propertyRowId, 'Unable to load property activity.'));
            return;
          }

          const activityRows = this.propertyActivityLinesByPropertyRowId.get(propertyRowId) || [];
          if (activityRows.length === 0) {
            rows.push(this.buildPropertyActivityStateRow(propertyRowId, 'No items this period.'));
            return;
          }

          activityRows.forEach(activity => {
            rows.push({
              rowId: activity.rowId,
              kind: 'propertyActivity',
              depth: 3,
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
              outstanding: '',
              outstandingValue: 0,
              income: '',
              incomeValue: 0,
              expenses: activity.expenses,
              expensesValue: Number(activity.expenses) || 0,
              balance: '',
              balanceValue: 0,
              workingCapital: '',
              workingCapitalValue: 0,
              workingCapitalBalanceDue: '',
              workingCapitalBalanceDueValue: 0,
              expandable: false,
              expanded: false
            });
          });
        });
      });
    });

    this.visibleRows = rows;
  }

  buildPropertyActivityStateRow(propertyRowId: string, message: string): OwnerReportVisibleRow {
    return {
      rowId: `${propertyRowId}:state`,
      kind: 'propertyActivity',
      depth: 3,
      primaryLabel: message,
      propertyCode: '',
      itemDescription: '',
      activityCode: '',
      expected: '',
      expectedValue: 0,
      prePaid: '',
      prePaidValue: 0,
      outstanding: '',
      outstandingValue: 0,
      income: '',
      incomeValue: 0,
      expenses: '',
      expensesValue: 0,
      balance: '',
      balanceValue: 0,
      workingCapital: '',
      workingCapitalValue: 0,
      workingCapitalBalanceDue: '',
      workingCapitalBalanceDueValue: 0,
      expandable: false,
      expanded: false
    };
  }
  //#endregion

  //#region Form Response Methods
  toggleRowExpansion(row: OwnerReportVisibleRow): void {
    if (!row.expandable) {
      return;
    }

    if (row.kind === 'property') {
      this.ownerCloseOnNextToggleRowIds.delete(this.getOwnerRowIdFromPropertyRowId(row.rowId));
      const isExpanded = this.expandedRowIds.has(row.rowId);
      if (isExpanded) {
        this.expandedRowIds.delete(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      this.expandedRowIds.add(row.rowId);
      this.rebuildVisibleRows();
      this.emitViewStateChange();
      this.markViewForCheck();

      if (!this.propertyActivityLinesByPropertyRowId.has(row.rowId) && !this.propertyActivityLoadingRowIds.has(row.rowId) && row.propertyId) {
        this.loadPropertyActivityRows(row);
      }
      return;
    }

    if (row.kind === 'owner') {
      const propertyRows = this.getPropertyRowsForOwner(row.rowId);
      const propertyRowIds = propertyRows.map(property => property.rowId);
      const isExpanded = this.expandedRowIds.has(row.rowId);

      if (isExpanded) {
        this.expandedRowIds.delete(row.rowId);
        propertyRowIds.forEach(propertyRowId => this.expandedRowIds.delete(propertyRowId));
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      this.expandedRowIds.add(row.rowId);
      propertyRows.forEach(property => this.expandedRowIds.add(property.rowId));
      this.ownerCloseOnNextToggleRowIds.delete(row.rowId);
      this.rebuildVisibleRows();
      this.emitViewStateChange();
      this.markViewForCheck();

      propertyRows.forEach(property => {
        if (!this.propertyActivityLinesByPropertyRowId.has(property.rowId) && !this.propertyActivityLoadingRowIds.has(property.rowId) && property.propertyId) {
          this.loadPropertyActivityRows({
            rowId: property.rowId,
            kind: 'property',
            depth: 2,
            ownerId: row.ownerId,
            officeId: property.officeId,
            propertyId: property.propertyId,
            primaryLabel: '',
            propertyCode: '',
            itemDescription: '',
            activityCode: '',
            expected: '',
            expectedValue: 0,
            prePaid: '',
            prePaidValue: 0,
            outstanding: '',
            outstandingValue: 0,
            income: '',
            incomeValue: 0,
            expenses: '',
            expensesValue: 0,
            balance: '',
            balanceValue: 0,
            workingCapital: '',
            workingCapitalValue: 0,
            workingCapitalBalanceDue: '',
            workingCapitalBalanceDueValue: 0,
            expandable: true,
            expanded: true
          });
        }
      });
      return;
    }

    if (row.kind === 'office') {
      const ownerRowIds = this.getOwnerRowIdsForOffice(row.rowId);
      const propertyRows = ownerRowIds.flatMap(ownerRowId => this.getPropertyRowsForOwner(ownerRowId));
      const propertyRowIds = propertyRows.map(property => property.rowId);
      const isOfficeExpanded = this.expandedRowIds.has(row.rowId);
      const hasExpandedSubordinates = ownerRowIds.some(ownerRowId => this.expandedRowIds.has(ownerRowId))
        || propertyRowIds.some(propertyRowId => this.expandedRowIds.has(propertyRowId));

      if (!isOfficeExpanded) {
        this.expandedRowIds.add(row.rowId);
        this.officeCloseOnNextToggleRowIds.delete(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      if (hasExpandedSubordinates) {
        ownerRowIds.forEach(ownerRowId => this.expandedRowIds.delete(ownerRowId));
        propertyRowIds.forEach(propertyRowId => this.expandedRowIds.delete(propertyRowId));
        ownerRowIds.forEach(ownerRowId => this.ownerCloseOnNextToggleRowIds.delete(ownerRowId));
        this.officeCloseOnNextToggleRowIds.add(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      if (this.officeCloseOnNextToggleRowIds.has(row.rowId)) {
        this.expandedRowIds.delete(row.rowId);
        this.officeCloseOnNextToggleRowIds.delete(row.rowId);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }

      ownerRowIds.forEach(ownerRowId => this.expandedRowIds.add(ownerRowId));
      propertyRowIds.forEach(propertyRowId => this.expandedRowIds.add(propertyRowId));
      this.officeCloseOnNextToggleRowIds.delete(row.rowId);
      this.rebuildVisibleRows();
      this.emitViewStateChange();
      this.markViewForCheck();

      propertyRows.forEach(property => {
        if (!this.propertyActivityLinesByPropertyRowId.has(property.rowId) && !this.propertyActivityLoadingRowIds.has(property.rowId) && property.propertyId) {
          this.loadPropertyActivityRows({
            rowId: property.rowId,
            kind: 'property',
            depth: 2,
            ownerId: '',
            officeId: property.officeId,
            propertyId: property.propertyId,
            primaryLabel: '',
            propertyCode: '',
            itemDescription: '',
            activityCode: '',
            expected: '',
            expectedValue: 0,
            prePaid: '',
            prePaidValue: 0,
            outstanding: '',
            outstandingValue: 0,
            income: '',
            incomeValue: 0,
            expenses: '',
            expensesValue: 0,
            balance: '',
            balanceValue: 0,
            workingCapital: '',
            workingCapitalValue: 0,
            workingCapitalBalanceDue: '',
            workingCapitalBalanceDueValue: 0,
            expandable: true,
            expanded: true
          });
        }
      });
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
      officeRowIds.forEach(rowId => this.officeCloseOnNextToggleRowIds.delete(rowId));
    } else {
      officeRowIds.forEach(rowId => this.expandedRowIds.add(rowId));
      officeRowIds.forEach(rowId => this.officeCloseOnNextToggleRowIds.delete(rowId));
    }

    this.rebuildVisibleRows();
    this.emitViewStateChange();
    this.markViewForCheck();
  }

  mapPropertyActivityDisplays(propertyRowId: string, lines: OwnerReportPropertyActivityLineResponse[]): OwnerReportPropertyActivityLineDisplay[] {
    return (lines || []).map((line, index) => ({
      rowId: `${propertyRowId}:activity:${index}`,
      activityId: (line.activityId || '').trim() || null,
      activityType: line.activityType || '',
      activityDate: this.formatMonthDay(line.activityDate),
      documentCode: line.documentCode || '',
      description: line.description || '',
      expectedIncome: this.formatter.currencyUsd(Number(line.expectedIncome) || 0),
      expenses: this.formatter.currencyUsd(Number(line.expenses) || 0)
    }));
  }

  formatMonthDay(inputDate: string): string {
    if (!inputDate) {
      return '';
    }

    const date = new Date(inputDate);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}.${day}`;
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
    if (row.kind !== 'owner' && row.kind !== 'property') {
      return false;
    }
    if (!row.officeId || !row.ownerId) {
      return false;
    }
    if (metric === 'outstanding') {
      return row.expectedValue !== 0 || row.incomeValue !== 0;
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
    if (metric === 'income') {
      return row.incomeValue !== 0;
    }
    return row.expensesValue !== 0;
  }

  clearPropertyActivityState(): void {
    this.propertyActivityLinesByPropertyRowId.clear();
    this.propertyActivityLoadingRowIds.clear();
    this.propertyActivityErrorRowIds.clear();
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

    this.propertyActivityLinesByPropertyRowId.clear();
    Object.entries(viewState?.propertyActivityByPropertyRowId || {}).forEach(([rowId, lines]) => {
      this.propertyActivityLinesByPropertyRowId.set(rowId, lines || []);
    });
    this.propertyActivityLoadingRowIds.clear();
    this.propertyActivityErrorRowIds.clear();
  }

  collectExpandableRowIds(officeGroups: OwnerReportOfficeGroup[]): Set<string> {
    const ids = new Set<string>();
    (officeGroups || []).forEach(office => {
      ids.add(office.rowId);
      (office.owners || []).forEach(owner => {
        ids.add(owner.rowId);
        (owner.properties || []).forEach(property => {
          if (property.propertyId) {
            ids.add(`property:${office.officeId}:${owner.rowId}:${property.propertyId || property.propertyCode}`);
          }
        });
      });
    });

    return ids;
  }

  emitViewStateChange(): void {
    const propertyActivityByPropertyRowId: Record<string, OwnerReportPropertyActivityLineDisplay[]> = {};
    this.propertyActivityLinesByPropertyRowId.forEach((lines, rowId) => {
      propertyActivityByPropertyRowId[rowId] = lines || [];
    });

    this.viewStateChange.emit({
      expandedRowIds: Array.from(this.expandedRowIds),
      propertyActivityByPropertyRowId
    });
  }

  onActivityCodeClick(row: OwnerReportVisibleRow): void {
    const selection = this.getActivityLinkSelection(row);
    if (!selection) {
      return;
    }
    this.activityLinkSelect.emit(selection);
  }

  onItemDescriptionCodeClick(row: OwnerReportVisibleRow, code: string): void {
    const selection = this.getActivityLinkSelection(row);
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

  onCashReportToggleChange(isCashSelected: boolean): void {
    const nextReportKind: OwnerReportKind = isCashSelected ? 'cash' : 'accrual';
    if (this.reportKind === nextReportKind) {
      return;
    }

    this.reportKindChange.emit(nextReportKind);
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
    const codeRegex = /\b(?:WO-[A-Za-z0-9-]+|R-\d+(?:-\d+)*|RC[A-Za-z0-9-]*)\b/ig;
    let startIndex = 0;
    let matched = codeRegex.exec(text);
    while (matched) {
      const matchIndex = matched.index;
      if (matchIndex > startIndex) {
        segments.push({ text: text.slice(startIndex, matchIndex), code: null });
      }

      segments.push({ text: matched[0], code: matched[0] });
      startIndex = matchIndex + matched[0].length;
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

  getActivityLinkSelection(row: OwnerReportVisibleRow): OwnerReportActivityLinkSelection | null {
    if (row.kind !== 'propertyActivity' || !row.officeId || !row.propertyId) {
      return null;
    }

    const allActivityRows = Array.from(this.propertyActivityLinesByPropertyRowId.values())
      .reduce((acc, next) => acc.concat(next), [] as OwnerReportPropertyActivityLineDisplay[]);
    const matchedActivity = allActivityRows.find(line => line.rowId === row.rowId);
    if (!matchedActivity) {
      return null;
    }

    return {
      activityId: matchedActivity.activityId,
      activityCode: matchedActivity.documentCode,
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
    if (row.kind !== 'office') {
      return row.expanded ? 'chevron_left' : 'chevron_right';
    }

    return row.expanded ? 'expand_less' : 'expand_more';
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

  getOwnerRowIdsForOffice(officeRowId: string): string[] {
    const officeGroup = (this.ownerReportOfficeGroups || []).find(group => group.rowId === officeRowId);
    if (!officeGroup) {
      return [];
    }
    return (officeGroup.owners || []).map(owner => owner.rowId);
  }

  getPropertyRowsForOwner(ownerRowId: string): { rowId: string; officeId: number; propertyId: string }[] {
    const rows: { rowId: string; officeId: number; propertyId: string }[] = [];
    (this.ownerReportOfficeGroups || []).forEach(office => {
      const owner = (office.owners || []).find(currentOwner => currentOwner.rowId === ownerRowId);
      if (!owner) {
        return;
      }
      (owner.properties || []).forEach(property => {
        if (!property.propertyId) {
          return;
        }
        rows.push({
          rowId: `property:${office.officeId}:${owner.rowId}:${property.propertyId || property.propertyCode}`,
          officeId: office.officeId,
          propertyId: property.propertyId
        });
      });
    });
    return rows;
  }

  getOwnerRowIdFromPropertyRowId(propertyRowId: string): string {
    for (const office of this.ownerReportOfficeGroups || []) {
      for (const owner of office.owners || []) {
        if ((propertyRowId || '').startsWith(`property:${office.officeId}:${owner.rowId}:`)) {
          return owner.rowId;
        }
      }
    }
    return '';
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
