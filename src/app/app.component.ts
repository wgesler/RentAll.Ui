import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CostCodesService } from './authenticated/accounting/services/cost-codes.service';
import { ContactService } from './authenticated/contacts/services/contact.service';
import { AccountingOfficeService } from './authenticated/organizations/services/accounting-office.service';
import { OfficeService } from './authenticated/organizations/services/office.service';
import { OrganizationListService } from './authenticated/organizations/services/organization-list.service';
import { OrganizationService } from './authenticated/organizations/services/organization.service';
import { AuthService } from './services/auth.service';
import { CommonService } from './services/common.service';
import { UtilityService } from './services/utility.service';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, MatButtonModule, MatIconModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})

export class AppComponent implements OnInit, OnDestroy {
  title = 'RentAll.Ui';
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['states', 'dailyQuote', 'organizations', 'contacts', 'offices', 'accountingOffices', 'costCodes']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private contactService: ContactService,
    private organizationListService: OrganizationListService,
    private organizationService: OrganizationService,
    private officeService: OfficeService,
    private costCodesService: CostCodesService,
    private accountingOfficeService: AccountingOfficeService,
    private utilityService: UtilityService
  ) { }

  ngOnInit(): void {
    // Load anonymous data on app startup
    this.loadDailyQuote();
    this.loadStates();

    // Watch for login changes and re-initialize organization list, contacts, and offices
    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(isLoggedIn => {
      if (isLoggedIn) {
        this.initializeOrganizationList();
        this.loadContacts();
        this.loadOffices();
        this.loadAccountingOffices();
      } else {
        this.organizationListService.clearOrganizations();
        this.contactService.clearContacts();
        this.officeService.clearOffices();
        this.accountingOfficeService.clearAccountingOffices();
        this.costCodesService.clearCostCodes();
      }
    });
  }

  loadStates(): void {
    this.commonService.loadStates();
    this.commonService.getStates().pipe(filter(states => states && states.length > 0),take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'states'); })).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'states');
      }
    });
  }

  loadDailyQuote(): void {
    this.commonService.loadDailyQuote();
    this.commonService.getDailyQuote().pipe(filter(quote => quote !== null), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'dailyQuote'); })).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'dailyQuote');
      }
    });
  }

  loadContacts(): void {
    this.contactService.loadAllContacts();
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
      }
    });
  }

  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId || '';
    this.officeService.loadAllOffices(organizationId);
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: () => {
         this.loadCostCodes();
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.loadAllAccountingOffices();
    this.accountingOfficeService.areAccountingOfficesLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'); })).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.loadAllCostCodes();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes'); })).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
      }
    });
  }

  initializeOrganizationList(): void {
    const user = this.authService.getUser();
    const userGuid = user.userId;
    const adminUserGuid = '00000000-0000-0000-0000-000000000000';

    if (userGuid === adminUserGuid) {
      // Admin user: Get all organizations
      this.organizationService.getOrganizations().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'); })).subscribe({
        next: (organizations) => {
          this.organizationListService.setOrganizations(organizations);
        },
        error: () => {}
      });
    } else {
      // Regular user: Load and add their single organization to the list
      this.commonService.loadOrganization();
      this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'); })).subscribe({
        next: (organization) => {
          if (organization) {
            this.organizationListService.setOrganizations([organization]);
          }
        },
        error: () => {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations');
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
}
