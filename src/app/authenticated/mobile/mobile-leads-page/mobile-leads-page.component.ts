import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OrganizationFeatureService } from '../../organizations/services/organization-feature.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { canShowLeadsNav } from '../../shared/access/role-access';
import { MobileLeadDetailComponent } from '../mobile-lead-detail/mobile-lead-detail.component';
import { MobileLeadsListComponent } from '../mobile-leads-list/mobile-leads-list.component';
import {
  MobileNavTab,
  getMobileLeadsTab,
  getMobileLeadsTabs,
  getMobileRouteParts
} from '../mobile-nav';

@Component({
  standalone: true,
  selector: 'app-mobile-leads-page',
  imports: [MaterialModule, MobileLeadsListComponent, MobileLeadDetailComponent],
  templateUrl: './mobile-leads-page.component.html',
  styleUrl: './mobile-leads-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileLeadsPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private organizationFeatureService = inject(OrganizationFeatureService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  tab: MobileNavTab | null = null;
  titleTabs: MobileNavTab[] = [];
  detailId = '';
  selectedOfficeId: number | null = null;
  isOwnerAdmin = false;

  ngOnInit(): void {
    this.isOwnerAdmin = this.authService.isOwnerAdmin();
    this.enforceAccess();
    this.syncFromUrl();

    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.selectedOfficeId = officeId;
      this.markViewForCheck();
    });

    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntil(this.destroy$)).subscribe(() => {
      this.syncFromUrl();
    });

    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isOwnerAdmin = this.authService.isOwnerAdmin();
      this.enforceAccess();
      this.markViewForCheck();
    });

    this.organizationFeatureService.getAllFeatures().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.enforceAccess();
      this.markViewForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onTitleTabSelect(menuTab: MobileNavTab): void {
    void this.router.navigate(['/mobile', 'leads', menuTab.path]);
  }

  isTitleTabSelected(menuTab: MobileNavTab): boolean {
    return this.tab?.path === menuTab.path;
  }

  backToList(): void {
    if (!this.tab?.path) {
      void this.router.navigate(['/mobile', 'leads', 'rentals']);
      return;
    }
    void this.router.navigate(['/mobile', 'leads', this.tab.path]);
  }

  onLeadSaved(): void {
    this.backToList();
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  private enforceAccess(): void {
    if (!canShowLeadsNav(this.authService)) {
      void this.router.navigate(['/mobile', 'home']);
    }
  }

  private syncFromUrl(): void {
    if (!canShowLeadsNav(this.authService)) {
      return;
    }

    const parts = getMobileRouteParts(this.router.url);
    this.titleTabs = getMobileLeadsTabs(this.isOwnerAdmin);
    this.tab = getMobileLeadsTab(parts.tabPath, this.isOwnerAdmin);
    this.detailId = parts.id;

    if (parts.tabPath === 'owners' && !this.isOwnerAdmin) {
      void this.router.navigate(['/mobile', 'leads', 'rentals']);
      return;
    }

    if (parts.tabPath && !this.tab) {
      void this.router.navigate(['/mobile', 'leads', 'rentals']);
      return;
    }

    this.markViewForCheck();
  }
}
