import { OnInit, Component, OnDestroy, ChangeDetectorRef, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule, DatePipe } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { InvoiceResponse, InvoiceListDisplay, LedgerLineResponse } from '../models/accounting.model';
import { AccountingService } from '../services/accounting.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, forkJoin, of, Subscription, filter } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { FormatterService } from '../../../services/formatter-service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountsResponse } from '../models/chart-of-accounts.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';

@Component({
  selector: 'app-accounting-list',
  templateUrl: './accounting-list.component.html',
  styleUrls: ['./accounting-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DatePipe]
})

export class AccountingListComponent implements OnInit, OnDestroy {
  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate: TemplateRef<any>;
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property

  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded
  selectedTabIndex: number = 0;
  selectedOfficeId: number | null = null; // Office filter for both tabs
  chartOfAccountsDisplay: any[] = [];
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  showInactiveChartOfAccounts: boolean = false; // Toggle for inactive chart of accounts

  allChartOfAccounts: ChartOfAccountsResponse[] = [];
  chartOfAccountsSubscription?: Subscription;

  invoicesDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '50px', sort: false },
    invoiceNumber: { displayAs: 'Invoice', maxWidth: '20ch', sortType: 'natural' },
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '20ch' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '20ch' },
    dueDate: { displayAs: 'Due Date', maxWidth: '20ch' },
    totalAmount: { displayAs: 'Total Amount', maxWidth: '20ch' },
    paidAmount: { displayAs: 'Paid Amount', maxWidth: '20ch' }
  };

  ledgerLinesDisplayedColumns: ColumnSet = {
    account: { displayAs: 'Account', maxWidth: '20ch', wrap: false },
    transactionType: { displayAs: 'Transaction Type', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '20ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '15ch', wrap: false }
  };

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
    public accountingService: AccountingService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private chartOfAccountsService: ChartOfAccountsService,
    private officeService: OfficeService,
    private cdr: ChangeDetectorRef,
    private formatter: FormatterService) {
  }

  //#region Invoice-List
  ngOnInit(): void {
    // Read query params from snapshot first to set tab and officeId immediately
    const snapshotParams = this.route.snapshot.queryParams;
    const tabParam = snapshotParams['tab'];
    const officeIdParam = snapshotParams['officeId'];
    
    // Set tab index from snapshot
    if (tabParam === 'chartOfAccounts') {
      this.selectedTabIndex = 1;
      // Initialize loading state for Chart Of Accounts tab (offices will be loaded)
      this.itemsToLoad$.next(new Set(['offices']));
    } else {
      this.selectedTabIndex = 0;
      // Initialize loading state for Invoices tab
      this.itemsToLoad$.next(new Set(['offices', 'invoices']));
    }
    
    // Set officeId from snapshot if available
    if (officeIdParam) {
      const parsedOfficeId = parseInt(officeIdParam, 10);
      if (parsedOfficeId) {
        this.selectedOfficeId = parsedOfficeId;
      }
    }
    
    // Subscribe to chart of accounts observable
    this.chartOfAccountsSubscription = this.chartOfAccountsService.getAllChartOfAccounts().subscribe({
      next: (chartOfAccounts) => {
        this.allChartOfAccounts = chartOfAccounts || [];
        // Apply filters if we're on the Chart Of Accounts tab
        if (this.selectedTabIndex === 1) {
          this.applyChartOfAccountsFilters();
        }
        // Apply invoice filters if we're on the Invoices tab (chart of accounts are used for descriptions)
        if (this.selectedTabIndex === 0 && this.allInvoices.length > 0) {
          this.applyFilters();
        }
      }
    });
    
    // Load offices first so dropdowns can be initialized
    this.loadOffices();
    
    // Subscribe to query params for changes (for navigation)
    this.route.queryParams.subscribe(params => {
      const updatedOfficeIdParam = params['officeId'];
      if (updatedOfficeIdParam) {
        const parsedOfficeId = parseInt(updatedOfficeIdParam, 10);
        if (parsedOfficeId) {
          this.selectedOfficeId = parsedOfficeId;
        }
      }
      
      // Check if we should switch to Chart Of Accounts tab
      const updatedTabParam = params['tab'];
      if (updatedTabParam === 'chartOfAccounts') {
        if (this.selectedTabIndex !== 1) {
          this.selectedTabIndex = 1;
          // Load Chart Of Accounts data if office is selected
          if (this.selectedOfficeId) {
            this.getChartOfAccounts();
          }
        }
      } else if (updatedTabParam !== 'chartOfAccounts') {
        // Default to Invoices tab if tab param is not chartOfAccounts
        if (this.selectedTabIndex !== 0) {
          this.selectedTabIndex = 0;
          this.getInvoices();
        }
      }
    });
  }

  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    // Only load data if not already loaded - don't call applyFilters() as it triggers change detection
    // The data is already filtered and displayed, so switching tabs shouldn't require reprocessing
    if (this.selectedTabIndex === 0) {
      // Invoices tab - only load if data is empty
      if (this.allInvoices.length === 0) {
        this.getInvoices();
      }
      // Don't call applyFilters() - data is already filtered and displayed
    } else if (this.selectedTabIndex === 1) {
      // Chart Of Accounts tab
      // Only load if office is selected and we don't have data for it
      if (this.selectedOfficeId) {
        const hasDataForOffice = this.allChartOfAccounts.length > 0 && 
          this.allChartOfAccounts.some(account => account.officeId === this.selectedOfficeId);
        if (!hasDataForOffice) {
          this.getChartOfAccounts();
        }
        // Don't call applyChartOfAccountsFilters() - data is already filtered and displayed
      } else {
        // No office selected - clear display
        this.chartOfAccountsDisplay = [];
        this.removeLoadItem('chartOfAccounts');
      }
    }
  }

  onInvoiceOfficeChange(): void {
    // If Chart Of Accounts tab is active and office is selected, reload data
    if (this.selectedTabIndex === 1 && this.selectedOfficeId) {
      this.getChartOfAccounts();
    }
    // Wait for chart of accounts to load before applying filters
    this.loadChartOfAccountsForInvoices().subscribe({
      next: () => {
        this.applyFilters();
      }
    });
  }

  getInvoices(): void {
    this.accountingService.getInvoicesByOffice().pipe(take(1), finalize(() => { this.removeLoadItem('invoices'); })).subscribe({
      next: (invoices) => {
        this.allInvoices = invoices || [];
        // Set all invoices to expanded
        this.expandedInvoices.clear();
        this.allInvoices.forEach(invoice => {
          this.expandedInvoices.add(invoice.invoiceId);
        });
        // Load chart of accounts for all offices that have invoices, then apply filters
        this.loadChartOfAccountsForInvoices().subscribe({
          next: () => {
            this.applyFilters();
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  getInvoiceById(invoiceId: string): InvoiceResponse | undefined {
    return this.allInvoices.find(inv => inv.invoiceId === invoiceId);
  }

  toggleInvoice(invoiceId: string): void {
    if (this.expandedInvoices.has(invoiceId)) {
      this.expandedInvoices.delete(invoiceId);
    } else {
      this.expandedInvoices.add(invoiceId);
    }
    // Trigger change detection to update the view
    this.cdr.detectChanges();
  }

  isExpanded(invoiceId: string): boolean {
    return this.expandedInvoices.has(invoiceId);
  }

  addInvoice(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Accounting, ['new']));
  }

  deleteInvoice(invoice: InvoiceResponse): void {
    if (confirm(`Are you sure you want to delete this invoice?`)) {
      this.accountingService.deleteInvoice(invoice.invoiceId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Invoice deleted successfully', CommonMessage.Success);
          this.getInvoices(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToInvoice(event: InvoiceResponse): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Accounting, [event.invoiceId]));
  }
  //#endregion

  //#region Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.allInvoices;
    if (!this.showInactive) {
      filtered = filtered.filter(invoice => invoice.isActive);
    }
    // Filter by office if selected
    if (this.selectedOfficeId !== null) {
      filtered = filtered.filter(invoice => invoice.officeId === this.selectedOfficeId);
    }
    // Map invoices to include expand button data for DataTableComponent
    this.invoicesDisplay = filtered.map(invoice => {
      // Angular HTTP converts PascalCase to camelCase, so use ledgerLines
      const ledgerLines = invoice['ledgerLines'] ?? [];
      return {
      ...invoice,
      invoiceNumber: invoice.invoiceName || '',
      totalAmount: '$' + this.formatter.currency(invoice.totalAmount),
      paidAmount: '$' + this.formatter.currency(invoice.paidAmount),
      invoiceDate: this.formatter.formatDateString(invoice.invoiceDate),
      dueDate: invoice.dueDate ? this.formatter.formatDateString(invoice.dueDate) : null,
      expand: invoice.invoiceId, // Store invoiceId for expand functionality
      expanded: this.isExpanded(invoice.invoiceId), // Should be true for all invoices by default
      LedgerLines: ledgerLines, // Include ledger lines in the display data (using PascalCase for template)
      expandClick: (event: Event, item: any) => {
        event.stopPropagation();
        this.toggleInvoice(item.invoiceId);
        item.expanded = this.isExpanded(item.invoiceId);
      }
      };
    });
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

  getTransactionTypeLabel(transactionTypeId: number): string {
    const types = ['Debit', 'Credit', 'Payment', 'Refund', 'Charge', 'Deposit', 'Adjustment'];
    return types[transactionTypeId] || 'Unknown';
  }

  getChartOfAccountDescription(chartOfAccountId: number | string | undefined, officeId: number): string {
    if (!chartOfAccountId) return '-';
    
    // Find the chart of account for this office
    // Try matching by chartOfAccountId first, then by accountId
    let account = this.allChartOfAccounts.find(
      coa => (coa.chartOfAccountId === chartOfAccountId || coa.accountId === chartOfAccountId) && coa.officeId === officeId
    );
    
    // If not found and it's a string, try parsing as number
    if (!account && typeof chartOfAccountId === 'string') {
      const numericId = parseInt(chartOfAccountId, 10);
      if (!isNaN(numericId)) {
        account = this.allChartOfAccounts.find(
          coa => (coa.chartOfAccountId === numericId || coa.accountId === numericId) && coa.officeId === officeId
        );
      }
    }
    
    return account?.description || chartOfAccountId.toString();
  }

  getReservationCode(reservationId: string | null | undefined, invoiceReservationCode: string | null | undefined): string {
    // Use the invoice's reservationCode if available, otherwise return the ID or '-'
    return invoiceReservationCode || reservationId || '-';
  }

  getLedgerLineColumnNames(): string[] {
    return Object.keys(this.ledgerLinesDisplayedColumns);
  }

  getLedgerLineColumnValue(line: any, columnName: string, invoice: any): any {
    switch (columnName) {
      case 'account':
        return this.getChartOfAccountDescription(line.chartOfAccountId, invoice.officeId);
      case 'transactionType':
        return this.getTransactionTypeLabel(line.transactionTypeId ?? line.transactionType ?? 0);
      case 'reservation':
        return this.getReservationCode(line.reservationId, invoice.reservationCode);
      case 'description':
        return line.description || '-';
      case 'amount':
        return '$' + this.formatter.currency(line.amount);
      default:
        return line[columnName] || '-';
    }
  }

  loadChartOfAccountsForInvoices(): Observable<void> {
    // Chart of accounts are now loaded globally via the service observable
    // This method is kept for compatibility but just returns immediately
    // The chart of accounts will already be available via the subscription
    return of(void 0);
  }

  //#region Chart Of Accounts Methods
  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
    });
  }

  initializeDataAfterOfficesLoaded(): void {
    // Check if officeId from query params is valid
    if (this.selectedOfficeId && this.offices.some(o => o.officeId === this.selectedOfficeId)) {
      // OfficeId is already set from snapshot, just load data based on active tab
      if (this.selectedTabIndex === 1) {
        this.getChartOfAccounts();
      } else if (this.selectedTabIndex === 0) {
        this.getInvoices();
      }
        } else if (this.selectedOfficeId) {
          // OfficeId was set but not found in offices list - clear it
          this.selectedOfficeId = null;
        } else {
          // No officeId in query params - use default behavior
          // Auto-select first office for Chart Of Accounts tab if available
          if (this.offices.length > 0 && this.selectedTabIndex === 1) {
            this.selectedOfficeId = this.offices[0].officeId;
            this.getChartOfAccounts();
          } else if (this.selectedTabIndex === 0) {
        // Load invoices for Invoices tab (office can be null for "All Offices")
        this.getInvoices();
      }
    }
  }

  onOfficeChange(): void {
    // Reload invoices if Invoices tab is active
    if (this.selectedTabIndex === 0) {
      this.applyFilters();
    }
    // Load Chart Of Accounts data if office is selected
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
    // Chart of accounts are already loaded via the service observable
    // Just filter and display them for the selected office
    this.applyChartOfAccountsFilters();
  }

  applyChartOfAccountsFilters(): void {
    let filtered = this.allChartOfAccounts;
    
    // Filter by office if selected
    if (this.selectedOfficeId !== null) {
      filtered = filtered.filter(account => account.officeId === this.selectedOfficeId);
    }
    
    // Filter by inactive if needed
    if (!this.showInactiveChartOfAccounts) {
      filtered = filtered.filter(account => account.isActive !== false);
    }
    
    // Map chart of accounts using mapping service to convert accountType to display string
    const mapped = this.mappingService.mapChartOfAccounts(filtered, this.offices);
    this.chartOfAccountsDisplay = mapped;
  }

  toggleInactiveChartOfAccounts(): void {
    this.showInactiveChartOfAccounts = !this.showInactiveChartOfAccounts;
    this.applyChartOfAccountsFilters();
  }

  addChartOfAccount(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.ChartOfAccounts, ['new']);
    const queryParams: string[] = [];
    if (this.selectedOfficeId) {
      queryParams.push('officeId=' + this.selectedOfficeId);
    }
    queryParams.push('fromAccountingTab=true');
    this.router.navigateByUrl(url + '?' + queryParams.join('&'));
  }

  deleteChartOfAccount(chartOfAccount: ChartOfAccountsResponse): void {
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
          this.getChartOfAccounts(); // Refresh the display
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
    const queryParams: string[] = [];
    const officeIdToUse = event.officeId || this.selectedOfficeId;
    if (officeIdToUse) {
      queryParams.push('officeId=' + officeIdToUse);
    }
    queryParams.push('fromAccountingTab=true');
    this.router.navigateByUrl(url + '?' + queryParams.join('&'));
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

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
    this.chartOfAccountsSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
