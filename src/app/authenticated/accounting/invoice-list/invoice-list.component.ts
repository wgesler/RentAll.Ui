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

@Component({
  selector: 'app-invoice-list',
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DatePipe]
})

export class InvoiceListComponent implements OnInit, OnDestroy {
  @ViewChild('ledgerLinesTemplate') ledgerLinesTemplate: TemplateRef<any>;
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property

  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded
  selectedOffice: OfficeResponse | null = null;
  allChartOfAccounts: ChartOfAccountsResponse[] = []; // For getChartOfAccountDescription
  chartOfAccountsSubscription?: Subscription;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;

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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'invoices']));
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
    // Read query params from snapshot first to set office immediately
    const snapshotParams = this.route.snapshot.queryParams;
    const officeIdParam = snapshotParams['officeId'];
    
    // Subscribe to chart of accounts observable (needed for getChartOfAccountDescription in ledger lines)
    this.chartOfAccountsSubscription = this.chartOfAccountsService.getAllChartOfAccounts().subscribe({
      next: (chartOfAccounts) => {
        this.allChartOfAccounts = chartOfAccounts || [];
        // Apply filters if invoices are already loaded
        if (this.allInvoices.length > 0) {
          this.applyFilters();
        }
      }
    });
    
    // Load offices first so dropdowns can be initialized
    this.loadOffices().then(() => {
      // Set selectedOffice from query params after offices are loaded
      if (officeIdParam) {
        const parsedOfficeId = parseInt(officeIdParam, 10);
        if (parsedOfficeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
        }
      }
    });
    
    // Subscribe to query params for changes (for navigation)
    this.route.queryParams.subscribe(params => {
      const updatedOfficeIdParam = params['officeId'];
      if (updatedOfficeIdParam) {
        const parsedOfficeId = parseInt(updatedOfficeIdParam, 10);
        if (parsedOfficeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
          this.applyFilters();
        }
      }
    });
  }

  onInvoiceOfficeChange(): void {
    // selectedOffice is already set by ngModel binding
    // Apply filters when office changes
    this.applyFilters();
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

  loadOffices(): Promise<void> {
    return new Promise((resolve) => {
      // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
      this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
        this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.removeLoadItem('offices');
          // Load invoices after offices are loaded
          this.getInvoices();
          resolve();
        });
      });
    });
  }

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
