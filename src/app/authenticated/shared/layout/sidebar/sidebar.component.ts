import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable, Subject, forkJoin, map, shareReplay, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { LeadStateType } from '../../../leads/models/lead-enums';
import { LeadsService } from '../../../leads/services/leads.service';
import { getVisibleNavItems } from '../../access/role-access';
import { TicketStateType } from '../../../tickets/models/ticket-enum';
import { TicketService } from '../../../tickets/services/ticket.service';
import { SecurityDepositService } from '../../../accounting/services/security-deposit.service';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { OrganizationFeatureService } from '../../../organizations/services/organization-feature.service';
import { UserGroups } from '../../../users/models/user-enums';
import { SidebarStateService } from '../services/sidebar-state.service';

@Component({
    standalone: true,
    selector: 'app-sidebar',
    imports: [CommonModule, MaterialModule, RouterOutlet, RouterLink, RouterLinkActive],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class SidebarComponent implements OnInit, OnDestroy {
  router = inject(Router);
  private authService = inject(AuthService);
  private breakpointObserver = inject(BreakpointObserver);
  private sidebarStateService = inject(SidebarStateService);
  private ticketService = inject(TicketService);
  private securityDepositService = inject(SecurityDepositService);
  private reservationService = inject(ReservationService);
  private leadsService = inject(LeadsService);
  private organizationFeatureService = inject(OrganizationFeatureService);
  private cdr = inject(ChangeDetectorRef);

  readonly expandedSidebarWidth = 175;
  readonly collapsedSidebarWidth = 64;
  @ViewChild('sideNav') sideNav: MatSidenav;
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  isExpanded: boolean = true;
  isHandset = false;
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.XSmall)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );
  navItems: any[] = [];
  hasAssignedTicketBadge = false;
  hasNewLeadBadge = false;
  hasSecurityDepositsOutstanding = false;
  destroy$ = new Subject<void>();

markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.filterNavItemsByRole();
    this.refreshAssignedTicketBadge();
    this.refreshLeadBadge();
    this.refreshSecurityDepositsOutstandingBadge();

    this.securityDepositService.securityDepositsOutstanding$.pipe(takeUntil(this.destroy$)).subscribe(outstanding => {
      this.hasSecurityDepositsOutstanding = outstanding;
      this.markViewForCheck();
    });

    this.sidebarStateService.isExpanded$.pipe(takeUntil(this.destroy$)).subscribe(isExpanded => {
      this.isExpanded = isExpanded;
      this.markViewForCheck();
    });

    this.sidebarStateService.toggleRequest$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.sideNavToggleHandler();
    });

    this.isHandset$.pipe(takeUntil(this.destroy$)).subscribe(isHandset => {
      this.isHandset = isHandset;
      if (isHandset) {
        // Mobile keeps the overlay behavior and always shows labels.
        this.sidebarStateService.setExpanded(true);
      }
      this.markViewForCheck();
    });
    
    // Re-filter when login status changes
    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItemsByRole();
      this.refreshAssignedTicketBadge();
      this.refreshLeadBadge();
      this.refreshSecurityDepositsOutstandingBadge();
      this.markViewForCheck();
    });

    this.organizationFeatureService.getAllFeatures().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItemsByRole();
      this.refreshAssignedTicketBadge();
      this.refreshLeadBadge();
      this.refreshSecurityDepositsOutstandingBadge();
      this.markViewForCheck();
    });

    this.ticketService.ticketStateChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshAssignedTicketBadge();
    });

    this.leadsService.leadStateChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshLeadBadge();
    });

    this.reservationService.reservationSaved$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshSecurityDepositsOutstandingBadge();
    });
  }



  filterNavItemsByRole(): void {
    const user = this.authService.getUser();
    let items = getVisibleNavItems(user?.userGroups as Array<string | number> | undefined);
    const showLeadsMenu =
      (this.authService.hasRole(UserGroups.Admin) ||
      this.authService.hasRole(UserGroups.Agent) ||
      this.authService.hasRole(UserGroups.AgentAdmin)) &&
      this.authService.hasAccessToLeads();
    if (!showLeadsMenu) {
      items = items.filter(item => {
        const url = String(item.url || '');
        return url !== 'leads' && !url.startsWith('leads/');
      });
    }
    if (!this.authService.isOwnerAdmin() || !this.authService.hasAccessToOwners()) {
      items = items.filter(item => {
        const url = String(item.url || '');
        return url !== 'owner' && !url.startsWith('owner/');
      });
    }
    if (!this.authService.hasTicketingAccess()) {
      items = items.filter(item => {
        const url = String(item.url || '');
        return url !== 'tickets' && !url.startsWith('tickets/');
      });
    }
    this.navItems = items;
  }

  refreshAssignedTicketBadge(): void {
    if (!this.authService.hasTicketingAccess()) {
      this.hasAssignedTicketBadge = false;
      this.markViewForCheck();
      return;
    }

    const currentUserId = String(this.authService.getUser()?.userId || '').trim();
    const currentUserAgentId = String(this.authService.getUser()?.agentId || '').trim();
    if (!currentUserId) {
      this.hasAssignedTicketBadge = false;
      this.markViewForCheck();
      return;
    }

    this.ticketService.getTickets().pipe(take(1)).subscribe({
      next: tickets => {
        this.hasAssignedTicketBadge = (tickets || []).some(ticket => {
          const assigneeId = String(ticket.assigneeId || '').trim();
          const agentId = String(ticket.agentId || '').trim();
          const createdBy = String(ticket.createdBy || '').trim();
          const isAssignedToCurrentUser = assigneeId === currentUserId || (currentUserAgentId !== '' && agentId === currentUserAgentId);
          const isCreatedByCurrentUser = createdBy === currentUserId;
          if (ticket.ticketStateTypeId === TicketStateType.caseCreated) {
            return isCreatedByCurrentUser;
          }
          if (ticket.ticketStateTypeId === TicketStateType.assigned) {
            return isAssignedToCurrentUser;
          }
          return false;
        });
        this.markViewForCheck();
      },
      error: () => {
        this.hasAssignedTicketBadge = false;
        this.markViewForCheck();
      }
    });
  }

  refreshLeadBadge(): void {
    if (!this.authService.hasAccessToLeads()) {
      this.hasNewLeadBadge = false;
      this.markViewForCheck();
      return;
    }

    const hasLeadsNavItem = this.navItems.some(navItem => {
      const url = String(navItem?.url || '');
      return url === 'leads' || url.startsWith('leads/');
    });
    if (!hasLeadsNavItem) {
      this.hasNewLeadBadge = false;
      this.markViewForCheck();
      return;
    }

    forkJoin({
      rentals: this.leadsService.getRentalLeads(),
      owners: this.leadsService.getOwnerLeads(),
      generals: this.leadsService.getGeneralLeads()
    }).pipe(take(1)).subscribe({
      next: ({ rentals, owners, generals }) => {
        this.hasNewLeadBadge = this.hasNewLeadState(rentals) || this.hasNewLeadState(owners) || this.hasNewLeadState(generals);
        this.markViewForCheck();
      },
      error: () => {
        this.hasNewLeadBadge = false;
        this.markViewForCheck();
      }
    });
  }

  hasNewLeadState(rows: Array<{ leadStateId?: number }> | null | undefined): boolean {
    return (rows || []).some(row => row?.leadStateId === LeadStateType.New);
  }

  refreshSecurityDepositsOutstandingBadge(): void {
    if (!this.authService.hasAccountingNavAccess()) {
      this.securityDepositService.clearSecurityDepositsOutstanding();
      this.markViewForCheck();
      return;
    }

    const hasAccountingNavItem = this.navItems.some(navItem => {
      const url = String(navItem?.url || '');
      return url === 'accounting' || url.startsWith('accounting/');
    });
    if (!hasAccountingNavItem) {
      this.securityDepositService.clearSecurityDepositsOutstanding();
      this.markViewForCheck();
      return;
    }

    this.securityDepositService.refreshSecurityDepositsOutstanding();
  }
    
  get desktopSidebarWidth(): number {
    return this.isExpanded ? this.expandedSidebarWidth : this.collapsedSidebarWidth;
  }

  sideNavToggleHandler(): void {
    if (this.isHandset && this.sideNav) {
      this.sideNav.toggle();
    } else {
      this.sidebarStateService.toggleExpanded();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}
