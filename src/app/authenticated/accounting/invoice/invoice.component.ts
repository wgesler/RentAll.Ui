import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, firstValueFrom, map, skip, take, timeout } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { ApplyCreditToInvoiceDialogComponent, ApplyCreditToInvoiceDialogData } from '../../shared/modals/apply-credit-to-invoice/apply-credit-to-invoice-dialog.component';
import { ApplyCreditDialogComponent, ApplyCreditDialogData } from '../../shared/modals/apply-credit/apply-credit-dialog.component';
import { SearchableSelectComponent } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { TransactionType, TransactionTypeLabels, getTransactionTypeLabel as getAccountingTransactionTypeLabel } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceMonthlyDataRequest, InvoiceMonthlyDataResponse, InvoiceRequest, InvoiceResponse, LedgerLineListDisplay, LedgerLineRequest } from '../models/invoice.model';
import { InvoiceService } from '../services/invoice.service';
import { CostCodesService } from '../services/cost-codes.service';

@Component({
    standalone: true,
    selector: 'app-invoice',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, TitleBarSelectComponent],
    templateUrl: './invoice.component.html',
    styleUrl: './invoice.component.scss'
})

export class InvoiceComponent implements OnInit, OnDestroy, OnChanges {
  @Input() shellMode: boolean = false;
  @Input() invoiceIdInput: string | null = null;
  @Input() officeIdInput: number | null = null;
  @Input() reservationIdInput: string | null = null;
  @Input() companyIdInput: string | null = null;

