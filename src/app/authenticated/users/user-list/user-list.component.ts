import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, finalize, take, takeUntil} from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { OrganizationService } from '../../organizations/services/organization.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { hasCompanyRole, hasHousekeepingRole, hasInspectorRole, hasOwnerRole, hasVendorRole } from '../../shared/access/role-access';
import { getStartupPage, UserGroups } from '../models/user-enums';
import { UserListDisplay, UserRequest, UserResponse } from '../models/user.model';
import { UserService } from '../services/user.service';

@Component({
    standalone: true,
    selector: 'app-user-list',
    templateUrl: './user-list.component.html',
    styleUrls: ['./user-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class UserListComponent implements OnInit, OnDestroy, OnChanges {

  @Input() tabIndex?: number;
  @Input() officeId: number | null = null;
  @Input() selectedOrganizationId: string | null = null;
  @Output() openUser = new EventEmitter<{ userId: string; tabIndex?: number }>();
  userService = inject(UserService);
  private organizationService = inject(OrganizationService);
  private officeService = inject(OfficeService);
  private authService = inject(AuthService);
  toastr = inject(ToastrService);
  private formatterService = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  isServiceError: boolean = false;
  showInactive: boolean = false;
  selectedTabIndex: number = 0;
  user: any;
  isAdmin = false;
  canEditIsActiveCheckbox = false;
  allUsers: UserListDisplay[] = [];
  usersDisplay: UserListDisplay[] = [];
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  isSuperAdminUser: boolean = false;
  organizations: OrganizationResponse[] = [];
  selectedOrganization: OrganizationResponse | null = null;
  users: UserResponse[] = [];
  officeScopeResolved: boolean = false;
  organizationId = '';
  usersDisplayedColumns: ColumnSet = {
    'organizationName': { displayAs: 'Organization', maxWidth: '20ch' },
    'fullName': { displayAs: 'Full Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'startupPageDisplay': { displayAs: 'Startup Page', maxWidth: '15ch' },
    'defaultOffice': { displayAs: 'Default Office', maxWidth: '20ch' },
    'userGroupsDisplay': { displayAs: 'User Groups', maxWidth: '30ch'},
    'isLoggedInDisplay': { displayAs: 'Logged In', maxWidth: '12ch' },
    'lastLoginOnDisplay': { displayAs: 'Last Login', maxWidth: '20ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['users', 'organizations', 'offices', 'officeScope']));
  destroy$ = new Subject<void>();

  //#region User-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    if (this.tabIndex !== undefined && this.tabIndex !== null) {
      this.selectedTabIndex = this.tabIndex;
    }

    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.isSuperAdminUser = this.hasRole(UserGroups.SuperAdmin);
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.loadUsers();
    this.loadOrganizations();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabIndex']) {
      const newTabIndex = changes['tabIndex'].currentValue;
      if (newTabIndex !== undefined && newTabIndex !== null) {
        this.setSelectedTabIndex(newTabIndex);
      }
    }

    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue as number | null;
      const previousOfficeId = changes['officeId'].previousValue as number | null | undefined;
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.resolveOfficeScope(newOfficeId);
        }
        this.markViewForCheck();
      }
    }

    if (changes['selectedOrganizationId']) {
      this.applyOrganizationFromInput();
      this.markViewForCheck();
    }
  }

  addUser(): void {
    this.openUser.emit({
      userId: 'new',
      tabIndex: this.selectedTabIndex
    });
  }

  deleteUser(user: UserListDisplay): void {
    this.userService.deleteUser(user.userId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('User deleted successfully', CommonMessage.Success);
        this.utilityService.addLoadItem(this.itemsToLoad$, 'users');
        this.loadUsers();
      },
      error: () => {}
    });
  }
  
  goToUser(event: UserListDisplay): void {
    const userId = (event.userId || '').trim();
    if (!userId) {
      this.toastr.error('Unable to open user: missing user ID.', CommonMessage.Error);
      return;
    }
    this.openUser.emit({
      userId,
      tabIndex: this.selectedTabIndex
    });
  }

  onUserCheckboxChange(event: UserListDisplay): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as any)?.__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as any)?.__previousCheckboxValue === true;
    const nextValue = (event as any)?.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyUserIsActiveValue(event.userId, nextValue);

    this.userService.getUserByGuid(event.userId).pipe(take(1), finalize(() => {
      this.applyFilters();
      this.markViewForCheck();
    })).subscribe({
      next: (user: UserResponse) => {
        const request = this.buildUserIsActiveUpdateRequest(user, nextValue);
        this.userService.updateUser(request).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('User updated.', CommonMessage.Success);
          },
          error: () => {
            this.applyUserIsActiveValue(event.userId, previousValue);
            this.toastr.error('Unable to update user.', CommonMessage.Error);
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.applyUserIsActiveValue(event.userId, previousValue);
        this.toastr.error('Unable to update user.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.showInactive
      ? this.allUsers.filter(user => user.isActive === false)
      : this.allUsers.filter(user => user.isActive === true);

    if (this.selectedOffice && !this.isSuperAdminUser) {
      filtered = filtered.filter(user => (user.officeAccess || []).includes(this.selectedOffice!.officeId));
    }

    if (this.isSuperAdminUser && this.selectedOrganization) {
      filtered = filtered.filter(user => user.organizationName === this.selectedOrganization?.name);
    }

    const tabPredicates: Array<(user: UserListDisplay) => boolean> = [
      (user) => hasCompanyRole(user.userGroups),
      (user) => hasOwnerRole(user.userGroups),
      (user) => hasHousekeepingRole(user.userGroups),
      (user) => hasInspectorRole(user.userGroups),
      (user) => hasVendorRole(user.userGroups)
    ];
    const selectedTabPredicate = tabPredicates[this.selectedTabIndex] ?? tabPredicates[0];
    filtered = filtered.filter(selectedTabPredicate);

    this.usersDisplay = filtered;
  }

  setSelectedTabIndex(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
    this.applyFilters();
  }

  onInactiveChange(checked: boolean): void {
    this.showInactive = checked;
    this.applyFilters();
  }

  private applyOrganizationFromInput(): void {
    this.selectedOrganization = this.selectedOrganizationId
      ? this.organizations.find(organization => organization.organizationId === this.selectedOrganizationId) || null
      : null;
    if (this.officeScopeResolved) {
      this.applyFilters();
    }
  }

  get organizationOptions(): { value: string, label: string }[] {
    return this.organizations.map(organization => ({
      value: organization.organizationId,
      label: organization.name
    }));
  }

  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  getDefaultOfficeName(defaultOfficeId: number | null): string {
    if (defaultOfficeId === null || defaultOfficeId === undefined) {
      return '';
    }
    const office = this.offices.find(o => o.officeId === Number(defaultOfficeId));
    return office?.name || String(defaultOfficeId);
  }

  refreshDefaultOfficeDisplay(): void {
    if (!this.allUsers?.length) {
      return;
    }

    this.allUsers = this.allUsers.map(user => ({
      ...user,
      defaultOffice: this.getDefaultOfficeName(user.defaultOfficeId ?? null)
    }));
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.refreshDefaultOfficeDisplay();
    this.applyFilters();
  }
  //#endregion

  //#region Data Loading Methods
  loadUsers(): void {
    this.userService.getUsers().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users'); })).subscribe({
      next: (users: UserResponse[]) => {
        this.users = users || [];
        this.rebuildUsersDisplay();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.users = [];
        this.allUsers = [];
        this.usersDisplay = [];
        this.markViewForCheck();
      }
    });
  }

  loadOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'); })).subscribe({
      next: (organizations: OrganizationResponse[]) => {
        this.organizations = organizations || [];
        this.applyOrganizationFromInput();
        this.rebuildUsersDisplay();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.organizations = [];
        this.rebuildUsersDisplay();
        this.markViewForCheck();
      }
    });
  }

  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(allOffices => {
          this.offices = (allOffices || []).filter(office => office.isActive);
          this.showOfficeDropdown = this.offices.length > 1;
          this.resolveOfficeScope(this.officeId);
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.showOfficeDropdown = false;
        this.resolveOfficeScope(null);
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region IsActive Support Methods
  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.usersDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }
  
  buildUserIsActiveUpdateRequest(user: UserResponse, isActive: boolean): UserRequest {
    const { organizationName: _organizationName, ...requestBase } = user;
    return {
      ...requestBase,
      isActive
    };
  }

  applyUserIsActiveValue(userId: string, isActive: boolean): void {
    for (const user of this.users) {
      if (user.userId === userId) {
        user.isActive = isActive;
        break;
      }
    }
    for (const user of this.allUsers) {
      if (user.userId === userId) {
        user.isActive = isActive;
        break;
      }
    }
    this.applyFilters();
  }
  //#endregion

  //#region Role Methods
  hasRole(role: UserGroups): boolean {
    const userGroups = this.authService.getUser()?.userGroups || [];
    if (!userGroups.length) {
      return false;
    }

    return userGroups.some(group => {
      if (typeof group === 'string') {
        if (group === UserGroups[role]) {
          return true;
        }

        const groupAsNumber = Number(group);
        return !isNaN(groupAsNumber) && groupAsNumber === role;
      }

      return typeof group === 'number' && group === role;
    });
  }

  rebuildUsersDisplay(): void {
    const orgMap = new Map<string, string>();
    this.organizations.forEach(org => {
      orgMap.set(org.organizationId, org.name);
    });

    const groupLabels: { [key: string]: string } = {
      'SuperAdmin': 'Super Admin',
      'Admin': 'Admin',
      'User': 'User',
      'Unknown': 'Unknown'
    };

    this.allUsers = this.users.map((user: UserResponse): UserListDisplay | null => {
      const userId = (user.userId || '').trim();
      if (!userId) {
        return null;
      }
      const userGroups = user.userGroups || [];
      const userGroupsDisplay = userGroups.map(g => groupLabels[g] || g).join(', ');
      const lastLoginOn = user.lastLoginOn ? new Date(user.lastLoginOn) : null;
      return {
        userId,
        fullName: user.firstName + ' ' + user.lastName,
        email: user.email,
        phone: this.formatterService.phoneNumber(user.phone || ''),
        organizationName: orgMap.get(user.organizationId) || '',
        officeAccess: (user.officeAccess || []).map(id => Number(id)).filter(id => !isNaN(id)),
        startupPageDisplay: getStartupPage(user.startupPageId),
        defaultOfficeId: user.defaultOfficeId ?? null,
        defaultOffice: this.getDefaultOfficeName(user.defaultOfficeId),
        userGroups: userGroups,
        userGroupsDisplay: userGroupsDisplay,
        isLoggedInDisplay: user.isLoggedIn ? 'Yes' : 'No',
        lastLoginOnDisplay: lastLoginOn ? lastLoginOn.toLocaleString() : '',
        isActive: user.isActive
      };
    }).filter((user): user is UserListDisplay => user !== null);

    this.applyFilters();
  }

  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }  
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

