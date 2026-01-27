import { OnInit, Component, OnDestroy, ViewChild, TemplateRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { InvoiceResponse, LedgerLineResponse } from '../models/invoice.model';
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
import { CostCodesService } from '../services/cost-codes.service';
import { CostCodesResponse } from '../models/cost-codes.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationListResponse } from '../../reservation/models/reservation-model';
import { TransactionTypeLabels } from '../models/accounting-enum';

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

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  reservationsSubscription?: Subscription;
  selectedReservation: ReservationListResponse | null = null;
 
  costCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: string, label: string }[] = [];
  costCodesSubscription?: Subscription;
  
  transactionTypes: { value: number, label: string }[] = [] = TransactionTypeLabels;
  invoicesDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '50px', sort: false },
    invoiceNumber: { displayAs: 'Invoice', maxWidth: '20ch', sortType: 'natural' },
    officeName: { displayAs: 'Office', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '20ch' },
    dueDate: { displayAs: 'Due Date', maxWidth: '20ch' },
    totalAmount: { displayAs: 'Total', maxWidth: '15ch' },
    paidAmount: { displayAs: 'Paid', maxWidth: '15ch' }
  };

  ledgerLinesDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: '#', maxWidth: '5ch', wrap: false, alignment: 'right' },
    account: { displayAs: 'Account', maxWidth: '20ch', wrap: false },
    transactionType: { displayAs: 'Transaction Type', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '20ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '15ch', wrap: false }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'reservations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public accountingService: AccountingService,
    public toastr: ToastrService,
    public router: Router,
    public route: ActivatedRoute,
    public mappingService: MappingService,
    private costCodesService: CostCodesService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private formatter: FormatterService) {
  }

  //#region Invoice-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadReservations();
    this.loadCostCodes();
    
    // Handle query params for office selection changes (works in both embedded and non-embedded modes)
    // Wait for offices to load before processing query params
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            // Find office from already loaded offices
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              // Emit office change to parent if in embedded mode
              if (this.embeddedMode) {
                this.officeIdChange.emit(this.selectedOffice.officeId);
              }
              this.filterCostCodes();
              this.addLoadItem('invoices');
              this.getInvoices(); // Refresh invoices when returning
            }
            this.applyFilters();
          }
        } else {
          if (!this.embeddedMode || this.officeId === null || this.officeId === undefined) {
            this.selectedOffice = null;
            this.allInvoices = [];
            this.invoicesDisplay = [];
            this.applyFilters();
          }
        }
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input from parent
    if (changes['officeId'] && this.embeddedMode) {
      const newOfficeId = changes['officeId'].currentValue;
       if (this.offices.length > 0) {
        this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
        if (this.selectedOffice) {
          this.filterCostCodes();
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
         this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
         }
      }
    });
  }

  addInvoice(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Accounting, ['new']);
    const params: string[] = [];
    if (this.selectedOffice) {
      params.push(`officeId=${this.selectedOffice.officeId}`);
    }
    if (this.selectedReservation) {
      params.push(`reservationId=${this.selectedReservation.reservationId}`);
    }
    if (params.length > 0) {
      this.router.navigateByUrl(url + `?${params.join('&')}`);
    } else {
      this.router.navigateByUrl(url);
    }
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
    const url = RouterUrl.replaceTokens(RouterUrl.Accounting, [event.invoiceId]);
    const params: string[] = [];
    if (this.selectedOffice) {
      params.push(`officeId=${this.selectedOffice.officeId}`);
    }
    if (this.selectedReservation) {
      params.push(`reservationId=${this.selectedReservation.reservationId}`);
    }
    if (params.length > 0) {
      this.router.navigateByUrl(url + `?${params.join('&')}`);
    } else {
      this.router.navigateByUrl(url);
    }
  }

  onPayable(event: InvoiceResponse): void {
    // TODO: Implement payable action
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

    // Filter by reservation if selected
    if (this.selectedReservation) {
      filtered = filtered.filter(invoice => invoice.reservationId === this.selectedReservation.reservationId);
    }

    // Map invoices to include expand button data for DataTableComponent
    this.invoicesDisplay = filtered.map(invoice => {
      // Angular HTTP converts PascalCase to camelCase, so use ledgerLines
      const rawLedgerLines = invoice['ledgerLines'] ?? [];
      const mappedLedgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.costCodes, invoice.officeId, this.transactionTypes);
      return {
      ...invoice,
      invoiceNumber: invoice.invoiceName || '',
      totalAmount: '$' + this.formatter.currency(invoice.totalAmount),
      paidAmount: '$' + this.formatter.currency(invoice.paidAmount),
      invoiceDate: this.formatter.formatDateString(invoice.invoiceDate),
      dueDate: invoice.dueDate ? this.formatter.formatDateString(invoice.dueDate) : null,
      expand: invoice.invoiceId, // Store invoiceId for expand functionality
      expanded: this.expandedInvoices.has(invoice.invoiceId), // Restore expanded state from Set
      LedgerLines: mappedLedgerLines, 
      expandClick: (event: Event, item: any) => {
        event.stopPropagation();
        if (this.expandedInvoices.has(item.invoiceId)) {
          this.expandedInvoices.delete(item.invoiceId);
        } else {
          this.expandedInvoices.add(item.invoiceId);
        }
        this.applyFilters();
      }
      };
    });
  }
  //#endregion

  //#region Dropdowns
  filterCostCodes(): void {
    if (!this.selectedOffice) {
      this.costCodes = [];
      this.availableCostCodes = [];
      return;
    }
    
    // Get cost codes for the selected office from the observable data
    this.costCodes = this.costCodesService.getCostCodesForOffice(this.selectedOffice.officeId);
    this.availableCostCodes = this.costCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: `${c.costCode} - ${c.description}`
      }));
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
          this.filterCostCodes();
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

  loadReservations(): void {
    this.addLoadItem('reservations');
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.removeLoadItem('reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
      },
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        this.availableReservations = [];
        if (err.status !== 400 && err.status !== 401) {
          this.toastr.error('Could not load Reservations', CommonMessage.ServiceError);
        }
      }
    });
  }

  filterReservations(): void {
    if (!this.selectedOffice) {
      this.availableReservations = [];
      this.selectedReservation = null;
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: `${r.reservationCode || r.reservationId.substring(0, 8)} - ${r.tenantName || 'N/A'}`
    }));
    
    // Clear selected reservation if it doesn't belong to the selected office
    if (this.selectedReservation && this.selectedReservation.officeId !== this.selectedOffice.officeId) {
      this.selectedReservation = null;
      this.applyFilters();
    }
  }

  loadCostCodes(): void {
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(accounts => {
        this.filterCostCodes();
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
    
    // Filter reservations by selected office
    this.filterReservations();
    
    // Only load invoices if an office is selected
    if (this.selectedOffice) {
      this.filterCostCodes();
      this.addLoadItem('invoices');
      this.getInvoices();
    } else {
      // Clear invoices when no office is selected
      this.allInvoices = [];
      this.invoicesDisplay = [];
      this.selectedReservation = null;
      this.applyFilters();
    }
  }

  onReservationChange(): void {
    this.applyFilters();
  }

  getTransactionTypeLabel(transactionTypeId: number): string {
    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    return transactionType?.label || 'Unknown';
  }

  getCostCodeDescription(costCodeId: number | string | undefined, officeId: number): string {
    if (!costCodeId) return '-';
    let costCode = this.costCodes.find(
      c => (c.costCodeId === costCodeId || c.costCode?.toString() === costCodeId?.toString()) && c.officeId === officeId
    );
    
    return costCode?.description || costCodeId.toString();
  }

  getReservationCode(reservationId: string | null | undefined, invoiceReservationCode: string | null | undefined): string {    // Use the invoice's reservationCode if available, otherwise return the ID or '-'
    return invoiceReservationCode || reservationId || '-';
  }

  getLedgerLineColumnNames(): string[] {
    return Object.keys(this.ledgerLinesDisplayedColumns);
  }

  getLedgerLineColumnValue(line: any, columnName: string, invoice: any, lineIndex?: number): any {
    switch (columnName) {
      case 'lineNo':
        return lineIndex !== undefined ? lineIndex + 1 : '-';
      case 'account':
        return line.costCode || this.getCostCodeDescription(line.costCodeId, invoice.officeId);
      case 'transactionType':
        return line.transactionType || this.getTransactionTypeLabel(line.transactionTypeId ?? 0);
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

  getDetailRowContextMethods() {
    return {
      getLedgerLineColumnValue: (line: any, columnName: string, invoice: any) => this.getLedgerLineColumnValue(line, columnName, invoice),
      ledgerLinesDisplayedColumns: this.ledgerLinesDisplayedColumns,
      ledgerLineColumnNames: Object.keys(this.ledgerLinesDisplayedColumns)
    };
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
    this.costCodesSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.reservationsSubscription?.unsubscribe();
  }
  //#endregion
}
