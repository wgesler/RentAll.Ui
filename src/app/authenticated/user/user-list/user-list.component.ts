import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { UserResponse, UserListDisplay } from '../models/user.model';
import { UserGroups } from '../models/user-type';
import { UserService } from '../services/user.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
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

export class UserListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  usersDisplayedColumns: ColumnSet = {
    'fullName': { displayAs: 'Full Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '25ch' },
    'userGroupsDisplay': { displayAs: 'User Groups' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allUsers: UserListDisplay[] = [];
  usersDisplay: UserListDisplay[] = [];

  constructor(
    public userService: UserService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('users');
  }

  ngOnInit(): void {
    this.getUsers();
  }

  addUser(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, ['new']));
  }

  getUsers(): void {
    this.userService.getUsers().pipe(take(1), finalize(() => { this.removeLoadItem('users') })).subscribe({
      next: (response: UserResponse[]) => {
        this.allUsers = this.mappingService.mapUsers(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Users', CommonMessage.ServiceError);
        }
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


  // Utility Methods
  applyFilters(): void {
    this.usersDisplay = this.showInactive
      ? this.allUsers
      : this.allUsers.filter(user => user.isActive);
  }
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  goToUser(event: UserListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.User, [event.userId]));
  }
    removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

