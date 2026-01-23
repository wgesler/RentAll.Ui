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
import { InvoiceResponse, InvoiceRequest, InvoiceMonthlyDataResponse, LedgerLineResponse, LedgerLineListDisplay } from '../models/accounting.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { ReservationService } from '../../reservation/services/reservation.service';
import { ReservationListResponse } from '../../reservation/models/reservation-model';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-accounting',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './accounting.component.html',
  styleUrl: './accounting.component.scss'
})

export class AccountingComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  invoiceId: string;
  invoice: InvoiceResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: string, label: string }[] = [];
  officeIdSubscription?: Subscription;
  reservationIdSubscription?: Subscription;
  
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
    private mappingService: MappingService
  ) {
  }

  //#region Invoice
  ngOnInit(): void {
    this.loadOffices();
    this.loadReservations();
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
          // Handle not found error if business logic requires
        }
      }
    });
  }

  saveInvoice(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    
    const invoiceRequest: InvoiceRequest = {
      organizationId: user?.organizationId || '',
      officeId: formValue.officeId,
      reservationId: formValue.reservationId || null,
      invoiceDate: formValue.invoiceDate ? new Date(formValue.invoiceDate).toISOString() : '',
      dueDate: formValue.dueDate ? new Date(formValue.dueDate).toISOString() : null,
      totalAmount: parseFloat(formValue.totalAmount) || 0,
      paidAmount: this.isAddMode ? 0 : (parseFloat(formValue.paidAmount) || 0), // Default to 0 in add mode
      notes: formValue.notes || null,
      isActive: formValue.isActive !== undefined ? formValue.isActive : true
    };

    if (!this.isAddMode) {
      invoiceRequest.invoiceId = this.invoiceId;
    }

    const save$ = this.isAddMode
      ? this.accountingService.createInvoice(invoiceRequest)
      : this.accountingService.updateInvoice(this.invoiceId, invoiceRequest);

    save$.pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: () => {
        const message = this.isAddMode ? 'Invoice created successfully' : 'Invoice updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.router.navigateByUrl(RouterUrl.AccountingList);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
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

  updateAvailableReservations(): void {
    const selectedOfficeId = this.form?.get('officeId')?.value;
    
    if (selectedOfficeId) {
      const filteredReservations = this.reservations.filter(r => r.officeId === selectedOfficeId);
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
      reservationId: new FormControl(null),
      invoiceDate: new FormControl(today, [Validators.required]),
      dueDate: new FormControl(today),
      invoiceTotal: new FormControl({ value: '', disabled: true }), // Read-only string field
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
        totalInput.value = this.formatCurrency(totalValue);
      }
    }, 100);
  }

  setupOfficeIdHandler(): void {
    // Unsubscribe from previous subscription if it exists
    this.officeIdSubscription?.unsubscribe();

    // Update available reservations based on current officeId (if form exists and reservations are loaded)
    if (this.reservations.length > 0) {
      this.updateAvailableReservations();
    }

    // Subscribe to officeId changes
    this.officeIdSubscription = this.form.get('officeId')?.valueChanges.subscribe(officeId => {
      // Update available reservations based on selected office
      this.updateAvailableReservations();
      
      // Clear selected reservation if it doesn't belong to the new office
      const currentReservationId = this.form.get('reservationId')?.value;
      if (currentReservationId && officeId) {
        const currentReservation = this.reservations.find(r => r.reservationId === currentReservationId);
        if (currentReservation && currentReservation.officeId !== officeId) {
          this.form.get('reservationId')?.setValue(null, { emitEvent: false });
        }
      } else if (!officeId) {
        // If office is cleared, also clear reservation
        this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      }
    });
  }

  setupReservationIdHandler(): void {
    // Unsubscribe from previous subscription if it exists
    this.reservationIdSubscription?.unsubscribe();

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

  loadMonthlyLedgerLines(reservationId: string, updateTotalAmount: boolean = true): void {
    this.accountingService.getMonthlyLedgerLines(reservationId).pipe(take(1)).subscribe({
      next: (response: InvoiceMonthlyDataResponse) => {
        console.log('InvoiceMonthlyDataResponse received:', response);
        console.log('LedgerLines from response:', response.LedgerLines);
        
        // Invoice is a string from the API
        const invoiceString = response.invoice || '';
        this.form.get('invoiceTotal')?.setValue(invoiceString, { emitEvent: false });
        
        // Store ledger lines - map to display model
        const rawLedgerLines = response.LedgerLines || (response as any).ledgerLines || (response as any).LedgerLineResponse || [];
        this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines);
        console.log('Stored ledgerLines:', this.ledgerLines);
        console.log('ledgerLines.length:', this.ledgerLines.length);
        
        // Calculate total amount from ledger lines and update the form
        const calculatedTotal = this.calculateTotalAmount();
        const totalControl = this.form.get('totalAmount');
        if (totalControl) {
          totalControl.setValue(calculatedTotal.toFixed(2), { emitEvent: false });
          // Format the display value after a brief delay to ensure DOM is updated
          setTimeout(() => {
            const input = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
            if (input && document.activeElement !== input) {
              input.value = this.formatCurrency(calculatedTotal);
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

  updateLedgerLineField(index: number, field: keyof LedgerLineListDisplay, value: any): void {
    if (this.ledgerLines[index]) {
      (this.ledgerLines[index] as any)[field] = value;
      
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
              input.value = this.formatCurrency(calculatedTotal);
            }
          }, 0);
        }
      }
    }
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

  onLedgerAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    // Remove currency formatting ($ and commas) before processing
    let value = input.value.replace(/[$,]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    
    // Update ledger line amount
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
            totalInput.value = this.formatCurrency(calculatedTotal);
          }
        }, 0);
      }
    }
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

  formatCurrency(value: number | null | undefined): string {
    if (value == null || value === undefined) {
      return '';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  getTransactionTypeLabel(transactionType: number): string {
    const types = ['Debit', 'Credit', 'Payment', 'Refund', 'Charge', 'Deposit', 'Adjustment'];
    return types[transactionType] || 'Unknown';
  }

  populateForm(): void {
    if (this.invoice && this.form) {
      this.form.patchValue({
        organizationId: this.invoice.organizationId,
        officeId: this.invoice.officeId,
        reservationId: this.invoice.reservationId || null,
        invoiceDate: this.invoice.invoiceDate ? new Date(this.invoice.invoiceDate) : null,
        dueDate: this.invoice.dueDate ? new Date(this.invoice.dueDate) : null,
        totalAmount: this.invoice.totalAmount.toFixed(2),
        paidAmount: this.invoice.paidAmount.toFixed(2),
        notes: this.invoice.notes || '',
        isActive: this.invoice.isActive
      }, { emitEvent: false });
      
      // Update available reservations after populating officeId
      this.updateAvailableReservations();
      
      // Format totalAmount display
      setTimeout(() => {
        const totalInput = document.querySelector(`[formControlName="totalAmount"]`) as HTMLInputElement;
        if (totalInput && document.activeElement !== totalInput) {
          const totalValue = parseFloat(this.form.get('totalAmount')?.value) || 0;
          totalInput.value = this.formatCurrency(totalValue);
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

  //#region Utility Methods
  onAmountInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    // Remove currency formatting ($ and commas) before processing
    let value = input.value.replace(/[$,]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    
    // Store raw numeric value in form control
    const numericValue = value === '' ? '0.00' : value;
    this.form.get(fieldName)?.setValue(numericValue, { emitEvent: false });
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
      input.value = this.formatCurrency(value);
    }
  }

  selectAllOnFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
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
    this.officeIdSubscription?.unsubscribe();
    this.reservationIdSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.AccountingList);
  }
  //#endregion
}
