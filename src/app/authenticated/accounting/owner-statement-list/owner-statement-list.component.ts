import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { OwnerStatementPropertyActivityLineResponse, OwnerStatementResponse, OwnerStatementSearchRequest } from '../models/owner-statement.model';
import { OwnerStatementService } from '../services/owner-statement.service';

interface OwnerStatementPropertyRow {
  propertyId: string;
  ownerName: string;
  ownerId: string;
  propertyCode: string;
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

interface OwnerStatementOwnerGroup {
  rowId: string;
  ownerId: string;
  ownerName: string;
  properties: OwnerStatementPropertyRow[];
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

interface OwnerStatementOfficeGroup {
  rowId: string;
  officeId: number;
  officeName: string;
  owners: OwnerStatementOwnerGroup[];
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

type OwnerStatementVisibleRowKind = 'office' | 'owner' | 'property' | 'propertyActivity';

interface OwnerStatementVisibleRow {
  rowId: string;
  kind: OwnerStatementVisibleRowKind;
  depth: number;
  ownerId?: string;
  officeId?: number;
  propertyId?: string;
  primaryLabel: string;
  propertyCode: string;
  itemDescription: string;
  activityCode: string;
  expected: string;
  prePaid: string;
  outstanding: string;
  income: string;
  expenses: string;
  balance: string;
  workingCapital: string;
  workingCapitalBalanceDue: string;
  expandable: boolean;
  expanded: boolean;
}

interface OwnerStatementPropertyActivityLineDisplay {
  rowId: string;
  activityId: string | null;
  activityType: string;
  activityDate: string;
  documentCode: string;
  description: string;
  expectedIncome: string;
  expenses: string;
}

export interface OwnerStatementActivityLinkSelection {
  activityId: string | null;
  activityCode: string;
  activityType: string;
  officeId: number;
  propertyId: string;
}

export interface OwnerStatementListViewState {
  expandedRowIds: string[];
  propertyActivityByPropertyRowId: Record<string, OwnerStatementPropertyActivityLineDisplay[]>;
}

@Component({
  selector: 'app-owner-statement-list',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './owner-statement-list.component.html',
  styleUrl: './owner-statement-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() searchRequest?: MaintenanceListSearchRequest | null;
  @Input() refreshTrigger = 0;
  @Input() viewState: OwnerStatementListViewState | null = null;
  @Output() activityLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();
  @Output() viewStateChange = new EventEmitter<OwnerStatementListViewState>();

  isPageReady = false;
  isServiceError = false;
  companyName = '';
  ownerStatements: OwnerStatementResponse[] = [];
  ownerStatementOfficeGroups: OwnerStatementOfficeGroup[] = [];
  visibleRows: OwnerStatementVisibleRow[] = [];
  expandedRowIds = new Set<string>();
  propertyActivityLinesByPropertyRowId = new Map<string, OwnerStatementPropertyActivityLineDisplay[]>();
  propertyActivityLoadingRowIds = new Set<string>();
  propertyActivityErrorRowIds = new Set<string>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatements']));
  destroy$ = new Subject<void>();

  constructor(
    private ownerStatementService: OwnerStatementService,
    private commonService: CommonService,
    private formatter: FormatterService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Owner Statement List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOrganization();
    this.loadOwnerStatements();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['searchRequest'] && !changes['searchRequest'].firstChange) {
      this.loadOwnerStatements();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadOwnerStatements();
    }
  }
  //#endregion

  //#region Data Load Methods
  buildOwnerStatementSearchRequest(): OwnerStatementSearchRequest {
    return {
      officeIds: (this.searchRequest?.officeIds ?? []).filter(id => id > 0),
      propertyId: this.searchRequest?.propertyId ?? null,
      startDate: this.searchRequest?.startDate ?? null,
      endDate: this.searchRequest?.endDate ?? null
    };
  }

  loadOwnerStatements(): void {
    const request = this.buildOwnerStatementSearchRequest();
    if (request.officeIds.length === 0) {
      this.ownerStatements = [];
      this.ownerStatementOfficeGroups = [];
      this.visibleRows = [];
      this.expandedRowIds.clear();
      this.clearPropertyActivityState();
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatements');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerStatements');
    this.ownerStatementService.searchOwnerStatements(request).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatements'))
    ).subscribe({
      next: statements => {
        this.ownerStatements = statements || [];
        this.ownerStatementOfficeGroups = this.buildOwnerStatementOfficeGroups(this.ownerStatements);
        this.restoreViewState(this.ownerStatementOfficeGroups, this.viewState);
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.ownerStatements = [];
        this.ownerStatementOfficeGroups = [];
        this.visibleRows = [];
        this.expandedRowIds.clear();
        this.clearPropertyActivityState();
        this.emitViewStateChange();
        this.markViewForCheck();
      }
    });
  }

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

