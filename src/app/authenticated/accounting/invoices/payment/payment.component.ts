import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { FormatterService } from '../../../../services/formatter-service';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { UtilityService } from '../../../../services/utility.service';
import { MappingService } from '../../../../services/mapping.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { PaymentType, PaymentTypeLabels, TransactionType } from '../../models/accounting-enum';
import { CostCodesResponse } from '../../models/cost-codes.model';
import { InvoiceResponse } from '../../models/invoice.model';
import { CreatePaymentWithAllocationsRequest, PaymentLedgerLine, PaymentRequest, PaymentResponse } from '../../models/payment.model';
import { CostCodesService } from '../../services/cost-codes.service';
import { InvoiceService } from '../../services/invoice.service';
import { JournalEntryService } from '../../services/journal-entry.service';
import { PaymentService } from '../../services/payment.service';

@Component({
  standalone: true,
  selector: 'app-payment',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.scss'
})
export class PaymentComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() paymentId: string | null = null;
  @Input() prefetchedPayment: PaymentResponse | null = null;
  @Input() invoiceSearchDateRange: { startDate: string | null; endDate: string | null } = { startDate: null, endDate: null };
  @Input() autoBackOnSave = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<PaymentResponse>();
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private paymentService = inject(PaymentService);
  private invoiceService = inject(InvoiceService);
  private journalEntryService = inject(JournalEntryService);
  private costCodesService = inject(CostCodesService);
  private utilityService = inject(UtilityService);
  private mappingService = inject(MappingService);
  formatter = inject(FormatterService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  isAddMode = false;
  isSubmitting = false;
  isPageReady = false;
  isPaymentContentReady = false;
  organizationId = '';
  payment: PaymentResponse | null = null;
  invoices: InvoiceResponse[] = [];
  costCodeOptions: SearchableSelectOption<number>[] = [];
  invoiceOptions: SearchableSelectOption<string>[] = [];
  readonly paymentTypeOptions = PaymentTypeLabels;
  readonly comparePaymentTypeIds = (left: number | null, right: number | null): boolean => left === right;
  amountFocused = false;
  amountEditValue = '';
  saveValidationHighlightActive = false;
  splitTotalValidationError = false;
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';
  isSyncingInitialSplit = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  readonly requirePositiveAmount = (control: AbstractControl): ValidationErrors | null => {
    const raw = this.sanitizeSignedDecimalInput(control.value?.toString() ?? '').trim();
    const amount = parseFloat(raw);
    if (!raw || !Number.isFinite(amount) || Math.abs(amount) < 0.000001) {
      return { required: true };
    }
    return null;
  };

  readonly requireCostCodeId = (control: AbstractControl): ValidationErrors | null => {
    const costCodeId = Number(control.value ?? 0);
    return Number.isFinite(costCodeId) && costCodeId > 0 ? null : { required: true };
  };

  readonly requireInvoiceId = (control: AbstractControl): ValidationErrors | null => {
    const invoiceId = (control.value || '').toString().trim();
    return invoiceId.length > 0 ? null : { required: true };
  };

  constructor() {
    this.form = this.fb.group({});
  }

  //#region Payment
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncPageReadyFromLoadItems());
    this.isAddMode = this.paymentId === 'new';
    this.loadCostCodesForOffice();
    if (this.isAddMode) {
      this.loadInvoicesForOffice();
      this.ensureAtLeastOneSplit();
      this.isPaymentContentReady = true;
      this.clearPaymentLoading();
    } else if (this.prefetchedPayment && this.prefetchedPayment.paymentId === this.paymentId) {
      this.applyLoadedPayment(this.prefetchedPayment);
      this.loadPayment(true);
    } else {
      this.isPaymentContentReady = false;
      this.loadPayment();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['paymentId'] && !changes['paymentId'].firstChange) {
      this.isAddMode = this.paymentId === 'new';
      if (this.isAddMode) {
        this.resetForm();
      } else {
        this.isPaymentContentReady = false;
        if (this.prefetchedPayment && this.prefetchedPayment.paymentId === this.paymentId) {
          this.applyLoadedPayment(this.prefetchedPayment);
          this.loadPayment(true);
        } else {
          this.loadPayment();
        }
      }
    }
    if (changes['prefetchedPayment'] && !changes['prefetchedPayment'].firstChange
      && this.prefetchedPayment && this.prefetchedPayment.paymentId === this.paymentId) {
      this.applyLoadedPayment(this.prefetchedPayment);
    }
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadCostCodesForOffice();
      this.loadInvoicesForOffice();
    }
    if (changes['invoiceSearchDateRange'] && !changes['invoiceSearchDateRange'].firstChange) {
      this.loadInvoicesForOffice();
    }
  }

  savePayment(): void {
    this.saveValidationHighlightActive = true;
    this.form.markAllAsTouched();
    this.splitsFormArray.controls.forEach(control => control.markAllAsTouched());
    this.cdr.markForCheck();

    if (!this.organizationId) {
      this.showValidationErrorToast();
      return;
    }
    if (this.form.invalid) {
      this.showValidationErrorToast();
      return;
    }

    const paymentDateValue = this.utilityService.toDateOnlyJsonString(this.form.get('paymentDate')?.value);
    if (!paymentDateValue) {
      this.form.get('paymentDate')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    const amountValue = parseFloat(this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '')) || 0;
    const costCodeId = Number(this.form.get('costCodeId')?.value ?? 0);
    if (!Number.isFinite(costCodeId) || costCodeId <= 0) {
      this.form.get('costCodeId')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    const paymentTypeId = this.resolvePaymentTypeIdFromForm();

    if (!this.isAddMode && !this.payment?.paymentId) {
      this.toastr.error('Payment is still loading.', 'Error');
      return;
    }

    const payload = this.mappingService.buildPaymentSaveRequest(
      this.isAddMode ? null : this.payment,
      this.organizationId,
      this.getPaymentOfficeId(),
      {
        paymentDate: paymentDateValue,
        amount: amountValue,
        costCodeId,
        description: (this.form.get('description')?.value || '').trim(),
        paymentTypeId,
        isActive: !!this.form.get('isActive')?.value
      }
    );

    if (this.isAddMode) {
      const allocations = this.getPayloadAllocationsFromForm();
      if (allocations.length === 0) {
        this.showValidationErrorToast();
        return;
      }
      if (this.isAllocationTotalOutOfBalance()) {
        this.splitTotalValidationError = true;
        this.showValidationErrorToast();
        return;
      }
      this.splitTotalValidationError = false;

      this.isSubmitting = true;
      const createPayload: CreatePaymentWithAllocationsRequest = {
        ...payload,
        allocations
      };
      this.paymentService.createPaymentWithAllocations(createPayload).pipe(take(1), finalize(() => {
        this.isSubmitting = false;
        this.cdr.markForCheck();
      })).subscribe({
        next: (saved: PaymentResponse) => {
          this.payment = saved;
          this.isAddMode = false;
          this.saveValidationHighlightActive = false;
          this.toastr.success('Payment saved successfully.', 'Success');
          this.savedEvent.emit(saved);
          if (this.autoBackOnSave) {
            this.backEvent.emit();
          }
        },
        error: (_err: HttpErrorResponse) => {
          this.toastr.error('Unable to save payment.', 'Error');
        }
      });
      return;
    }

    const allocations = this.getPayloadAllocationsFromForm();
    if (allocations.length === 0) {
      this.showValidationErrorToast();
      return;
    }
    if (this.isAllocationTotalOutOfBalance()) {
      this.splitTotalValidationError = true;
      this.showValidationErrorToast();
      return;
    }
    this.splitTotalValidationError = false;

    const savePayment = () => {
      this.isSubmitting = true;
      this.paymentService.updatePayment(payload).pipe(take(1), finalize(() => {
        this.isSubmitting = false;
        this.cdr.markForCheck();
      })).subscribe({
        next: (saved: PaymentResponse) => {
          this.payment = saved;
          this.saveValidationHighlightActive = false;
          this.toastr.success('Payment saved successfully.', 'Success');
          this.savedEvent.emit(saved);
          if (this.autoBackOnSave) {
            this.backEvent.emit();
          }
        },
        error: (_err: HttpErrorResponse) => {
          this.toastr.error('Unable to save payment.', 'Error');
        }
      });
    };

    this.journalEntryService.confirmUpdateIfAllowed(this.payment?.postingStatusId, 'Payment').pipe(take(1)).subscribe(canProceed => {
      if (!canProceed) {
        return;
      }

      savePayment();
    });
  }
  //#endregion

  //#region Build Form
  buildForm(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form = this.fb.group({
      paymentDate: new FormControl<Date | null>(today, [Validators.required]),
      amount: new FormControl('0.00', [Validators.required, this.requirePositiveAmount]),
      costCodeId: new FormControl<number>(0, [Validators.required, this.requireCostCodeId]),
      paymentTypeId: new FormControl<number | null>(PaymentType.Check),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true),
      splits: this.fb.array([])
    });
  }

  populateForm(payment: PaymentResponse): void {
    this.form.patchValue({
      paymentDate: this.getDateControlValue(payment.paymentDate),
      description: payment.description || '',
      amount: payment.amount != null ? this.formatter.currency(payment.amount) : '0.00',
      costCodeId: payment.costCodeId ?? 0,
      paymentTypeId: payment.paymentTypeId ?? null,
      isActive: payment.isActive
    });
    this.replaceSplitLinesFromLedgerLines(payment.ledgerLines || []);
  }

  resetForm(): void {
    this.payment = null;
    this.isPaymentContentReady = true;
    this.clearPaymentLoading();
    this.buildForm();
    this.loadCostCodesForOffice();
    this.loadInvoicesForOffice();
    this.ensureAtLeastOneSplit();
  }
  //#endregion

  resolvePaymentTypeIdFromForm(): number | null {
    const raw = this.form.get('paymentTypeId')?.value;
    if (raw === null || raw === undefined || raw === '') {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  //#region Split Methods
  get splitsFormArray(): FormArray {
    return this.form.get('splits') as FormArray;
  }

  addSplitLine(): void {
    const newIndex = this.splitsFormArray.length;
    const overallDescription = (this.form.get('description')?.value || '').trim();
    let remainderAmount = 0;
    if (newIndex === 1) {
      const paymentTotal = this.getPaymentAmountValue();
      const existingTotal = this.getDisplayedSplitTotal();
      remainderAmount = Math.max(0, Math.round((paymentTotal - existingTotal) * 100) / 100);
    }
    this.splitsFormArray.push(this.createSplitGroup({
      amount: newIndex === 1 ? remainderAmount : 0,
      description: overallDescription
    }));
    this.cdr.markForCheck();
  }

  removeSplitLine(index: number): void {
    if (this.splitsFormArray.length <= 1) {
      return;
    }
    this.splitsFormArray.removeAt(index);
    this.syncPaymentAmountFromSplits();
    this.cdr.markForCheck();
  }

  ensureAtLeastOneSplit(): void {
    if (this.splitsFormArray.length === 0) {
      const paymentAmount = this.getPaymentAmountValue();
      this.splitsFormArray.push(this.createSplitGroup({
        amount: paymentAmount > 0 ? paymentAmount : 0,
        description: (this.form.get('description')?.value || '').trim()
      }));
    }
  }

  replaceSplitLinesFromLedgerLines(lines: PaymentLedgerLine[]): void {
    while (this.splitsFormArray.length > 0) {
      this.splitsFormArray.removeAt(0);
    }

    if (!lines.length) {
      this.ensureAtLeastOneSplit();
      return;
    }

    lines.forEach(line => {
      this.splitsFormArray.push(this.createSplitGroup({
        invoiceId: line.invoiceId,
        amount: line.amount,
        description: line.description
      }));
    });
  }

  createSplitGroup(split?: { invoiceId?: string; amount?: number; description?: string }): FormGroup {
    const amount = Number(split?.amount);
    return this.fb.group({
      invoiceId: new FormControl((split?.invoiceId || '').trim(), [Validators.required, this.requireInvoiceId]),
      amount: new FormControl(Number.isFinite(amount) ? amount.toFixed(2) : '0.00', [Validators.required, this.requirePositiveAmount]),
      description: new FormControl(split?.description || '', [Validators.required])
    });
  }

  getPayloadAllocationsFromForm(): CreatePaymentWithAllocationsRequest['allocations'] {
    return this.splitsFormArray.controls.map(control => {
      const group = control as FormGroup;
      const amount = parseFloat(this.sanitizeSignedDecimalInput(group.get('amount')?.value?.toString() ?? '')) || 0;
      return {
        invoiceId: (group.get('invoiceId')?.value || '').toString().trim(),
        amount,
        description: (group.get('description')?.value || '').toString().trim()
      };
    }).filter(line => line.invoiceId.length > 0 && line.amount !== 0);
  }

  getDisplayedSplitTotal(): number {
    return this.getPayloadAllocationsFromForm().reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  }

  toCurrencyCents(value: number): number {
    return Math.round((Number(value) || 0) * 100);
  }

  isAllocationTotalOutOfBalance(): boolean {
    return this.toCurrencyCents(this.getDisplayedSplitTotal()) !== this.toCurrencyCents(this.getPaymentAmountValue());
  }

  onOverallDescriptionBlur(): void {
    this.applyDescriptionToAllSplitLines();
  }

  applyDescriptionToAllSplitLines(): void {
    if (!this.splitsFormArray || this.splitsFormArray.length === 0) {
      return;
    }

    const overallDescription = (this.form.get('description')?.value || '').trim();
    if (!overallDescription) {
      return;
    }

    this.splitsFormArray.controls.forEach(control => {
      const descriptionControl = control.get('description');
      if (!(descriptionControl?.value || '').toString().trim()) {
        descriptionControl?.setValue(overallDescription, { emitEvent: false });
      }
    });
  }

  onSplitInvoiceSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const invoiceId = (value ?? '').toString().trim();
    const splitGroup = this.splitsFormArray.at(splitIndex) as FormGroup | undefined;
    splitGroup?.get('invoiceId')?.setValue(invoiceId);
    splitGroup?.get('invoiceId')?.markAsTouched();
    if (invoiceId.length > 0) {
      const balanceDue = this.getInvoiceBalanceDue(invoiceId);
      splitGroup?.get('amount')?.setValue(balanceDue.toFixed(2), { emitEvent: false });
      splitGroup?.get('amount')?.markAsTouched();
      splitGroup?.get('amount')?.updateValueAndValidity({ emitEvent: false });
    }
    this.syncPaymentAmountFromSplits();
    this.cdr.markForCheck();
  }

  getInvoiceBalanceDue(invoiceId: string): number {
    const invoice = this.invoices.find(item => item.invoiceId === invoiceId);
    if (!invoice) {
      return 0;
    }

    const balance = Math.round(((Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0)) * 100) / 100;
    return balance > 0 ? balance : 0;
  }

  syncPaymentAmountFromSplits(): void {
    const splitTotal = this.getDisplayedSplitTotal();
    this.form.get('amount')?.setValue(splitTotal.toFixed(2), { emitEvent: false });
    this.form.get('amount')?.markAsTouched();
    this.form.get('amount')?.updateValueAndValidity({ emitEvent: false });
    this.splitTotalValidationError = false;
  }

  getSplitInvoiceSelectClass(splitGroup: AbstractControl): string {
    const baseClass = 'split-editable-input split-invoice-select-control';
    return this.shouldShowSplitControlError(splitGroup, 'invoiceId')
      ? `${baseClass} split-input-invalid`
      : baseClass;
  }

  getSplitAmountDisplay(index: number): string {
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    const raw = this.sanitizeSignedDecimalInput(amountControl?.value?.toString() ?? '');
    if (this.focusedSplitAmountIndex === index) {
      return this.splitAmountEditValue;
    }
    const num = parseFloat(raw) || 0;
    return '$' + this.formatter.currency(num);
  }

  onSplitAmountFocus(event: Event, index: number): void {
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    const current = this.sanitizeSignedDecimalInput(amountControl?.value?.toString() ?? '');
    this.focusedSplitAmountIndex = index;
    this.splitAmountEditValue = current || '';
    setTimeout(() => (event.target as HTMLInputElement)?.select(), 0);
  }

  onSplitAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input?.value ?? '';
    this.splitAmountEditValue = this.sanitizeSignedDecimalInput(value);
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    amountControl?.setValue(this.splitAmountEditValue, { emitEvent: false });
  }

  onSplitAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const raw = this.sanitizeSignedDecimalInput(input?.value ?? '');
    const num = parseFloat(raw) || 0;
    const formatted = num.toFixed(2);
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    amountControl?.setValue(formatted, { emitEvent: false });
    amountControl?.markAsTouched();
    amountControl?.updateValueAndValidity({ emitEvent: false });
    if (this.focusedSplitAmountIndex === index) {
      this.focusedSplitAmountIndex = null;
      this.splitAmountEditValue = '';
    }
  }

  onSplitAmountKeydown(event: Event, index: number): void {
    const amountControl = this.splitsFormArray.at(index)?.get('amount');
    this.formatter.formatDecimalOnEnter(event as KeyboardEvent, amountControl);
  }

  shouldShowSplitControlError(splitGroup: AbstractControl, controlName: string): boolean {
    return this.shouldShowControlError((splitGroup as FormGroup).get(controlName));
  }

  buildInvoiceOptions(invoices: InvoiceResponse[]): SearchableSelectOption<string>[] {
    return (invoices || [])
      .map(invoice => {
        const balance = Math.round(((Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0)) * 100) / 100;
        const party = (invoice.responsibleParty || invoice.companyName || invoice.contactName || '').trim();
        const balanceLabel = this.formatter.currencyUsd(balance);
        const labelParts = [(invoice.invoiceCode || '').trim(), party, `Bal ${balanceLabel}`].filter(part => part.length > 0);
        return {
          value: invoice.invoiceId,
          label: labelParts.join(' — ')
        };
      })
      .filter(option => option.value.length > 0)
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  }
  //#endregion

  //#region Data Load Methods
  loadPayment(refreshOnly = false): void {
    if (this.isAddMode || !this.paymentId) {
      this.clearPaymentLoading();
      return;
    }

    if (!refreshOnly) {
      this.isPaymentContentReady = false;
      this.utilityService.addLoadItem(this.itemsToLoad$, 'payment');
    }

    this.paymentService.getPaymentById(this.paymentId).pipe(take(1), finalize(() => {
      if (!refreshOnly) {
        this.clearPaymentLoading();
      }
    })).subscribe({
      next: (payment: PaymentResponse) => this.applyLoadedPayment(payment),
      error: (_err: HttpErrorResponse) => {
        if (!refreshOnly) {
          this.toastr.error('Unable to load payment.', 'Error');
        }
      }
    });
  }

  applyLoadedPayment(payment: PaymentResponse): void {
    this.payment = payment;
    this.populateForm(payment);
    this.loadCostCodesForOffice();
    this.loadInvoicesForOffice();
    this.clearPaymentLoading();
    this.isPaymentContentReady = true;
    this.cdr.markForCheck();
  }

  loadCostCodesForOffice(): void {
    const officeId = this.getPaymentOfficeId();
    if (!officeId) {
      this.costCodeOptions = [];
      return;
    }

    this.costCodesService.getCostCodesByOfficeId(officeId).pipe(take(1)).subscribe({
      next: (costCodes: CostCodesResponse[]) => {
        this.costCodeOptions = (costCodes || [])
          .filter(code => code.isActive !== false && code.transactionTypeId === TransactionType.Payment)
          .map(code => ({
            value: code.costCodeId,
            label: `${(code.costCode || '').trim()} - ${(code.description || '').trim()}`.replace(/ - $/, '')
          }));
        this.cdr.markForCheck();
      },
      error: () => {
        this.costCodeOptions = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadInvoicesForOffice(): void {
    const officeId = this.getPaymentOfficeId();
    if (!officeId) {
      this.invoices = [];
      this.invoiceOptions = [];
      return;
    }

    this.invoiceService.searchInvoices({
      officeIds: [officeId],
      includeInactive: false,
      includePaid: true,
      startDate: this.invoiceSearchDateRange?.startDate ?? null,
      endDate: this.invoiceSearchDateRange?.endDate ?? null
    }).pipe(take(1)).subscribe({
      next: (invoices: InvoiceResponse[]) => {
        this.invoices = invoices || [];
        this.invoiceOptions = this.buildInvoiceOptions(this.invoices);
        this.cdr.markForCheck();
      },
      error: () => {
        this.invoices = [];
        this.invoiceOptions = [];
        this.cdr.markForCheck();
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onCostCodeSelectionChange(value: number | string): void {
    this.form.patchValue({ costCodeId: Number(value) || 0 });
    this.form.get('costCodeId')?.markAsTouched();
  }

  shouldShowControlError(control: AbstractControl | null | undefined): boolean {
    if (!control) {
      return false;
    }
    return control.invalid && (control.touched || this.saveValidationHighlightActive);
  }

  showValidationErrorToast(): void {
    this.cdr.markForCheck();
    this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
  }

  getPaymentAmountValue(): number {
    const raw = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    return parseFloat(raw) || 0;
  }

  getAmountDisplay(): string {
    if (this.amountFocused) {
      return this.amountEditValue;
    }
    const raw = this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '');
    const num = parseFloat(raw) || 0;
    return '$' + this.formatter.currency(num);
  }

  onAmountFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get('amount');
    const current = this.sanitizeSignedDecimalInput(control?.value?.toString() ?? '');
    this.amountEditValue = current || '';
    this.amountFocused = true;
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      input.setSelectionRange(0, input.value.length);
    });
  }

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input?.value ?? '';
    this.amountEditValue = this.sanitizeSignedDecimalInput(value);
    this.form.get('amount')?.setValue(this.amountEditValue, { emitEvent: false });
  }

  onAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = this.sanitizeSignedDecimalInput(input?.value ?? '');
    const num = parseFloat(raw) || 0;
    const formatted = num.toFixed(2);
    const control = this.form.get('amount');
    control?.setValue(formatted, { emitEvent: false });
    control?.markAsTouched();
    control?.updateValueAndValidity({ emitEvent: false });
    this.amountFocused = false;
    this.amountEditValue = '';
  }

  onAmountKeydown(event: Event): void {
    this.formatter.formatDecimalOnEnter(event as KeyboardEvent, this.form.get('amount'));
  }

  sanitizeSignedDecimalInput(value: string): string {
    if (!value) {
      return '';
    }
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const isNegative = cleaned.startsWith('-');
    const unsigned = cleaned.replace(/-/g, '');
    const parts = unsigned.split('.');
    const numericPortion = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
    return `${isNegative ? '-' : ''}${numericPortion}`;
  }

  getPaymentOfficeId(): number | null {
    if (this.payment?.officeId) {
      return this.payment.officeId;
    }
    if (this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    return null;
  }

  getDateControlValue(value: string | null | undefined): Date | null {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    return parsed ?? null;
  }

  clearPaymentLoading(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'payment');
    this.cdr.markForCheck();
  }

  syncPageReadyFromLoadItems(): void {
    this.isPageReady = this.itemsToLoad$.value.size === 0;
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