  isServiceError: boolean = false;
  invoiceId: string;
  invoice: InvoiceResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: string, label: string }[] = [];
  reservationIdSubscription?: Subscription;
  selectedReservation: ReservationListResponse | null = null;
  
  companyId: string | null = null;
  
  allCostCodes: CostCodesResponse[] = [];
  officeCostCodes:CostCodesResponse[] = [];
  debitCostCodes: CostCodesResponse[] = [];
  creditCostCodes: CostCodesResponse[] = [];
  availableCostCodes: { value: number, label: string }[] = [];
  officeAvailableCostCodes: { value: number, label: string }[] = [];
  costCodesSubscription?: Subscription;
  isPaymentMode: boolean = false;
  
  transactionTypes: { value: number, label: string }[] = TransactionTypeLabels;
  ledgerLines: LedgerLineListDisplay[] = [];
  originalLedgerLines: LedgerLineListDisplay[] = [];
  originalFormSnapshot: {
    officeId: number | null;
    reservationId: string | null;
    startDate: string | null;
    endDate: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    notes: string | null;
    isActive: boolean;
  } | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'reservations', 'costCodes']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  routeInvoiceId: string | null = null;
  contextReady: boolean = false;
  lastContextKey: string | null = null;
  
  constructor(
    public accountingService: InvoiceService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private authService: AuthService,
    private mappingService: MappingService,
    private costCodesService: CostCodesService,
    public formatter: FormatterService,
    private utilityService: UtilityService,
    private dialog: MatDialog,
    private globalSelectionService: GlobalSelectionService
  ) {
  }

  //#region Invoice
  ngOnInit(): void {
    this.isPaymentMode = false;
    this.routeInvoiceId = this.route.snapshot.paramMap.get('id');
    this.loadOffices();
    this.loadReservations();
    this.loadCostCodes();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0 && this.isAddMode && this.form) {
        this.resolveOfficeScope(officeId);
        this.form.get('officeId')?.setValue(this.selectedOffice?.officeId ?? null, { emitEvent: false });
        this.updateAvailableReservations();
        this.filterCostCodes();
      }
    });

    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      this.routeInvoiceId = paramMap.get('id');
      if (this.contextReady && !this.shellMode) {
        this.initializeInvoiceContext(true);
      }
    });

    this.itemsToLoad$.pipe(filter(items => items.size === 0),  take(1)).subscribe(() => {
      this.buildForm();
      this.setupFormHandlers();
      this.contextReady = true;
      this.initializeInvoiceContext();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.contextReady) {
      return;
    }

    if (
      changes['invoiceIdInput']
      || changes['officeIdInput']
      || changes['reservationIdInput']
      || changes['companyIdInput']
      || changes['shellMode']
    ) {
      this.initializeInvoiceContext(true);
    }
  }

  resolveInvoiceContextId(): string | null {
    if (this.invoiceIdInput !== null && this.invoiceIdInput !== undefined && this.invoiceIdInput !== '') {
      return this.invoiceIdInput;
    }

    if (this.shellMode) {
      return null;
    }

    return this.routeInvoiceId;
  }

  initializeInvoiceContext(force: boolean = false): void {
    const contextInvoiceId = this.resolveInvoiceContextId();
    if (!contextInvoiceId) {
      return;
    }

    const contextKey = [
      contextInvoiceId,
      this.officeIdInput ?? '',
      this.reservationIdInput ?? '',
      this.companyIdInput ?? '',
      this.shellMode ? 'shell' : 'route'
    ].join('|');

    if (!force && this.lastContextKey === contextKey) {
      return;
    }

    this.lastContextKey = contextKey;
    this.invoiceId = contextInvoiceId;
    this.isAddMode = this.invoiceId === 'new';

    if (!this.isAddMode) {
      this.getInvoice();
    } else {
      this.invoice = null as any;
      this.ledgerLines = [];
      this.originalLedgerLines = [];
      this.originalFormSnapshot = null;
      this.handleAddModeQueryParams();
    }
  }

  handleAddModeQueryParams(): void {
    const snapshotParams = this.route.snapshot.queryParams;
    this.processQueryParams(snapshotParams);
    
    this.route.queryParams.subscribe(queryParams => {
      this.processQueryParams(queryParams);
    });
  }

  processQueryParams(queryParams: any): void {
    const officeIdParam = this.officeIdInput ?? queryParams['officeId'];
    const reservationIdParam = this.reservationIdInput ?? queryParams['reservationId'];
    const companyIdParam = this.companyIdInput ?? queryParams['companyId'];
    const reservationFromParam = reservationIdParam
      ? this.reservations.find(r => r.reservationId === reservationIdParam) || null
      : null;
    const parsedOfficeId = officeIdParam ? parseInt(officeIdParam, 10) : null;
    const officeIdToApply = reservationFromParam?.officeId
      ?? (parsedOfficeId && !Number.isNaN(parsedOfficeId) ? parsedOfficeId : null);
    
    if (companyIdParam) {
      this.companyId = companyIdParam;
    }
    
    if (officeIdToApply && this.offices.length > 0 && this.reservations.length > 0) {
      this.resolveOfficeScope(officeIdToApply);
      if (this.selectedOffice && this.form) {
        this.form.get('officeId')?.setValue(this.selectedOffice.officeId, { emitEvent: false });
        this.updateAvailableReservations();
        this.filterCostCodes();
        if (reservationFromParam && this.availableReservations.find(r => r.value === reservationFromParam.reservationId)) {
          this.form.get('reservationId')?.setValue(reservationFromParam.reservationId, { emitEvent: false });
          this.selectedReservation = reservationFromParam;
          this.setInvoiceCode(this.selectedReservation);
        }
      }
    } else if (this.isAddMode && this.offices.length > 0 && this.form) {
      const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
      if (globalOfficeId != null) {
        this.resolveOfficeScope(globalOfficeId);
        if (this.selectedOffice) {
          this.form.get('officeId')?.setValue(this.selectedOffice.officeId, { emitEvent: false });
          this.updateAvailableReservations();
          this.filterCostCodes();
        }
      }
    }
  }

  getInvoice(): void {
    const companyIdParam = this.companyIdInput ?? this.route.snapshot.queryParams['companyId'];
    if (companyIdParam) {
      this.companyId = companyIdParam;
    }
    
    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoice');
    this.accountingService.getInvoiceByGuid(this.invoiceId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoice'); })).subscribe({
      next: (response: InvoiceResponse) => {
        this.invoice = response;
        this.populateForm();
        this.loadLedgerLines(false); 
        
        const addLedgerLineParam = this.route.snapshot.queryParams['addLedgerLine'];
        if (addLedgerLineParam === 'true') {         
          this.isPaymentMode = true;
          this.filterCostCodes();
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

    this.performSave();
  }
  //#endregion

  //#region Form Response Methods
  onPrimaryAction(): void {
    if (!this.isAddMode && !this.isPaymentMode && !this.hasChanges()) {
      this.toInvoiceCreate(this.invoice, this.form?.getRawValue());
      return;
    }

    this.saveInvoice();
  }

  get officeTitleBarOptions(): { value: number, label: string }[] {
    return this.availableOffices.map(office => ({
      value: office.value,
      label: office.name
    }));
  }

  get reservationTitleBarOptions(): { value: string, label: string }[] {
    return this.availableReservations.map(reservation => ({
      value: reservation.value,
      label: reservation.label
    }));
  }

  onTitleBarOfficeChange(value: string | number | null): void {
    if (!this.isAddMode || !this.form) {
      return;
    }
    this.form.get('officeId')?.setValue(value == null || value === '' ? null : Number(value));
  }

  onTitleBarReservationChange(value: string | number | null): void {
    if (!this.isAddMode || !this.form) {
      return;
    }
    this.form.get('reservationId')?.setValue(value == null || value === '' ? null : String(value));
  }
  //#endregion

  //#region Ledger Line Methods
  async checkAndApplyCredit(): Promise<void> {
    if (!this.selectedReservation || !this.selectedOffice) {
      this.performSave();
      return;
    }

    const creditAmount = this.selectedReservation.creditDue || 0;
    if (creditAmount <= 0) {
      this.performSave();
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    try {
      await firstValueFrom(this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true),take(1)));
    } catch (_err: any) {
      this.performSave();
      return;
    }

    const dialogConfig: MatDialogConfig = {
      width: '500px',
      autoFocus: true,
      restoreFocus: true,
      disableClose: false,
      hasBackdrop: true
    };

    const costCodes = this.costCodesService.getCostCodesForOffice(this.selectedOffice.officeId);
    const debitCostCodes = costCodes.filter(c => c.isActive && c.transactionTypeId !== TransactionType.Payment);

    if (!debitCostCodes || debitCostCodes.length === 0) {
      this.toastr.warning('No debit cost codes found for this office. Cannot apply credit.', 'Missing Cost Code');
      this.performSave();
      return;
    }

    const debitCostCode = debitCostCodes[0];

    const creditDialogData: ApplyCreditDialogData = {
      creditAmount: creditAmount,
      reservations: [{
        value: this.selectedReservation,
        label: this.utilityService.getReservationDropdownLabel(this.selectedReservation, null)
      }],
      invoiceId: '',
      costCodeId: debitCostCode.costCodeId,
      description: 'Credit applied from reservation'
    };

    const dialogRef = this.dialog.open(ApplyCreditDialogComponent, {
      ...dialogConfig,
      data: creditDialogData
    });

    dialogRef.afterClosed().subscribe(async (result: { success: boolean } | undefined) => {
      if (result?.success) {
        this.addCreditDebitLine(creditAmount, debitCostCode);
        (this as any).appliedCreditAmount = creditAmount;
      }
      this.performSave();
    });
  }

  addCreditDebitLine(creditAmount: number, debitCostCode: CostCodesResponse): void {
    const debitLine: LedgerLineListDisplay = {
      ledgerLineId: null,
      lineNumber: this.ledgerLines.length + 1,
      costCodeId: debitCostCode.costCodeId,
      costCode: debitCostCode.costCode,
      transactionType: this.transactionTypes.find(t => t.value === debitCostCode.transactionTypeId)?.label || 'Debit',
      description: 'Credit applied from reservation',
      amount: Math.abs(creditAmount),
      isNew: true
    };
    
    (debitLine as any).transactionTypeId = debitCostCode.transactionTypeId;
    
    this.ledgerLines.push(debitLine);
    
    this.updateTotalAmount();
    
    this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
  }

  async updateReservationCreditAfterSave(creditAmount: number): Promise<void> {
    if (!this.selectedReservation?.reservationId) {
      return;
    }

    try {
      await this.reservationService.updateModifiedReservation(this.selectedReservation.reservationId, reservation => ({
        creditDue: Math.max(0, (reservation.creditDue || 0) - creditAmount)
      }));
    } catch (err: any) {
      
    }
  }

  performSave(): void {
    this.isSubmitting = true;

    if (this.ledgerLines.length === 0) {
      this.toastr.error('At least one ledger line is required', CommonMessage.Error);
      return;
    }

    const incompleteLines: number[] = [];
    this.ledgerLines.forEach((line, index) => {
      const hasTransactionTypeId = (line as any).transactionTypeId !== undefined && (line as any).transactionTypeId !== null;
      const parsedCostCodeId = line.costCodeId == null ? NaN : Number(line.costCodeId);
      const hasCostCodeId = Number.isInteger(parsedCostCodeId) && parsedCostCodeId > 0;
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
         
    const ledgerLines: LedgerLineRequest[] = this.ledgerLines.map((line, index) => {
        const numericCostCodeId = line.costCodeId == null ? NaN : Number(line.costCodeId);
        const ledgerLine: LedgerLineRequest = {
          ledgerLineId: line.ledgerLineId || undefined,
          invoiceId: this.isAddMode ? undefined : this.invoiceId,
          lineNumber: line.lineNumber !== undefined ? line.lineNumber : index + 1,
          costCodeId: Number.isInteger(numericCostCodeId) && numericCostCodeId > 0 ? numericCostCodeId : undefined,
          transactionTypeId: (line as any).transactionTypeId,
          reservationId: formValue.reservationId || null,
          amount: line.amount || 0,
          description: line.description || ''
        };
        return ledgerLine;
      });
    
    const invoiceCode = formValue.invoiceCode || '';
    const selectedOffice = this.availableOffices.find(office => office.value === formValue.officeId);
    const officeName = selectedOffice?.name || '';  
    const selectedReservation = this.reservations.find(res => res.reservationId === formValue.reservationId);
    const reservationCode = selectedReservation?.reservationCode || null;
    const invoicedAmount = this.calculateInvoicedAmount();
    const paidAmount = this.isPaymentMode
      ? this.calculateNewPaymentAmount()
      : this.calculatePaidAmount();
    
    const invoiceRequest: InvoiceRequest = {
      organizationId: user?.organizationId || '',
      officeId: formValue.officeId,
      officeName: officeName,
      invoiceCode: invoiceCode,
      reservationId: formValue.reservationId || null,
      reservationCode: reservationCode,
      startDate: this.utilityService.toDateOnlyJsonString(formValue.startDate) ?? '',
      endDate: this.utilityService.toDateOnlyJsonString(formValue.endDate) ?? '',
      invoiceDate: this.utilityService.toDateOnlyJsonString(formValue.invoiceDate) ?? '',
      dueDate: this.utilityService.toDateOnlyJsonString(formValue.dueDate) ?? '',
      invoicePeriod: (() => {
        const sd = this.utilityService.parseCalendarDateInput(formValue.startDate);
        const ed = this.utilityService.parseCalendarDateInput(formValue.endDate);
        return sd && ed ? `${this.formatter.dateOnly(sd)} - ${this.formatter.dateOnly(ed)}` : '';
      })(),
      totalAmount: invoicedAmount,
      paidAmount: paidAmount,
      notes: formValue.notes || null,
      isActive: formValue.isActive !== undefined ? formValue.isActive : true,
      ledgerLines: ledgerLines
    };

    const isCreating = !this.invoiceId || this.invoiceId === 'new' || this.invoiceId === '';
    
    if (!isCreating) {
      invoiceRequest.invoiceId = this.invoiceId;
    }

    const save$ = isCreating
      ? this.accountingService.createInvoice(invoiceRequest)
      : this.accountingService.updateInvoice(invoiceRequest);

    save$.pipe(take(1), finalize(() => {
      this.isSubmitting = false;
    })).subscribe({
      next: async (savedInvoice: InvoiceResponse) => {
        const message = isCreating ? 'Invoice created successfully' : 'Invoice updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        
        if (isCreating && savedInvoice?.invoiceId && (this as any).appliedCreditAmount) {
          await this.updateReservationCreditAfterSave((this as any).appliedCreditAmount);
          (this as any).appliedCreditAmount = null;
        }
        
        if (isCreating) {
          this.toInvoiceCreate(savedInvoice || this.invoice, formValue);
          return;
        }

        this.invoice = savedInvoice || this.invoice;
        this.populateForm();
        this.loadLedgerLines(false);
        this.updateTotalAmount();
        this.captureFormSnapshot();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
        }
      }
    });
  }

  filterCostCodes(): void {
    if (!this.selectedOffice) {
      this.officeCostCodes = [];
      this.debitCostCodes = [];
      this.creditCostCodes = [];
      this.availableCostCodes = [];
      return;
    }
    
    this.officeCostCodes = this.allCostCodes.filter(c => c.officeId === this.selectedOffice.officeId);
    this.debitCostCodes = this.officeCostCodes.filter(c => c.transactionTypeId !== TransactionType.Payment);
    this.creditCostCodes = this.officeCostCodes.filter(c => c.transactionTypeId === TransactionType.Payment);
    
    this.availableCostCodes = this.allCostCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));
    
    this.officeAvailableCostCodes = this.officeCostCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));
  }
  
  getCostCodesForLine(line: LedgerLineListDisplay): { value: number, label: string }[] {
    if (line.isNew !== true) {
      return this.officeAvailableCostCodes;
    }

    if (!this.isAddMode && !this.isPaymentMode) {
      const chargeAndPayment = this.officeCostCodes.filter(
        c => c.isActive && (c.transactionTypeId === TransactionType.Charge || c.transactionTypeId === TransactionType.Payment)
      );
      return chargeAndPayment.map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));
    }

    const transactionTypeId = (line as any).transactionTypeId;

    if (transactionTypeId !== undefined && transactionTypeId !== null && transactionTypeId === TransactionType.Payment) {
      return this.creditCostCodes.filter(c => c.isActive).map(c => ({
        value: c.costCodeId,
        label: `${c.costCode}: ${c.description}`
      }));
    }

    return this.debitCostCodes.filter(c => c.isActive).map(c => ({
      value: c.costCodeId,
      label: `${c.costCode}: ${c.description}`
    }));
  }

  getTransactionTypeLabel(transactionType: number): string {
    return getAccountingTransactionTypeLabel(transactionType, this.transactionTypes);
  }

  isPaymentLine(line: LedgerLineListDisplay): boolean {
    const transactionTypeId = (line as any).transactionTypeId;
    if (transactionTypeId !== undefined && transactionTypeId !== null) {
      return transactionTypeId === TransactionType.Payment;
    }
    return line.transactionType === 'Payment';
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    const bindOfficeStream = (): void => {
      this.officesSubscription?.unsubscribe();
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: (offices) => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        },
        error: () => {
          this.offices = [];
          this.availableOffices = [];
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        }
      });
    };

    this.officeService.areOfficesLoaded().pipe(take(1)).subscribe((loaded) => {
      if (loaded) {
        bindOfficeStream();
        return;
      }

      const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
      if (organizationId) {
        // Self-heal if root preload did not run yet.
        this.officeService.loadAllOffices(organizationId);
        this.officeService.areOfficesLoaded().pipe(filter(isLoaded => isLoaded === true), take(1)).subscribe({
          next: () => bindOfficeStream(),
          error: () => {
            this.offices = [];
            this.availableOffices = [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
          }
        });
      } else {
        // No org scope available; do not block the page spinner forever.
        this.offices = [];
        this.availableOffices = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
         if (this.form) {
          this.updateAvailableReservations();
        } else {
          this.availableReservations = this.reservations.map(r => ({
            value: r.reservationId,
            label: this.utilityService.getReservationDropdownLabel(r, null)
          }));
        }
      },
      error: (err: HttpErrorResponse) => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadCostCodes(): void {
    this.costCodesService.ensureCostCodesLoaded();
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(accounts => {
        this.allCostCodes = this.costCodesService.getAllCostCodesValue();
        this.filterCostCodes();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCodes');
      });
    });
  }

  loadLedgerLines(updateTotalAmount: boolean = true): void {
    const rawLedgerLines = this.invoice?.ledgerLines || [];
    if (!this.invoice || !rawLedgerLines || rawLedgerLines.length === 0) {
      this.ledgerLines = [];
      this.originalLedgerLines = [];
      if (updateTotalAmount) {
        this.form.get('invoicedAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('paidAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('totalDue')?.setValue('0.00', { emitEvent: false });
      }
      return;
    }
    
    if (!this.officeCostCodes || this.officeCostCodes.length === 0) {
      this.filterCostCodes();
    }
    
    this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.officeCostCodes, this.transactionTypes);
    this.ledgerLines.forEach(line => {
      if (line.isNew === undefined) {
        (line as any).isNew = false;
      }
    });
    this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
    
    if (updateTotalAmount) {
      this.updateTotalAmount();
    }
  }

  loadMonthlyLedgerLines(reservationId: string): void {
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    const invoiceCode = this.form.get('invoiceCode')?.value || '';
    
    if (!startDate || !endDate) {
      this.toastr.warning('Start Date and End Date are required to load ledger lines', 'Missing Dates');
      return;
    }
    
    const request: InvoiceMonthlyDataRequest = {
      invoiceCode: invoiceCode,
      reservationId: reservationId,
      startDate: this.utilityService.toDateOnlyJsonString(startDate) ?? '',
      endDate: this.utilityService.toDateOnlyJsonString(endDate) ?? ''
    };
    
    this.accountingService.getMonthlyLedgerLines(request).pipe(take(1)).subscribe({
      next: (response: InvoiceMonthlyDataResponse) => {
        const rawLedgerLines = response.ledgerLines || [];
        console.log('Invoice monthly ledger lines response:', {
          reservationId: request.reservationId,
          startDate: request.startDate,
          endDate: request.endDate,
          rawLedgerLines
        });
        this.ledgerLines = this.mappingService.mapLedgerLines(rawLedgerLines, this.officeCostCodes, this.transactionTypes);
        this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
        this.updateTotalAmount();
        
        if (this.isAddMode && this.selectedReservation && this.selectedReservation.creditDue > 0) {
          this.checkAndOfferCreditApplication();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
        this.ledgerLines = [];
        this.form.get('invoicedAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('paidAmount')?.setValue('0.00', { emitEvent: false });
        this.form.get('totalDue')?.setValue('0.00', { emitEvent: false });
        if (err.status === 404) {
        }
      }
    });
  }
 //#endregion

  //#region Form methods
  buildForm(): void {
    const user = this.authService.getUser();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDayOfCurrentMonth.setHours(0, 0, 0, 0);
    
    this.form = this.fb.group({
      organizationId: new FormControl(user?.organizationId || '', [Validators.required]),
      officeId: new FormControl(null, [Validators.required]),
      officeName: new FormControl({ value: '', disabled: true }), 
      reservationId: new FormControl(null),
      reservationCode: new FormControl({ value: '', disabled: true }), 
      startDate: new FormControl(firstDayOfCurrentMonth, [this.endDateValidator.bind(this)]),
      endDate: new FormControl(lastDayOfCurrentMonth, [this.endDateValidator.bind(this)]),
      invoiceDate: new FormControl(today, [Validators.required]),
      dueDate: new FormControl(today, [Validators.required]),
      invoiceTotal: new FormControl({ value: '', disabled: true }),
      invoiceCode: new FormControl({ value: ' ', disabled: true }),
      invoicedAmount: new FormControl({ value: '0.00', disabled: true }), 
      paidAmount: new FormControl({ value: '0.00', disabled: true }),
      totalDue: new FormControl({ value: '0.00', disabled: true }), 
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });
    

    this.form.get('startDate')?.valueChanges.subscribe((startDateValue) => {
      if (!startDateValue) {
        return;
      }

      const startDate = this.utilityService.parseCalendarDateInput(startDateValue);
      if (!startDate) {
        return;
      }

      const lastDayOfStartMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      lastDayOfStartMonth.setHours(0, 0, 0, 0);
      setTimeout(() => {
        this.form.get('endDate')?.setValue(lastDayOfStartMonth, { emitEvent: false });
      }, 0);
    });
  }

  populateForm(): void {
    if (this.invoice && this.form) {
      this.form.patchValue({
        organizationId: this.invoice.organizationId,
        officeId: this.invoice.officeId,
        officeName: this.invoice.officeName || '',
        reservationId: this.invoice.reservationId || null,
        reservationCode: this.invoice.reservationCode || '',
        startDate: this.utilityService.parseCalendarDateInput(this.invoice.startDate),
        endDate: this.utilityService.parseCalendarDateInput(this.invoice.endDate),
        invoiceDate: this.utilityService.parseCalendarDateInput(this.invoice.invoiceDate),
        dueDate:
          this.utilityService.parseCalendarDateInput(this.invoice.dueDate) ??
          this.utilityService.parseCalendarDateInput(this.invoice.invoiceDate),
        invoiceTotal: this.invoice.totalAmount || '',
        invoiceCode: this.invoice.invoiceCode || '',
        invoicedAmount: this.invoice.totalAmount.toFixed(2),
        paidAmount: (this.invoice.paidAmount || 0).toFixed(2),
        totalDue: ((this.invoice.totalAmount || 0) - (this.invoice.paidAmount || 0)).toFixed(2),
        notes: this.invoice.notes || '',
        isActive: this.invoice.isActive
      }, { emitEvent: false });
      
      this.captureFormSnapshot();
      
      const officeId = this.form.get('officeId')?.value;
      this.selectedOffice = officeId ? this.offices.find(o => o.officeId === officeId) || null : null;
      
      const reservationId = this.form.get('reservationId')?.value;
      this.selectedReservation = reservationId ? this.reservations.find(r => r.reservationId === reservationId) || null : null;
      
      this.updateAvailableReservations();
      this.filterCostCodes();
      this.setInvoiceCode(this.selectedReservation);
    } else {
      this.originalFormSnapshot = null;
      
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
      
      if (!this.invoice.reservationId) {
        this.form.get('invoiceTotal')?.setValue('', { emitEvent: false });
      }
    }
  }
  //#endregion

  //#region Form Responders
  setupFormHandlers(): void {
    this.setupOfficeIdHandler();
    this.setupReservationIdHandler();
    this.setupInvoiceDateSyncHandler();
    
    
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

  setupInvoiceDateSyncHandler(): void {
    this.form.get('invoiceDate')?.valueChanges.subscribe(invoiceDateValue => {
      if (!this.isAddMode || !this.form) {
        return;
      }

      const parsedInvoiceDate = this.utilityService.parseCalendarDateInput(invoiceDateValue);
      if (!parsedInvoiceDate) {
        return;
      }

      parsedInvoiceDate.setHours(0, 0, 0, 0);
      const syncedDate = new Date(parsedInvoiceDate.getTime());
      const syncedEndDate = new Date(parsedInvoiceDate.getFullYear(), parsedInvoiceDate.getMonth() + 1, 0);
      syncedEndDate.setHours(0, 0, 0, 0);

      // Keep Due Date and Start Date aligned with Invoice Date during add flow.
      this.form.get('dueDate')?.setValue(new Date(syncedDate.getTime()), { emitEvent: false });
      this.form.get('startDate')?.setValue(new Date(syncedDate.getTime()), { emitEvent: false });
      this.form.get('endDate')?.setValue(new Date(syncedEndDate.getTime()), { emitEvent: false });
    });
  }

  setupOfficeIdHandler(): void {
    this.form.get('officeId')?.valueChanges.subscribe(officeId => {
      this.globalSelectionService.setSelectedOfficeId(officeId ?? null);
      this.resolveOfficeScope(officeId);
      this.updateAvailableReservations();
      this.filterCostCodes();
      
      const currentReservationId = this.form.get('reservationId')?.value;
      if (currentReservationId && this.selectedOffice) {
        const currentReservation = this.reservations.find(r => r.reservationId === currentReservationId);
        if (currentReservation && currentReservation.officeId !== this.selectedOffice.officeId) {
          this.form.get('reservationId')?.setValue(null, { emitEvent: false });
        }
      } else if (!this.selectedOffice) {
        this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      }
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  setupReservationIdHandler(): void {
    this.reservationIdSubscription = this.form.get('reservationId')?.valueChanges.subscribe(reservationId => {
      this.selectedReservation = reservationId ? this.reservations.find(r => r.reservationId === reservationId) || null : null;
      if (this.selectedReservation) {
        const selectedOfficeId = this.form.get('officeId')?.value;
        if (selectedOfficeId !== this.selectedReservation.officeId) {
          this.form.get('officeId')?.setValue(this.selectedReservation.officeId);
        }
        this.setInvoiceCode(this.selectedReservation);
      } else {
        this.form.get('invoiceCode')?.setValue(' ', { emitEvent: false });
      }
    });
  }

  setInvoiceCode(reservation: ReservationListResponse): void {
    if (!this.isAddMode) {
      return;
    }
    if (reservation && this.form) {
      const invoiceCode = reservation.reservationCode + '-' + (reservation.currentInvoiceNo + 1).toString().padStart(3, '0');
      this.form.get('invoiceCode')?.setValue(invoiceCode, { emitEvent: false });
    }
  }

  updateAvailableReservations(): void {
    if (this.selectedOffice) {
      const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
      this.availableReservations = filteredReservations.map(r => ({
        value: r.reservationId,
        label: this.utilityService.getReservationDropdownLabel(r, null)
      }));
    } else {
      this.availableReservations = this.reservations.map(r => ({
        value: r.reservationId,
        label: this.utilityService.getReservationDropdownLabel(r, null)
      }));
    }
  }

  updateLedgerLineField(index: number, field: keyof LedgerLineListDisplay, value: any): void {
    if (this.ledgerLines[index]) {
      (this.ledgerLines[index] as any)[field] = value;
      if (field === 'amount') {
        this.updateTotalAmount();
      }
      
      if (field === 'transactionType' && typeof value === 'string') {
        const transactionType = this.transactionTypes.find(t => t.label === value);
        if (transactionType) {
           (this.ledgerLines[index] as any).transactionTypeId = transactionType.value;
        }
      }
      
    }
  }

  onTransactionTypeChange(index: number, transactionTypeId: number | null): void {
    if (transactionTypeId === null || transactionTypeId === undefined) {
      this.updateLedgerLineField(index, 'transactionType', '');
      (this.ledgerLines[index] as any).transactionTypeId = undefined;
      return;
    }

    const transactionType = this.transactionTypes.find(t => t.value === transactionTypeId);
    if (transactionType) {
      this.updateLedgerLineField(index, 'transactionType', transactionType.label);
      (this.ledgerLines[index] as any).transactionTypeId = transactionTypeId;
    }
  }

  onCostCodeChange(index: number, costCodeId: string | number | null): void {
    const parsedCostCodeId = costCodeId === null || costCodeId === undefined || costCodeId === '' ? NaN : Number(costCodeId);
    const normalizedCostCodeId = Number.isInteger(parsedCostCodeId) ? parsedCostCodeId : null;
    if (normalizedCostCodeId === null) {
      this.updateLedgerLineField(index, 'costCodeId', null);
      this.updateLedgerLineField(index, 'costCode', null);
      (this.ledgerLines[index] as any).transactionTypeId = undefined;
      this.updateLedgerLineField(index, 'transactionType', '');
    } else {
      const line = this.ledgerLines[index];
      
      this.updateLedgerLineField(index, 'costCodeId', normalizedCostCodeId);
      const matchingCostCode = this.officeCostCodes.find(c => c.costCodeId === normalizedCostCodeId)
        ?? this.allCostCodes.find(c =>
          c.costCodeId === normalizedCostCodeId
          && (!this.selectedOffice || c.officeId === this.selectedOffice.officeId)
        );
      if (matchingCostCode) {
        this.updateLedgerLineField(index, 'costCode', matchingCostCode.costCode);
        const newTransactionTypeId = matchingCostCode.transactionTypeId;
        (this.ledgerLines[index] as any).transactionTypeId = newTransactionTypeId;
        const transactionType = this.transactionTypes.find(t => t.value === newTransactionTypeId);
        if (transactionType) {
          this.updateLedgerLineField(index, 'transactionType', transactionType.label);
        }
        
      } else {
        this.updateLedgerLineField(index, 'costCode', null);
        (this.ledgerLines[index] as any).transactionTypeId = undefined;
        this.updateLedgerLineField(index, 'transactionType', '');
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
      if (this.isPaymentLine(line)) {
        const amount = line.amount || 0;
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  calculateNewPaymentAmount(): number {
    if (!this.ledgerLines || this.ledgerLines.length === 0) {
      return 0;
    }
    return this.ledgerLines.reduce((sum, line) => {
      if (line.isNew === true && this.isPaymentLine(line)) {
        const amount = line.amount || 0;
        return sum + amount;
      }
      return sum;
    }, 0);
  }

  updateTotalAmount(): void {
    const invoicedAmount = this.calculateInvoicedAmount();
    const paidAmount = this.calculatePaidAmount();
    const totalDue = invoicedAmount - paidAmount;
    
    const invoicedControl = this.form.get('invoicedAmount');
    if (invoicedControl) {
      invoicedControl.setValue(invoicedAmount.toFixed(2), { emitEvent: false });
    }
    
    const paidControl = this.form.get('paidAmount');
    if (paidControl) {
      paidControl.setValue(paidAmount.toFixed(2), { emitEvent: false });
    }
    
    const totalDueControl = this.form.get('totalDue');
    if (totalDueControl) {
      totalDueControl.setValue(totalDue.toFixed(2), { emitEvent: false });
    }
    
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
        const formattedValue = '$' + this.formatter.currency(Math.abs(paidAmount));
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

    return this.hasFormStateChanged();
  }

  hasLedgerLinesChanged(): boolean {
    if (this.isAddMode && this.originalLedgerLines.length === 0) {
      return this.ledgerLines.length > 0;
    }
    
    if (this.ledgerLines.length !== this.originalLedgerLines.length) {
      return true;
    }
    
    for (let i = 0; i < this.ledgerLines.length; i++) {
      const current = this.ledgerLines[i];
      const original = this.originalLedgerLines[i];
      
      if (!original) {
        return true;
      }
      
      if (current.ledgerLineId !== original.ledgerLineId ||
          current.costCodeId !== original.costCodeId ||
          (current as any).transactionTypeId !== (original as any).transactionTypeId ||
          current.description !== original.description ||
          current.amount !== original.amount) {
        return true;
      }
    }
    
    return false;
  }

  hasFormStateChanged(): boolean {
    if (this.isAddMode || !this.form || !this.originalFormSnapshot) {
      return false;
    }

    const current = this.normalizeFormForDirtyCompare(this.form.getRawValue());
    return JSON.stringify(current) !== JSON.stringify(this.originalFormSnapshot);
  }

  captureFormSnapshot(): void {
    if (!this.form) {
      this.originalFormSnapshot = null;
      return;
    }
    this.originalFormSnapshot = this.normalizeFormForDirtyCompare(this.form.getRawValue());
  }

  normalizeFormForDirtyCompare(formValue: any): {
    officeId: number | null;
    reservationId: string | null;
    startDate: string | null;
    endDate: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    notes: string | null;
    isActive: boolean;
  } {
    const toDateKey = (value: any): string | null => this.utilityService.toDateOnlyJsonString(value);

    return {
      officeId: formValue?.officeId ?? null,
      reservationId: formValue?.reservationId ?? null,
      startDate: toDateKey(formValue?.startDate),
      endDate: toDateKey(formValue?.endDate),
      invoiceDate: toDateKey(formValue?.invoiceDate),
      dueDate: toDateKey(formValue?.dueDate),
      notes: (formValue?.notes ?? '').trim() || null,
      isActive: !!formValue?.isActive
    };
  }
  //#endregion

  //#region Ledger Lines
  onLedgerAmountInput(event: Event, _index: number): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;

    value = value.replace(/[^0-9.-]/g, '');
    const hasLeadingMinus = value.startsWith('-');
    const unsignedValue = value.replace(/-/g, '');
    const normalizedValue = hasLeadingMinus ? `-${unsignedValue}` : unsignedValue;

    const parts = normalizedValue.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = normalizedValue;
    }
  }

  onLedgerAmountFocus(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line && line.amount != null && line.amount !== undefined) {
      input.value = line.amount.toString();
      input.select();
    } else {
      input.value = '';
    }
  }

  onLedgerAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.ledgerLines[index];
    if (line) {
      const rawValue = input.value.replace(/[^0-9.-]/g, '').trim();
      let numValue: number;
      let formattedValue: string;
      
      if (rawValue !== '' && rawValue !== null) {
        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed)) {
          const finalValue = parsed;
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

  generateLedgerLines(): void {
    const reservationId = this.form.get('reservationId')?.value;
    if (reservationId) {
      this.loadMonthlyLedgerLines(reservationId);
    } else {
      this.toastr.warning('Please select a reservation before generating ledger lines', 'No Reservation Selected');
    }
  }

  getLedgerAmountDisplay(line: LedgerLineListDisplay): string {
    if (line.amount == null || line.amount === undefined) {
      return '';
    }
    return line.amount.toFixed(2);
  }

  checkAndOfferCreditApplication(): void {
    if (!this.selectedReservation || !this.selectedOffice || this.selectedReservation.creditDue <= 0) {
      return;
    }

    const creditAmount = this.selectedReservation.creditDue;
    const paymentCostCode = this.creditCostCodes.find(c => c.isActive);
    if (!paymentCostCode) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const dialogConfig: MatDialogConfig = {
      width: '500px',
      autoFocus: true,
      restoreFocus: true,
      disableClose: false,
      hasBackdrop: true
    };

    const dialogData: ApplyCreditToInvoiceDialogData = {
      creditAmount: creditAmount
    };

    const dialogRef = this.dialog.open(ApplyCreditToInvoiceDialogComponent, {
      ...dialogConfig,
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result: boolean | undefined) => {
      if (result === true) {
        this.addCreditPaymentLine(creditAmount, paymentCostCode);
      }
    });
  }

  addCreditPaymentLine(creditAmount: number, paymentCostCode: CostCodesResponse): void {
    const paymentLine: LedgerLineListDisplay = {
      ledgerLineId: null,
      lineNumber: this.ledgerLines.length + 1,
      costCodeId: paymentCostCode.costCodeId,
      costCode: paymentCostCode.costCode,
      transactionType: 'Payment',
      description: `Credit applied from reservation`,
      amount: Math.abs(creditAmount),
      isNew: true
    };
    
    (paymentLine as any).transactionTypeId = TransactionType.Payment;
    
    this.ledgerLines.push(paymentLine);
    
    (this as any).appliedCreditAmount = creditAmount;
    
    this.updateTotalAmount();
    
    this.originalLedgerLines = JSON.parse(JSON.stringify(this.ledgerLines));
  }

  addLedgerLine(): void {
    const newLine: LedgerLineListDisplay = {
      ledgerLineId: null,
      lineNumber: this.ledgerLines.length + 1,
      costCodeId: null as number | null,
      costCode: null,
      transactionType: '',
      description: '',
      amount: undefined as any,
      isNew: true
    };
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
      const value = parseFloat(control.value) || 0;
      input.value = value.toFixed(2);
      input.select();
    }
  }

  onAmountBlur(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get(fieldName);
    if (control) {
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
      return null;
    }
    
    const endDate = this.utilityService.parseCalendarDateInput(control.value);
    const start = this.utilityService.parseCalendarDateInput(startDate);
    if (!endDate || !start) {
      return null;
    }
    
    endDate.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    
    if (endDate < start) {
      return { endDateBeforeStartDate: true };
    }
    
    return null;
  }
  //#endregion

  //#region Utility Methods
  toInvoiceCreate(invoiceToUse: InvoiceResponse | null | undefined, formValue?: any): void {
    if (!invoiceToUse?.invoiceId) {
      this.back(formValue || this.form?.getRawValue() || {});
      return;
    }

    const queryParams = this.route.snapshot.queryParams;
    const originReturnTo = queryParams['returnTo'] || 'accounting';
    const params: string[] = [
      'returnTo=invoice-edit',
      `originReturnTo=${encodeURIComponent(originReturnTo)}`
    ];

    const officeIdToUse = this.selectedOffice?.officeId || invoiceToUse.officeId || formValue?.officeId;
    const reservationIdToUse = this.selectedReservation?.reservationId || invoiceToUse.reservationId || formValue?.reservationId;

    if (officeIdToUse) {
      params.push(`officeId=${officeIdToUse}`);
    }
    if (reservationIdToUse) {
      params.push(`reservationId=${reservationIdToUse}`);
    }

    params.push(`invoiceId=${invoiceToUse.invoiceId}`);

    if (this.companyId) {
      params.push(`companyId=${this.companyId}`);
    }

    const organizationIdParam = queryParams['organizationId'];
    if (organizationIdParam) {
      params.push(`organizationId=${encodeURIComponent(organizationIdParam)}`);
    }

    const invoiceCreateUrl = `${RouterUrl.InvoiceCreate}?${params.join('&')}`;
    this.router.navigateByUrl(invoiceCreateUrl);
  }

  back(formValue?: any): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];
    let officeId = queryParams['officeId'] || formValue?.officeId;
    const reservationId = queryParams['reservationId'] || formValue?.reservationId;
    const params: string[] = [];
    
    if (!officeId && this.invoice && this.invoice.officeId) {
      officeId = this.invoice.officeId.toString();
    } 
    if (officeId) {
      params.push(`officeId=${officeId}`);
    }

    if (returnTo === 'reservation' && reservationId) {
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }      
      params.push(`tab=invoices`);
      const reservationUrl = params.length > 0 
        ? RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]) + `?${params.join('&')}`
        : RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
      this.router.navigateByUrl(reservationUrl);
    } else if (returnTo === 'accounting' || !returnTo) {
      if (this.companyId) {
        params.push(`companyId=${this.companyId}`);
      }
      if (params.length > 0) {
        this.router.navigateByUrl(RouterUrl.AccountingList + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.AccountingList);
      }
    } else {
      if (params.length > 0) {
        this.router.navigateByUrl(RouterUrl.AccountingList + `?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.AccountingList);
      }
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.reservationIdSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  } 
  //#endregion
}
