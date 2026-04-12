import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, map, of, take, takeUntil } from 'rxjs';
import { CostCodesService } from './authenticated/accounting/services/cost-codes.service';
import { ContactService } from './authenticated/contacts/services/contact.service';
import { AccountingOfficeService } from './authenticated/organizations/services/accounting-office.service';
import { GlobalSelectionService } from './authenticated/organizations/services/global-selection.service';
import { OfficeService } from './authenticated/organizations/services/office.service';
import { OrganizationListService } from './authenticated/organizations/services/organization-list.service';
import { OrganizationService } from './authenticated/organizations/services/organization.service';
import { AuthService } from './services/auth.service';
import { CommonService } from './services/common.service';
import { PropertySelectionFilterService } from './authenticated/properties/services/property-selection-filter.service';
import { PropertyService } from './authenticated/properties/services/property.service';
import { environment } from '../environments/environment';
import { DebugLayoutBandsService } from './services/debug-layout-bands.service';
import { UtilityService } from './services/utility.service';

@Component({
    standalone: true,
    selector: 'app-root',
    imports: [RouterOutlet],
    templateUrl: './app.component.html'
})

export class AppComponent implements OnInit, OnDestroy {
  title = 'RentAll.Ui';
  organizationId: string = '';
  preferredOfficeId: number | null = null;
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
    private globalSelectionService: GlobalSelectionService,
    private costCodesService: CostCodesService,
    private accountingOfficeService: AccountingOfficeService,
    private utilityService: UtilityService,
    private propertyService: PropertyService,
    private propertySelectionFilterService: PropertySelectionFilterService,
    private debugLayoutBandsService: DebugLayoutBandsService
  ) { }

  ngOnInit(): void {
    this.debugLayoutBandsService.setEnabled(false);

    // Load anonymous data on app startup
    this.loadDailyQuote();
    this.loadStates();

    // Watch for login changes and re-initialize organization list, contacts, and offices
    this.authService.getIsLoggedIn$().pipe(takeUntil(this.destroy$)).subscribe(isLoggedIn => {
      if (isLoggedIn) {
        this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
        this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
        this.initializeOrganizationList();
        this.loadContacts();
        this.loadOffices();
        this.loadPropertySelectionFilterState();
      } else {
        this.organizationId = '';
        this.preferredOfficeId = null;
        this.organizationListService.clearOrganizations();
        this.contactService.clearContacts();
        this.officeService.clearOffices();
        this.accountingOfficeService.clearAccountingOffices();
        this.costCodesService.clearCostCodes();
        this.propertySelectionFilterService.clear();
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
    this.contactService.ensureContactsLoaded().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.officeService.clearOffices();
      this.accountingOfficeService.clearAccountingOffices();
      this.globalSelectionService.setSelectedOfficeId(null);
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      return;
    }
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
    })).subscribe({
      next: () => {
        this.loadCostCodes();
      },
      error: () => {}
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

  loadPropertySelectionFilterState(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.propertySelectionFilterService.clear();
      return;
    }
    this.propertyService
      .getPropertySelection(userId)
      .pipe(
        take(1),
        catchError((err: { status?: number }) => {
          if (err?.status === 404) {
            return of(null);
          }
          return of(null);
        })
      )
      .subscribe((selection) => this.propertySelectionFilterService.setFromResponse(selection));
  }

  initializeOrganizationList(): void {
    const user = this.authService.getUser();
    const userGuid = user.userGuid || user.userId;
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
