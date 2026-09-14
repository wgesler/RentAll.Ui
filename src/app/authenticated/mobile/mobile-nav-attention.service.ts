import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, forkJoin, of, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LeadStateType } from '../leads/models/lead-enums';
import { LeadsService } from '../leads/services/leads.service';
import { GlobalSelectionService } from '../organizations/services/global-selection.service';
import { TicketStateType } from '../tickets/models/ticket-enum';
import { TicketResponse } from '../tickets/models/ticket-models';
import { TicketService } from '../tickets/services/ticket.service';

export interface MobileNavAttentionState {
  hasLeadsAttention: boolean;
  hasTicketsAttention: boolean;
  leadTabAttention: Record<string, boolean>;
  ticketTabAttention: Record<string, boolean>;
}

const emptyState: MobileNavAttentionState = {
  hasLeadsAttention: false,
  hasTicketsAttention: false,
  leadTabAttention: {},
  ticketTabAttention: {}
};

@Injectable({
  providedIn: 'root'
})
export class MobileNavAttentionService {
  private authService = inject(AuthService);
  private ticketService = inject(TicketService);
  private leadsService = inject(LeadsService);
  private globalSelectionService = inject(GlobalSelectionService);

  private readonly stateSubject = new BehaviorSubject<MobileNavAttentionState>(emptyState);
  readonly state$ = this.stateSubject.asObservable();

