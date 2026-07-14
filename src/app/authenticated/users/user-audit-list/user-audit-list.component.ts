import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { UserActivityResponse, UserAuditListDisplay } from '../models/user.model';
import { UserService } from '../services/user.service';

@Component({
  standalone: true,
  selector: 'app-user-audit-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './user-audit-list.component.html',
  styleUrl: './user-audit-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserAuditListComponent implements OnInit, OnDestroy {
  private userService = inject(UserService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);
  private dialogRef = inject<MatDialogRef<UserAuditListComponent>>(MatDialogRef);

  isServiceError = false;
  isPageReady = false;
  userActivity: UserActivityResponse[] = [];
  userActivityDisplay: UserAuditListDisplay[] = [];

  userAuditDisplayedColumns: ColumnSet = {
    'fullName': { displayAs: 'Full Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'isLoggedInDisplay': { displayAs: 'Logged In', maxWidth: '12ch', alignment: 'center' },
    'lastLoginOnDisplay': { displayAs: 'Last Login', maxWidth: '22ch' },
    'lastSeenOnDisplay': { displayAs: 'Last Seen', maxWidth: '22ch' },
    'lastLogoutOnDisplay': { displayAs: 'Last Logout', maxWidth: '22ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['userActivity']));
  destroy$ = new Subject<void>();

  //#region Lifecycle
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.loadUserActivity();
  }
  //#endregion

  //#region Data Loading
  loadUserActivity(): void {
    if (!this.itemsToLoad$.value.has('userActivity')) {
      return;
    }

    this.userService.getUserActivity().pipe(take(1),finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'userActivity'))).subscribe({
      next: (rows: UserActivityResponse[]) => {
        this.isServiceError = false;
        this.userActivity = (rows || []).filter(row =>
          row.isLoggedIn === true || !!String(row.lastLoginOn || '').trim()
        );
        this.userActivityDisplay = this.mapUserAuditRows(this.userActivity);
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.userActivity = [];
        this.userActivityDisplay = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Mapping
  mapUserAuditRows(rows: UserActivityResponse[]): UserAuditListDisplay[] {
    return (rows || []).map(row => ({
      userId: row.userId,
      fullName: row.fullName || '',
      email: row.email || '',
      isActive: row.isActive === true,
      isLoggedIn: row.isLoggedIn === true,
      isLoggedInDisplay: row.isLoggedIn ? 'Yes' : 'No',
      lastLoginOnDisplay: this.formatAuditDate(row.lastLoginOn),
      lastSeenOnDisplay: this.formatAuditDate(row.lastSeenOn),
      lastLogoutOnDisplay: this.formatAuditDate(row.lastLogoutOn)
    }));
  }

  formatAuditDate(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      return '';
    }
    return parsed.toLocaleString();
  }
  //#endregion

  //#region Utility
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
