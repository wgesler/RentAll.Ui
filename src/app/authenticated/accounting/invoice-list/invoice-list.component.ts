import { OnInit, Component, OnDestroy, ChangeDetectorRef, ViewChild, TemplateRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { InvoiceResponse, InvoiceListDisplay, LedgerLineResponse } from '../models/accounting.model';
import { AccountingService } from '../services/accounting.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, Subscription, filter } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { FormatterService } from '../../../services/formatter-service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountsResponse } from '../models/chart-of-accounts.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { TransactionType } from '../models/accounting-enum';

@Component({
  selector: 'app-invoice-list',
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DatePipe]
})

export class InvoiceListComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate: TemplateRef<any>;
  @Input() embeddedMode: boolean = false; // If true, hide header
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property

  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
 
  chartOfAccounts: ChartOfAccountsResponse[] = [];
  availableChartOfAccounts: { value: string, label: string }[] = [];
  chartOfAccountsSubscription?: Subscription;
  
  transactionTypes: { value: number, label: string }[] = [];
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
    this.setupTransactions();
    this.loadOffices();
    this.loadChartOfAccounts();
    
    // Handle query params for office selection changes (only if not in embedded mode)
    if (!this.embeddedMode) {
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId && this.offices.length > 0) {
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              this.filterChartOfAccounts();
              this.addLoadItem('invoices');
              this.getInvoices();
            }
            this.applyFilters();
          }
        } else {
          this.selectedOffice = null;
          // Clear invoices when no office is selected
          this.allInvoices = [];
          this.invoicesDisplay = [];
          this.applyFilters();
        }
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input from parent
    if (changes['officeId'] && this.embeddedMode) {
      const newOfficeId = changes['officeId'].currentValue;
      // Wait for offices to be loaded before setting selectedOffice
      if (this.offices.length > 0) {
        this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
        if (this.selectedOffice) {
          this.filterChartOfAccounts();
          this.addLoadItem('invoices');
          this.getInvoices();
        } else {
          this.applyFilters();
        }
      } else {
        // Offices not loaded yet, wait for them to load in loadOffices()
        // The loadOffices() method will handle setting selectedOffice from officeId input
      }
    }
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
        // Apply filters (chart of accounts are already loaded via subscription)
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
    if (this.selectedOffice) {
      filtered = filtered.filter(invoice => invoice.officeId === this.selectedOffice.officeId);
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
  //#endregion

  //#region Dropdowns
  filterChartOfAccounts(): void {
    if (!this.selectedOffice) {
      this.chartOfAccounts = [];
      this.availableChartOfAccounts = [];
      return;
    }
    
    // Get chart of accounts for the selected office from the observable data
    this.chartOfAccounts = this.chartOfAccountsService.getChartOfAccountsForOffice(this.selectedOffice.officeId);
    this.availableChartOfAccounts = this.chartOfAccounts.filter(account => account.isActive).map(account => ({
        value: account.chartOfAccountId,
        label: `${account.accountId} - ${account.description}`
      }));
  }

  setupTransactions(): void {
    this.transactionTypes = [
      { value: TransactionType.Debit, label: 'Debit' },
      { value: TransactionType.Credit, label: 'Credit' },
      { value: TransactionType.Payment, label: 'Payment' },
      { value: TransactionType.Refund, label: 'Refund' },
      { value: TransactionType.Charge, label: 'Charge' },
      { value: TransactionType.Deposit, label: 'Deposit' },
      { value: TransactionType.Adjustment, label: 'Adjustment' }
    ];
  }
  //#endregion

  //#region Data Load Items
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.removeLoadItem('offices');
        
        // Set selectedOffice from input (embedded mode) or query params (standalone mode)
        if (this.embeddedMode && this.officeId !== null && this.officeId !== undefined) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        } else if (!this.embeddedMode) {
          const snapshotParams = this.route.snapshot.queryParams;
          const officeIdParam = snapshotParams['officeId'];
          if (officeIdParam) {
            const parsedOfficeId = parseInt(officeIdParam, 10);
            if (parsedOfficeId) {
              this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            }
          }
        }
        
        // Only load invoices if an office is selected
        if (this.selectedOffice) {
          this.filterChartOfAccounts();
          this.addLoadItem('invoices');
          this.getInvoices();
        } else {
          // No office selected, clear invoices display
          this.allInvoices = [];
          this.invoicesDisplay = [];
        }
      });
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.chartOfAccountsSubscription = this.chartOfAccountsService.getAllChartOfAccounts().subscribe(accounts => {
        this.filterChartOfAccounts();
      });
    });
  }
  //#endregion

  //#region Form Response Methods
  onOfficeChange(): void {
    // Emit office change to parent if in embedded mode
    if (this.embeddedMode && this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else if (this.embeddedMode && !this.selectedOffice) {
      this.officeIdChange.emit(null);
    }
    
    // Only load invoices if an office is selected
    if (this.selectedOffice) {
      this.filterChartOfAccounts();
      this.addLoadItem('invoices');
      this.getInvoices();
    } else {
      // Clear invoices when no office is selected
      this.allInvoices = [];
      this.invoicesDisplay = [];
      this.applyFilters();
    }
  }

  getTransactionTypeLabel(transactionTypeId: number): string {
    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    return transactionType?.label || 'Unknown';
  }

  getChartOfAccountDescription(chartOfAccountId: number | string | undefined, officeId: number): string {
    if (!chartOfAccountId) return '-';
    
    // Find the chart of account for this office
    // Try matching by chartOfAccountId first, then by accountId (if chartOfAccountId is a number string)
    let account = this.chartOfAccounts.find(
      coa => (coa.chartOfAccountId === chartOfAccountId || coa.accountId.toString() === chartOfAccountId) && coa.officeId === officeId
    );
    
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
    this.itemsToLoad$.complete();
    this.chartOfAccountsSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