  buildOwnerStatementOfficeGroups(statements: OwnerStatementResponse[]): OwnerStatementOfficeGroup[] {
    const officeMap = new Map<string, { officeId: number; officeName: string; ownerMap: Map<string, OwnerStatementPropertyRow[]> }>();

    (statements || []).forEach(statement => {
      const officeId = Number(statement.officeId) || 0;
      const officeName = (statement.officeName || '').trim();
      const officeKey = `${officeId}::${officeName.toLowerCase()}`;
      const ownerId = (statement.ownerId || '').trim();
      const ownerName = (statement.ownerName || '').trim() || 'Unassigned Owner';
      const ownerKey = ownerId || ownerName.toLowerCase();

      if (!officeMap.has(officeKey)) {
        officeMap.set(officeKey, { officeId, officeName, ownerMap: new Map<string, OwnerStatementPropertyRow[]>() });
      }

      const office = officeMap.get(officeKey)!;
      if (!office.ownerMap.has(ownerKey)) {
        office.ownerMap.set(ownerKey, []);
      }

      office.ownerMap.get(ownerKey)!.push({
        propertyId: statement.propertyId || '',
        ownerName,
        ownerId,
        propertyCode: statement.propertyCode || '',
        expected: Number(statement.expected) || 0,
        prePaid: Number(statement.prePaid) || 0,
        outstanding: Number(statement.outstanding) || 0,
        income: Number(statement.income) || 0,
        expenses: Number(statement.expenses) || 0,
        balance: Number(statement.balance) || 0,
        workingCapital: Number(statement.workingCapital) || 0,
        workingCapitalBalanceDue: Number(statement.workingCapitalBalanceDue) || 0
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

  initializeExpandedRows(officeGroups: OwnerStatementOfficeGroup[]): void {
    this.expandedRowIds.clear();
    (officeGroups || []).forEach(office => this.expandedRowIds.add(office.rowId));
  }

  rebuildVisibleRows(): void {
    const rows: OwnerStatementVisibleRow[] = [];
    (this.ownerStatementOfficeGroups || []).forEach(office => {
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
        prePaid: this.formatter.currencyUsd(office.prePaid),
        outstanding: this.formatter.currencyUsd(office.outstanding),
        income: this.formatter.currencyUsd(office.income),
        expenses: this.formatter.currencyUsd(office.expenses),
        balance: this.formatter.currencyUsd(office.balance),
        workingCapital: this.formatter.currencyUsd(office.workingCapital),
        workingCapitalBalanceDue: this.formatter.currencyUsd(office.workingCapitalBalanceDue),
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
          prePaid: this.formatter.currencyUsd(owner.prePaid),
          outstanding: this.formatter.currencyUsd(owner.outstanding),
          income: this.formatter.currencyUsd(owner.income),
          expenses: this.formatter.currencyUsd(owner.expenses),
          balance: this.formatter.currencyUsd(owner.balance),
          workingCapital: this.formatter.currencyUsd(owner.workingCapital),
          workingCapitalBalanceDue: this.formatter.currencyUsd(owner.workingCapitalBalanceDue),
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
            prePaid: this.formatter.currencyUsd(property.prePaid),
            outstanding: this.formatter.currencyUsd(property.outstanding),
            income: this.formatter.currencyUsd(property.income),
            expenses: this.formatter.currencyUsd(property.expenses),
            balance: this.formatter.currencyUsd(property.balance),
            workingCapital: this.formatter.currencyUsd(property.workingCapital),
            workingCapitalBalanceDue: this.formatter.currencyUsd(property.workingCapitalBalanceDue),
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
              prePaid: '',
              outstanding: '',
              income: '',
              expenses: activity.expenses,
              balance: '',
              workingCapital: '',
              workingCapitalBalanceDue: '',
              expandable: false,
              expanded: false
            });
          });
        });
      });
    });

