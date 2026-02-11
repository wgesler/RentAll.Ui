import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { Observable, map, shareReplay, take, Subscription } from 'rxjs';
import { JwtUser } from '../../../../public/login/models/jwt';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonService } from '../../../../services/common.service';
import { DailyQuote } from '../../../../shared/models/daily-quote';
import { MatDialog } from '@angular/material/dialog';
import { UserComponent } from '../../../users/user/user.component';
import { UserService } from '../../../users/services/user.service';
import { UserResponse } from '../../../users/models/user.model';
import { SidebarStateService } from '../services/sidebar-state.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})

export class HeaderComponent implements OnInit, OnDestroy {
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  user: JwtUser = this.authService.getUser();
  dailyQuote: Observable<DailyQuote> = this.commonService.getDailyQuote();
  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.XSmall).pipe( map(result => result.matches), shareReplay() );
  isMobile: boolean = false;
  isSidebarExpanded = true;
  
  // Profile picture properties
  profilePictureUrl: string | null = null;
  private userSubscription?: Subscription;
  private sidebarSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private breakpointObserver: BreakpointObserver,
    private dialog: MatDialog,
    private userService: UserService,
    private sidebarStateService: SidebarStateService
  ) { }
  
  ngOnInit(): void {
    // Load user profile picture when component initializes
    this.loadUserProfilePicture();
    this.sidebarSubscription = this.sidebarStateService.isExpanded$.subscribe(isExpanded => {
      this.isSidebarExpanded = isExpanded;
    });
  }
  
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.sidebarSubscription?.unsubscribe();
  }
  
  loadUserProfilePicture(): void {
    const currentUser = this.authService.getUser();
    if (!currentUser?.userId) {
      return;
    }
    
    this.userSubscription = this.userService.getUserByGuid(currentUser.userId).pipe(take(1)).subscribe({
      next: (userResponse: UserResponse) => {
        // Set profile picture URL from fileDetails or profilePath
        if (userResponse.fileDetails && userResponse.fileDetails.file) {
          // Construct data URL from fileDetails
          const contentType = userResponse.fileDetails.contentType || 'image/png';
          this.profilePictureUrl = `data:${contentType};base64,${userResponse.fileDetails.file}`;
        } else if (userResponse.profilePath) {
          this.profilePictureUrl = userResponse.profilePath;
        } else {
          this.profilePictureUrl = null;
        }
      },
      error: () => {
        // Silently fail - just don't show profile picture
        this.profilePictureUrl = null;
      }
    });
  }
  
  logout(): void {
    this.authService.logout();
  }

  openUserDialog(): void {
    if (!this.user?.userId) {
      return;
    }

    const dialogRef = this.dialog.open(UserComponent, {
      width: '90%',
      maxWidth: '800px',
      maxHeight: '90vh',
      data: {
        userId: this.user.userId,
        isDialog: true,
        selfEdit: true
      }
    });
    
    // Reload profile picture when dialog closes (in case user updated it)
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        // User saved changes, reload profile picture
        this.loadUserProfilePicture();
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarStateService.requestToggle();
  }
}