  private refreshLoadId = 0;
  private selectedOfficeId: number | null = null;
  private scheduledRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.globalSelectionService.getSelectedOfficeId$().subscribe(officeId => {
      this.selectedOfficeId = officeId;
      this.refresh();
    });
    this.ticketService.ticketStateChanged$.subscribe(() => this.refresh());
    this.leadsService.leadStateChanged$.subscribe(() => this.refresh());
  }

  getState(): MobileNavAttentionState {
    return this.stateSubject.value;
  }

  hasLeadTabAttention(tabPath: string): boolean {
    return !!this.stateSubject.value.leadTabAttention[tabPath];
  }

  hasTicketTabAttention(tabPath: string): boolean {
    return !!this.stateSubject.value.ticketTabAttention[tabPath];
  }

  scheduleRefreshAfterLogin(): void {
    this.refresh({ delayMs: 1500 });
  }

  refresh(options?: { delayMs?: number }): void {
    const delayMs = Math.max(0, options?.delayMs ?? 0);
    if (this.scheduledRefreshTimer != null) {
      clearTimeout(this.scheduledRefreshTimer);
      this.scheduledRefreshTimer = null;
    }

    if (delayMs > 0) {
      this.scheduledRefreshTimer = setTimeout(() => {
        this.scheduledRefreshTimer = null;
        this.executeRefresh();
      }, delayMs);
      return;
    }

    this.executeRefresh();
  }

  clear(): void {
    if (this.scheduledRefreshTimer != null) {
      clearTimeout(this.scheduledRefreshTimer);
      this.scheduledRefreshTimer = null;
    }
    this.refreshLoadId++;
    this.stateSubject.next(emptyState);
  }

  private executeRefresh(): void {
    const loadId = ++this.refreshLoadId;
    const isOwnerAdmin = this.authService.isOwnerAdmin();
    const isAdmin = this.authService.isAdmin();

    forkJoin({
      tickets: this.authService.hasTicketingAccess() ? this.ticketService.getTickets().pipe(take(1)) : of([] as TicketResponse[]),
      rentals: this.authService.hasAccessToLeads() ? this.leadsService.getRentalLeads().pipe(take(1)) : of([]),
      owners: this.authService.hasAccessToLeads() && isOwnerAdmin ? this.leadsService.getOwnerLeads().pipe(take(1)) : of([]),
      generals: this.authService.hasAccessToLeads() ? this.leadsService.getGeneralLeads().pipe(take(1)) : of([]),
      partners: this.authService.hasAccessToLeads() ? this.leadsService.getPartnerLeads().pipe(take(1)) : of([])
    }).pipe(take(1)).subscribe({
      next: ({ tickets, rentals, owners, generals, partners }) => {
        if (loadId !== this.refreshLoadId) {
          return;
        }

        const leadTabAttention = {
          rentals: this.hasNewLeadState(rentals),
          owners: isOwnerAdmin && this.hasNewLeadState(owners),
          general: this.hasNewLeadState(generals),
          partners: this.hasNewLeadState(partners)
        };

        const ticketTabAttention: Record<string, boolean> = {
          'my-tickets': (tickets || []).some(ticket => this.shouldShowMyTicketsAttention(ticket)),
          ...(isAdmin ? {
            rentall: (tickets || []).some(ticket => this.shouldShowRentAllTicketsAttention(ticket)),
            review: (tickets || []).some(ticket => this.shouldShowReviewTicketsAttention(ticket))
          } : {})
        };

        const nextState: MobileNavAttentionState = {
          leadTabAttention,
          ticketTabAttention,
          hasLeadsAttention: Object.values(leadTabAttention).some(Boolean),
          hasTicketsAttention: Object.values(ticketTabAttention).some(Boolean)
        };
        this.stateSubject.next(nextState);
      },
      error: () => {
        if (loadId !== this.refreshLoadId) {
          return;
        }
        this.stateSubject.next(emptyState);
      }
    });
  }

  private hasNewLeadState(rows: Array<{ leadStateId?: number; officeId?: number }> | null | undefined): boolean {
    const officeId = this.selectedOfficeId != null && this.selectedOfficeId > 0 ? this.selectedOfficeId : null;
    return (rows || []).some(row => {
      if (row?.leadStateId !== LeadStateType.New) {
        return false;
      }
      if (officeId == null) {
        return true;
      }
      return Number(row.officeId) === officeId;
    });
  }

  private isTicketInSelectedOfficeScope(ticket: TicketResponse): boolean {
    const officeId = this.selectedOfficeId != null && this.selectedOfficeId > 0 ? this.selectedOfficeId : null;
    return officeId == null || Number(ticket.officeId) === officeId;
  }

  private shouldShowRentAllTicketsAttention(ticket: TicketResponse): boolean {
    return this.isTicketInSelectedOfficeScope(ticket)
      && !!ticket.isForRentAll
      && ticket.isActive !== false
      && ticket.ticketStateTypeId === TicketStateType.caseCreated;
  }

  private shouldShowReviewTicketsAttention(ticket: TicketResponse): boolean {
    return this.isTicketInSelectedOfficeScope(ticket)
      && !!ticket.isForRentAll
      && ticket.isActive !== false
      && ticket.ticketStateTypeId === TicketStateType.inReview;
  }

  private shouldShowMyTicketsAttention(ticket: TicketResponse): boolean {
    if (!this.isTicketInSelectedOfficeScope(ticket) || ticket.isActive === false || ticket.isForRentAll) {
      return false;
    }

    const currentUserId = String(this.authService.getUser()?.userId || '').trim();
    const currentUserAgentId = String(this.authService.getUser()?.agentId || '').trim();
    if (!currentUserId) {
      return false;
    }

    const assigneeId = String(ticket.assigneeId || '').trim();
    const agentId = String(ticket.agentId || '').trim();
    const createdBy = String(ticket.createdBy || '').trim();
    const isAssignedToCurrentUser = assigneeId === currentUserId
      || (currentUserAgentId !== '' && agentId === currentUserAgentId);
    const isCreatedByCurrentUser = createdBy === currentUserId;

    if (ticket.ticketStateTypeId === TicketStateType.caseCreated) {
      return isCreatedByCurrentUser;
    }
    if (ticket.ticketStateTypeId === TicketStateType.assigned) {
      return isAssignedToCurrentUser;
    }
    return false;
  }
}
