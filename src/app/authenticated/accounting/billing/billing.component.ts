import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, firstValueFrom, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OrganizationRequest, OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { TransactionType, TransactionTypeLabels } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { BillingMonthlyDataRequest, BillingMonthlyDataResponse, InvoiceRequest, InvoiceResponse, LedgerLineListDisplay, LedgerLineRequest } from '../models/invoice.model';
import { InvoiceService } from '../services/invoice.service';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    selector: 'app-billing',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './billing.component.html',
    styleUrl: './billing.component.scss'
})

export class BillingComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  invoiceId: string;
  invoice: InvoiceResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  organizations: OrganizationResponse[] = [];
  availableOrganizations: { value: string; label: string }[] = [];
  selectedOrganization: OrganizationResponse | null;
  billingOrganization: OrganizationResponse | null;
  
  billingCostCodes: CostCodesResponse[] = [];
  hasInitializedBillingCostCodes: boolean = false;
  debitCostCodes: CostCodesResponse[] = [];
  creditCostCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: string, label: string }[] = [];
  costCodesSubscription?: Subscription;
  isPaymentMode: boolean = false; // Track if we're adding a payment (from payable action)
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
  ledgerLines: LedgerLineListDisplay[] = [];
  originalLedgerLines: LedgerLineListDisplay[] = []; // Store original state for comparison
  originalNotes: string | null = null; // Store original notes for comparison

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organizations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  


  constructor(
    public accountingService: InvoiceService,
    public router: Router,
    public fb: FormBuilder,
    public route: ActivatedRoute,
    public toastr: ToastrService,
    public authService: AuthService,
    public mappingService: MappingService,
    public costCodesService: CostCodesService,
    public formatter: FormatterService,
    public utilityService: UtilityService,
    public dialog: MatDialog,
    public organizationService: OrganizationService
  ) {
  }

  //#region Invoice
  ngOnInit(): void {
    this.isPaymentMode = false;
    this.loadCostCodes();
    this.loadOrganizations();
        
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.invoiceId = paramMap.get('id');
        this.isAddMode = this.invoiceId === 'new';
        
        
        // Wait for all data to load, then set up handlers and load invoice if needed
        this.itemsToLoad$.pipe(filter(items => items.size === 0),  take(1)).subscribe(() => {
          this.buildForm();
          this.setupFormHandlers();
          
          if (!this.isAddMode) {
            this.getInvoice();
          } else {
            this.handleAddModeQueryParams();
          }
        });
      }
    });
  }

  handleAddModeQueryParams(): void {
    // Process initial query params immediately from snapshot
    const snapshotParams = this.route.snapshot.queryParams;
    this.processQueryParams(snapshotParams);
    
    // Subscribe to future query param changes
    this.route.queryParams.subscribe(queryParams => {
      this.processQueryParams(queryParams);
    });
  }

  processQueryParams(queryParams: any): void {
    const organizationIdParam = queryParams['OrganizationId'] ?? queryParams['organizationId'];

    const organizationControl = this.form?.get('organizationId');
    if (organizationControl && organizationControl.value !== organizationIdParam) {
      organizationControl.setValue(organizationIdParam ?? null, { emitEvent: false });
    }
    this.applyOrganizationSelection();
    this.setInvoiceCode(this.selectedOrganization);
  }

  getInvoice(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoice');
    this.accountingService.getInvoiceByGuid(this.invoiceId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice'); })).subscribe({
      next: (response: InvoiceResponse) => {
        this.invoice = response;
        this.populateForm();
        this.loadLedgerLines(false); 
        
        // Check if we should add a ledger line (from payable action)
        const addLedgerLineParam = this.route.snapshot.queryParams['addLedgerLine'];
        if (addLedgerLineParam === 'true') {         
          this.isPaymentMode = true;
          this.addLedgerLine();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
        }
      }
    });
  }

  saveInvoice(): void {
    this.isSubmitting = true;
    
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.isSubmitting = false;
      return;
    }

    // Create invoice directly without checking for credit dialog
    this.performSave();
  }

  onPrimaryAction(): void {
    if (!this.isAddMode && !this.isPaymentMode && !this.hasChanges()) {
      this.navigateToBillingCreate(this.invoice, this.form?.getRawValue());
      return;
    }

    this.saveInvoice();
  }

  performSave(): void {
    this.isSubmitting = true;

    if (this.ledgerLines.length === 0) {
      this.toastr.error('At least one ledger line is required', CommonMessage.Error);
      return;
    }

    // Check each ledger line for completeness
    const incompleteLines: number[] = [];
    this.ledgerLines.forEach((line, index) => {
      const hasTransactionTypeId = (line as any).transactionTypeId !== undefined && (line as any).transactionTypeId !== null;
      const hasCostCodeId = line.costCodeId && line.costCodeId !== null && line.costCodeId !== '';
      const hasDescription = line.description && line.description.trim() !== '';
      const hasAmount = line.amount !== null && line.amount !== undefined && line.amount !== 0;
      
      if (!hasTransactionTypeId || !hasCostCodeId || !hasDescription || !hasAmount) {
        incompleteLines.push(index + 1);
      }
    });

    if (incompleteLines.length > 0) {
      this.toastr.error(`Ledger lines ${incompleteLines.join(', ')} are incomplete. All fields (Cost Code, Transaction Type, Description, and Amount) are required.`, CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
         
    // Convert ledger lines from display format to request format
    const ledgerLines: LedgerLineRequest[] = this.ledgerLines.map((line, index) => {
        const ledgerLine: LedgerLineRequest = {
          ledgerLineId: line.ledgerLineId || undefined,
          invoiceId: this.isAddMode ? undefined : this.invoiceId,
          lineNumber: line.lineNumber !== undefined ? line.lineNumber : index + 1,
          costCodeId: line.costCodeId || undefined,
          transactionTypeId: (line as any).transactionTypeId,
          amount: line.amount || 0,
          description: line.description || ''
        };
        return ledgerLine;
      });
    
    // Capture the Invoice date
    const invoiceCode = formValue.invoiceCode || '';
    const invoicedAmount = this.calculateInvoicedAmount();
    const paidAmount = this.calculatePaidAmount();
    const invoicePeriod = formValue.startDate && formValue.endDate
      ? `${this.formatter.dateOnly(new Date(formValue.startDate))} - ${this.formatter.dateOnly(new Date(formValue.endDate))}`
      : '';
    
    const invoiceRequest: InvoiceRequest = {
      organizationId: this.billingOrganization.organizationId || '',
      officeId: 1,
      officeName: "Denver",
      invoiceCode: invoiceCode,
      reservationId: this.selectedOrganization.organizationId,
      reservationCode: this.selectedOrganization.organizationCode,
      startDate: formValue.startDate ? new Date(formValue.startDate).toISOString() : '',
      endDate: formValue.endDate ? new Date(formValue.endDate).toISOString() : '',
      invoiceDate: formValue.invoiceDate ? new Date(formValue.invoiceDate).toISOString() : '',
      dueDate: formValue.dueDate ? new Date(formValue.dueDate).toISOString() : '',
      invoicePeriod: invoicePeriod,
      totalAmount: invoicedAmount,
      paidAmount: paidAmount,
      notes: formValue.notes || null,
      isActive: formValue.isActive !== undefined ? formValue.isActive : true,
      ledgerLines: ledgerLines
    };

    // Determine if this is add or edit mode based on invoiceId
    const isCreating = !this.invoiceId || this.invoiceId === 'new' || this.invoiceId === '';
    
    if (!isCreating) {
      invoiceRequest.invoiceId = this.invoiceId;
    }

    console.log('Billing invoiceRequest payload:', invoiceRequest);

    const save$ = isCreating
      ? this.accountingService.createInvoice(invoiceRequest)
      : this.accountingService.updateInvoice(invoiceRequest);

    save$.pipe(take(1), finalize(() => {this.isSubmitting = false;})).subscribe({
      next: async (savedInvoice: InvoiceResponse) => {
        const message = isCreating ? 'Invoice created successfully' : 'Invoice updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });

        const savedInvoiceAny = (savedInvoice || {}) as any;
        const resolvedInvoiceId =
          savedInvoice?.invoiceId ||
          savedInvoiceAny?.id ||
          savedInvoiceAny?.invoiceID ||
          invoiceRequest.invoiceId ||
          this.invoiceId;

        if (resolvedInvoiceId && resolvedInvoiceId !== 'new') {
          const invoiceForNavigation = {
            ...(savedInvoiceAny || {}),
            invoiceId: resolvedInvoiceId,
            officeId: savedInvoice?.officeId ?? invoiceRequest.officeId,
            officeName: savedInvoice?.officeName ?? invoiceRequest.officeName ?? ''
          } as InvoiceResponse;

          this.navigateToBillingCreate(invoiceForNavigation, formValue);
          return;
        }

        this.toastr.warning('Saved successfully, but response did not include invoiceId. Returning to Billing list.', 'Missing invoice id');
        this.navigateBack(formValue);
      },
      error: () => { void 0; }
    });
  }
  //#endregion

  //#region Form methods
  buildForm(): void {
    const user = this.authService.getUser();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for consistency
    
    // Calculate start date: first day of current month
    const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    // Calculate end date: last day of current month
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    this.form = this.fb.group({
      organizationId: new FormControl(this.billingOrganization.organizationId || '', [Validators.required]),
      startDate: new FormControl(firstDayOfCurrentMonth, [Validators.required, this.endDateValidator.bind(this)]),
      endDate: new FormControl(lastDayOfCurrentMonth, [Validators.required, this.endDateValidator.bind(this)]),
      invoiceDate: new FormControl(today, [Validators.required]),
      dueDate: new FormControl(today, [Validators.required]),
      invoiceTotal: new FormControl({ value: '', disabled: true }),
      invoiceCode: new FormControl({ value: '', disabled: true }), 
      invoicedAmount: new FormControl({ value: '0.00', disabled: true }), 
      paidAmount: new FormControl({ value: '0.00', disabled: true }),
      totalDue: new FormControl({ value: '0.00', disabled: true }), 
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });

    if (!this.isAddMode) {
      this.form.get('organizationId')?.disable({ emitEvent: false });
    } else {
      this.form.get('organizationId')?.enable({ emitEvent: false });
    }
    

    // Set up startDate change handler to validate endDate and auto-update endDate if month changes
    this.form.get('startDate')?.valueChanges.subscribe((startDateValue) => {
      if (startDateValue) {
        const startDate = new Date(startDateValue);
        const endDate = this.form.get('endDate')?.value;
        
        // Check if endDate exists and if it's in a different month/year than startDate
        if (endDate) {
          const currentEndDate = new Date(endDate);
          const startMonth = startDate.getMonth();
          const startYear = startDate.getFullYear();
          const endMonth = currentEndDate.getMonth();
          const endYear = currentEndDate.getFullYear();
          
          // If the month or year changed, update endDate to last day of startDate's month
          if (startMonth !== endMonth || startYear !== endYear) {
            const lastDayOfStartMonth = new Date(startYear, startMonth + 1, 0);
            lastDayOfStartMonth.setHours(0, 0, 0, 0);
            // Defer the update to avoid change detection errors
            setTimeout(() => {
              this.form.get('endDate')?.setValue(lastDayOfStartMonth, { emitEvent: false });
            }, 0);
          }
        } else {
          // If no endDate, set it to last day of startDate's month
          const lastDayOfStartMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
          lastDayOfStartMonth.setHours(0, 0, 0, 0);
          // Defer the update to avoid change detection errors
          setTimeout(() => {
            this.form.get('endDate')?.setValue(lastDayOfStartMonth, { emitEvent: false });
          }, 0);
        }
      }
    });
  }

  populateForm(): void {
    if (this.invoice && this.form) {
      const invoiceAny = this.invoice as any;
      const resolvedInvoicePeriod =
        this.invoice.invoicePeriod ||
        invoiceAny.invoicePeriod ||
        invoiceAny.InvoicePeriod ||
        '';
      const [periodStartRaw, periodEndRaw] = typeof resolvedInvoicePeriod === 'string' && resolvedInvoicePeriod.includes('-')
        ? resolvedInvoicePeriod.split(/\s*-\s*/, 2).map(part => part.trim())
        : ['', ''];
      const resolvedRecipientOrganizationId =
        this.invoice.reservationId ||
        invoiceAny.reservationId ||
        invoiceAny.ReservationId ||
        null;
      const resolvedStartDate =
        this.invoice.startDate ||
        invoiceAny.startDate ||
        invoiceAny.StartDate ||
        invoiceAny.invoiceStartDate ||
        invoiceAny.InvoiceStartDate ||
        periodStartRaw ||
        null;
      const resolvedEndDate =
        this.invoice.endDate ||
        invoiceAny.endDate ||
        invoiceAny.EndDate ||
        invoiceAny.invoiceEndDate ||
        invoiceAny.InvoiceEndDate ||
        periodEndRaw ||
        null;

      this.form.patchValue({
        organizationId: resolvedRecipientOrganizationId,
        startDate: resolvedStartDate ? new Date(resolvedStartDate) : null,
        endDate: resolvedEndDate ? new Date(resolvedEndDate) : null,
        invoiceDate: this.invoice.invoiceDate ? new Date(this.invoice.invoiceDate) : null,
        dueDate: this.invoice.dueDate ? new Date(this.invoice.dueDate) : (this.invoice.invoiceDate ? new Date(this.invoice.invoiceDate) : null),
        invoiceTotal: this.invoice.totalAmount || '',
        invoiceCode: this.invoice.invoiceCode || '',
        invoicedAmount: this.invoice.totalAmount.toFixed(2),
        paidAmount: (this.invoice.paidAmount || 0).toFixed(2),
        totalDue: ((this.invoice.totalAmount || 0) - (this.invoice.paidAmount || 0)).toFixed(2),
        notes: this.invoice.notes || '',
        isActive: this.invoice.isActive
      }, { emitEvent: false });
      
      // Store original notes for change detection
      this.originalNotes = this.invoice.notes || null;
      this.applyOrganizationSelection();
    } else {
      // In add mode, reset original notes
      this.originalNotes = null;
      
      // Format invoicedAmount, paidAmount, and totalDue display
      setTimeout(() => {
        const invoicedInput = document.querySelector(`[formControlName="invoicedAmount"]`) as HTMLInputElement;
        if (invoicedInput && document.activeElement !== invoicedInput) {
          const invoicedValue = parseFloat(this.form.get('invoicedAmount')?.value) || 0;
          const formattedInvoiced = invoicedValue < 0 
            ? '-$' + this.formatter.currency(Math.abs(invoicedValue))
            : '$' + this.formatter.currency(invoicedValue);
          invoicedInput.value = formattedInvoiced;
        }
        const paidInput = document.querySelector(`[formControlName="paidAmount"]`) as HTMLInputElement;
        if (paidInput && document.activeElement !== paidInput) {
          const paidValue = parseFloat(this.form.get('paidAmount')?.value) || 0;
          const formattedPaid = paidValue < 0 
            ? '-$' + this.formatter.currency(Math.abs(paidValue))
            : '$' + this.formatter.currency(paidValue);
          paidInput.value = formattedPaid;
        }
        const totalDueInput = document.querySelector(`[formControlName="totalDue"]`) as HTMLInputElement;
        if (totalDueInput && document.activeElement !== totalDueInput) {
          const totalDueValue = parseFloat(this.form.get('totalDue')?.value) || 0;
          const formattedTotalDue = totalDueValue < 0 
            ? '-$' + this.formatter.currency(Math.abs(totalDueValue))
            : '$' + this.formatter.currency(totalDueValue);
          totalDueInput.value = formattedTotalDue;
        }
      }, 100);
      
      this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
    }
  }
  //#endregion

  //#region Dropdown Methods
  onOrganizationChange(organizationId?: string | null): void {
    const nextOrganizationId = organizationId ?? this.form?.get('organizationId')?.value ?? null;
    this.form.get('organizationId')?.setValue(nextOrganizationId, { emitEvent: false });
    this.applyOrganizationSelection();
  }

  applyOrganizationSelection(): void {
    if (!this.organizations.length) {
      return;
    }

    const selectedOrganizationId = this.form?.get('organizationId')?.value ?? null;
    this.selectedOrganization = selectedOrganizationId
      ? this.organizations.find(o => o.organizationId === selectedOrganizationId) || null
      : null;
  }
  
  filterCostCodes(): void {
    if (this.hasInitializedBillingCostCodes) {
      return;
    }

    if (!this.billingCostCodes?.length) {
      this.debitCostCodes = [];
      this.creditCostCodes = [];
      this.availableCostCodes = [];
      return;
    }

    this.debitCostCodes = this.billingCostCodes.filter(c => c.transactionTypeId !== TransactionType.Payment);
    this.creditCostCodes = this.billingCostCodes.filter(c => c.transactionTypeId === TransactionType.Payment);
    this.availableCostCodes = this.billingCostCodes.map(c => ({
      value: c.costCodeId,
      label: `${c.costCode}: ${c.description}`
    }));
    this.hasInitializedBillingCostCodes = true;
  }
  
  getCostCodesForLine(_line: LedgerLineListDisplay): { value: string, label: string }[] {
    return this.availableCostCodes;
  }

  getTransactionTypeLabel(transactionType: number): string {
    const types = ['Debit', 'Credit', 'Payment', 'Refund', 'Charge', 'Deposit', 'Adjustment'];
    return types[transactionType] || 'Unknown';
  }

  isPaymentLine(line: LedgerLineListDisplay): boolean {
    // Check if transactionType is "Payment" or transactionTypeId is Payment (11)
    const transactionTypeId = (line as any).transactionTypeId;
    if (transactionTypeId !== undefined && transactionTypeId !== null) {
      return transactionTypeId === TransactionType.Payment || transactionTypeId === TransactionType.Payment;
    }
    // Fallback to checking transactionType string
    return line.transactionType === 'Payment' || line.transactionType === 'Credit' || line.transactionType === 'Refund';
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'))).subscribe({
      next: (organizations) => {
        const currentUser = this.authService.getUser();
        this.organizations = (organizations || []).filter(o => o.isActive);
        this.billingOrganization = this.organizations.find(o => o.organizationId === currentUser?.organizationId) || null;
        this.availableOrganizations = this.organizations
          .filter(o => o.organizationId !== this.billingOrganization?.organizationId)
          .map(o => ({
          value: o.organizationId,
          label: o.name
        }));
        this.applyOrganizationSelection();
      },
      error: () => {
        this.organizations = [];
        this.availableOrganizations = [];
        this.billingOrganization = null;
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(accounts => {
        this.billingCostCodes = this.costCodesService.getAllCostCodesValue();
        this.filterCostCodes();
      });
    });
  }

  loadLedgerLines(updateTotalAmount: boolean = true): void {
    const rawLedgerLines = this.invoice?.ledgerLines || [];
    if (!this.invoice || !rawLedgerLines || rawLedgerLines.length === 0) {
      this.ledgerLines = [];
      this.originalLedgerLines = []; // Reset original state
      if (updateTotalAmount) {
        this.form.get('invoicedAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('paidAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('totalDue')?.setValue('0.00', { emitEvent: false });
      }
      return;
    }
    
    if (!this.hasInitializedBillingCostCodes) {
      return;
    }
    
    this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.billingCostCodes, this.transactionTypes);
    this.ledgerLines.forEach(line => {
      if (line.isNew === undefined) {
        (line as any).isNew = false;
      }
    });
    this.normalizePaymentLineSigns();
    
    // Store original state for change detection (deep clone)
    this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
    
    // Calculate total amount from ledger lines and update the form
    if (updateTotalAmount) {
      this.updateTotalAmount();
    }
  }
  //#endregion

  //#region Form Responders
  setupFormHandlers(): void {
    // Format initial invoicedAmount, paidAmount, and totalDue display
    setTimeout(() => {
      const invoicedInput = document.querySelector(`[formControlName="invoicedAmount"]`) as HTMLInputElement;
      if (invoicedInput && document.activeElement !== invoicedInput) {
        const invoicedValue = parseFloat(this.form.get('invoicedAmount')?.value) || 0;
        const formattedInvoiced = invoicedValue < 0 
          ? '-$' + this.formatter.currency(Math.abs(invoicedValue))
          : '$' + this.formatter.currency(invoicedValue);
        invoicedInput.value = formattedInvoiced;
      }
      const paidInput = document.querySelector(`[formControlName="paidAmount"]`) as HTMLInputElement;
      if (paidInput && document.activeElement !== paidInput) {
        const paidValue = parseFloat(this.form.get('paidAmount')?.value) || 0;
        const formattedPaid = paidValue < 0 
          ? '-$' + this.formatter.currency(Math.abs(paidValue))
          : '$' + this.formatter.currency(paidValue);
        paidInput.value = formattedPaid;
      }
      const totalDueInput = document.querySelector(`[formControlName="totalDue"]`) as HTMLInputElement;
      if (totalDueInput && document.activeElement !== totalDueInput) {
        const totalDueValue = parseFloat(this.form.get('totalDue')?.value) || 0;
        const formattedTotalDue = totalDueValue < 0 
          ? '-$' + this.formatter.currency(Math.abs(totalDueValue))
          : '$' + this.formatter.currency(totalDueValue);
        totalDueInput.value = formattedTotalDue;
      }
    }, 100);
  }

  setInvoiceCode(organization: OrganizationResponse): void {
    if (organization && this.form) {
      const invoiceCode = organization.organizationCode + '-' + (organization.currentInvoiceNo + 1).toString().padStart(3, '0');
      this.form.get('invoiceCode')?.setValue(invoiceCode, { emitEvent: false });
    }
  }

  updateLedgerLineField(index: number, field: keyof LedgerLineListDisplay, value: any): void {
    if (this.ledgerLines[index]) {
      (this.ledgerLines[index] as any)[field] = value;
      // Update total amount if amount field changed
      if (field === 'amount') {
        this.updateTotalAmount();
      }
      
      // If transactionType was updated from dropdown, convert the label back to the enum value for storage
      if (field === 'transactionType' && typeof value === 'string') {
        const transactionType = this.transactionTypes.find(t => t.label === value);
        if (transactionType) {
           (this.ledgerLines[index] as any).transactionTypeId = transactionType.value;
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

  onCostCodeChange(index: number, costCodeId: string | null): void {
    if (costCodeId === null || costCodeId === undefined) {
      this.updateLedgerLineField(index, 'costCodeId', null);
      this.updateLedgerLineField(index, 'costCode', null);
      // Clear transactionTypeId when cost code is cleared
      (this.ledgerLines[index] as any).transactionTypeId = undefined;
      this.updateLedgerLineField(index, 'transactionType', '');
    } else {
      const line = this.ledgerLines[index];
      const previousTransactionTypeId = (line as any).transactionTypeId;
      const currentAmount = line.amount || 0;
      
      this.updateLedgerLineField(index, 'costCodeId', costCodeId);
      // Find the cost code and update costCode display value and transactionTypeId
      const matchingCostCode = this.billingCostCodes.find(c => c.costCodeId === costCodeId);
      if (matchingCostCode) {
        this.updateLedgerLineField(index, 'costCode', matchingCostCode.costCode);
        // Update transactionTypeId from CostCode
        const newTransactionTypeId = matchingCostCode.transactionTypeId;
        (this.ledgerLines[index] as any).transactionTypeId = newTransactionTypeId;
        // Update transactionType display value
        const transactionType = this.transactionTypes.find(t => t.value === newTransactionTypeId);
        if (transactionType) {
          this.updateLedgerLineField(index, 'transactionType', transactionType.label);
        }
        
        // Check if we're switching between debit and credit types
        const wasDebit = previousTransactionTypeId !== undefined && previousTransactionTypeId !== null && previousTransactionTypeId !== TransactionType.Payment;
        const wasCredit = previousTransactionTypeId !== undefined && previousTransactionTypeId !== null && previousTransactionTypeId === TransactionType.Payment;
        const isDebit = newTransactionTypeId !== TransactionType.Payment;
        const isCredit = newTransactionTypeId === TransactionType.Payment;
        
        // If we have an amount and we're switching between debit and credit, flip the sign
        if (currentAmount !== 0 && currentAmount !== null && currentAmount !== undefined) {
          let newAmount = currentAmount;
          
          if (wasDebit && isCredit) {
            // Switching from debit to credit: make negative
            newAmount = -Math.abs(currentAmount);
          } else if (wasCredit && isDebit) {
            // Switching from credit to debit: make positive
            newAmount = Math.abs(currentAmount);
          } else if (isCredit && currentAmount > 0) {
            // Already credit type but amount is positive: make negative
            newAmount = -Math.abs(currentAmount);
          } else if (isDebit && currentAmount < 0) {
            // Already debit type but amount is negative: make positive
            newAmount = Math.abs(currentAmount);
          }
          
          // Update the amount if it changed
          if (newAmount !== currentAmount) {
            this.updateLedgerLineField(index, 'amount', newAmount);
            // Update the amount input field display (specifically target the amount field using data attribute)
            setTimeout(() => {
              const amountInput = document.querySelector(`input[data-field="amount"][data-index="${index}"]`) as HTMLInputElement;
              if (amountInput) {
                amountInput.value = newAmount.toFixed(2);
              }
            }, 0);
          }
        }
      }
    }
  }

  getTransactionTypeId(line: LedgerLineListDisplay): number | null {
    const transactionTypeId = (line as any).transactionTypeId;
    return transactionTypeId !== undefined && transactionTypeId !== null ? transactionTypeId : null;
  }

  calculateInvoicedAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      if (!this.isPaymentLine(line)) {
        const amount = line.amount || 0;
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  calculatePaidAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      // These amounts are stored as negative, so we sum the absolute values
      if (this.isPaymentLine(line)) {
        const amount = Math.abs(line.amount || 0);
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  calculateTotalAmount(): number {
    // Legacy method - kept for compatibility, but should use calculateInvoicedAmount instead
    return this.calculateInvoicedAmount();
  }
   
  updateTotalAmount(): void {
    const invoicedAmount = this.calculateInvoicedAmount();
    const paidAmount = this.calculatePaidAmount();
    const totalDue = invoicedAmount - paidAmount;
    
    // Update invoicedAmount
    const invoicedControl = this.form.get('invoicedAmount');
    if (invoicedControl) {
      invoicedControl.setValue(invoicedAmount.toFixed(2), { emitEvent: false });
    }
    
    // Update paidAmount
    const paidControl = this.form.get('paidAmount');
    if (paidControl) {
      paidControl.setValue(paidAmount.toFixed(2), { emitEvent: false });
    }
    
    // Update totalDue
    const totalDueControl = this.form.get('totalDue');
    if (totalDueControl) {
      totalDueControl.setValue(totalDue.toFixed(2), { emitEvent: false });
    }
    
    // Format the display values
    setTimeout(() => {
      const invoicedInput = document.querySelector(`[formControlName="invoicedAmount"]`) as HTMLInputElement;
      if (invoicedInput && document.activeElement !== invoicedInput) {
        const formattedValue = invoicedAmount < 0 
          ? '-$' + this.formatter.currency(Math.abs(invoicedAmount))
          : '$' + this.formatter.currency(invoicedAmount);
        invoicedInput.value = formattedValue;
      }
      
      const paidInput = document.querySelector(`[formControlName="paidAmount"]`) as HTMLInputElement;
      if (paidInput && document.activeElement !== paidInput) {
        const formattedValue = paidAmount < 0 
          ? '-$' + this.formatter.currency(Math.abs(paidAmount))
          : '$' + this.formatter.currency(paidAmount);
        paidInput.value = formattedValue;
      }
      
      const totalDueInput = document.querySelector(`[formControlName="totalDue"]`) as HTMLInputElement;
      if (totalDueInput && document.activeElement !== totalDueInput) {
        const formattedValue = totalDue < 0 
          ? '-$' + this.formatter.currency(Math.abs(totalDue))
          : '$' + this.formatter.currency(totalDue);
        totalDueInput.value = formattedValue;
      }
    }, 0);
  }

  get isSaveDisabled(): boolean {
    if (this.isSubmitting || this.ledgerLines.length === 0) {
      return true;
    }
    
    if (this.isAddMode) {
      return false;
    }

    return false;
  }

  get primaryActionLabel(): string {
    if (this.isPaymentMode) {
      return 'Apply';
    }

    if (this.isAddMode) {
      return 'Create';
    }

    return this.hasChanges() ? 'Modify' : 'View';
  }

  hasChanges(): boolean {
    if (this.hasLedgerLinesChanged()) {
      return true;
    }
    
    // Check if notes have changed
    const currentNotes = this.form.get('notes')?.value || null;
    const normalizedCurrentNotes = currentNotes === '' ? null : currentNotes;
    const normalizedOriginalNotes = this.originalNotes === '' ? null : this.originalNotes;
    
    if (normalizedCurrentNotes !== normalizedOriginalNotes) {
      return true;
    }
    
    return false;
  }

  hasLedgerLinesChanged(): boolean {
    // In add mode, if there are no original lines, any lines are considered a change
    if (this.isAddMode && this.originalLedgerLines.length === 0) {
      return this.ledgerLines.length > 0;
    }
    
    // Compare current ledger lines with original
    if (this.ledgerLines.length !== this.originalLedgerLines.length) {
      return true; // Lines added or removed
    }
    
    // Deep comparison of each line
    for (let i = 0; i < this.ledgerLines.length; i++) {
      const current = this.ledgerLines[i];
      const original = this.originalLedgerLines[i];
      
      if (!original) {
        return true; // New line added
      }
      
      // Compare key fields
      if (current.ledgerLineId !== original.ledgerLineId ||
          current.costCodeId !== original.costCodeId ||
          (current as any).transactionTypeId !== (original as any).transactionTypeId ||
          current.description !== original.description ||
          current.amount !== original.amount) {
        return true; // Line modified
      }
    }
    
    return false; // No changes detected
  }
  //#endregion

  //#region Ledger Lines
  onLedgerAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    let value = input.value;
    
    // Check if value starts with minus sign
    const isNegative = value.startsWith('-');
    
    // Strip non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Check if this line has a credit transaction type 
    const isCreditType = this.isPaymentLine(line);
    
    // For credit types, automatically add negative sign
    if (isCreditType && !isNegative && value !== '') {
      value = '-' + value;
    } else if (!isCreditType && isNegative) {
      // For debit types, remove negative sign if present
      value = value.replace(/^-/, '');
    } else if (isNegative) {
      // Keep negative sign if it was there
      value = '-' + value;
    }
    
    // Allow only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
  }

  onLedgerAmountFocus(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    // Set initial value on focus - show raw number without formatting (same as Daily Rate)
    if (line && line.amount != null && line.amount !== undefined) {
      input.value = line.amount.toString();
      input.select(); // Select all text (same as selectAllOnFocus)
    } else {
      input.value = '';
    }
  }

  onLedgerAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line) {
      // Check if value is negative
      const isNegative = input.value.startsWith('-');
      // Parse and format exactly like formatDecimalControl, preserving negative sign
      const rawValue = input.value.replace(/[^0-9.]/g, '').trim();
      let numValue: number;
      let formattedValue: string;
      
      // Check if this line has a credit transaction type (>= StartOfCredits)
      const isCreditType = this.isPaymentLine(line);
      
      if (rawValue !== '' && rawValue !== null) {
        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed)) {
          // For credit types, always make it negative; for debit types, use sign from input
          const finalValue = isCreditType ? -Math.abs(parsed) : (isNegative ? -parsed : parsed);
          // Format to 2 decimal places (same as formatDecimalControl)
          formattedValue = finalValue.toFixed(2);
          numValue = parseFloat(formattedValue);
        } else {
          formattedValue = '0.00';
          numValue = 0;
        }
      } else {
        formattedValue = '0.00';
        numValue = 0;
      }
      
      input.value = formattedValue;
      line.amount = numValue;
      this.updateTotalAmount();
    }
  }

  normalizePaymentLineSigns(): void {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return;
    }

    this.ledgerLines.forEach(line => {
      if (!this.isPaymentLine(line)) {
        return;
      }

      const currentAmount = line.amount ?? 0;
      if (currentAmount > 0) {
        line.amount = -Math.abs(currentAmount);
      }
    });
  }

  generateLedgerLines(): void {
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    const organizationId = this.form.get('organizationId')?.value ?? null;
    if (!this.hasInitializedBillingCostCodes || !startDate || !endDate || !organizationId) {
      return;
    }

    const request: BillingMonthlyDataRequest = {
      invoiceCode: this.form.get('invoiceCode')?.value || '',
      organizationId: organizationId,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString()
    };

    this.accountingService.getBillingMonthlyLedgerLines(request).pipe(take(1)).subscribe({
      next: (response: BillingMonthlyDataResponse) => {
        const rawLedgerLines = response.ledgerLines || (response as any).ledgerLines || [];
        this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.billingCostCodes, this.transactionTypes);
        this.normalizePaymentLineSigns();
        this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
        this.updateTotalAmount();
      },
      error: () => {
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
        this.ledgerLines = [];
        this.form.get('invoicedAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('paidAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('totalDue')?.setValue('0.00', { emitEvent: false });
      }
    });
  }

  addLedgerLine(): void {
    const newLine: LedgerLineListDisplay = {
      ledgerLineId: null, // Temporary ID, will be assigned when saved
      lineNumber: this.ledgerLines.length + 1, // Assign line number based on current array length
      costCodeId: null as string | null, // null makes dropdown show "Select Cost Code"
      costCode: null, // Will be populated when costCodeId is selected
      transactionType: '', // Empty string for display
      description: '', // Empty string makes it editable per HTML template check
      amount: undefined as any, // undefined makes it editable per HTML template check
      isNew: true // Mark as new so it remains editable
    };
    // Set transactionTypeId to undefined so dropdown shows "Select Transaction Type"
    (newLine as any).transactionTypeId = undefined;
    this.ledgerLines.push(newLine);
    this.updateTotalAmount();
  }

  removeLedgerLine(index: number): void {
    if (index >= 0 && index < this.ledgerLines.length) {
      this.ledgerLines.splice(index, 1);
      this.updateTotalAmount();
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

  endDateValidator(control: FormControl): { [key: string]: any } | null {
    if (!control.value || !this.form) {
      return null;
    }
    
    const startDate = this.form.get('startDate')?.value;
    if (!startDate) {
      return null; // Don't validate if startDate is not set
    }
    
    const endDate = new Date(control.value);
    const start = new Date(startDate);
    
    // Set hours to 0 for accurate date comparison
    endDate.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    
    if (endDate < start) {
      return { endDateBeforeStartDate: true };
    }
    
    return null;
  }

  navigateBack(formValue: any): void {
    this.router.navigateByUrl(RouterUrl.AccountingList);
  }

  navigateToBillingCreate(invoiceToUse: InvoiceResponse | null | undefined, formValue?: any): void {
    if (!invoiceToUse?.invoiceId) {
      this.navigateBack(formValue || this.form?.getRawValue() || {});
      return;
    }

    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'] || 'billing';
    const params: string[] = [`returnTo=${returnTo}`];

    const organizationIdToUse = this.form?.get('organizationId')?.value || formValue?.organizationId || invoiceToUse.organizationId;

    if (organizationIdToUse) {
      params.push(`OrganizationId=${organizationIdToUse}`);
    }

    params.push(`InvoiceId=${invoiceToUse.invoiceId}`);

    const billingCreateUrl = `${RouterUrl.BillingCreate}?${params.join('&')}`;
    this.router.navigateByUrl(billingCreateUrl);
  }

  //#endregion

   //#region Utility Methods
  ngOnDestroy(): void {
    this.costCodesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'] || 'accounting';
    const params: string[] = [];

    if (returnTo === 'accounting') {
      if (params.length > 0) {
        this.router.navigateByUrl(RouterUrl.AccountingList + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.AccountingList);
      }
    } else {
      // Fallback to accounting list (defaults to invoices tab)
      if (params.length > 0) {
        this.router.navigateByUrl(RouterUrl.AccountingList + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.AccountingList);
      }
    }
  }
  //#endregion
}

