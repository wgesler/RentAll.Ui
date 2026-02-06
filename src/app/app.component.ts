import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { AuthService } from './services/auth.service';
import { CommonService } from './services/common.service';
import { ContactService } from './authenticated/clients/services/contact.service';
import { OrganizationListService } from './authenticated/organization/services/organization-list.service';
import { OrganizationService } from './authenticated/organization/services/organization.service';
import { OfficeService } from './authenticated/organization/services/office.service';
import { CostCodesService } from './authenticated/accounting/services/cost-codes.service';
import { AccountingOfficeService } from './authenticated/organization/services/accounting-office.service';
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
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['states', 'dailyQuote', 'organizations', 'contacts', 'offices', 'accountingOffices', 'costCodes']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private authService: AuthService,
    private commonService: CommonService,
    private contactService: ContactService,
    private organizationListService: OrganizationListService,
    private organizationService: OrganizationService,
    private officeService: OfficeService,
    private costCodesService: CostCodesService,
    private accountingOfficeService: AccountingOfficeService,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    // Load anonymous data on app startup
    this.loadDailyQuote();
    this.loadStates();

    // Watch for login changes and re-initialize organization list, contacts, and offices
    this.authService.getIsLoggedIn$().subscribe(isLoggedIn => {
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
    this.commonService.getStates().pipe(filter(states => states && states.length > 0),take(1),finalize(() => { this.removeLoadItem('states'); })).subscribe({
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
    this.commonService.getDailyQuote().pipe(filter(quote => quote !== null), take(1), finalize(() => { this.removeLoadItem('dailyQuote'); })).subscribe({
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
    this.contactService.loadAllContacts();
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.removeLoadItem('contacts'); })).subscribe({
      next: () => {},
      error: () => {
        this.removeLoadItem('contacts');
      }
    });
  }

  loadOffices(): void {
    this.officeService.loadAllOffices();
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.removeLoadItem('offices'); })).subscribe({
      next: () => {
        // After offices are loaded, load cost codes
        this.loadCostCodes();
      },
      error: () => {
        this.removeLoadItem('offices');
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.loadAllAccountingOffices();
    this.accountingOfficeService.areAccountingOfficesLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.removeLoadItem('accountingOffices'); })).subscribe({
      next: () => {},
      error: () => {
        this.removeLoadItem('accountingOffices');
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.loadAllCostCodes();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true),take(1),finalize(() => { this.removeLoadItem('costCodes'); })).subscribe({
      next: () => {},
      error: () => {
        this.removeLoadItem('costCodes');
      }
    });
  }

  initializeOrganizationList(): void {
    const user = this.authService.getUser();
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
      // Regular user: Load and add their single organization to the list
      this.commonService.loadOrganization();
      this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), finalize(() => { this.removeLoadItem('organizations'); })).subscribe({
        next: (organization) => {
          if (organization) {
            this.organizationListService.setOrganizations([organization]);
          }
        },
        error: () => {
          this.removeLoadItem('organizations');
        }
      });
    }
  }

  // Utiltity Methods
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
