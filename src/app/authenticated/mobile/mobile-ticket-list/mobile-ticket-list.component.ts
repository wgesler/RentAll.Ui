import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { ColumnData, ColumnSet } from '../../shared/data-table/models/column-data';
import { TicketStateType } from '../../tickets/models/ticket-enum';
import { TicketResponse } from '../../tickets/models/ticket-models';
import { TicketService } from '../../tickets/services/ticket.service';
import { MobileTicketListRow } from './mobile-ticket-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-ticket-list',
  imports: [MaterialModule],
  templateUrl: './mobile-ticket-list.component.html',
  styleUrl: './mobile-ticket-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileTicketListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() filterMode: 'assignedToMe' | 'allOthers' | 'closed' | 'rentAll' | 'review' | 'complete' = 'assignedToMe';
  @Input() tabPath = 'my-tickets';
  private router = inject(Router);
  private authService = inject(AuthService);
  private ticketService = inject(TicketService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  allTickets: TicketResponse[] = [];
  ticketsDisplay: MobileTicketListRow[] = [];
  selectedOfficeId: number | null = null;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['tickets']));
  destroy$ = new Subject<void>();
  readonly displayedColumns: ColumnSet = {
    ticketCode: { displayAs: 'Ticket', maxWidth: '14ch', wrap: false },
    title: { displayAs: 'Title', maxWidth: '100%', wrap: false }
  };

  //#region Mobile-Ticket-List
  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['filterMode'] || changes['tabPath']) && !changes['filterMode']?.firstChange && !changes['tabPath']?.firstChange) {
      this.applyFilter();
    }
  }

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.selectedOfficeId = officeId;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(() => {
      if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
        return;
      }
      this.applyFilter();
    });
    this.loadTickets();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTickets(): void {
    this.ticketService.getTickets().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'tickets'))).subscribe({
      next: tickets => {
        this.allTickets = tickets || [];
        this.applyFilter();
      },
      error: () => {
        this.allTickets = [];
        this.ticketsDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  applyFilter(): void {
    const currentUserId = this.utilityService.normalizeIdOrNull(this.authService.getUser()?.userId ?? null);
    const currentUserAgentId = this.utilityService.normalizeIdOrNull(this.authService.getUser()?.agentId ?? null);
    this.ticketsDisplay = this.sortTickets((this.allTickets || []).filter(ticket => this.mappingService.matchesMobileOfficeScope(ticket.officeId, this.selectedOfficeId) && this.matchesTicketFilter(ticket, currentUserId, currentUserAgentId))).map(ticket => this.mapTicketListDisplay(ticket, currentUserId, currentUserAgentId));
    this.markViewForCheck();
  }

  getColumnEntries(): { name: string; column: ColumnData }[] {
    return Object.entries(this.displayedColumns).map(([name, column]) => ({ name, column }));
  }

  getCellValue(ticket: MobileTicketListRow, name: string): string {
    return String(ticket[name as keyof MobileTicketListRow] ?? '');
  }

  onTicketClick(ticket: MobileTicketListRow): void {
    const ticketId = String(ticket.ticketId || '').trim();
    if (!ticketId) {
      return;
    }
    this.router.navigate(['/mobile', 'tickets', this.tabPath || 'my-tickets', ticketId]);
  }

  addTicket(): void {
    this.router.navigate(['/mobile', 'tickets', this.tabPath || 'my-tickets', 'new']);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Utility Methods
  mapTicketListDisplay(ticket: TicketResponse, currentUserId: string | null, currentUserAgentId: string | null): MobileTicketListRow {
    return {
      ticketId: ticket.ticketId,
      ticketAttentionDot: this.shouldShowAttentionDot(ticket, currentUserId, currentUserAgentId) ? '●' : '',
      ticketCode: ticket.ticketCode || '',
      title: ticket.title || ''
    };
  }

  shouldShowAttentionDot(ticket: TicketResponse, currentUserId: string | null, currentUserAgentId: string | null): boolean {
    if (this.filterMode === 'review') {
      return ticket.ticketStateTypeId === TicketStateType.inReview;
    }
    if (this.filterMode === 'rentAll') {
      return ticket.ticketStateTypeId === TicketStateType.caseCreated;
    }
    const isCreatedOrAssigned = ticket.ticketStateTypeId === TicketStateType.caseCreated || ticket.ticketStateTypeId === TicketStateType.assigned;
    return this.isTicketMine(ticket, currentUserId, currentUserAgentId) && isCreatedOrAssigned;
  }

  matchesTicketFilter(ticket: TicketResponse, currentUserId: string | null, currentUserAgentId: string | null): boolean {
    if (this.filterMode === 'closed') {
      return ticket.isActive !== false && ticket.ticketStateTypeId === TicketStateType.closed && !ticket.isForRentAll;
    }
    if (!ticket.isActive) {
      return false;
    }
    if (this.filterMode === 'rentAll') {
      return !!ticket.isForRentAll && this.isRentAllQueueState(ticket.ticketStateTypeId);
    }
    if (this.filterMode === 'review') {
      return !!ticket.isForRentAll && ticket.ticketStateTypeId === TicketStateType.inReview;
    }
    if (this.filterMode === 'complete') {
      return !!ticket.isForRentAll && (ticket.ticketStateTypeId === TicketStateType.workComplete || ticket.ticketStateTypeId === TicketStateType.closed);
    }
    if (ticket.ticketStateTypeId === TicketStateType.closed || ticket.isForRentAll) {
      return false;
    }
    const isMine = this.isTicketMine(ticket, currentUserId, currentUserAgentId);
    if (this.filterMode === 'assignedToMe') {
      return !!currentUserId && isMine;
    }
    if (this.filterMode === 'allOthers') {
      return currentUserId ? !isMine : true;
    }
    return false;
  }

  isRentAllQueueState(ticketStateTypeId: number | null | undefined): boolean {
    return ticketStateTypeId === TicketStateType.caseCreated
      || ticketStateTypeId === TicketStateType.assigned
      || ticketStateTypeId === TicketStateType.scheduled
      || ticketStateTypeId === TicketStateType.inProgress;
  }

  isTicketMine(ticket: TicketResponse, currentUserId: string | null, currentUserAgentId: string | null): boolean {
    if (!currentUserId) {
      return false;
    }
    if (ticket.ticketStateTypeId === TicketStateType.caseCreated) {
      return this.utilityService.normalizeIdOrNull(ticket.createdBy ?? null) === currentUserId;
    }
    const assigneeId = this.utilityService.normalizeIdOrNull(ticket.assigneeId ?? null);
    const agentId = this.utilityService.normalizeIdOrNull(ticket.agentId ?? null);
    return assigneeId === currentUserId || (currentUserAgentId != null && agentId === currentUserAgentId);
  }

  sortTickets(tickets: TicketResponse[]): TicketResponse[] {
    return (tickets || []).slice().sort((a, b) => {
      const stateOrder = (a.ticketStateTypeId ?? 0) - (b.ticketStateTypeId ?? 0);
      if (stateOrder !== 0) {
        return stateOrder;
      }
      return (Date.parse(String(b.createdOn || '')) || 0) - (Date.parse(String(a.createdOn || '')) || 0);
    });
  }
  //#endregion
}
