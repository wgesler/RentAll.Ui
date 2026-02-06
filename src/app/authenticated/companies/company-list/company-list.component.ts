import { OnInit, Component, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { CompanyResponse, CompanyListDisplay } from '../models/company.model';
import { CompanyService } from '../services/company.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, Subscription, filter } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-company-list',
  templateUrl: './company-list.component.html',
  styleUrls: ['./company-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class CompanyListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() selectedOffice: OfficeResponse | null = null; // Office selection from parent
  @Output() officeChange = new EventEmitter<OfficeResponse | null>(); // Emit office changes to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allCompanies: CompanyListDisplay[] = [];
  companiesDisplay: CompanyListDisplay[] = [];

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  routerSubscription?: Subscription;
  showOfficeDropdown: boolean = true;
  hasInitialLoad: boolean = false;

  companiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'companyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'city': { displayAs: 'City' },
    'state': { displayAs: 'State' },
    'phone': { displayAs: 'Phone' },
    'website': { displayAs: 'Website' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['companies']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public companyService: CompanyService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private route: ActivatedRoute) {
  }

  //#region Company-List
  ngOnInit(): void {
    this.loadOffices();
    
    // Subscribe to router events to refresh list when navigating back to companies page
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        filter(() => this.router.url.includes(RouterUrl.Companies) && !this.router.url.includes('/company/') && !this.router.url.includes('/vendor/'))
      )
      .subscribe(() => {
        // Only refresh if we've already done the initial load (to avoid double-loading)
        if (this.hasInitialLoad) {
          this.getCompanies();
        }
      });
  }

  getCompanies(): void {
    this.companyService.getCompanies().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'companies'); })).subscribe({
      next: (companies) => {
        this.allCompanies = this.mappingService.mapCompanies(companies, undefined);
        this.applyFilters();
        this.hasInitialLoad = true;
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
        this.hasInitialLoad = true;
      }
    });
  }

  addCompany(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Company, ['new']);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab and officeId)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  deleteCompany(company: CompanyListDisplay): void {
    if (confirm(`Are you sure you want to delete ${company.name}?`)) {
      this.companyService.deleteCompany(company.companyId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Company deleted successfully', CommonMessage.Success);
          this.getCompanies(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToCompany(event: CompanyListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Company, [event.companyId]);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab and officeId)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  copyCompany(event: CompanyListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Company, ['new']);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab and officeId)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Add copyFrom parameter
    queryParams.copyFrom = event.companyId;
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: queryParams
    });
  }
  //#endregion

  //#region Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.allCompanies;

    // Filter by office
    if (this.selectedOffice) {
      filtered = filtered.filter(company => company.officeId === this.selectedOffice.officeId);
    }

    // Filter by active status
    this.companiesDisplay = this.showInactive
      ? filtered
      : filtered.filter(company => company.isActive);
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Reapply filters when selectedOffice changes
    if (changes['selectedOffice']) {
      // Update local selectedOffice when input changes from parent
      this.selectedOffice = changes['selectedOffice'].currentValue;
      this.applyFilters();
    }
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
      // Offices are already loaded on login, so directly subscribe to changes
      // API already filters offices by user access
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        
        // Auto-select if only one office available and no office is already selected from parent
        if (this.offices.length === 1 && !this.selectedOffice) {
          this.selectedOffice = this.offices[0];
          this.officeChange.emit(this.selectedOffice);
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        this.getCompanies();
    });
  }

  onOfficeChange(): void {
    // Emit office change to parent so all tabs can be updated
    this.officeChange.emit(this.selectedOffice);
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

