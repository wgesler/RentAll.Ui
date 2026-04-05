import { CommonModule } from "@angular/common";
import { Component, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, skip, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { OrganizationService } from '../../organizations/services/organization.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { EMPLOYEE_USER_GROUPS, getStartupPage, UserGroups } from '../models/user-enums';
import { UserListDisplay, UserRequest, UserResponse } from '../models/user.model';
import { UserService } from '../services/user.service';

@Component({
    standalone: true,
    selector: 'app-user-list',
    templateUrl: './user-list.component.html',
    styleUrls: ['./user-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, TitlebarSelectComponent, DataTableComponent]
})

export class UserListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() tabIndex?: number;
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  selectedTabIndex: number = 0;
  user: any;
  isAdmin = false;
  canEditIsActiveCheckbox = false;
  allUsers: UserListDisplay[] = [];
  usersDisplay: UserListDisplay[] = [];
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  isSuperAdminUser: boolean = false;
  organizations: OrganizationResponse[] = [];
  selectedOrganization: OrganizationResponse | null = null;
  users: UserResponse[] = [];
  officeScopeResolved: boolean = false;
  usersDisplayedColumns: ColumnSet = {
    'organizationName': { displayAs: 'Organization', maxWidth: '20ch' },
    'fullName': { displayAs: 'Full Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'startupPageDisplay': { displayAs: 'Startup Page', maxWidth: '15ch' },
    'defaultOffice': { displayAs: 'Default Office', maxWidth: '20ch' },
    'userGroupsDisplay': { displayAs: 'User Groups', maxWidth: '30ch'},
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['users', 'organizations', 'offices', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public userService: UserService,
    private organizationService: OrganizationService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private authService: AuthService,
    public toastr: ToastrService,
    public router: Router,
    private ngZone: NgZone,
    private formatterService: FormatterService,
    public mappingService: MappingService,
    private utilityService: UtilityService) {
  }

  //#region User-List
  ngOnInit(): void {
    if (this.tabIndex !== undefined && this.tabIndex !== null) {
      this.selectedTabIndex = this.tabIndex;
    }

    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.isSuperAdminUser = this.hasRole(UserGroups.SuperAdmin);
    this.loadOffices();
    this.loadUsers();
    this.loadOrganizations();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabIndex']) {
      const newTabIndex = changes['tabIndex'].currentValue;
      if (newTabIndex !== undefined && newTabIndex !== null) {
        this.setSelectedTabIndex(newTabIndex);
      }
    }
  }

  addUser(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, ['new']));
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
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, [event.userId]));
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

    this.userService.getUserByGuid(event.userId).pipe(
      take(1),
      finalize(() => this.applyFilters())
    ).subscribe({
      next: (user: UserResponse) => {
        const request = this.buildUserIsActiveUpdateRequest(user, nextValue);
        this.userService.updateUser(request).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success('User updated.', CommonMessage.Success);
          },
          error: () => {
            this.applyUserIsActiveValue(event.userId, previousValue);
            this.toastr.error('Unable to update user.', CommonMessage.Error);
          }
        });
      },
      error: () => {
        this.applyUserIsActiveValue(event.userId, previousValue);
        this.toastr.error('Unable to update user.', CommonMessage.Error);
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
      ? this.allUsers
      : this.allUsers.filter(user => user.isActive);

    if (this.selectedOffice && !this.isSuperAdminUser) {
      filtered = filtered.filter(user => (user.officeAccess || []).includes(this.selectedOffice!.officeId));
    }

    if (this.isSuperAdminUser && this.selectedOrganization) {
      filtered = filtered.filter(user => user.organizationName === this.selectedOrganization?.name);
    }

    const tabPredicates: Array<(user: UserListDisplay) => boolean> = [
      (user) => this.hasAnyUserGroup(user, EMPLOYEE_USER_GROUPS),
      (user) => this.hasUserGroup(user, UserGroups.Owner),
      (user) => this.hasUserGroup(user, UserGroups.Housekeeping),
      (user) => this.hasUserGroup(user, UserGroups.Inspector),
      (user) => this.hasUserGroup(user, UserGroups.Vendor)
    ];
    const selectedTabPredicate = tabPredicates[this.selectedTabIndex] ?? tabPredicates[0];
    filtered = filtered.filter(selectedTabPredicate);

    this.usersDisplay = filtered;
  }

  onTabChange(event: { index: number }): void {
    this.selectedTabIndex = event.index;
    this.applyFilters();
  }

  setSelectedTabIndex(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
    this.applyFilters();
  }

  onInactiveChange(checked: boolean): void {
    this.showInactive = checked;
    this.applyFilters();
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    this.applyFilters();
  }

  onOrganizationChange(): void {
    this.applyFilters();
  }

  get organizationOptions(): { value: string, label: string }[] {
    return this.organizations.map(organization => ({
      value: organization.organizationId,
      label: organization.name
    }));
  }

  get selectedOrganizationId(): string | null {
    return this.selectedOrganization?.organizationId ?? null;
  }

  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get selectedOfficeId(): number | null {
    return this.selectedOffice?.officeId ?? null;
  }

  onOrganizationDropdownChange(value: string | number | null): void {
    const organizationId = value == null || value === '' ? null : String(value);
    this.selectedOrganization = organizationId
      ? this.organizations.find(organization => organization.organizationId === organizationId) || null
      : null;
    this.onOrganizationChange();
  }

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.selectedOffice = officeId == null
      ? null
      : this.offices.find(office => office.officeId === officeId) || null;
    this.onOfficeChange();
  }
  //#endregion

  //#region Data Loading Methods
  loadUsers(): void {
    this.userService.getUsers().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'users'); })).subscribe({
      next: (users: UserResponse[]) => {
        this.users = users || [];
        this.rebuildUsersDisplay();
      },
      error: () => {
        this.isServiceError = true;
        this.users = [];
        this.allUsers = [];
        this.usersDisplay = [];
      }
    });
  }

  loadOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'); })).subscribe({
      next: (organizations: OrganizationResponse[]) => {
        this.organizations = organizations || [];
        this.rebuildUsersDisplay();
      },
      error: () => {
        this.isServiceError = true;
        this.organizations = [];
        this.rebuildUsersDisplay();
      }
    });
  }

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: allOffices => {
          this.offices = (allOffices || []).filter(office => office.isActive);
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');

          this.showOfficeDropdown = this.offices.length !== 1;
          this.resolveOfficeScope(this.globalOfficeSelectionService.getSelectedOfficeIdValue());
        },
        error: () => {
          this.offices = [];
          this.availableOffices = [];
          this.showOfficeDropdown = true;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
          this.resolveOfficeScope(null);
        }
      });
    });
  }
  //#endregion

  //#region Utility Methods
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

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.usersDisplayedColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
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

    this.allUsers = this.users.map<UserListDisplay>((user: UserResponse) => {
      const userGroups = user.userGroups || [];
      const userGroupsDisplay = userGroups.map(g => groupLabels[g] || g).join(', ');
      return {
        userId: user.userId,
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
        isActive: user.isActive
      };
    });

    this.applyFilters();
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

  hasUserGroup(user: UserListDisplay, group: UserGroups): boolean {
    const groups = user.userGroups || [];
    const targetGroup = UserGroups[group];
    return groups.some(userGroup => String(userGroup) === targetGroup);
  }

  hasAnyUserGroup(user: UserListDisplay, groups: UserGroups[]): boolean {
    return groups.some(group => this.hasUserGroup(user, group));
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

