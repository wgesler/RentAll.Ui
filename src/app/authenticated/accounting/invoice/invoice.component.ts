import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize, BehaviorSubject, Observable, map, filter, Subscription } from 'rxjs';
import { AccountingService } from '../services/accounting.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { InvoiceResponse, InvoiceRequest, InvoiceMonthlyDataResponse, LedgerLineResponse, LedgerLineListDisplay, LedgerLineRequest } from '../models/accounting.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationListResponse } from '../../reservation/models/reservation-model';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountsResponse } from '../models/chart-of-accounts.model';
import { TransactionType } from '../models/accounting-enum';
import { FormatterService } from '../../../services/formatter-service';

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './invoice.component.html',
  styleUrl: './invoice.component.scss'
})

export class InvoiceComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  invoiceId: string;
  invoice: InvoiceResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: string, label: string }[] = [];
  reservationIdSubscription?: Subscription;
  
  chartOfAccounts: ChartOfAccountsResponse[] = [];
  availableChartOfAccounts: { value: string, label: string }[] = [];
  chartOfAccountsSubscription?: Subscription;
  
  transactionTypes: { value: number, label: string }[] = [];
  ledgerLines: LedgerLineListDisplay[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['invoice', 'offices', 'reservations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public accountingService: AccountingService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private authService: AuthService,
    private mappingService: MappingService,
    private chartOfAccountsService: ChartOfAccountsService,
    public formatter: FormatterService
  ) {
  }

  //#region Invoice
  ngOnInit(): void {
    this.initializeTransactionTypes();
    this.loadOffices();
    this.loadReservations();
    this.loadChartOfAccounts();
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.invoiceId = paramMap.get('id');
        this.isAddMode = this.invoiceId === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('invoice');
          this.buildForm();
        } else {
          this.getInvoice();
        }
      }
    });
  }


  getInvoice(): void {
    this.accountingService.getInvoiceByGuid(this.invoiceId).pipe(take(1), finalize(() => { this.removeLoadItem('invoice'); })).subscribe({
      next: (response: InvoiceResponse) => {
        this.invoice = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
        }
      }
    });
  }

  saveInvoice(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    // Validate all ledger lines are complete
    if (this.ledgerLines.length === 0) {
      this.toastr.error('At least one ledger line is required', CommonMessage.Error);
      return;
    }

    // Check each ledger line for completeness
    const incompleteLines: number[] = [];
    this.ledgerLines.forEach((line, index) => {
      const hasTransactionTypeId = (line as any).transactionTypeId !== undefined && (line as any).transactionTypeId !== null;
      const hasChartOfAccountId = line.chartOfAccountId && line.chartOfAccountId !== null && line.chartOfAccountId !== '';
      const hasDescription = line.description && line.description.trim() !== '';
      const hasAmount = line.amount !== null && line.amount !== undefined && line.amount !== 0;
      
      if (!hasTransactionTypeId || !hasChartOfAccountId || !hasDescription || !hasAmount) {
        incompleteLines.push(index + 1);
      }
    });

    if (incompleteLines.length > 0) {
      this.toastr.error(`Ledger lines ${incompleteLines.join(', ')} are incomplete. All fields (Chart of Account, Transaction Type, Description, and Amount) are required.`, CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    
    // Get officeName from availableOffices
    const selectedOffice = this.availableOffices.find(office => office.value === formValue.officeId);
    const officeName = selectedOffice?.name || '';
    
    // Get reservationCode from reservations array
    const selectedReservation = this.reservations.find(res => res.reservationId === formValue.reservationId);
    const reservationCode = selectedReservation?.reservationCode || null;
    
    // Get invoiceName from invoiceTotal field
    const invoiceName = formValue.invoiceTotal || '';
    
    // Convert ledger lines from display format to request format
    // All lines should be complete at this point due to validation above
    const ledgerLines: LedgerLineRequest[] = this.ledgerLines.map(line => {
        const ledgerLine: LedgerLineRequest = {
          ledgerLineId: line.Id && line.Id !== 0 ? line.Id : undefined,
          invoice: invoiceName || null,
          chartOfAccountId: line.chartOfAccountId || undefined,
          transactionTypeId: (line as any).transactionTypeId,
          propertyId: null,
          reservationId: formValue.reservationId || null,
          amount: line.amount || 0,
          description: line.description || ''
        };
        return ledgerLine;
      });
    
    const invoiceRequest: InvoiceRequest = {
      organizationId: user?.organizationId || '',
      officeId: formValue.officeId,
      officeName: officeName,
      invoiceName: invoiceName,
      reservationId: formValue.reservationId || null,
      reservationCode: reservationCode,
      invoiceDate: formValue.invoiceDate ? new Date(formValue.invoiceDate).toISOString() : '',
      dueDate: formValue.dueDate ? new Date(formValue.dueDate).toISOString() : null,
      totalAmount: parseFloat(formValue.totalAmount) || 0,
      paidAmount: this.isAddMode ? 0 : (parseFloat(formValue.paidAmount) || 0), // Default to 0 in add mode
      notes: formValue.notes || null,
      isActive: formValue.isActive !== undefined ? formValue.isActive : true,
      LedgerLines: ledgerLines
    };

    // Determine if this is add or edit mode based on invoiceId
    const isCreating = !this.invoiceId || this.invoiceId === 'new' || this.invoiceId === '';
    
    if (!isCreating) {
      invoiceRequest.invoiceId = this.invoiceId;
    }

    const save$ = isCreating
      ? this.accountingService.createInvoice(invoiceRequest)
      : this.accountingService.updateInvoice(this.invoiceId, invoiceRequest);

    save$.pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = isCreating ? 'Invoice created successfully' : 'Invoice updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        // Navigate back to accounting list with officeId query parameter to reload invoices for the same office
        const officeId = formValue.officeId;
        const navigationUrl = officeId 
          ? `${RouterUrl.AccountingList}?officeId=${officeId}`
          : RouterUrl.AccountingList;
        this.router.navigateByUrl(navigationUrl);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }
  //#endregion

  //#region Dropdowns
  initializeTransactionTypes(): void {
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
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.removeLoadItem('offices');
      });
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.removeLoadItem('reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        // Update available reservations - will filter by officeId if form exists and office is selected
        if (this.form) {
          this.updateAvailableReservations();
        } else {
          // Form doesn't exist yet, show all reservations
          this.availableReservations = this.reservations.map(r => ({
            value: r.reservationId,
            label: `${r.reservationCode || r.reservationId.substring(0, 8)} - ${r.tenantName || 'N/A'}`
          }));
        }
      },
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadChartOfAccounts(): void {
     this.chartOfAccountsService.areChartOfAccountsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.chartOfAccountsSubscription = this.chartOfAccountsService.getAllChartOfAccounts().subscribe(accounts => {
         this.filterChartOfAccounts();
      });
    });
  }

  loadMonthlyLedgerLines(reservationId: string, updateTotalAmount: boolean = true): void {
    this.accountingService.getMonthlyLedgerLines(reservationId).pipe(take(1)).subscribe({
      next: (response: InvoiceMonthlyDataResponse) => {
        // Invoice is a string from the API
        const invoiceString = response.invoice || '';
        this.form.get('invoiceTotal')?.setValue(invoiceString, { emitEvent: false });
        
        // Store ledger lines - map to display model
        const rawLedgerLines = response.LedgerLines || (response as any).ledgerLines || (response as any).LedgerLineResponse || [];
        this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines);
        // Preserve transactionTypeId for each line item (needed for dropdowns and saving)
        rawLedgerLines.forEach((rawLine: LedgerLineResponse, index: number) => {
          if (this.ledgerLines[index]) {
            (this.ledgerLines[index] as any).transactionTypeId = rawLine.transactionTypeId;
          }
        });
        
        // Calculate total amount from ledger lines and update the form
        const calculatedTotal = this.calculateTotalAmount();
        const totalControl = this.form.get('totalAmount');
        if (totalControl) {
          totalControl.setValue(calculatedTotal.toFixed(2), { emitEvent: false });
          // Format the display value after a brief delay to ensure DOM is updated
          setTimeout(() => {
            const input = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
            if (input && document.activeElement !== input) {
              input.value = '$' + this.formatter.currency(calculatedTotal);
            }
          }, 100);
        }
      },
      error: (err: HttpErrorResponse) => {
        // On error, reset to empty string for invoice (since it's a string)
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
        this.ledgerLines = [];
        if (updateTotalAmount) {
          this.form.get('totalAmount')?.setValue('0.00', { emitEvent: false });
        }
        if (err.status !== 404) {
          this.toastr.error('Could not load invoice data for reservation', CommonMessage.Error);
        }
      }
    });
  }
 //#endregion

  //#region Form methods
  buildForm(): void {
    const user = this.authService.getUser();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for consistency
    
    // In add mode, paidAmount is not required and defaults to 0
    const paidAmountValidators = this.isAddMode ? [] : [Validators.required];
    
    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      officeId: new FormControl(null, [Validators.required]),
      officeName: new FormControl({ value: '', disabled: true }), // Read-only, only populated in edit mode
      reservationId: new FormControl(null),
      reservationCode: new FormControl({ value: '', disabled: true }), // Read-only, only populated in edit mode
      invoiceDate: new FormControl(today, [Validators.required]),
      dueDate: new FormControl(today),
      invoiceTotal: new FormControl({ value: '', disabled: true }), // Read-only string field
      invoiceName: new FormControl({ value: '', disabled: true }), // Read-only, only populated in edit mode
      totalAmount: new FormControl('0.00', [Validators.required]),
      paidAmount: new FormControl('0.00', paidAmountValidators),
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });

    // Subscribe to officeId changes to filter reservations
    this.setupOfficeIdHandler();
    // Subscribe to reservationId changes to load monthly ledger lines
    this.setupReservationIdHandler();
    
      // Format initial totalAmount display
      setTimeout(() => {
        const totalInput = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
        if (totalInput && document.activeElement !== totalInput) {
          const totalValue = parseFloat(this.form.get('totalAmount')?.value) || 0;
          totalInput.value = '$' + this.formatter.currency(totalValue);
        }
      }, 100);
  }

  populateForm(): void {
    if (this.invoice && this.form) {
      this.form.patchValue({
        organizationId: this.invoice.organizationId,
        officeId: this.invoice.officeId,
        officeName: this.invoice.officeName || '',
        reservationId: this.invoice.reservationId || null,
        reservationCode: this.invoice.reservationCode || '',
        invoiceDate: this.invoice.invoiceDate ? new Date(this.invoice.invoiceDate) : null,
        dueDate: this.invoice.dueDate ? new Date(this.invoice.dueDate) : null,
        invoiceTotal: this.invoice.invoiceName || '', // Use invoiceName for invoiceTotal field
        invoiceName: this.invoice.invoiceName || '',
        totalAmount: this.invoice.totalAmount.toFixed(2),
        paidAmount: this.invoice.paidAmount.toFixed(2),
        notes: this.invoice.notes || '',
        isActive: this.invoice.isActive
      }, { emitEvent: false });
      
      // Set selectedOffice from the populated officeId
      const officeId = this.form.get('officeId')?.value;
      this.selectedOffice = officeId ? this.offices.find(o => o.officeId === officeId) || null : null;
      
      // Update available reservations after populating officeId
      this.updateAvailableReservations();
      
      // Filter chart of accounts for the office
      this.filterChartOfAccounts();
      
      // Format totalAmount display
      setTimeout(() => {
        const totalInput = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
        if (totalInput && document.activeElement !== totalInput) {
          const totalValue = parseFloat(this.form.get('totalAmount')?.value) || 0;
          totalInput.value = '$' + this.formatter.currency(totalValue);
        }
      }, 100);
      
      // Load monthly ledger lines if reservation exists (without updating totalAmount in edit mode)
      if (this.invoice.reservationId) {
        this.loadMonthlyLedgerLines(this.invoice.reservationId, false); // Don't overwrite totalAmount in edit mode
      } else {
        // Set invoiceTotal to empty string if no reservation (since it's a string field)
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
      }
    }
  }
  //#endregion

  //#region Form Responders
  setupOfficeIdHandler(): void {
    // Subscribe to officeId changes - just set selectedOffice and trigger updates
    this.form.get('officeId')?.valueChanges.subscribe(officeId => {
      // Set selectedOffice from the officeId
      this.selectedOffice = officeId ? this.offices.find(o => o.officeId === officeId) || null : null;
      
      // Update available reservations based on selected office
      this.updateAvailableReservations();
      
      // Filter chart of accounts for the selected office
      this.filterChartOfAccounts();
      
      // Clear selected reservation if it doesn't belong to the new office
      const currentReservationId = this.form.get('reservationId')?.value;
      if (currentReservationId && this.selectedOffice) {
        const currentReservation = this.reservations.find(r => r.reservationId === currentReservationId);
        if (currentReservation && currentReservation.officeId !== this.selectedOffice.officeId) {
          this.form.get('reservationId')?.setValue(null, { emitEvent: false });
        }
      } else if (!this.selectedOffice) {
        // If office is cleared, also clear reservation
        this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      }
    });
  }

  setupReservationIdHandler(): void {
    // Subscribe to reservationId changes
    this.reservationIdSubscription = this.form.get('reservationId')?.valueChanges.subscribe(reservationId => {
      if (reservationId) {
        this.loadMonthlyLedgerLines(reservationId, true); // Update totalAmount when user selects reservation
      } else {
        // Clear invoice total if reservation is cleared (invoice is a string, so use empty string)
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
        this.form.get('totalAmount')?.setValue('0.00', { emitEvent: false });
        this.ledgerLines = [];
      }
    });
  }

  updateAvailableReservations(): void {
    if (this.selectedOffice) {
      const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
      this.availableReservations = filteredReservations.map(r => ({
        value: r.reservationId,
        label: `${r.reservationCode || r.reservationId.substring(0, 8)} - ${r.tenantName || 'N/A'}`
      }));
    } else {
      // If no office selected, show all reservations
      this.availableReservations = this.reservations.map(r => ({
        value: r.reservationId,
        label: `${r.reservationCode || r.reservationId.substring(0, 8)} - ${r.tenantName || 'N/A'}`
      }));
    }
  }

  updateLedgerLineField(index: number, field: keyof LedgerLineListDisplay, value: any): void {
    if (this.ledgerLines[index]) {
      (this.ledgerLines[index] as any)[field] = value;
      
      // If transactionType was updated from dropdown, convert the label back to the enum value for storage
      if (field === 'transactionType' && typeof value === 'string') {
        const transactionType = this.transactionTypes.find(t => t.label === value);
        if (transactionType) {
           (this.ledgerLines[index] as any).transactionTypeId = transactionType.value;
        }
      }
      
      // If amount was updated, recalculate total amount
      if (field === 'amount') {
        const calculatedTotal = this.calculateTotalAmount();
        const totalControl = this.form.get('totalAmount');
        if (totalControl) {
          totalControl.setValue(calculatedTotal.toFixed(2), { emitEvent: false });
          // Format the display value if not focused
          setTimeout(() => {
            const input = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
            if (input && document.activeElement !== input) {
              input.value = '$' + this.formatter.currency(calculatedTotal);
            }
          }, 0);
        }
      }
    }
  }

  onTransactionTypeChange(index: number, transactionTypeId: number | null): void {
    if (transactionTypeId === null || transactionTypeId === undefined) {     // Clear the transaction type
      this.updateLedgerLineField(index, 'transactionType', '');
      (this.ledgerLines[index] as any).transactionTypeId = undefined;
      return;
    }

    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    if (transactionType) {
      this.updateLedgerLineField(index, 'transactionType', transactionType.label);      // Store the ID for when we save
      (this.ledgerLines[index] as any).transactionTypeId = transactionTypeId;
    }
  }

  onChartOfAccountChange(index: number, chartOfAccountId: string | null): void {
    if (chartOfAccountId === null || chartOfAccountId === undefined) {
      this.updateLedgerLineField(index, 'chartOfAccountId', null);
    } else {
      this.updateLedgerLineField(index, 'chartOfAccountId', chartOfAccountId);
    }
  }

  getTransactionTypeId(line: LedgerLineListDisplay): number | null {
    const transactionTypeId = (line as any).transactionTypeId;
    return transactionTypeId !== undefined && transactionTypeId !== null ? transactionTypeId : null;
  }

  calculateTotalAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      const amount = line.amount || 0;
      return sum + amount;
    }, 0);
  }
  //#endregion

  //#region Ledger Lines
  onLedgerAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    // Use FormatterService to handle decimal input formatting
    const value = input.value.replace(/[$,]/g, '');
    const numValue = parseFloat(value) || null;
    this.updateLedgerLineField(index, 'amount', numValue);
  }

  onLedgerAmountFocus(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line && line.amount != null) {
      input.value = line.amount.toFixed(2);
      input.select();
    }
  }

  onLedgerAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line) {
      const value = parseFloat(input.value.replace(/[$,]/g, '')) || null;
      line.amount = value;
      // Recalculate total
      const calculatedTotal = this.calculateTotalAmount();
      const totalControl = this.form.get('totalAmount');
      if (totalControl) {
        totalControl.setValue(calculatedTotal.toFixed(2), { emitEvent: false });
        // Format the display value if not focused
        setTimeout(() => {
          const totalInput = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
          if (totalInput && document.activeElement !== totalInput) {
            totalInput.value = '$' + this.formatter.currency(calculatedTotal);
          }
        }, 0);
      }
    }
  }

  addLedgerLine(): void {
    // Create a blank ledger item with all fields null/undefined/0/empty so they appear as editable inputs
    const newLine: LedgerLineListDisplay = {
      Id: 0, // Temporary ID, will be assigned when saved
      chartOfAccountId: null as string | null, // null makes dropdown show "Select Chart of Account"
      transactionType: '', // Empty string for display
      description: '', // Empty string makes it editable per HTML template check
      amount: undefined as any // undefined makes it editable per HTML template check
    };
    // Set transactionTypeId to undefined so dropdown shows "Select Transaction Type"
    (newLine as any).transactionTypeId = undefined;
    this.ledgerLines.push(newLine);
  }

  removeLedgerLine(index: number): void {
    if (index >= 0 && index < this.ledgerLines.length) {
      this.ledgerLines.splice(index, 1);
      // Recalculate total after removal
      const calculatedTotal = this.calculateTotalAmount();
      const totalControl = this.form.get('totalAmount');
      if (totalControl) {
        totalControl.setValue(calculatedTotal.toFixed(2), { emitEvent: false });
        // Format the display value if not focused
        setTimeout(() => {
          const totalInput = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
          if (totalInput && document.activeElement !== totalInput) {
            totalInput.value = '$' + this.formatter.currency(calculatedTotal);
          }
        }, 0);
      }
    }
  }
  //#endregion

  //#region Formatting Methods
  onAmountInput(event: Event, fieldName: string): void {
    const control = this.form.get(fieldName);
    this.formatter.formatDecimalInput(event, control);
  }

  onAmountFocus(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get(fieldName);
    if (control) {
      // Show raw numeric value when focused for editing
      const value = parseFloat(control.value) || 0;
      input.value = value.toFixed(2);
      input.select();
    }
  }

  onAmountBlur(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get(fieldName);
    if (control) {
      // Format with currency on blur
      const value = parseFloat(input.value.replace(/[$,]/g, '')) || 0;
      control.setValue(value.toFixed(2), { emitEvent: false });
      input.value = '$' + this.formatter.currency(value);
    }
  }

  selectAllOnFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  parseNumber(value: string): number | null {
    if (!value || value.trim() === '') {
      return null;
    }
    // Remove currency formatting ($ and commas) before parsing
    const cleanedValue = value.replace(/[$,]/g, '');
    const parsed = parseFloat(cleanedValue);
    return isNaN(parsed) ? null : parsed;
  }

  getTransactionTypeLabel(transactionType: number): string {
    const types = ['Debit', 'Credit', 'Payment', 'Refund', 'Charge', 'Deposit', 'Adjustment'];
    return types[transactionType] || 'Unknown';
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
    this.officesSubscription?.unsubscribe();
    this.reservationIdSubscription?.unsubscribe();
    this.chartOfAccountsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    const officeId = this.route.snapshot.queryParams['officeId'];
    if (officeId) {
      this.router.navigateByUrl(RouterUrl.AccountingList + `?officeId=${officeId}`);
    } else {
      this.router.navigateByUrl(RouterUrl.AccountingList);
    }
  }
  //#endregion
}
