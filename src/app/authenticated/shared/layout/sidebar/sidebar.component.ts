import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable, Subject, map, shareReplay, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { CommonService } from '../../../../services/common.service';
import { LeadsService } from '../../../leads/services/leads.service';
import { getFilteredSidebarNavItems, getSidebarFilterOptions } from '../../access/role-access';
import { TicketService } from '../../../tickets/services/ticket.service';
import { SecurityDepositService } from '../../../accounting/services/security-deposit.service';
import { UserReceiptDraftNoticeService } from '../../../maintenance/services/user-receipt-draft-notice.service';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { OrganizationFeatureService } from '../../../organizations/services/organization-feature.service';
import { UserGroups } from '../../../users/models/user-enums';
import { SidebarStateService } from '../services/sidebar-state.service';
import { SidebarAttentionService } from '../services/sidebar-attention.service';

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
  private commonService = inject(CommonService);
  private breakpointObserver = inject(BreakpointObserver);
  private sidebarStateService = inject(SidebarStateService);
  private ticketService = inject(TicketService);
  private securityDepositService = inject(SecurityDepositService);
  private userReceiptDraftNoticeService = inject(UserReceiptDraftNoticeService);
  private reservationService = inject(ReservationService);
  private leadsService = inject(LeadsService);
  private organizationFeatureService = inject(OrganizationFeatureService);
  private sidebarAttentionService = inject(SidebarAttentionService);
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
  hasPendingUserReceiptDrafts = false;
  destroy$ = new Subject<void>();

markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnInit(): void {
    this.filterNavItemsByRole();

    this.securityDepositService.securityDepositsOutstanding$.pipe(takeUntil(this.destroy$)).subscribe(outstanding => {
      this.hasSecurityDepositsOutstanding = outstanding;
      this.markViewForCheck();
    });

    this.userReceiptDraftNoticeService.hasPendingUserReceiptDrafts$.pipe(takeUntil(this.destroy$)).subscribe(pending => {
      this.hasPendingUserReceiptDrafts = pending;
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
    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(isLoggedIn => {
      this.filterNavItemsByRole();
      this.refreshAttentionSummary();
      if (!isLoggedIn) {
        this.userReceiptDraftNoticeService.clearPendingNotice();
      }
      this.markViewForCheck();
    });

    this.organizationFeatureService.getAllFeatures().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItemsByRole();
      this.markViewForCheck();
    });

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItemsByRole();
      this.markViewForCheck();
    });

    this.ticketService.ticketStateChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshAttentionSummary();
    });

    this.leadsService.leadStateChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshAttentionSummary();
    });

    this.reservationService.reservationSaved$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.refreshSecurityDepositsOutstandingBadge();
    });
  }



  filterNavItemsByRole(): void {
    const user = this.authService.getUser();
    const userGroups = user?.userGroups as Array<string | number> | undefined;
    this.navItems = getFilteredSidebarNavItems(userGroups, getSidebarFilterOptions(this.authService, this.commonService.getOrganizationTypeId()));
  }

  refreshAttentionSummary(): void {
    if (!this.authService.getIsLoggedIn()) {
      this.hasAssignedTicketBadge = false;
      this.hasNewLeadBadge = false;
      this.hasSecurityDepositsOutstanding = false;
      return;
    }

    this.sidebarAttentionService.getSummary().pipe(take(1)).subscribe({
      next: summary => {
        this.hasAssignedTicketBadge = this.authService.hasTicketingAccess() && summary.assignedTicketCount > 0;
        this.hasNewLeadBadge = this.authService.hasAccessToLeads() && summary.newLeadCount > 0;
        this.hasSecurityDepositsOutstanding = this.authService.hasAccountingNavAccess() && summary.securityDepositCount > 0;
        this.securityDepositService.setSecurityDepositsOutstanding(this.hasSecurityDepositsOutstanding);
        this.userReceiptDraftNoticeService.setPendingNotice(summary.pendingReceiptDraftCount > 0);
        this.markViewForCheck();
      },
      error: () => this.markViewForCheck()
    });
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

    this.refreshAttentionSummary();
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