    this.visibleRows = rows;
  }

  toggleRowExpansion(row: OwnerStatementVisibleRow): void {
    if (!row.expandable) {
      return;
    }

    if (row.kind === 'property') {
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

    if (row.kind === 'office') {
      const ownerRowIds = this.getOwnerRowIdsForOffice(row.rowId);
      const hasExpandedOwners = ownerRowIds.some(ownerRowId => this.expandedRowIds.has(ownerRowId));

      // Triple-toggle behavior for office rows:
      // 1) If any owners are open, close owner rows first and keep office open.
      // 2) If no owners are open, then toggle office open/closed.
      if (hasExpandedOwners) {
        ownerRowIds.forEach(ownerRowId => this.expandedRowIds.delete(ownerRowId));
        this.rebuildVisibleRows();
        this.emitViewStateChange();
        this.markViewForCheck();
        return;
      }
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
    const officeRowIds = (this.ownerStatementOfficeGroups || []).map(group => group.rowId);
    if (officeRowIds.length === 0) {
      return;
    }

    if (this.areAllOfficeRowsExpanded) {
      officeRowIds.forEach(rowId => this.expandedRowIds.delete(rowId));
    } else {
      officeRowIds.forEach(rowId => this.expandedRowIds.add(rowId));
    }

    this.rebuildVisibleRows();
    this.emitViewStateChange();
    this.markViewForCheck();
  }

  loadPropertyActivityRows(row: OwnerStatementVisibleRow): void {
    if (row.kind !== 'property' || !row.propertyId || !row.officeId) {
      return;
    }

    const request = this.buildOwnerStatementSearchRequest();
    this.propertyActivityLoadingRowIds.add(row.rowId);
    this.propertyActivityErrorRowIds.delete(row.rowId);
    this.rebuildVisibleRows();
    this.markViewForCheck();

    this.ownerStatementService.searchOwnerStatementPropertyActivityLines({
      officeIds: [row.officeId],
      propertyId: row.propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      take(1)
    ).subscribe({
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

  mapPropertyActivityDisplays(propertyRowId: string, lines: OwnerStatementPropertyActivityLineResponse[]): OwnerStatementPropertyActivityLineDisplay[] {
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

  buildPropertyActivityStateRow(propertyRowId: string, message: string): OwnerStatementVisibleRow {
    return {
      rowId: `${propertyRowId}:state`,
      kind: 'propertyActivity',
      depth: 3,
      primaryLabel: message,
      propertyCode: '',
      itemDescription: '',
      activityCode: '',
      expected: '',
      prePaid: '',
      outstanding: '',
      income: '',
      expenses: '',
      balance: '',
      workingCapital: '',
      workingCapitalBalanceDue: '',
      expandable: false,
      expanded: false
    };
  }

  clearPropertyActivityState(): void {
    this.propertyActivityLinesByPropertyRowId.clear();
    this.propertyActivityLoadingRowIds.clear();
    this.propertyActivityErrorRowIds.clear();
  }

  restoreViewState(officeGroups: OwnerStatementOfficeGroup[], viewState: OwnerStatementListViewState | null): void {
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

  collectExpandableRowIds(officeGroups: OwnerStatementOfficeGroup[]): Set<string> {
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
    const propertyActivityByPropertyRowId: Record<string, OwnerStatementPropertyActivityLineDisplay[]> = {};
    this.propertyActivityLinesByPropertyRowId.forEach((lines, rowId) => {
      propertyActivityByPropertyRowId[rowId] = lines || [];
    });

    this.viewStateChange.emit({
      expandedRowIds: Array.from(this.expandedRowIds),
      propertyActivityByPropertyRowId
    });
  }

  onActivityCodeClick(row: OwnerStatementVisibleRow): void {
    if (row.kind !== 'propertyActivity' || !row.officeId || !row.propertyId) {
      return;
    }

    const activity = this.propertyActivityLinesByPropertyRowId
      .values();
    const allActivityRows = Array.from(activity)
      .reduce((acc, next) => acc.concat(next), [] as OwnerStatementPropertyActivityLineDisplay[]);
    const matchedActivity = allActivityRows
      .find(line => line.rowId === row.rowId);
    if (!matchedActivity) {
      return;
    }

    this.activityLinkSelect.emit({
      activityId: matchedActivity.activityId,
      activityCode: matchedActivity.documentCode,
      activityType: matchedActivity.activityType,
      officeId: row.officeId,
      propertyId: row.propertyId
    });
  }

  get areAllOfficeRowsExpanded(): boolean {
    const officeRowIds = (this.ownerStatementOfficeGroups || []).map(group => group.rowId);
    return officeRowIds.length > 0 && officeRowIds.every(rowId => this.expandedRowIds.has(rowId));
  }

  getAllOfficeRowsExpandIcon(): string {
    return this.areAllOfficeRowsExpanded ? 'expand_less' : 'expand_more';
  }

  getRowExpandIcon(row: OwnerStatementVisibleRow): string {
    if (row.kind !== 'office') {
      return row.expanded ? 'chevron_left' : 'chevron_right';
    }

    return row.expanded ? 'expand_less' : 'expand_more';
  }

  get headerEntityLine(): string {
    const officeLabel = this.getHeaderOfficeLabel();
    return [this.companyName, officeLabel].filter(label => !!label).join(' ');
  }

  getHeaderOfficeLabel(): string {
    const officeNames = (this.ownerStatementOfficeGroups || [])
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
    const officeGroup = (this.ownerStatementOfficeGroups || []).find(group => group.rowId === officeRowId);
    if (!officeGroup) {
      return [];
    }
    return (officeGroup.owners || []).map(owner => owner.rowId);
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
