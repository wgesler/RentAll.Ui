import { OnInit, Component, OnDestroy, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { ChartOfAccountsResponse } from '../models/chart-of-accounts.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-chart-of-accounts-list',
  templateUrl: './chart-of-accounts-list.component.html',
  styleUrls: ['./chart-of-accounts-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ChartOfAccountsListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() embeddedMode: boolean = false; // If true, hide header and office selector
  @Input() hideHeader: boolean = false; // If true, hide the header/sub-heading
  @Input() showInactiveInput: boolean = false; // Input to control inactive filter from parent (for embedded mode)
  @Output() addChartOfAccountEvent = new EventEmitter<void>();
  @Output() editChartOfAccountEvent = new EventEmitter<number>();
  
  isServiceError: boolean = false;
  showInactive: boolean = false; // Internal property for non-embedded mode
  allChartOfAccounts: ChartOfAccountsResponse[] = [];
  chartOfAccountsDisplay: any[] = [];
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  officesSubscription?: Subscription;
  chartOfAccountsSubscription?: Subscription;

  chartOfAccountsDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    accountId: { displayAs: 'Account No', maxWidth: '20ch', sortType: 'natural' },
    description: { displayAs: 'Description', maxWidth: '33ch' },
    accountType: { displayAs: 'Account Type', maxWidth: '25ch' },
    isActive: { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public chartOfAccountsService: ChartOfAccountsService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private authService: AuthService) {
  }

  //#region ChartOfAccounts-List
  ngOnInit(): void {
    // Initialize with empty display - no data until office is selected
    this.chartOfAccountsDisplay = [];
    this.allChartOfAccounts = [];
    
    // Load chart of accounts observable
    this.loadChartOfAccounts();
    
    // Always load offices first (needed for mapping officeId to officeName in display)
    this.loadOffices().then(() => {
      // If officeId is provided as input and not null, use it and load data
      if (this.officeId !== null && this.officeId !== undefined) {
        this.selectedOfficeId = this.officeId;
        // Only filter chart of accounts if officeId is provided and not null
        this.filterChartOfAccounts();
      } else if (!this.embeddedMode) {
        // Not in embedded mode - check query params for officeId
        this.route.queryParams.pipe(take(1)).subscribe(params => {
          const officeIdParam = params['officeId'];
          if (officeIdParam) {
            this.selectedOfficeId = parseInt(officeIdParam, 10);
            this.filterChartOfAccounts();
          }
          // If no officeId in query params, list stays empty (no spinner)
        });
      }
      // If in embedded mode and no officeId provided, list stays empty (no spinner) - wait for user selection
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Only update if officeId changed from null/undefined to a value, or changed to a different value
      if (newOfficeId !== previousOfficeId) {
        this.selectedOfficeId = newOfficeId;
        if (newOfficeId !== null && newOfficeId !== undefined) {
          // Office was selected - filter chart of accounts display
          this.filterChartOfAccounts();
        } else {
          // Office was cleared - clear the display
          this.chartOfAccountsDisplay = [];
          this.allChartOfAccounts = [];
        }
      }
    }
    
    // Watch for changes to showInactiveInput input
    if (changes['showInactiveInput'] && !changes['showInactiveInput'].firstChange) {
      // Reapply filters when showInactiveInput changes
      this.applyFilters();
    }
  }

  onOfficeChange(): void {
    this.filterChartOfAccounts();
  }

  loadChartOfAccounts(): void {
    // Wait for chart of accounts to be loaded initially, then subscribe to changes
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.chartOfAccountsSubscription = this.chartOfAccountsService.getAllChartOfAccounts().subscribe(accounts => {
        // Update chart of accounts when observable emits
        // Filter will be applied when officeId changes
        this.filterChartOfAccounts();
      });
    });
  }

  filterChartOfAccounts(): void {
    if (!this.selectedOfficeId) {
      this.allChartOfAccounts = [];
      this.chartOfAccountsDisplay = [];
      return;
    }
    
    // Get chart of accounts for the selected office from the observable data
    this.allChartOfAccounts = this.chartOfAccountsService.getChartOfAccountsForOffice(this.selectedOfficeId);
    this.applyFilters();
  }

  addChartOfAccount(): void {
    // If in embedded mode, emit event instead of navigating
    if (this.embeddedMode) {
      this.addChartOfAccountEvent.emit();
      return;
    }
    const url = RouterUrl.replaceTokens(RouterUrl.ChartOfAccounts, ['new']);
    const queryParams: string[] = [];
    if (this.selectedOfficeId) {
      queryParams.push('officeId=' + this.selectedOfficeId);
    }
    queryParams.push('fromOffice=true');
    this.router.navigateByUrl(url + (queryParams.length > 0 ? '?' + queryParams.join('&') : ''));
  }

  deleteChartOfAccount(chartOfAccount: ChartOfAccountsResponse): void {
    // Use officeId from the chartOfAccount response, fallback to selectedOfficeId
    const officeIdToUse = chartOfAccount.officeId || this.selectedOfficeId;
    if (!officeIdToUse) {
      return;
    }
    if (confirm(`Are you sure you want to delete this chart of account?`)) {
      this.chartOfAccountsService.deleteChartOfAccount(officeIdToUse, chartOfAccount.chartOfAccountId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Chart of Account deleted successfully', CommonMessage.Success);
          // Refresh chart of accounts for this office from the service
          this.chartOfAccountsService.refreshChartOfAccountsForOffice(officeIdToUse);
          this.filterChartOfAccounts(); // Refresh the display
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToChartOfAccount(event: ChartOfAccountsResponse): void {
    // If in embedded mode, emit event instead of navigating
    if (this.embeddedMode) {
      this.editChartOfAccountEvent.emit(event.chartOfAccountId);
      return;
    }
    const url = RouterUrl.replaceTokens(RouterUrl.ChartOfAccounts, [event.chartOfAccountId.toString()]);
    const queryParams: string[] = [];
    // Use officeId from the response, fallback to selectedOfficeId
    const officeIdToUse = event.officeId || this.selectedOfficeId;
    if (officeIdToUse) {
      queryParams.push('officeId=' + officeIdToUse);
    }
    queryParams.push('fromOffice=true');
    this.router.navigateByUrl(url + (queryParams.length > 0 ? '?' + queryParams.join('&') : ''));
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): Promise<void> {
    return new Promise((resolve) => {
      // Wait for offices to be loaded initially, then subscribe to changes
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.removeLoadItem('offices');
        this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
          this.offices = offices || [];
          // Auto-select first office if available and no officeId from query params
          // Only do this if NOT in embedded mode (parent controls office selection in embedded mode)
          if (!this.embeddedMode && this.offices.length > 0 && !this.selectedOfficeId) {
            this.selectedOfficeId = this.offices[0].officeId;
            this.filterChartOfAccounts();
          }
          resolve();
        });
      });
    });
  }
   //#endregion

  //#region Filter Methods
  applyFilters(): void {
    let filtered = this.allChartOfAccounts;
    // Filter by inactive if needed
    // In embedded mode, use the @Input() showInactiveInput value; otherwise use internal property
    const shouldShowInactive = this.embeddedMode ? this.showInactiveInput : this.showInactive;
    if (!shouldShowInactive) {
      filtered = filtered.filter(account => account.isActive !== false);
    }
    // Map chart of accounts using mapping service to convert accountType to display string
    const mapped = this.mappingService.mapChartOfAccounts(filtered, this.offices);
    this.chartOfAccountsDisplay = mapped;
  }

  toggleInactive(): void {
    // Only toggle if not in embedded mode (parent controls it)
    if (!this.embeddedMode) {
      this.showInactive = !this.showInactive;
      this.applyFilters();
    }
  }
  //#endregion

  //#region Utility Methods
  addLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (!currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.add(key);
      this.itemsToLoad$.next(newSet);
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
    this.officesSubscription?.unsubscribe();
    this.chartOfAccountsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
