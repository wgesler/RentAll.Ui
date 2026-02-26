import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, forkJoin, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { OrganizationService } from '../../organizations/services/organization.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { getStartupPage, UserGroups } from '../models/user-enums';
import { UserListDisplay, UserResponse } from '../models/user.model';
import { UserService } from '../services/user.service';

@Component({
    selector: 'app-user-list',
    templateUrl: './user-list.component.html',
    styleUrls: ['./user-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class UserListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allUsers: UserListDisplay[] = [];
  usersDisplay: UserListDisplay[] = [];
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  officesSubscription?: Subscription;
  isSuperAdminUser: boolean = false;
  organizations: OrganizationResponse[] = [];
  selectedOrganization: OrganizationResponse | null = null;

  usersDisplayedColumns: ColumnSet = {
    'organizationName': { displayAs: 'Organization', maxWidth: '20ch' },
    'fullName': { displayAs: 'Full Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'phone': { displayAs: 'Phone', maxWidth: '18ch' },
    'startupPageDisplay': { displayAs: 'Startup Page', maxWidth: '20ch' },
    'userGroupsDisplay': { displayAs: 'User Groups', maxWidth: '40ch'},
    'isActive': { displayAs: 'Is Active', isCheckbox: true, maxWidth: '15ch', sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['users', 'organizations', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public userService: UserService,
    private organizationService: OrganizationService,
    private officeService: OfficeService,
    private authService: AuthService,
    public toastr: ToastrService,
    public router: Router,
    private ngZone: NgZone,
    private formatterService: FormatterService,
    public mappingService: MappingService) {
  }

  //#region User-List
  ngOnInit(): void {
    this.isSuperAdminUser = this.hasRole(UserGroups.SuperAdmin);
    this.loadOffices();
    this.getUsers();
  }

  addUser(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, ['new']));
  }

  getUsers(): void {
    forkJoin({
      users: this.userService.getUsers().pipe(take(1)),
      organizations: this.organizationService.getOrganizations().pipe(take(1))
    }).pipe(
      take(1),
      finalize(() => {
        this.removeLoadItem('users');
        this.removeLoadItem('organizations');
      })
    ).subscribe({
      next: ({ users, organizations }) => {
        this.organizations = organizations || [];

        // Create lookup map for organizations
        const orgMap = new Map<string, string>();
        organizations.forEach(org => {
          orgMap.set(org.organizationId, org.name);
        });

        // Map users with organization names
        this.allUsers = users.map<UserListDisplay>((user: UserResponse) => {
          const userGroups = user.userGroups || [];
          const groupLabels: { [key: string]: string } = {
            'SuperAdmin': 'Super Admin',
            'Admin': 'Admin',
            'User': 'User',
            'Unknown': 'Unknown'
          };
          const userGroupsDisplay = userGroups.map(g => groupLabels[g] || g).join(', ');
          return {
            userId: user.userId,
            fullName: user.firstName + ' ' + user.lastName,
            email: user.email,
            phone: this.formatterService.phoneNumber(user.phone || ''),
            organizationName: orgMap.get(user.organizationId) || '',
            officeAccess: (user.officeAccess || []).map(id => Number(id)).filter(id => !isNaN(id)),
            startupPageDisplay: getStartupPage(user.startupPageId),
            userGroups: userGroups,
            userGroupsDisplay: userGroupsDisplay,
            isActive: user.isActive
          };
        });
        this.applyFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.removeLoadItem('users');
        this.removeLoadItem('organizations');
      }
    });
  }

  deleteUser(user: UserListDisplay): void {
    if (confirm(`Are you sure you want to delete ${user.fullName}?`)) {
      this.userService.deleteUser(user.userId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('User deleted successfully', CommonMessage.Success);
          this.getUsers(); // Refresh the list
        },
        error: () => {}
      });
    }
  }
  
  goToUser(event: UserListDisplay): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, [event.userId]));
    });
  }
  //#endregion

  //#region Filter Methods
  applyFilters(): void {
    let filtered = this.showInactive
      ? this.allUsers
      : this.allUsers.filter(user => user.isActive);

    if (this.selectedOffice && !this.isSuperAdminUser) {
      filtered = filtered.filter(user => (user.officeAccess || []).includes(this.selectedOffice!.officeId));
    }

    if (this.isSuperAdminUser && this.selectedOrganization) {
      filtered = filtered.filter(user => user.organizationName === this.selectedOrganization?.name);
    }

    this.usersDisplay = filtered;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  onOfficeChange(): void {
    this.applyFilters();
  }

  onOrganizationChange(): void {
    this.applyFilters();
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = (allOffices || []).filter(office => office.isActive);
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.removeLoadItem('offices');

        if (this.offices.length === 1) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }

        this.applyFilters();
      });
    });
  }
  //#endregion

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  private hasRole(role: UserGroups): boolean {
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

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

