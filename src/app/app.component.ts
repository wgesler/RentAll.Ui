import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { AuthService } from './services/auth.service';
import { CommonService } from './services/common.service';
import { ContactService } from './authenticated/contact/services/contact.service';
import { OrganizationListService } from './authenticated/organization/services/organization-list.service';
import { OrganizationService } from './authenticated/organization/services/organization.service';
import { Observable, filter, take, BehaviorSubject, map, finalize } from 'rxjs';
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

export class AppComponent implements OnInit, OnDestroy {
  title = 'RentAll.Ui';
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['states', 'dailyQuote', 'organizations', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private contactService: ContactService,
    private organizationListService: OrganizationListService,
    private organizationService: OrganizationService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    // Load anonymous data on app startup
    this.loadDailyQuote();
    this.loadStates();

    // Initialize organization list and load contacts when user is logged in
    this.initializeOrganizationList();
    this.loadContacts();

    // Initialize user's organization when logged in
    if (this.authService.getIsLoggedIn()) {
      this.commonService.loadOrganization();
    }

    // Watch for login changes and re-initialize organization list and contacts
    this.authService.getIsLoggedIn$().subscribe(isLoggedIn => {
      if (isLoggedIn) {
        this.commonService.loadOrganization();
        this.initializeOrganizationList();
        this.loadContacts();
      } else {
        this.organizationListService.clearOrganizations();
        this.contactService.clearContacts();
      }
    });
  }

  loadStates(): void {
    this.commonService.loadStates();
    this.commonService.getStates().pipe(
      filter(states => states && states.length > 0),
      take(1),
      finalize(() => { this.removeLoadItem('states'); })
    ).subscribe({
      next: () => {},
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Unable to load States. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('states');
      }
    });
  }

  loadDailyQuote(): void {
    this.commonService.loadDailyQuote();
    this.commonService.getDailyQuote().pipe(
      filter(quote => quote !== null),
      take(1),
      finalize(() => { this.removeLoadItem('dailyQuote'); })
    ).subscribe({
      next: () => {},
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Unable to load Daily Quote. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('dailyQuote');
      }
    });
  }

  loadContacts(): void {
    if (!this.authService.getIsLoggedIn()) {
      this.removeLoadItem('contacts');
      return;
    }

    const user = this.authService.getUser();
    if (!user || !user.organizationId) {
      this.removeLoadItem('contacts');
      return;
    }

    this.contactService.loadAllContacts();
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.removeLoadItem('contacts'); })).subscribe({
      next: () => {},
      error: () => {
        this.removeLoadItem('contacts');
      }
    });
  }

  initializeOrganizationList(): void {
    if (!this.authService.getIsLoggedIn()) {
      this.removeLoadItem('organizations');
      return;
    }

    const user = this.authService.getUser();
    if (!user || !user.userId) {
      this.removeLoadItem('organizations');
      return;
    }

    const userGuid = user.userId;
    const adminUserGuid = '00000000-0000-0000-0000-000000000000';

    if (userGuid === adminUserGuid) {
      // Admin user: Get all organizations
      this.organizationService.getOrganizations().pipe(take(1),finalize(() => { this.removeLoadItem('organizations'); })).subscribe({
        next: (organizations) => {
          this.organizationListService.setOrganizations(organizations);
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not load organizations. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      // Regular user: No need to load organization list (they only have one org, loaded via commonService.loadOrganization())
      this.removeLoadItem('organizations');
    }
  }

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
}
