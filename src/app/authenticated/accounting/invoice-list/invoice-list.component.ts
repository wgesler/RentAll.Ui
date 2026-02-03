import { OnInit, Component, OnDestroy, ViewChild, TemplateRef, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, DatePipe } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { InvoiceResponse } from '../models/invoice.model';
import { AccountingService } from '../services/accounting.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, Subscription, filter } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
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
import { MatDialog } from '@angular/material/dialog';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { ApplyPaymentDialogComponent, ApplyPaymentDialogData } from '../../shared/modals/apply-payment/apply-payment-dialog.component';
import { ReservationPaymentRequest } from '../../reservation/models/reservation-model';
import { AuthService } from '../../../services/auth.service';

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
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Input() source: 'reservation' | 'accounting' | null = null; // Track where we came from for back button navigation
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  @Output() printInvoiceEvent = new EventEmitter<{ officeId: number | null, reservationId: string | null, invoiceId: string }>(); // Emit print invoice event to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allInvoices: InvoiceResponse[] = [];
  invoicesDisplay: any[] = []; // Will contain invoices with expand property

  expandedInvoices: Set<string> = new Set(); // Track which invoices are expanded
  isAllExpanded: boolean = false; // Track if all rows are expanded

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
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
  invoicesDisplayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '50px', sort: false },
    invoiceNumber: { displayAs: 'Invoice', maxWidth: '20ch', sortType: 'natural' },
    officeName: { displayAs: 'Office', maxWidth: '15ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '20ch' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '15ch' },
    totalAmount: { displayAs: 'Total', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    paidAmount: { displayAs: 'Paid', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' },
    dueAmount: { displayAs: 'Due', maxWidth: '15ch', alignment: 'right', headerAlignment: 'right' }
  };

  ledgerLinesDisplayedColumns: ColumnSet = {
    lineNo: { displayAs: 'No', maxWidth: '5ch', wrap: false, alignment: 'left' },
    costCode: { displayAs: 'Cost Code', maxWidth: '25ch', wrap: false },
    transactionType: { displayAs: 'Type', maxWidth: '15ch', wrap: false },
    description: { displayAs: 'Description', maxWidth: '15ch', wrap: true },
    amount: { displayAs: 'Amount', maxWidth: '15ch', wrap: false, alignment: 'right'}
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
    private formatter: FormatterService,
    private utilityService: UtilityService,
    private dialog: MatDialog,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone) {
  }

  //#region Invoice-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadReservations();
    this.loadCostCodes();
    
    // Load all invoices on startup
    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
    this.loadAllInvoices();
    
    // Handle query params for office selection changes (works in both embedded and non-embedded modes)
    // Wait for offices to load before processing query params
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      // Apply initial officeId from @Input if in embedded mode
      if (this.embeddedMode && this.officeId !== null && this.offices.length > 0) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        if (this.selectedOffice) {
          this.filterCostCodes();
          this.filterReservations();
          // Filter invoices client-side by office
          this.applyFilters();
          
          // Apply initial reservationId from @Input if provided
          if (this.reservationId !== null && this.reservations.length > 0) {
            this.selectedReservation = this.reservations.find(r => 
              r.reservationId === this.reservationId && r.officeId === this.selectedOffice?.officeId
            ) || null;
          }
        }
      }
      
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
              this.filterReservations();
              // Filter invoices client-side by office
              this.applyFilters();
            }
          }
        } else {
          if (!this.embeddedMode || this.officeId === null || this.officeId === undefined) {
            this.selectedOffice = null;
            // Show all invoices when no office is selected
            this.applyFilters();
          }
        }
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Watch for changes to officeId input from parent (including initial load)
    if (changes['officeId'] && this.embeddedMode) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Update if the value changed (including initial load when previousOfficeId is undefined)
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
          if (this.selectedOffice) {
            this.filterCostCodes();
            this.filterReservations();
            // Filter invoices client-side by office
            this.applyFilters();
          } else {
            this.selectedReservation = null;
            // Show all invoices when no office is selected
            this.applyFilters();
          }
        } else {
          // Offices not loaded yet, wait for them to load in loadOffices()
          // The loadOffices() method will handle setting selectedOffice from officeId input
        }
      }
    }
    
    // Watch for changes to reservationId input from parent (including initial load)
    if (changes['reservationId'] && this.embeddedMode) {
      const newReservationId = changes['reservationId'].currentValue;
      const previousReservationId = changes['reservationId'].previousValue;
      
      // Update if the value changed (including initial load when previousReservationId is undefined)
      if (previousReservationId === undefined || newReservationId !== previousReservationId) {
        // Always try to set reservation, even if reservations haven't loaded yet
        // filterReservations() will handle it when reservations are loaded
        if (this.reservations.length > 0 && this.selectedOffice) {
          this.selectedReservation = newReservationId 
            ? this.reservations.find(r => r.reservationId === newReservationId && r.officeId === this.selectedOffice?.officeId) || null
            : null;
          this.applyFilters();
        }
      }
    }
  }

  loadAllInvoices(): void {
    this.accountingService.getAllInvoices().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices'); })).subscribe({
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

  getInvoices(): void {
    if (!this.selectedOffice?.officeId) {
      return;
    }
    this.accountingService.getInvoicesByOffice(this.selectedOffice.officeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices'); })).subscribe({
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
    
    // In embedded mode, prefer @Input() values from parent, otherwise use selectedOffice/selectedReservation
    const officeIdToUse = (this.embeddedMode && this.officeId !== null) ? this.officeId : (this.selectedOffice?.officeId || null);
    const reservationIdToUse = (this.embeddedMode && this.reservationId !== null) ? this.reservationId : (this.selectedReservation?.reservationId || null);
    
    if (officeIdToUse !== null) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse !== null) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    // Add returnTo parameter based on source input (explicit tracking)
    if (this.source === 'reservation') {
      params.push(`returnTo=reservation`);
      params.push(`fromReservation=true`); // Keep for backward compatibility
    } else if (this.source === 'accounting') {
      params.push(`returnTo=accounting`);
    } else if (this.embeddedMode && reservationIdToUse !== null) {
      // Fallback: if source not set but embedded with reservation, assume reservation
      params.push(`returnTo=reservation`);
      params.push(`fromReservation=true`);
    } else {
      // Default to accounting
      params.push(`returnTo=accounting`);
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

  printInvoice(invoice: InvoiceResponse): void {
    // Get values directly from the clicked invoice line
    const officeId = invoice?.officeId ?? null;
    const reservationId = invoice?.reservationId ?? null;
    const invoiceId = invoice?.invoiceId ?? null;
    
    if (this.embeddedMode) {
      // In embedded mode, emit event to parent to switch tabs without navigation
      if (invoiceId) {
        this.printInvoiceEvent.emit({ officeId, reservationId, invoiceId });
      }
    } else {
      // Not in embedded mode, navigate to Create Invoice page
      // Always include officeId and invoiceId, and reservationId if available
      const params: string[] = [];
      
      if (officeId !== null && officeId !== undefined) {
        params.push(`officeId=${officeId}`);
      }
      if (reservationId !== null && reservationId !== undefined && reservationId !== '') {
        params.push(`reservationId=${reservationId}`);
      }
      if (invoiceId) {
        params.push(`invoiceId=${invoiceId}`);
      }
      
      // Navigate to Create Invoice route with all parameters
      const url = params.length > 0 
        ? `${RouterUrl.CreateInvoice}?${params.join('&')}`
        : RouterUrl.CreateInvoice;
      this.router.navigateByUrl(url);
    }
  }

  goToInvoice(event: InvoiceResponse): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Accounting, [event.invoiceId]);
    const params: string[] = [];
    
    // In embedded mode, prefer @Input() values from parent, otherwise use selectedOffice/selectedReservation
    const officeIdToUse = (this.embeddedMode && this.officeId !== null) ? this.officeId : (this.selectedOffice?.officeId || null);
    const reservationIdToUse = (this.embeddedMode && this.reservationId !== null) ? this.reservationId : (this.selectedReservation?.reservationId || null);
    
    if (officeIdToUse !== null) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse !== null) {
      params.push(`reservationId=${reservationIdToUse}`);
    }
    // Add returnTo parameter based on source input (explicit tracking)
    if (this.source === 'reservation') {
      params.push(`returnTo=reservation`);
      params.push(`fromReservation=true`); // Keep for backward compatibility
    } else if (this.source === 'accounting') {
      params.push(`returnTo=accounting`);
    } else if (this.embeddedMode && reservationIdToUse !== null) {
      // Fallback: if source not set but embedded with reservation, assume reservation
      params.push(`returnTo=reservation`);
      params.push(`fromReservation=true`);
    } else {
      // Default to accounting
      params.push(`returnTo=accounting`);
    }
    if (params.length > 0) {
      this.router.navigateByUrl(url + `?${params.join('&')}`);
    } else {
      this.router.navigateByUrl(url);
    }
  }

  onPayable(event: InvoiceResponse): void {
    // Calculate remaining amount (totalAmount - paidAmount)
    const totalAmount = event.totalAmount || 0;
    const paidAmount = event.paidAmount || 0;
    const remainingAmount = totalAmount - paidAmount;
    
    if (remainingAmount <= 0) {
      // Show dialog that invoice is paid in full
      this.dialog.open(GenericModalComponent, {
        data: {
          title: 'Invoice Paid in Full',
          message: 'No more payments can be applied to this invoice, it is paid in full.',
          icon: 'info',
          iconColor: 'primary',
          no: '',
          yes: 'OK',
          callback: (dialogRef, result) => {
            dialogRef.close();
          },
          useHTML: false
        }
      });
    } else {
      // Navigate to invoice component and add a ledger line
      const url = RouterUrl.replaceTokens(RouterUrl.Accounting, [event.invoiceId]);
      const params: string[] = [];
      
      // In embedded mode, prefer @Input() values from parent, otherwise use selectedOffice/selectedReservation
      const officeIdToUse = (this.embeddedMode && this.officeId !== null) ? this.officeId : (this.selectedOffice?.officeId || null);
      const reservationIdToUse = (this.embeddedMode && this.reservationId !== null) ? this.reservationId : (this.selectedReservation?.reservationId || null);
      
      if (officeIdToUse !== null) {
        params.push(`officeId=${officeIdToUse}`);
      }
      if (reservationIdToUse !== null) {
        params.push(`reservationId=${reservationIdToUse}`);
      }
      params.push('addLedgerLine=true');
      // Add returnTo parameter based on source input (explicit tracking)
      if (this.source === 'reservation') {
        params.push(`returnTo=reservation`);
        params.push(`fromReservation=true`); // Keep for backward compatibility
      } else if (this.source === 'accounting') {
        params.push(`returnTo=accounting`);
      } else if (this.embeddedMode && reservationIdToUse !== null) {
        // Fallback: if source not set but embedded with reservation, assume reservation
        params.push(`returnTo=reservation`);
        params.push(`fromReservation=true`);
      } else {
        // Default to accounting
        params.push(`returnTo=accounting`);
      }
      if (params.length > 0) {
        this.router.navigateByUrl(url + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(url);
      }
    }
  }

  openApplyPaymentDialog(): void {
    if (!this.selectedOffice) {
      this.toastr.warning('Please select an office first');
      return;
    }

    const dialogData: ApplyPaymentDialogData = {
      costCodes: this.costCodes,
      transactionTypes: this.transactionTypes,
      officeId: this.selectedOffice.officeId,
      reservations: this.availableReservations,
      selectedReservation: this.selectedReservation
    };

    const dialogRef = this.dialog.open(ApplyPaymentDialogComponent, {
      width: '700px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result: { reservationId: string | null, costCodeId: number | null, description: string, amount: number } | undefined) => {
      if (result && result.reservationId && result.costCodeId !== null) {
        const paymentRequest: ReservationPaymentRequest = {
          reservationId: result.reservationId,
          costCodeId: result.costCodeId,
          description: result.description || '',
          amount: Math.abs(result.amount) // Payment should be positive
        };

        this.reservationService.applyPayment(paymentRequest).pipe(take(1)).subscribe({
          next: () => {
            this.toastr.success(`Payment of $${paymentRequest.amount.toFixed(2)} applied`, CommonMessage.Success);
            // Refresh invoices to show updated payment amounts
            if (this.selectedOffice) {
              this.getInvoices();
            }
          },
          error: (err: HttpErrorResponse) => {
            this.toastr.error('Failed to apply payment', CommonMessage.Error);
          }
        });
      }
    });
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
      const mappedLedgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.costCodes, this.transactionTypes);
      const totalAmount = invoice.totalAmount || 0;
      const paidAmount = invoice.paidAmount || 0;
      const dueAmount = totalAmount - paidAmount;
      
      return {
      ...invoice,
      invoiceNumber: invoice.invoiceName || '',
      totalAmount: '$' + this.formatter.currency(totalAmount),
      paidAmount: '$' + this.formatter.currency(paidAmount),
      dueAmount: '$' + this.formatter.currency(dueAmount),
      startDate: this.formatter.formatDateString(invoice.startDate),
      endDate: this.formatter.formatDateString(invoice.endDate),
      invoiceDate: this.formatter.formatDateString(invoice.invoiceDate),
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
    // Update isAllExpanded state after filtering
    this.updateIsAllExpanded();
  }

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (expanded) {
      // Expand all: add all invoice IDs to the set
      this.invoicesDisplay.forEach(invoice => {
        if (invoice.invoiceId) {
          this.expandedInvoices.add(invoice.invoiceId);
        }
      });
    } else {
      // Collapse all: clear the set
      this.expandedInvoices.clear();
    }
    // Update the expanded state for all invoices
    this.applyFilters();
  }

  updateIsAllExpanded(): void {
    // Check if all visible invoices are expanded
    if (this.invoicesDisplay.length === 0) {
      this.isAllExpanded = false;
      return;
    }
    this.isAllExpanded = this.invoicesDisplay.every(invoice => 
      invoice.invoiceId && this.expandedInvoices.has(invoice.invoiceId)
    );
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
        label: `${c.costCode}: ${c.description}`
      }));
  }
  //#endregion

  //#region Data Load Items
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        
        // Set selectedOffice from input (embedded mode) or query params (standalone mode)
        // Always check current officeId input value to sync with other tabs
        if (this.embeddedMode && this.officeId !== null && this.officeId !== undefined) {
          const matchingOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (matchingOffice !== this.selectedOffice) {
            this.selectedOffice = matchingOffice;
            if (this.selectedOffice) {
              this.filterCostCodes();
              this.filterReservations();
              // Filter invoices client-side by office
              this.applyFilters();
            } else {
              this.selectedReservation = null;
              // Show all invoices when no office is selected
              this.applyFilters();
            }
          }
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
        
        // Filter invoices client-side by office
        if (this.selectedOffice) {
          this.filterCostCodes();
          this.applyFilters();
        } else {
          // Show all invoices when no office is selected
          this.applyFilters();
        }
      });
    });
  }

  loadReservations(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
        
        // Sync selectedReservation from input if in embedded mode
        if (this.embeddedMode && this.reservationId !== null && this.reservationId !== undefined && this.selectedOffice) {
          const matchingReservation = this.reservations.find(r => 
            r.reservationId === this.reservationId && r.officeId === this.selectedOffice?.officeId
          ) || null;
          if (matchingReservation !== this.selectedReservation) {
            this.selectedReservation = matchingReservation;
            this.applyFilters();
          }
        }
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
      label: this.utilityService.getReservationLabel(r)
    }));
    
    // Clear selected reservation if it doesn't belong to the selected office
    if (this.selectedReservation && this.selectedReservation.officeId !== this.selectedOffice.officeId) {
      this.selectedReservation = null;
      this.applyFilters();
    }
    
    // In embedded mode, ensure reservationId from @Input is set after filtering
    if (this.embeddedMode && this.reservationId !== null && this.reservationId !== undefined && this.selectedOffice && this.reservations.length > 0) {
      const matchingReservation = this.reservations.find(r => 
        r.reservationId === this.reservationId && r.officeId === this.selectedOffice?.officeId
      ) || null;
      if (matchingReservation && matchingReservation !== this.selectedReservation) {
        this.selectedReservation = matchingReservation;
        this.applyFilters();
      }
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
    // Filter invoices client-side by selected office
    this.applyFilters();
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
      this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
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
    // Emit reservation change to parent if in embedded mode
    if (this.embeddedMode) {
      this.reservationIdChange.emit(this.selectedReservation?.reservationId || null);
    }
    
    // Preserve scroll position before filtering to prevent page jump
    const scrollContainer = document.querySelector('.tableDiv') || document.querySelector('.mat');
    const scrollTop = scrollContainer ? (scrollContainer as HTMLElement).scrollTop : window.pageYOffset;
    
    this.applyFilters();
    
    // Restore scroll position after Angular change detection completes
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      if (scrollContainer) {
        (scrollContainer as HTMLElement).scrollTop = scrollTop;
      } else {
        window.scrollTo({ top: scrollTop, behavior: 'auto' });
      }
    });
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
      case 'costCode':
        return line.costCode || this.getCostCodeDescription(line.costCodeId, invoice.officeId);
      case 'transactionType':
        return line.transactionType || this.getTransactionTypeLabel(line.transactionTypeId ?? 0);
      case 'reservation':
        return this.getReservationCode(line.reservationId, invoice.reservationCode);
      case 'description':
        return line.description || '-';
      case 'amount':
        const amountValue = line.amount || 0;
        const formattedAmount = this.formatter.currency(Math.abs(amountValue));
        return amountValue < 0 ? '-$' + formattedAmount : '$' + formattedAmount;
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
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
    this.costCodesSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.reservationsSubscription?.unsubscribe();
  }
  //#endregion
}
