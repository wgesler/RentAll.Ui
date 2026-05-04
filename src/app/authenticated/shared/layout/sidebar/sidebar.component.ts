import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable, Subject, map, shareReplay, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { getVisibleNavItems } from '../../access/role-access';
import { TicketStateType } from '../../../tickets/models/ticket-enum';
import { TicketService } from '../../../tickets/services/ticket.service';
import { SidebarStateService } from '../services/sidebar-state.service';

@Component({
    standalone: true,
    selector: 'app-sidebar',
    imports: [CommonModule, MaterialModule, RouterOutlet, RouterLink, RouterLinkActive],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss'
})

export class SidebarComponent implements OnInit, OnDestroy {
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
  destroy$ = new Subject<void>();

  constructor(
    public router: Router,
    private authService: AuthService,
    private breakpointObserver: BreakpointObserver,
    private sidebarStateService: SidebarStateService,
    private ticketService: TicketService
  ) { }

  ngOnInit(): void {
    this.filterNavItemsByRole();
    this.refreshAssignedTicketBadge();

    this.sidebarStateService.isExpanded$.pipe(takeUntil(this.destroy$)).subscribe(isExpanded => {
      this.isExpanded = isExpanded;
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
    });
    
    // Re-filter when login status changes
    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItemsByRole();
      this.refreshAssignedTicketBadge();
    });

    this.ticketService.ticketStateChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshAssignedTicketBadge();
    });
  }



  filterNavItemsByRole(): void {
    const user = this.authService.getUser();
    this.navItems = getVisibleNavItems(user?.userGroups as Array<string | number> | undefined);
  }

  refreshAssignedTicketBadge(): void {
    const currentUserId = String(this.authService.getUser()?.userId || '').trim();
    const currentUserAgentId = String(this.authService.getUser()?.agentId || '').trim();
    if (!currentUserId) {
      this.hasAssignedTicketBadge = false;
      return;
    }

    this.ticketService.getTickets().pipe(take(1)).subscribe({
      next: tickets => {
        this.hasAssignedTicketBadge = (tickets || []).some(ticket => {
          const assigneeId = String(ticket.assigneeId || '').trim();
          const agentId = String(ticket.agentId || '').trim();
          const isAssignedToCurrentUser = assigneeId === currentUserId || (currentUserAgentId !== '' && agentId === currentUserAgentId);
          return isAssignedToCurrentUser && ticket.ticketStateTypeId === TicketStateType.assigned;
        });
      },
      error: () => {
        this.hasAssignedTicketBadge = false;
      }
    });
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
