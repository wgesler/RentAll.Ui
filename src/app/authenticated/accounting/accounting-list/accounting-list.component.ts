import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { InvoiceResponse, InvoiceListDisplay, LedgerLineResponse } from '../models/accounting.model';
import { AccountingService } from '../services/accounting.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { TransactionType } from '../models/accounting-enum';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-accounting-list',
  templateUrl: './accounting-list.component.html',
  styleUrls: ['./accounting-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent, DatePipe]
})

export class AccountingListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property
  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded

  invoicesDisplayedColumns: ColumnSet = {
    expand: { displayAs: '', maxWidth: '50px', sort: false },
    invoiceNumber: { displayAs: 'Invoice #', maxWidth: '15ch', sortType: 'natural' },
    officeName: { displayAs: 'Office', maxWidth: '20ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '15ch' },
    dueDate: { displayAs: 'Due Date', maxWidth: '15ch' },
    totalAmount: { displayAs: 'Total Amount', maxWidth: '15ch' },
    paidAmount: { displayAs: 'Paid Amount', maxWidth: '15ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['invoices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public accountingService: AccountingService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService) {
  }

  //#region Invoice-List
  ngOnInit(): void {
    this.getInvoices();
  }

  getInvoices(): void {
    this.accountingService.getInvoices().pipe(take(1), finalize(() => { this.removeLoadItem('invoices'); })).subscribe({
      next: (invoices) => {
        this.allInvoices = invoices || [];
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
    // Map invoices to include expand button data for DataTableComponent
    this.invoicesDisplay = filtered.map(invoice => ({
      ...invoice,
      invoiceNumber: invoice.invoiceId.substring(0, 8),
      expand: invoice.invoiceId, // Store invoiceId for expand functionality
      expanded: this.isExpanded(invoice.invoiceId),
      expandClick: (event: Event, item: any) => {
        event.stopPropagation();
        this.toggleInvoice(item.invoiceId);
        item.expanded = this.isExpanded(item.invoiceId);
      }
    }));
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

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
