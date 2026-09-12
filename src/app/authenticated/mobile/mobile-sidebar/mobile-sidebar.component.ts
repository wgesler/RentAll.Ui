import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatSidenav } from '@angular/material/sidenav';
import { Subject, filter, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { SidebarStateService } from '../../shared/layout/services/sidebar-state.service';
import { MobileChromeOverlayService } from '../mobile-chrome-overlay.service';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { isInspectorOnlyUser } from '../../shared/access/role-access';
import { MobileNavItem, MobileNavTab, getMobileLeadsTabs, getMobileNavItem, getMobileNavItems, getMobilePrimaryLink, getMobileRouteParts, getMobileTicketTabs } from '../mobile-nav';
import { OrganizationFeatureService } from '../../organizations/services/organization-feature.service';
import { MobileReceiptCaptureService } from '../mobile-receipt-capture.service';

@Component({
  standalone: true,
  selector: 'app-mobile-sidebar',
  imports: [MaterialModule, RouterOutlet, RouterLink],
  templateUrl: './mobile-sidebar.component.html',
  styleUrl: './mobile-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileSidebarComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private commonService = inject(CommonService);
  private organizationFeatureService = inject(OrganizationFeatureService);
  private sidebarStateService = inject(SidebarStateService);
  private mobileChromeOverlayService = inject(MobileChromeOverlayService);
  private cdr = inject(ChangeDetectorRef);
  private mobileReceiptCaptureService = inject(MobileReceiptCaptureService);
  readonly collapsedSidebarWidth = 64;
  @ViewChild('sideNav') sideNav: MatSidenav;
  navItems: MobileNavItem[] = [];
  selectedItem: MobileNavItem | null = null;
  selectedTabPath: string | null = null;
  menuNavItem: MobileNavItem | null = null;
  isAdmin = false;
  isOwnerAdmin = false;
  destroy$ = new Subject<void>();

  //#region Mobile-Sidebar
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.filterNavItems();
    this.syncFromUrl();
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntil(this.destroy$)).subscribe(() => {
      this.syncFromUrl();
    });
    this.sidebarStateService.toggleRequest$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.mobileChromeOverlayService.isPrimaryChromeHidden) {
        return;
      }
      this.sideNav?.toggle();
    });
    this.mobileChromeOverlayService.primaryChromeHidden$.pipe(takeUntil(this.destroy$)).subscribe(hidden => {
      if (hidden) {
        this.sideNav?.close();
      }
      this.cdr.markForCheck();
    });
    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isAdmin = this.authService.isAdmin();
      this.isOwnerAdmin = this.authService.isOwnerAdmin();
      this.filterNavItems();
      this.markViewForCheck();
    });
    this.organizationFeatureService.getAllFeatures().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItems();
      this.markViewForCheck();
    });
    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.filterNavItems();
      this.markViewForCheck();
    });
    this.mobileReceiptCaptureService.captureInProgress$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.markViewForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getPrimaryLink(item: MobileNavItem): string {
    return getMobilePrimaryLink(item);
  }

  onNavItemClick(): void {
    this.sideNav?.close();
  }

  onMenuItemClick(navItem: MobileNavItem): void {
    this.menuNavItem = navItem;
    this.markViewForCheck();
  }

  onTabSelect(tab: MobileNavTab): void {
    if (!this.menuNavItem) {
      return;
    }
    this.router.navigate(['/mobile', this.menuNavItem.path, tab.path]);
    this.sideNav?.close();
  }

  showReceiptCaptureBlockAfter(navItem: MobileNavItem): boolean {
    if (!this.navItems.some(item => item.path === 'maintenance')) {
      return false;
    }
    if (this.navItems.some(item => item.path === 'contacts')) {
      return navItem.path === 'contacts';
    }
    return navItem.path === 'maintenance';
  }

  openCameraCapture(fileInput: HTMLInputElement): void {
    this.mobileReceiptCaptureService.openCameraPicker(fileInput);
    this.sideNav?.close();
  }

  openUploadCapture(fileInput: HTMLInputElement): void {
    this.mobileReceiptCaptureService.openUploadPicker(fileInput);
    this.sideNav?.close();
  }

  onReceiptCaptureSelected(event: Event): void {
    void this.mobileReceiptCaptureService.handleReceiptFileSelected(event).finally(() => {
      this.markViewForCheck();
    });
    this.markViewForCheck();
  }

  isReceiptCaptureInProgress(): boolean {
    return this.mobileReceiptCaptureService.isCaptureInProgress;
  }

  isTabSelected(tab: MobileNavTab): boolean {
    return this.selectedItem?.path === this.menuNavItem?.path && this.selectedTabPath === tab.path;
  }

  getMenuTabs(): MobileNavTab[] {
    if (this.menuNavItem?.path === 'tickets') {
      return getMobileTicketTabs(this.isAdmin);
    }
    if (this.menuNavItem?.path === 'leads') {
      return getMobileLeadsTabs(this.isOwnerAdmin);
    }
    if (this.menuNavItem?.path === 'maintenance' && this.isInspectorView()) {
      return (this.menuNavItem.tabs ?? []).filter(tab => tab.path !== 'work-orders');
    }
    return this.menuNavItem?.tabs ?? [];
  }

  isInspectorView(): boolean {
    return isInspectorOnlyUser(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
  }

  filterNavItems(): void {
    this.navItems = getMobileNavItems(this.authService, this.commonService.getOrganizationTypeId());
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Utility Methods
  syncFromUrl(): void {
    const parts = getMobileRouteParts(this.router.url);
    this.selectedItem = getMobileNavItem(parts.sectionPath);
    this.selectedTabPath = parts.tabPath;
    this.markViewForCheck();
  }
  //#endregion
}
