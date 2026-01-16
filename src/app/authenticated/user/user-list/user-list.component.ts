import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { UserResponse, UserListDisplay } from '../models/user.model';
import { UserGroups } from '../models/user-type';
import { UserService } from '../services/user.service';
import { OrganizationService } from '../../organization/services/organization.service';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, forkJoin, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class UserListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allUsers: UserListDisplay[] = [];
  usersDisplay: UserListDisplay[] = [];

  usersDisplayedColumns: ColumnSet = {
    'organizationName': { displayAs: 'Organization', maxWidth: '20ch' },
    'fullName': { displayAs: 'Full Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'userGroupsDisplay': { displayAs: 'User Groups', maxWidth: '30ch'},
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['users', 'organizations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public userService: UserService,
    private organizationService: OrganizationService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService) {
  }

  //#region User-List
  ngOnInit(): void {
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
            organizationName: orgMap.get(user.organizationId) || '',
            userGroups: userGroups,
            userGroupsDisplay: userGroupsDisplay,
            isActive: user.isActive
          };
        });
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Users', CommonMessage.ServiceError);
        }
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
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete user. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete user', CommonMessage.Error);
          }
        }
      });
    }
  }
  
  goToUser(event: UserListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, [event.userId]));
  }
  //#endregion

  //#region Filter Methods
  applyFilters(): void {
    this.usersDisplay = this.showInactive
      ? this.allUsers
      : this.allUsers.filter(user => user.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
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

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

