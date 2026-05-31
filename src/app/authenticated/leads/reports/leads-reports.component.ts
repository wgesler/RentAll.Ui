import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AgentService } from '../../organizations/services/agent.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AgentBreakdownRow, OfficeLeadStatusRow, UnifiedLeadRow } from '../models/lead-reports.model';
import { LEAD_FINAL_STATE_IDS, formatLeadStateLabel } from '../models/lead-enums';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-leads-reports',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './leads-reports.component.html',
  styleUrl: './leads-reports.component.scss'
})
export class LeadsReportsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() startDate: Date | null = null;
  @Input() endDate: Date | null = null;
  @Input() offices: OfficeResponse[] = [];

  isPageReady = false;
  closedLeadsColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '24ch' },
    statuses: { displayAs: 'Statuses', wrap: false, maxWidth: '44ch' },
    rentalCount: { displayAs: 'Rental-Leads', wrap: false, maxWidth: '12ch', alignment: 'center' },
    ownerCount: { displayAs: 'Owner-Leads', wrap: false, maxWidth: '12ch', alignment: 'center' },
    generalCount: { displayAs: 'General-Leads', wrap: false, maxWidth: '12ch', alignment: 'center' },
    totalCount: { displayAs: 'Total', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };
  openLeadsColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '24ch' },
    statuses: { displayAs: 'Statuses', wrap: false, maxWidth: '44ch' },
    rentalCount: { displayAs: 'Rental-Leads', wrap: false, maxWidth: '12ch', alignment: 'center' },
    ownerCount: { displayAs: 'Owner-Leads', wrap: false, maxWidth: '12ch', alignment: 'center' },
    generalCount: { displayAs: 'General-Leads', wrap: false, maxWidth: '12ch', alignment: 'center' },
    totalCount: { displayAs: 'Total', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };
  agentBreakdownColumns: ColumnSet = {
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '24ch' },
    agent: { displayAs: 'Agent', wrap: false, maxWidth: '26ch' },
    rentalCount: { displayAs: 'Rental', wrap: false, maxWidth: '10ch', alignment: 'center' },
    ownerCount: { displayAs: 'Owner', wrap: false, maxWidth: '10ch', alignment: 'center' },
    generalCount: { displayAs: 'General', wrap: false, maxWidth: '10ch', alignment: 'center' },
    openCount: { displayAs: 'Open', wrap: false, maxWidth: '10ch', alignment: 'center' },
    closedCount: { displayAs: 'Closed', wrap: false, maxWidth: '10ch', alignment: 'center' },
    totalCount: { displayAs: 'Total', wrap: false, maxWidth: '10ch', alignment: 'center' }
  };
  closedLeadRows: OfficeLeadStatusRow[] = [];
  openLeadRows: OfficeLeadStatusRow[] = [];
  agentBreakdownRows: AgentBreakdownRow[] = [];
  filteredLeadRows: UnifiedLeadRow[] = [];
  allLeadRows: UnifiedLeadRow[] = [];
  rentalRows: UnifiedLeadRow[] = [];
  ownerRows: UnifiedLeadRow[] = [];
  generalRows: UnifiedLeadRow[] = [];
  agentsById = new Map<string, AgentResponse>();
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rental-leads', 'owner-leads', 'general-leads', 'agents']));
  destroy$ = new Subject<void>();

  constructor(
    private leadsService: LeadsService,
    private utilityService: UtilityService,
    private agentService: AgentService,
    private mappingService: MappingService
  ) {}

  //#region Leads-Reports
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
    
    this.loadRentalLeads();
    this.loadOwnerLeads();
    this.loadGeneralLeads();
    this.loadAgents();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] || changes['startDate'] || changes['endDate'] || changes['offices']) {
      this.applyFiltersAndBuildReports();
    }
  }
  //#endregion

  //#region Supporting Get Methods
  get hasRows(): boolean {
    return this.closedLeadRows.length > 0 || this.openLeadRows.length > 0 || this.agentBreakdownRows.length > 0;
  }

  get closedLeadTotalCount(): number {
    return this.closedLeadRows.reduce((sum, row) => sum + row.totalCount, 0);
  }

  get openLeadTotalCount(): number {
    return this.openLeadRows.reduce((sum, row) => sum + row.totalCount, 0);
  }

  get agentBreakdownTotals(): { rental: number; owner: number; general: number; open: number; closed: number; total: number } {
    return this.agentBreakdownRows.reduce((acc, row) => {
      acc.rental += row.rentalCount;
      acc.owner += row.ownerCount;
      acc.general += row.generalCount;
      acc.open += row.openCount;
      acc.closed += row.closedCount;
      acc.total += row.totalCount;
      return acc;
    }, { rental: 0, owner: 0, general: 0, open: 0, closed: 0, total: 0 });
  }

  get leadTypeCounts(): { rental: number; owner: number; general: number; total: number } {
    return this.filteredLeadRows.reduce((acc, row) => {
      if (row.leadType === 'Rental') {
        acc.rental += 1;
      } else if (row.leadType === 'Owner') {
        acc.owner += 1;
      } else {
        acc.general += 1;
      }
      acc.total += 1;
      return acc;
    }, { rental: 0, owner: 0, general: 0, total: 0 });
  }
  //#endregion

  //#region Data Loading Methods
  loadRentalLeads(): void {
    this.leadsService.getRentalLeads().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental-leads'))).subscribe({
      next: rows => {
        this.rentalRows = this.mappingService.mapLeadRentalReportRows(rows || []);
        this.refreshAllLeadRows();
      },
      error: () => {
        this.rentalRows = [];
        this.refreshAllLeadRows();
      }
    });
  }

  loadOwnerLeads(): void {
    this.leadsService.getOwnerLeads().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'owner-leads'))).subscribe({
      next: rows => {
        this.ownerRows = this.mappingService.mapLeadOwnerReportRows(rows || []);
        this.refreshAllLeadRows();
      },
      error: () => {
        this.ownerRows = [];
        this.refreshAllLeadRows();
      }
    });
  }

  loadGeneralLeads(): void {
    this.leadsService.getGeneralLeads().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'general-leads'))).subscribe({
      next: rows => {
        this.generalRows = this.mappingService.mapLeadGeneralReportRows(rows || []);
        this.refreshAllLeadRows();
      },
      error: () => {
        this.generalRows = [];
        this.refreshAllLeadRows();
      }
    });
  }

  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'))).subscribe({
      next: agents => {
        this.agentsById.clear();
        for (const agent of (agents || [])) {
          const key = String(agent.agentId || '').trim().toLowerCase();
          if (key) {
            this.agentsById.set(key, agent);
          }
        }
        this.refreshAllLeadRows();
      },
      error: () => {
        this.agentsById.clear();
        this.refreshAllLeadRows();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  applyFiltersAndBuildReports(): void {
    if (this.allLeadRows.length === 0) {
      this.filteredLeadRows = [];
      this.closedLeadRows = [];
      this.openLeadRows = [];
      this.agentBreakdownRows = [];
      return;
    }
    this.filteredLeadRows = this.allLeadRows.filter(row => this.matchesOffice(row.officeId) && this.matchesDateRange(row.createdOn));
    this.closedLeadRows = this.buildLeadStateRows(this.filteredLeadRows, true);
    this.openLeadRows = this.buildLeadStateRows(this.filteredLeadRows, false);
    this.agentBreakdownRows = this.buildAgentBreakdownRows(this.filteredLeadRows);
  }
  //#endregion

  //#region Report Build Methods
  buildLeadStateRows(rows: UnifiedLeadRow[], isClosedSection: boolean): OfficeLeadStatusRow[] {
    const counts = new Map<string, { officeName: string; statuses: Set<string>; rentalCount: number; ownerCount: number; generalCount: number; totalCount: number }>();
    for (const row of rows) {
      const isClosedLeadState = LEAD_FINAL_STATE_IDS.has(row.leadStateId);
      if (isClosedSection !== isClosedLeadState) {
        continue;
      }
      const officeName = this.resolveOfficeName(row.officeId);
      const leadState = formatLeadStateLabel(row.leadStateId);
      const key = officeName;
      const existing = counts.get(key);
      if (existing) {
        existing.statuses.add(leadState);
        if (row.leadType === 'Rental') {
          existing.rentalCount += 1;
        } else if (row.leadType === 'Owner') {
          existing.ownerCount += 1;
        } else {
          existing.generalCount += 1;
        }
        existing.totalCount += 1;
      } else {
        const rentalCount = row.leadType === 'Rental' ? 1 : 0;
        const ownerCount = row.leadType === 'Owner' ? 1 : 0;
        const generalCount = row.leadType === 'General' ? 1 : 0;
        counts.set(key, {
          officeName,
          statuses: new Set<string>([leadState]),
          rentalCount,
          ownerCount,
          generalCount,
          totalCount: 1
        });
      }
    }

    return Array.from(counts.values())
      .map(row => ({
        officeName: row.officeName,
        statuses: Array.from(row.statuses).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(', '),
        rentalCount: row.rentalCount,
        ownerCount: row.ownerCount,
        generalCount: row.generalCount,
        totalCount: row.totalCount
      }))
      .sort((a, b) => a.officeName.localeCompare(b.officeName, undefined, { sensitivity: 'base' }));
  }

  buildAgentBreakdownRows(rows: UnifiedLeadRow[]): AgentBreakdownRow[] {
    const counts = new Map<string, AgentBreakdownRow>();
    for (const row of rows) {
      const officeName = this.resolveOfficeName(row.officeId);
      const agent = this.resolveAgentLabel(row);
      const key = `${officeName}|${agent}`;
      const existing = counts.get(key) || {
        officeName,
        agent,
        rentalCount: 0,
        ownerCount: 0,
        generalCount: 0,
        openCount: 0,
        closedCount: 0,
        totalCount: 0
      };
      const isClosedLeadState = LEAD_FINAL_STATE_IDS.has(row.leadStateId);
      if (row.leadType === 'Rental') {
        existing.rentalCount += 1;
      } else if (row.leadType === 'Owner') {
        existing.ownerCount += 1;
      } else {
        existing.generalCount += 1;
      }
      if (isClosedLeadState) {
        existing.closedCount += 1;
      } else {
        existing.openCount += 1;
      }
      existing.totalCount += 1;
      counts.set(key, existing);
    }

    return Array.from(counts.values()).sort((a, b) =>
      a.officeName.localeCompare(b.officeName, undefined, { sensitivity: 'base' })
      || a.agent.localeCompare(b.agent, undefined, { sensitivity: 'base' })
    );
  }
  
  refreshAllLeadRows(): void {
    this.allLeadRows = [
      ...this.rentalRows,
      ...this.ownerRows,
      ...this.generalRows
    ];
    this.applyFiltersAndBuildReports();
  }
    
  matchesOffice(officeId: number): boolean {
    if (this.officeId == null) {
      return true;
    }
    return Number(officeId) === Number(this.officeId);
  }

  matchesDateRange(createdOn: Date | null): boolean {
    const normalizedStart = this.startDate ? new Date(this.startDate) : null;
    const normalizedEnd = this.endDate ? new Date(this.endDate) : null;
    if (normalizedStart) {
      normalizedStart.setHours(0, 0, 0, 0);
    }
    if (normalizedEnd) {
      normalizedEnd.setHours(23, 59, 59, 999);
    }

    if (!normalizedStart && !normalizedEnd) {
      return true;
    }
    if (!createdOn) {
      return true;
    }
    const createdValue = new Date(createdOn);
    if (normalizedStart && createdValue.getTime() < normalizedStart.getTime()) {
      return false;
    }
    if (normalizedEnd && createdValue.getTime() > normalizedEnd.getTime()) {
      return false;
    }
    return true;
  }

  resolveAgentLabel(row: UnifiedLeadRow): string {
    const agentId = String(row.agentId || '').trim().toLowerCase();
    if (agentId) {
      const matchedAgent = this.agentsById.get(agentId);
      if (matchedAgent?.name) {
        return matchedAgent.name;
      }
    }
    return row.agentLabel || 'Unassigned';
  }
  //#endregion

  //#region Utility Methods
  resolveOfficeName(officeId: number): string {
    return this.offices.find(office => Number(office.officeId) === Number(officeId))?.name
      || `Office ${officeId}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

