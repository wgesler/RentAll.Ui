import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subscription, filter, map, shareReplay, take } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { JwtUser } from '../../../../public/login/models/jwt';
import { AuthService } from '../../../../services/auth.service';
import { CommonService } from '../../../../services/common.service';
import { DailyQuote } from '../../../../shared/models/daily-quote';
import { UserResponse } from '../../../users/models/user.model';
import { UserService } from '../../../users/services/user.service';
import { UserComponent } from '../../../users/user/user.component';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { GlobalOfficeSelectionService } from '../../../organizations/services/global-office-selection.service';
import { SidebarStateService } from '../services/sidebar-state.service';

@Component({
    standalone: true,
    selector: 'app-header',
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
  offices: OfficeResponse[] = [];
  selectedGlobalOfficeId: number | null = null;
  private userDefaultOfficeId: number | null = null;

  // Profile picture properties
  profilePictureUrl: string | null = null;
  private userSubscription?: Subscription;
  private sidebarSubscription?: Subscription;
  private officesSubscription?: Subscription;
  private selectedOfficeSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private breakpointObserver: BreakpointObserver,
    private dialog: MatDialog,
    private userService: UserService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private sidebarStateService: SidebarStateService
  ) { }
  
  ngOnInit(): void {
    // Stay in sync with global office selection (e.g. when app initializes from user default)
    this.selectedOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().subscribe(id => {
      this.selectedGlobalOfficeId = id;
    });
    // Load user profile picture when component initializes
    this.loadUserProfilePicture();
    this.sidebarSubscription = this.sidebarStateService.isExpanded$.subscribe(isExpanded => {
      this.isSidebarExpanded = isExpanded;
    });
    this.loadGlobalOfficeOptions();
  }
  
  ngOnDestroy(): void {
    this.userSubscription?.unsubscribe();
    this.sidebarSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.selectedOfficeSubscription?.unsubscribe();
  }
  
  loadUserProfilePicture(): void {
    const currentUser = this.authService.getUser();
    if (!currentUser?.userId) {
      return;
    }
    
    this.userSubscription = this.userService.getUserByGuid(currentUser.userId).pipe(take(1)).subscribe({
      next: (userResponse: UserResponse) => {
        this.userDefaultOfficeId = userResponse.defaultOfficeId ?? null;
        // Initialize working office from user's default if we have offices
        if (this.offices.length > 0 && this.userDefaultOfficeId !== null) {
          this.globalOfficeSelectionService.syncWithAvailableOffices(this.offices, this.userDefaultOfficeId);
        }
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

  onGlobalOfficeSelect(officeId: number | null): void {
    this.selectedGlobalOfficeId = officeId;
    this.globalOfficeSelectionService.setSelectedOfficeId(officeId);
  }

  stopMenuPropagation(event: Event): void {
    event.stopPropagation();
  }

  getSelectedOfficeName(): string {
    if (this.selectedGlobalOfficeId === null) {
      return 'All Offices';
    }

    return this.offices.find(office => office.officeId === this.selectedGlobalOfficeId)?.name || 'All Offices';
  }

  private loadGlobalOfficeOptions(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription?.unsubscribe();
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = (allOffices || []).filter(office => office.isActive);
        const preferredId = this.userDefaultOfficeId ?? this.authService.getUser()?.defaultOfficeId ?? null;
        this.selectedGlobalOfficeId = this.globalOfficeSelectionService.syncWithAvailableOffices(this.offices, preferredId);
      });
    });
  }
}
