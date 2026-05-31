import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, startWith, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { getNumberQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { UserComponent } from '../user/user.component';
import { UserListComponent } from '../user-list/user-list.component';

@Component({
  standalone: true,
  selector: 'app-users-shell',
  templateUrl: './users-shell.component.html',
  styleUrl: './users-shell.component.scss',
  imports: [CommonModule, MaterialModule, FormsModule, TitleBarSelectComponent, UserListComponent, UserComponent]
})
export class UsersShellComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren(UserListComponent) userSections?: QueryList<UserListComponent>;

  selectedTabIndex = 0;
  showUserForm = false;
  formUserId: string | null = null;
  formTabIndex: number | null = null;
  activeUsersSectionRef?: UserListComponent;
  /** Page-level office filter shared across user tabs (does not write global selection). */
  selectedOfficeId: number | null = null;
  selectedOrganizationId: string | null = null;
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private globalSelectionService: GlobalSelectionService
  ) {}

  ngOnInit(): void {
    const tabIndex = getNumberQueryParam(this.route.snapshot.queryParams, 'tab', 0, 4);
    if (tabIndex !== null) {
      this.selectedTabIndex = tabIndex;
    }
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
  }

  ngAfterViewInit(): void {
    this.userSections?.changes.pipe(startWith(this.userSections), takeUntil(this.destroy$)).subscribe(() => {
      queueMicrotask(() => {
        this.syncActiveSection();
      });
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
    this.showUserForm = false;
    this.formUserId = null;
    this.formTabIndex = null;
    this.updateUrlWithCurrentState();
    queueMicrotask(() => {
      this.syncActiveSection();
    });
  }

  onOpenUser(event: { userId: string; tabIndex?: number }): void {
    this.formUserId = event.userId;
    this.formTabIndex = this.selectedTabIndex;
    this.showUserForm = true;
  }

  onUserClosed(event: { saved?: boolean; userId?: string }): void {
    this.showUserForm = false;
    this.formUserId = null;
    this.formTabIndex = null;
    if (event.saved) {
      queueMicrotask(() => this.getActiveSection()?.loadUsers());
    }
  }

  onUserFormBack(): void {
    this.onUserClosed({});
  }

  onOrganizationDropdownChange(value: string | number | null): void {
    this.selectedOrganizationId = value == null || value === '' ? null : String(value);
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
  }

  getActiveSection(): UserListComponent | undefined {
    const sections = this.userSections?.toArray() || [];
    return sections.find(section => section.tabIndex === this.selectedTabIndex);
  }

  syncActiveSection(): void {
    this.activeUsersSectionRef = this.getActiveSection();
    this.activeUsersSectionRef?.setSelectedTabIndex(this.selectedTabIndex);
  }

  updateUrlWithCurrentState(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.selectedTabIndex.toString() },
      queryParamsHandling: 'merge'
    });
  }

  isActiveUserFormVisible(): boolean {
    return this.showUserForm && this.formTabIndex === this.selectedTabIndex;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
