import { OnInit, Component, OnDestroy, Input } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { ChartOfAccountsResponse } from '../models/chart-of-accounts.model';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
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

export class ChartOfAccountsListComponent implements OnInit, OnDestroy {
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() embeddedMode: boolean = false; // If true, hide header and office selector
  @Input() hideHeader: boolean = false; // If true, hide the header/sub-heading
  
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allChartOfAccounts: ChartOfAccountsResponse[] = [];
  chartOfAccountsDisplay: any[] = [];
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;

  chartOfAccountsDisplayedColumns: ColumnSet = {
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    accountId: { displayAs: 'Account No', maxWidth: '20ch', sortType: 'natural' },
    description: { displayAs: 'Description', maxWidth: '33ch' },
    accountType: { displayAs: 'Account Type', maxWidth: '25ch' },
    isActive: { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['chartOfAccounts', 'offices']));
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
    // If officeId is provided as input, use it directly
    if (this.officeId) {
      this.selectedOfficeId = this.officeId;
      this.removeLoadItem('offices'); // Don't need to load offices if officeId is provided
      this.getChartOfAccounts();
    } else {
      // Check query params for officeId first
      this.route.queryParams.pipe(take(1)).subscribe(params => {
        const officeIdParam = params['officeId'];
        if (officeIdParam) {
          this.selectedOfficeId = parseInt(officeIdParam, 10);
        }
        // Load offices and show selector
        this.loadOffices().then(() => {
          // After offices are loaded, if we have a selectedOfficeId from query params, load data
          if (this.selectedOfficeId) {
            this.getChartOfAccounts();
          }
        });
      });
    }
  }

  onOfficeChange(): void {
    if (this.selectedOfficeId) {
      this.getChartOfAccounts();
    } else {
      this.chartOfAccountsDisplay = [];
      this.removeLoadItem('chartOfAccounts');
    }
  }

  getChartOfAccounts(): void {
    if (!this.selectedOfficeId) {
      return;
    }
    this.chartOfAccountsService.getChartOfAccountsByOfficeId(this.selectedOfficeId).pipe(
      take(1), 
      finalize(() => { this.removeLoadItem('chartOfAccounts'); })
    ).subscribe({
      next: (chartOfAccounts) => {
        this.allChartOfAccounts = chartOfAccounts || [];
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  addChartOfAccount(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.ChartOfAccounts, ['new']);
    if (this.selectedOfficeId) {
      this.router.navigateByUrl(url + '?officeId=' + this.selectedOfficeId);
    } else {
      this.router.navigateByUrl(url);
    }
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
          this.getChartOfAccounts(); // Refresh the list
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
    const url = RouterUrl.replaceTokens(RouterUrl.ChartOfAccounts, [event.chartOfAccountId.toString()]);
    // Use officeId from the response, fallback to selectedOfficeId
    const officeIdToUse = event.officeId || this.selectedOfficeId;
    if (officeIdToUse) {
      this.router.navigateByUrl(url + '?officeId=' + officeIdToUse);
    } else {
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): Promise<void> {
    return new Promise((resolve) => {
      this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices'); })).subscribe({
        next: (offices) => {
          this.offices = offices || [];
          // Auto-select first office if available and no officeId from query params
          if (this.offices.length > 0 && !this.selectedOfficeId) {
            this.selectedOfficeId = this.offices[0].officeId;
            this.getChartOfAccounts();
          }
          resolve();
        },
        error: (err: HttpErrorResponse) => {
          this.isServiceError = true;
          this.removeLoadItem('offices');
          resolve();
        }
      });
    });
  }
   //#endregion

  //#region Filter Methods
  applyFilters(): void {
    let filtered = this.allChartOfAccounts;
    // Filter by inactive if needed
    if (!this.showInactive) {
      filtered = filtered.filter(account => account.isActive !== false);
    }
    // Map chart of accounts using mapping service to convert accountType to display string
    const mapped = this.mappingService.mapChartOfAccounts(filtered, this.offices);
    this.chartOfAccountsDisplay = mapped;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
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
  //#endregion
}
