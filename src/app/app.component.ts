import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { AuthService } from './services/auth.service';
import { CommonService } from './services/common.service';
import { ContactService } from './authenticated/contact/services/contact.service';
import { OrganizationListService } from './authenticated/organization/services/organization-list.service';
import { OrganizationService } from './authenticated/organization/services/organization.service';
import { UserService } from './authenticated/user/services/user.service';
import { Observable, filter, take } from 'rxjs';
import { MatIconModule } from '@angular/material/icon'; 
import { MatButtonModule } from '@angular/material/button';
import { LayoutComponent } from './authenticated/shared/layout/layout/layout.component';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from './enums/common-message.enum';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HttpClientModule, LayoutComponent, MatButtonModule, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})

export class AppComponent implements OnInit {
  title = 'RentAll.Ui';
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private contactService: ContactService,
    private organizationListService: OrganizationListService,
    private organizationService: OrganizationService,
    private userService: UserService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    // Load anonymous data on app startup
    this.commonService.loadDailyQuote();
    this.commonService.loadStates();

    // Initialize organization list and load contacts when user is logged in
    this.initializeOrganizationList();
    this.loadContacts();

    // Watch for login changes and re-initialize organization list and contacts
    this.authService.getIsLoggedIn$().subscribe(isLoggedIn => {
      if (isLoggedIn) {
        this.initializeOrganizationList();
        this.loadContacts();
      } else {
        this.organizationListService.clearOrganizations();
        this.contactService.loadAllContacts(); // Clear contacts or load without org filter
      }
    });
  }

  private loadContacts(): void {
    if (!this.authService.getIsLoggedIn()) {
      return;
    }

    const user = this.authService.getUser();
    if (!user || !user.organizationId) {
      return;
    }

    this.contactService.loadAllContacts();
  }

  private initializeOrganizationList(): void {
    if (!this.authService.getIsLoggedIn()) {
      return;
    }

    const user = this.authService.getUser();
    if (!user || !user.userId) {
      return;
    }

    const userGuid = user.userId;
    const adminUserGuid = '00000000-0000-0000-0000-000000000000';

    if (userGuid === adminUserGuid) {
      // Admin user: Get all organizations
      this.organizationService.getOrganizations().pipe(take(1)).subscribe({
        next: (organizations) => {
          this.organizationListService.setOrganizations(organizations);
        },
        error: (err: HttpErrorResponse) => {
          console.error('Error loading organizations:', err);
          if (err.status !== 400) {
            this.toastr.error('Could not load organizations. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      // Regular user: Use organizationId from JWT if available, otherwise fetch from API
      if (user.organizationId) {
        // Get the organization details directly from JWT organizationId
        this.organizationService.getOrganizationByGuid(user.organizationId).pipe(take(1)).subscribe({
          next: (organization) => {
            this.organizationListService.setOrganizations([organization]);
          },
          error: (err: HttpErrorResponse) => {
            console.error('Error loading user organization:', err);
            if (err.status !== 400) {
              this.toastr.error('Could not load organization. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          }
        });
      } else {
        // Fallback: Get user's organization from API if not in JWT
        this.userService.getUserByGuid(userGuid).pipe(take(1)).subscribe({
          next: (userResponse) => {
            if (userResponse && userResponse.organizationId) {
              // Get the organization details
              this.organizationService.getOrganizationByGuid(userResponse.organizationId).pipe(take(1)).subscribe({
                next: (organization) => {
                  this.organizationListService.setOrganizations([organization]);
                },
                error: (err: HttpErrorResponse) => {
                  console.error('Error loading user organization:', err);
                  if (err.status !== 400) {
                    this.toastr.error('Could not load organization. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
                  }
                }
              });
            }
          },
          error: (err: HttpErrorResponse) => {
            console.error('Error loading user:', err);
            if (err.status !== 400) {
              this.toastr.error('Could not load user information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          }
        });
      }
    }
  }
}
