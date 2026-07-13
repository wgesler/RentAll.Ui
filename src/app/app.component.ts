import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, forkJoin, map, of, switchMap, take, takeUntil } from 'rxjs';
import { ChartOfAccountsService } from './authenticated/accounting/services/chart-of-accounts.service';
import { CostCodesService } from './authenticated/accounting/services/cost-codes.service';
import { ContactService } from './authenticated/contacts/services/contact.service';
import { AccountingOfficeService } from './authenticated/organizations/services/accounting-office.service';
import { GlobalSelectionService } from './authenticated/organizations/services/global-selection.service';
import { OfficeService } from './authenticated/organizations/services/office.service';
import { OrganizationFeatureService } from './authenticated/organizations/services/organization-feature.service';
import { FeatureResponse } from './authenticated/organizations/models/organization-feature.model';
import { OrganizationListService } from './authenticated/organizations/services/organization-list.service';
import { OrganizationService } from './authenticated/organizations/services/organization.service';
import { CommonMessage, CommonTimeouts } from './enums/common-message.enum';
import { AuthService } from './services/auth.service';
import { BrandingService } from './services/branding.service';
import { CommonService } from './services/common.service';
import { PropertySelectionFilterService } from './authenticated/properties/services/property-selection-filter.service';
import { PropertyService } from './authenticated/properties/services/property.service';
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
  isLoggedIn: Observable<boolean> = this.authService.getIsLoggedIn$();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['states', 'dailyQuote', 'organizations', 'branding', 'contacts', 'offices', 'features', 'accountingOffices', 'costCodes', 'chartOfAccounts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  private readonly propertySelectionDomains: Array<{ name: string; prefixes: string[] }> = [
    { name: 'reservation', prefixes: ['/auth/reservations'] },
    { name: 'board', prefixes: ['/auth/boards'] },
    { name: 'property', prefixes: ['/auth/properties'] }
  ];

  constructor(
    private authService: AuthService,
    private brandingService: BrandingService,
    private commonService: CommonService,
    private contactService: ContactService,
    private organizationListService: OrganizationListService,
    private organizationService: OrganizationService,
    private officeService: OfficeService,
    private organizationFeatureService: OrganizationFeatureService,
    private globalSelectionService: GlobalSelectionService,
    private chartOfAccountsService: ChartOfAccountsService,
    private costCodesService: CostCodesService,
    private accountingOfficeService: AccountingOfficeService,
    private utilityService: UtilityService,
    private propertyService: PropertyService,
    private propertySelectionFilterService: PropertySelectionFilterService,
    private debugLayoutBandsService: DebugLayoutBandsService,
    private router: Router,
    private toastr: ToastrService
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
        this.loadBranding();
        this.initializeOrganizationList();
        this.loadContacts();
        this.loadOffices();
        this.loadPropertySelectionFilterState();
      } else {
        this.organizationId = '';
        this.brandingService.clearBranding();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'branding');
        this.organizationListService.clearOrganizations();
        this.contactService.clearContacts();
        this.officeService.clearOffices();
        this.organizationFeatureService.clearFeatures();
        this.accountingOfficeService.clearAccountingOffices();
        this.chartOfAccountsService.clearChartOfAccounts();
        this.costCodesService.clearCostCodes();
        this.propertySelectionFilterService.clear();
      }
    });

    this.router.events.pipe(filter(event => event instanceof NavigationStart), takeUntil(this.destroy$)).subscribe(event => {
      const navigationStart = event as NavigationStart;
      if (!this.shouldAutoResetPropertySelectionOnDomainExit(this.router.url, navigationStart.url)) {
        return;
      }
      this.autoResetPropertySelection();
    });
  }

  loadBranding(): void {
    this.brandingService.loadBrandingForCurrentOrganization().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'branding');
    })).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'branding');
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
      this.organizationFeatureService.clearFeatures();
      this.accountingOfficeService.clearAccountingOffices();
      this.globalSelectionService.clearGlobalOfficeSelection();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'features');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      return;
    }
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(
      take(1),
      switchMap(offices => {
        const activeOffices = (offices || []).filter(office => office.isActive);
        return forkJoin({
          accountingOffices: this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)),
          features: this.organizationFeatureService.refreshFeatures(this.organizationId).pipe(take(1))
        }).pipe(
          map(({ features }) => {
            this.globalSelectionService.reconcileGlobalOfficeWithAvailableOffices(activeOffices);
            return features || [];
          })
        );
      }),
      finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'features');
    })).subscribe({
      next: (features) => {
        const onLoginRoute = this.normalizePath(this.router.url) === '/login';
        if (!onLoginRoute && !this.verifyMainProgramAccess(features)) {
          return;
        }
        this.loadCostCodes();
      },
      error: () => {}
    });
  }

  verifyMainProgramAccess(features?: FeatureResponse[]): boolean {
    if (this.globalSelectionService.verifyMainProgramAccess(features)) {
      return true;
    }

    this.authService.logout();
    return false;
  }

  loadCostCodes(): void {
    forkJoin({
      costCodes: this.costCodesService.ensureCostCodesLoaded().pipe(take(1)),
      chartOfAccounts: this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1))
    }).pipe(
      take(1),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts');
      })
    ).subscribe({
      next: () => {},
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts');
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

  shouldAutoResetPropertySelectionOnDomainExit(fromUrl: string, toUrl: string): boolean {
    const fromPath = this.normalizePath(fromUrl);
    const toPath = this.normalizePath(toUrl);
    const fromDomain = this.getPropertySelectionDomain(fromPath);
    const toDomain = this.getPropertySelectionDomain(toPath);
    if (!this.authService.getIsLoggedIn()) {
      return false;
    }
    if (this.isPropertySelectionPage(fromPath) || this.isPropertySelectionPage(toPath)) {
      return false;
    }
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (userId && this.propertySelectionFilterService.isSelectionSticky(userId)) {
      return false;
    }
    return fromDomain !== toDomain;
  }

  isPropertySelectionPage(path: string): boolean {
    return path === '/auth/selection';
  }

  getPropertySelectionDomain(path: string): string | null {
    for (const domain of this.propertySelectionDomains) {
      if (domain.prefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'))) {
        return domain.name;
      }
    }
    return null;
  }

  normalizePath(url: string): string {
    const raw = (url || '').trim();
    if (!raw) {
      return '';
    }
    const withoutQuery = raw.split('?')[0];
    const withoutHash = withoutQuery.split('#')[0];
    return withoutHash.toLowerCase();
  }

  autoResetPropertySelection(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.propertySelectionFilterService.clear();
      return;
    }

    this.propertyService.resetPropertySelection(userId).pipe(take(1), catchError(() => of(null))).subscribe(selection => {
      this.propertySelectionFilterService.setFromResponse(selection);
      this.propertySelectionFilterService.setDateRange(null, null);
    });
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
