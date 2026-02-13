import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Observable, Subject, map, shareReplay, takeUntil } from 'rxjs';
import { RouterToken } from '../../../../app.routes';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { UserGroups } from '../../../users/models/user-enums';
import { SidebarStateService } from '../services/sidebar-state.service';

@Component({
    selector: 'app-sidebar',
    imports: [CommonModule, MaterialModule, RouterOutlet, RouterLink, RouterLinkActive],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss'
})

export class SidebarComponent implements OnInit, OnDestroy {
  readonly expandedSidebarWidth = 175;
  readonly collapsedSidebarWidth = 64;
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  isExpanded: boolean = true;
  isHandset = false;
  sideNav: MatSidenav;
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.XSmall)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );
  navItems: any[] = [];
  destroy$ = new Subject<void>();
  
  private allNavItems = [
    {
      icon: 'dashboard',
      displayName: 'Dashboard',
      url: RouterToken.Dashboard,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'grid_view',
      displayName: 'Boards',
      url: RouterToken.ReservationBoard,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'handshake',
      displayName: 'Reservations',
      url: RouterToken.RentalList,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'home',
      displayName: 'Properties',
      url: RouterToken.PropertyList,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'account_balance',
      displayName: 'Accounting',
      url: RouterToken.AccountingList,
      requiredRoles: [UserGroups.Accounting, UserGroups.Admin], // Accounting and Admin only
      excludedRoles: [] // No exclusions
    },
    {
      icon: 'description',
      displayName: 'Documents',
      url: RouterToken.DocumentList,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'business',
      displayName: 'Companies',
      url: RouterToken.Companies,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'contacts',
      displayName: 'Contacts',
      url: RouterToken.Contacts,
      requiredRoles: [], // Available to all
      excludedRoles: [UserGroups.SuperAdmin] // Exclude SuperAdmin
    },
    {
      icon: 'corporate_fare',
      displayName: 'Organizations',
      url: RouterToken.OrganizationList,
      requiredRoles: [UserGroups.SuperAdmin], // SuperAdmin only
      excludedRoles: [] // No exclusions
    },
    {
      icon: 'people',
      displayName: 'Users',
      url: RouterToken.UserList,
      requiredRoles: [UserGroups.SuperAdmin, UserGroups.Admin], 
      excludedRoles: [] // No exclusions
    },
    {
      icon: 'settings',
      displayName: 'Settings',
      url: RouterToken.OrganizationConfiguration,
      requiredRoles: [UserGroups.SuperAdmin, UserGroups.Admin], // SuperAdmin and Admin only
      excludedRoles: [] // No exclusions
    },
  ];

  constructor(
    public router: Router,
    private authService: AuthService,
    private breakpointObserver: BreakpointObserver,
    private sidebarStateService: SidebarStateService
  ) { }

  ngOnInit(): void {
    this.filterNavItemsByRole();

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
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  filterNavItemsByRole(): void {
    const user = this.authService.getUser();
    if (!user || !user.userGroups || user.userGroups.length === 0) {
      // If no user or no roles, show only items with no required roles
      this.navItems = this.allNavItems.filter(item => item.requiredRoles.length === 0);
      return;
    }

    // Convert userGroups to numbers for comparison
    const userGroupNumbers = user.userGroups.map(group => {
      // Handle both string names and numeric strings
      if (typeof group === 'string') {
        // Try to find enum value by name (e.g., "SuperAdmin" -> 1)
        const enumKey = Object.keys(UserGroups).find(key => key === group);
        if (enumKey) {
          return UserGroups[enumKey as keyof typeof UserGroups];
        }
        // Try parsing as number (e.g., "1" -> 1)
        const num = parseInt(group, 10);
        if (!isNaN(num)) {
          return num;
        }
      }
      return typeof group === 'number' ? group : null;
    }).filter(num => num !== null) as number[];

    // Filter nav items based on user roles
    this.navItems = this.allNavItems.filter(item => {
      // First check if user is excluded
      if (item.excludedRoles && item.excludedRoles.length > 0) {
        const isExcluded = item.excludedRoles.some(role => userGroupNumbers.includes(role));
        if (isExcluded) {
          return false; // User is excluded, don't show this item
        }
      }
      
      // If no required roles, show to everyone (unless excluded above)
      if (item.requiredRoles.length === 0) {
        return true;
      }
      
      // Check if user has at least one of the required roles
      return item.requiredRoles.some(role => userGroupNumbers.includes(role));
    });
  }

  sideNavToggleHandler(): void {
    if (this.isHandset) {
      this.sideNav.toggle();
    } else {
      this.sidebarStateService.toggleExpanded();
    }
  }

  get desktopSidebarWidth(): number {
    return this.isExpanded ? this.expandedSidebarWidth : this.collapsedSidebarWidth;
  }
}
