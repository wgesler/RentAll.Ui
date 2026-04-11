import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, startWith } from 'rxjs';
import { MaterialModule } from '../../../material.module';
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
  sectionsSubscription?: Subscription;

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const tabIndex = getNumberQueryParam(this.route.snapshot.queryParams, 'tab', 0, 4);
    if (tabIndex !== null) {
      this.selectedTabIndex = tabIndex;
    }
  }

  ngAfterViewInit(): void {
    this.sectionsSubscription = this.userSections?.changes.pipe(startWith(this.userSections)).subscribe(() => {
      queueMicrotask(() => {
        this.syncActiveSection();
      });
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
    this.updateUrlWithCurrentState();
    queueMicrotask(() => {
      this.syncActiveSection();
    });
  }

  onOpenUser(event: { userId: string; tabIndex?: number }): void {
    this.formUserId = event.userId;
    this.formTabIndex = event.tabIndex ?? this.selectedTabIndex;
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

  onOrganizationDropdownChange(value: string | number | null): void {
    this.getActiveSection()?.onOrganizationDropdownChange(value);
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.getActiveSection()?.onOfficeDropdownChange(value);
  }

  get activeUsersSection(): UserListComponent | undefined {
    return this.activeUsersSectionRef;
  }

  getActiveSection(): UserListComponent | undefined {
    const sections = this.userSections?.toArray() || [];
    return sections[this.selectedTabIndex];
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

  ngOnDestroy(): void {
    this.sectionsSubscription?.unsubscribe();
  }
}
