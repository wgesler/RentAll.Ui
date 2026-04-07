import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../../material.module';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { UserListComponent } from '../user-list/user-list.component';

@Component({
  standalone: true,
  selector: 'app-users-shell',
  templateUrl: './users-shell.component.html',
  styleUrl: './users-shell.component.scss',
  imports: [CommonModule, MaterialModule, FormsModule, TitleBarSelectComponent, UserListComponent]
})
export class UsersShellComponent implements AfterViewInit {
  @ViewChildren(UserListComponent) userSections?: QueryList<UserListComponent>;

  selectedTabIndex = 0;

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      this.getActiveSection()?.setSelectedTabIndex(this.selectedTabIndex);
    });
  }

  onTabIndexChange(tabIndex: number): void {
    this.selectedTabIndex = tabIndex;
    queueMicrotask(() => {
      this.getActiveSection()?.setSelectedTabIndex(tabIndex);
    });
  }

  onOrganizationDropdownChange(value: string | number | null): void {
    this.getActiveSection()?.onOrganizationDropdownChange(value);
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.getActiveSection()?.onOfficeDropdownChange(value);
  }

  get activeUsersSection(): UserListComponent | undefined {
    return this.getActiveSection();
  }

  getActiveSection(): UserListComponent | undefined {
    const sections = this.userSections?.toArray() || [];
    return sections[this.selectedTabIndex];
  }
}
