import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { Observable, map, shareReplay } from 'rxjs';
import { RouterOutlet, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { RouterToken } from '../../../../app.routes';
import { HeaderComponent } from '../header/header.component';
import { MatSidenav } from '@angular/material/sidenav';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, MaterialModule, RouterOutlet, RouterLink, RouterLinkActive, HeaderComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})

export class SidebarComponent {
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  isExpanded: boolean = true;
  sideNav: MatSidenav;
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.XSmall)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );
  navItems = [
    {
      icon: 'grid_view',
      displayName: 'Boards',
      url: RouterToken.ReservationBoard,
    },
    {
      icon: 'handshake',
      displayName: 'Reservations',
      url: RouterToken.RentalList,
    },
    {
      icon: 'business',
      displayName: 'Companies',
      url: RouterToken.CompanyList,
    },
    {
      icon: 'home',
      displayName: 'Properties',
      url: RouterToken.TenantList,
    },
    {
      icon: 'contacts',
      displayName: 'Contacts',
      url: RouterToken.ContactList,
    },
    {
      icon: 'person',
      displayName: 'Users',
      url: RouterToken.UserList,
    },
    {
      icon: 'support_agent',
      displayName: 'Agents',
      url: RouterToken.AgentList,
    },
  ];

  constructor(
    public router: Router,
    private authService: AuthService,
    private breakpointObserver: BreakpointObserver
  ) { }

  sideNavToggleHandler(): void {
    if (this.isHandset$) {
      this.sideNav.toggle();
    } else {
      this.isExpanded = !this.isExpanded;
    }
  }
}
