import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, switchMap, take, takeUntil } from 'rxjs';
import { FormatterService } from '../../../../services/formatter-service';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { UtilityService } from '../../../../services/utility.service';
import { MappingService } from '../../../../services/mapping.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { AccountType, PaymentDirection, PaymentType, PaymentTypeLabels, TransactionType } from '../../models/accounting-enum';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { CostCodesResponse } from '../../models/cost-codes.model';
import { InvoiceResponse } from '../../models/invoice.model';
import { CreatePaymentWithInvoiceAllocationsRequest, CreatePaymentWithBillAllocationsRequest, UpdatePaymentWithInvoiceAllocationsRequest, PaymentBillAllocation, PaymentLedgerLine, PaymentResponse } from '../../models/payment.model';
import { ReceiptResponse, buildBillSplitLineDescription } from '../../../maintenance/models/receipt.model';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import { CostCodesService } from '../../services/cost-codes.service';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { InvoiceService } from '../../services/invoice.service';
import { JournalEntryService } from '../../services/journal-entry.service';
import { PaymentService } from '../../services/payment.service';
import { ContactService } from '../../../contacts/services/contact.service';

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
  @Input() paymentDirection: PaymentDirection = PaymentDirection.Inbound;
  @Input() prefetchedPayment: PaymentResponse | null = null;
  @Input() autoBackOnSave = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<PaymentResponse>();
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private paymentService = inject(PaymentService);
  private invoiceService = inject(InvoiceService);
  private receiptService = inject(ReceiptService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private journalEntryService = inject(JournalEntryService);
  private costCodesService = inject(CostCodesService);
  private contactService = inject(ContactService);
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
  bills: ReceiptResponse[] = [];
  costCodeOptions: SearchableSelectOption<number>[] = [];
  bankAccountOptions: SearchableSelectOption<number>[] = [];
  private officeCostCodes: CostCodesResponse[] = [];
  private officeChartOfAccounts: ChartOfAccountResponse[] = [];
  allocationOptions: SearchableSelectOption<string>[] = [];
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

  readonly requireAllocationId = (control: AbstractControl): ValidationErrors | null => {
    const allocationId = (control.value || '').toString().trim();
    return allocationId.length > 0 ? null : { required: true };
  };

  get isOutbound(): boolean {
    return this.paymentDirection === PaymentDirection.Outbound;
  }

  constructor() {
    this.form = this.fb.group({});
  }

  //#region Payment
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.applyPaymentDirectionFormRules();
    this.setupOutboundFormHandlers();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncPageReadyFromLoadItems());
    this.isAddMode = this.paymentId === 'new';
    this.loadCostCodesForOffice();
    this.loadBankAccountsForOffice();
    if (this.isAddMode) {
      this.loadAllocationsForOffice();
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
      this.loadBankAccountsForOffice();
      this.loadAllocationsForOffice();
    }
    if (changes['paymentDirection'] && !changes['paymentDirection'].firstChange) {
      this.loadBankAccountsForOffice();
      this.loadAllocationsForOffice();
      this.applyPaymentDirectionFormRules();
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

    const paymentTypeId = this.resolvePaymentTypeIdFromForm();

    if (this.isOutbound) {
      this.saveOutboundPayment(paymentDateValue, paymentTypeId);
      return;
    }

    const amountValue = parseFloat(this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '')) || 0;
    const costCodeId = Number(this.form.get('costCodeId')?.value ?? 0);
    if (!Number.isFinite(costCodeId) || costCodeId <= 0) {
      this.form.get('costCodeId')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    if (!this.isAddMode && !this.payment?.paymentId) {
      this.toastr.error('Payment is still loading.', 'Error');
      return;
    }

    const payload = this.mappingService.buildPaymentInvoiceAllocationsRequest(
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
      const createPayload: CreatePaymentWithInvoiceAllocationsRequest = {
        ...payload,
        allocations
      };
      this.paymentService.createPaymentWithInvoiceAllocations(createPayload).pipe(take(1), finalize(() => {
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
      const updatePayload: UpdatePaymentWithInvoiceAllocationsRequest = {
        ...payload,
        paymentId: this.payment!.paymentId,
        allocations
      };
      this.paymentService.updatePaymentWithInvoiceAllocations(updatePayload).pipe(take(1), finalize(() => {
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

  saveOutboundPayment(paymentDateValue: string, paymentTypeId: number | null): void {
    const accountingPeriodValue = this.utilityService.toDateOnlyJsonString(this.form.get('accountingPeriod')?.value);
    if (!accountingPeriodValue) {
      this.form.get('accountingPeriod')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    const chartOfAccountId = Number(this.form.get('chartOfAccountId')?.value ?? 0);
    if (!Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0) {
      this.form.get('chartOfAccountId')?.markAsTouched();
      this.showValidationErrorToast();
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

    const request = this.buildOutboundBillAllocationsRequest(
      paymentDateValue,
      paymentTypeId ?? PaymentType.Check,
      chartOfAccountId,
      allocations
    );

    const postingStatusIds = allocations.map(allocation => {
      const bill = this.bills.find(item => item.receiptId === allocation.invoiceId);
      return bill?.postingStatusId;
    });

    const persistOutboundPayment = () => {
      this.isSubmitting = true;
      const saveRequest$ = this.isAddMode
        ? this.paymentService.createPaymentWithBillAllocations(request)
        : this.paymentService.updatePaymentWithBillAllocations({
          ...request,
          paymentId: this.payment!.paymentId
        });

      saveRequest$.pipe(
        take(1),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (payment: PaymentResponse) => {
          this.payment = payment;
          this.isAddMode = false;
          this.saveValidationHighlightActive = false;
          this.toastr.success('Payment saved successfully.', 'Success');
          this.savedEvent.emit(payment);
          if (this.autoBackOnSave) {
            this.backEvent.emit();
          }
        },
        error: (_err: HttpErrorResponse) => {
          this.toastr.error('Unable to save payment.', 'Error');
        }
      });
    };

    if (this.isAddMode) {
      this.journalEntryService.confirmPaymentIfAllowed(postingStatusIds, 'Receipt').pipe(take(1)).subscribe(canProceed => {
        if (!canProceed) {
          return;
        }
        persistOutboundPayment();
      });
      return;
    }

    this.journalEntryService.confirmUpdateIfAllowed(this.payment?.postingStatusId, 'Payment').pipe(take(1)).subscribe(canProceed => {
      if (!canProceed) {
        return;
      }
      persistOutboundPayment();
    });
  }

  buildOutboundBillAllocationsRequest(
    paymentDateValue: string,
    paymentTypeId: number,
    chartOfAccountId: number,
    allocations: CreatePaymentWithInvoiceAllocationsRequest['allocations']
  ): CreatePaymentWithBillAllocationsRequest {
    const overallDescription = (this.form.get('description')?.value || '').trim();
    const amountValue = parseFloat(this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '')) || 0;

    return {
      organizationId: this.organizationId,
      officeId: this.getPaymentOfficeId(),
      paymentDate: paymentDateValue,
      amount: amountValue,
      description: overallDescription,
      paymentTypeId,
      chartOfAccountId,
      isActive: !!this.form.get('isActive')?.value,
      allocations: allocations.map(allocation => {
        const bill = this.bills.find(item => item.receiptId === allocation.invoiceId);
        return {
          receiptId: allocation.invoiceId,
          amount: allocation.amount,
          description: (
            buildBillSplitLineDescription(bill) ||
            (allocation.description || '').trim() ||
            overallDescription
          ).trim(),
          costCodeId: this.resolveBillCostCodeId(bill)
        };
      })
    };
  }
  //#endregion

  //#region Build Form
  buildForm(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form = this.fb.group({
      paymentDate: new FormControl<Date | null>(today, [Validators.required]),
      accountingPeriod: new FormControl<Date | null>(this.firstDayOfMonthDate(today)),
      amount: new FormControl('0.00', [Validators.required, this.requirePositiveAmount]),
      costCodeId: new FormControl<number>(0, [Validators.required, this.requireCostCodeId]),
      chartOfAccountId: new FormControl<number>(0),
      paymentTypeId: new FormControl<number | null>(PaymentType.Check),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true),
      splits: this.fb.array([])
    });
  }

  applyPaymentDirectionFormRules(): void {
    const headerCostCodeControl = this.form.get('costCodeId');
    if (headerCostCodeControl) {
      if (this.isOutbound) {
        headerCostCodeControl.clearValidators();
        headerCostCodeControl.setValue(0, { emitEvent: false });
      } else {
        headerCostCodeControl.setValidators([Validators.required, this.requireCostCodeId]);
      }
      headerCostCodeControl.updateValueAndValidity({ emitEvent: false });
    }
  }

  setupOutboundFormHandlers(): void {
    this.form.get('paymentDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(paymentDateValue => {
      if (!this.isOutbound) {
        return;
      }
      const parsed = this.utilityService.parseCalendarDateInput(paymentDateValue);
      if (parsed) {
        this.syncAccountingPeriodFromPaymentDate(parsed);
      }
    });
  }

  firstDayOfMonthDate(value: Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const first = new Date(value.getFullYear(), value.getMonth(), 1);
    first.setHours(0, 0, 0, 0);
    return first;
  }

  syncAccountingPeriodFromPaymentDate(paymentDate: Date): void {
    const firstOfMonth = this.firstDayOfMonthDate(paymentDate);
    if (firstOfMonth) {
      this.form.get('accountingPeriod')?.setValue(firstOfMonth, { emitEvent: false });
    }
  }

  populateForm(payment: PaymentResponse): void {
    const paymentDate = this.getDateControlValue(payment.paymentDate);
    this.form.patchValue({
      paymentDate,
      accountingPeriod: this.firstDayOfMonthDate(paymentDate ?? new Date()),
      description: payment.description || '',
      amount: payment.amount != null ? this.formatter.currency(payment.amount) : '0.00',
      costCodeId: payment.costCodeId ?? 0,
      chartOfAccountId: payment.chartOfAccountId ?? 0,
      paymentTypeId: payment.paymentTypeId ?? null,
      isActive: payment.isActive
    });
    if (this.isOutbound) {
      this.replaceSplitLinesFromBillAllocations(payment.billAllocations || []);
      return;
    }
    this.replaceSplitLinesFromLedgerLines(payment.invoiceAllocations ?? payment.ledgerLines ?? []);
  }

  resetForm(): void {
    this.payment = null;
    this.isPaymentContentReady = true;
    this.clearPaymentLoading();
    this.buildForm();
    this.loadCostCodesForOffice();
    this.loadBankAccountsForOffice();
    this.loadAllocationsForOffice();
    this.ensureAtLeastOneSplit();
    this.applyPaymentDirectionFormRules();
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

  replaceSplitLinesFromBillAllocations(allocations: PaymentBillAllocation[]): void {
    while (this.splitsFormArray.length > 0) {
      this.splitsFormArray.removeAt(0);
    }

    if (!allocations.length) {
      this.ensureAtLeastOneSplit();
      return;
    }

    allocations.forEach(allocation => {
      this.splitsFormArray.push(this.createSplitGroup({
        invoiceId: allocation.receiptId,
        amount: allocation.amount,
        description: allocation.description
      }));
    });
  }

  createSplitGroup(split?: { invoiceId?: string; amount?: number; description?: string }): FormGroup {
    const amount = Number(split?.amount);
    return this.fb.group({
      invoiceId: new FormControl((split?.invoiceId || '').trim(), [Validators.required, this.requireAllocationId]),
      amount: new FormControl(Number.isFinite(amount) ? amount.toFixed(2) : '0.00', [Validators.required, this.requirePositiveAmount]),
      description: new FormControl(split?.description || '', [Validators.required])
    });
  }

  getPayloadAllocationsFromForm(): CreatePaymentWithInvoiceAllocationsRequest['allocations'] {
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
    return this.utilityService.sumCurrencyAmounts(
      this.getPayloadAllocationsFromForm().map(allocation => allocation.amount)
    );
  }

  isAllocationTotalOutOfBalance(): boolean {
    return !this.utilityService.areCurrencyAmountsEqual(
      this.getDisplayedSplitTotal(),
      this.getPaymentAmountValue()
    );
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

  onSplitAllocationSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const allocationId = (value ?? '').toString().trim();
    const splitGroup = this.splitsFormArray.at(splitIndex) as FormGroup | undefined;
    splitGroup?.get('invoiceId')?.setValue(allocationId);
    splitGroup?.get('invoiceId')?.markAsTouched();
    if (allocationId.length > 0) {
      const balanceDue = this.isOutbound
        ? this.getBillBalanceDue(allocationId)
        : this.getInvoiceBalanceDue(allocationId);
      splitGroup?.get('amount')?.setValue(balanceDue.toFixed(2), { emitEvent: false });
      splitGroup?.get('amount')?.markAsTouched();
      splitGroup?.get('amount')?.updateValueAndValidity({ emitEvent: false });

      if (this.isOutbound) {
        const bill = this.bills.find(item => item.receiptId === allocationId);
        const splitDescription = buildBillSplitLineDescription(bill);
        if (splitDescription) {
          splitGroup?.get('description')?.setValue(splitDescription, { emitEvent: false });
          splitGroup?.get('description')?.markAsTouched();
        }
      }
    }
    this.syncPaymentAmountFromSplits();
    this.cdr.markForCheck();
  }

  onSplitInvoiceSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    this.onSplitAllocationSelectionChange(splitIndex, value);
  }

  getInvoiceBalanceDue(invoiceId: string): number {
    const invoice = this.invoices.find(item => item.invoiceId === invoiceId);
    if (!invoice) {
      return 0;
    }

    const balance = Math.round(((Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0)) * 100) / 100;
    return balance > 0 ? balance : 0;
  }

  getBillBalanceDue(receiptId: string): number {
    const bill = this.bills.find(item => item.receiptId === receiptId);
    if (!bill) {
      return 0;
    }

    const balance = Math.round(((Number(bill.amount) || 0) - (Number(bill.paidAmount) || 0)) * 100) / 100;
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

  getSplitAllocationOptions(splitIndex: number): SearchableSelectOption<string>[] {
    if (!this.isOutbound) {
      return this.allocationOptions;
    }

    return this.buildBillOptionsForSplit(splitIndex);
  }

  buildBillOptionsForSplit(splitIndex: number): SearchableSelectOption<string>[] {
    const excludeReceiptIds = new Set<string>();
    this.splitsFormArray.controls.forEach((control, index) => {
      if (index === splitIndex) {
        return;
      }

      const receiptId = (control.get('invoiceId')?.value || '').toString().trim();
      if (receiptId.length > 0) {
        excludeReceiptIds.add(receiptId);
      }
    });

    const currentReceiptId = (this.splitsFormArray.at(splitIndex)?.get('invoiceId')?.value || '').toString().trim();
    const options = this.buildBillOptions(this.bills, excludeReceiptIds);

    if (currentReceiptId.length > 0 && !options.some(option => option.value === currentReceiptId)) {
      const bill = this.bills.find(item => item.receiptId === currentReceiptId);
      if (bill) {
        options.push({
          value: bill.receiptId,
          label: this.buildBillOptionLabel(bill)
        });
      } else {
        const allocation = (this.payment?.billAllocations || []).find(item => item.receiptId === currentReceiptId);
        const receiptCode = (allocation?.receiptCode || currentReceiptId).trim();
        options.push({
          value: currentReceiptId,
          label: receiptCode.length > 0 ? `${receiptCode} — Bal $0.00` : currentReceiptId
        });
      }

      options.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
    }

    return options;
  }

  buildInvoiceOptions(
    invoices: InvoiceResponse[],
    allocatedLedgerLines: PaymentLedgerLine[] = []
  ): SearchableSelectOption<string>[] {
    const sourceInvoices = this.isAddMode
      ? (invoices || []).filter(invoice => this.getInvoiceBalanceDueAmount(invoice) > 0.005)
      : (invoices || []);

    const options = sourceInvoices
      .map(invoice => ({
        value: invoice.invoiceId,
        label: this.buildInvoiceOptionLabel(invoice)
      }))
      .filter(option => option.value.length > 0);

    const existingValues = new Set(options.map(option => option.value));
    if (!this.isAddMode) {
      (allocatedLedgerLines || []).forEach(line => {
        const invoiceId = (line.invoiceId || '').trim();
        if (!invoiceId || existingValues.has(invoiceId)) {
          return;
        }
        existingValues.add(invoiceId);
        const invoiceCode = (line.invoiceCode || '').trim();
        options.push({
          value: invoiceId,
          label: invoiceCode.length > 0 ? `${invoiceCode} — Bal $0.00` : invoiceId
        });
      });
    }

    return options.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  }

  private buildInvoiceOptionLabel(invoice: InvoiceResponse): string {
    const balance = this.getInvoiceBalanceDueAmount(invoice);
    const party = (invoice.responsibleParty || invoice.companyName || invoice.contactName || '').trim();
    const balanceLabel = this.formatter.currencyUsd(balance);
    const labelParts = [(invoice.invoiceCode || '').trim(), party, `Bal ${balanceLabel}`].filter(part => part.length > 0);
    return labelParts.join(' — ');
  }

  private getInvoiceBalanceDueAmount(invoice: InvoiceResponse): number {
    return Math.round(((Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0)) * 100) / 100;
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
    this.loadBankAccountsForOffice();
    this.loadAllocationsForOffice();
    this.clearPaymentLoading();
    this.isPaymentContentReady = true;
    this.cdr.markForCheck();
  }

  loadCostCodesForOffice(): void {
    const officeId = this.getPaymentOfficeId();
    if (!officeId) {
      this.costCodeOptions = [];
      this.officeCostCodes = [];
      return;
    }

    this.costCodesService.getCostCodesByOfficeId(officeId).pipe(take(1)).subscribe({
      next: (costCodes: CostCodesResponse[]) => {
        this.officeCostCodes = (costCodes || []).filter(code => code.isActive !== false);
        if (this.isOutbound) {
          this.costCodeOptions = [];
        } else {
          this.costCodeOptions = this.officeCostCodes
            .filter(code => code.transactionTypeId === TransactionType.Payment)
            .map(code => ({
              value: code.costCodeId,
              label: `${(code.costCode || '').trim()} - ${(code.description || '').trim()}`.replace(/ - $/, '')
            }));
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.costCodeOptions = [];
        this.officeCostCodes = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadAllocationsForOffice(): void {
    if (this.isOutbound) {
      this.loadBillsForOffice();
      return;
    }
    this.loadInvoicesForOffice();
  }

  loadBankAccountsForOffice(): void {
    if (!this.isOutbound) {
      this.bankAccountOptions = [];
      return;
    }

    const officeId = this.getPaymentOfficeId();
    if (!officeId) {
      this.bankAccountOptions = [];
      return;
    }

    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(take(1)).subscribe({
        next: (accounts: ChartOfAccountResponse[]) => {
          this.officeChartOfAccounts = (accounts || []).filter(account => account.officeId === officeId);
          this.bankAccountOptions = this.officeChartOfAccounts
            .filter(account => Number(account.accountTypeId) === AccountType.Bank)
            .sort((left, right) =>
              this.utilityService.getChartOfAccountDropdownLabel(left).localeCompare(
                this.utilityService.getChartOfAccountDropdownLabel(right),
                undefined,
                { sensitivity: 'base' }
              )
            )
            .map(account => ({
              value: Number(account.accountId),
              label: this.utilityService.getChartOfAccountDropdownLabel(account)
            }));

          const currentValue = Number(this.form.get('chartOfAccountId')?.value ?? 0);
          const hasCurrent = this.bankAccountOptions.some(option => option.value === currentValue);
          if (!hasCurrent && this.bankAccountOptions.length > 0) {
            this.form.patchValue({ chartOfAccountId: this.bankAccountOptions[0].value });
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.bankAccountOptions = [];
          this.cdr.markForCheck();
        }
      });
    });
  }

  loadBillsForOffice(): void {
    const officeId = this.getPaymentOfficeId();
    if (!officeId) {
      this.bills = [];
      this.allocationOptions = [];
      return;
    }

    this.contactService.ensureContactsLoaded().pipe(
      take(1),
      switchMap(() => this.receiptService.searchReceipts({
        officeIds: [officeId],
        isActive: true,
        includeInactive: false,
        receiptKind: 1,
        startDate: null,
        endDate: null
      })),
      take(1)
    ).subscribe({
      next: (receipts: ReceiptResponse[]) => {
        this.bills = (receipts || [])
          .filter(receipt => (receipt.bankCardId ?? 0) === 0)
          .filter(receipt => this.isBillUnpaid(receipt));
        this.allocationOptions = this.buildBillOptions(this.bills);
        this.cdr.markForCheck();
      },
      error: () => {
        this.bills = [];
        this.allocationOptions = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadInvoicesForOffice(): void {
    const officeId = this.getPaymentOfficeId();
    if (!officeId) {
      this.invoices = [];
      this.allocationOptions = [];
      return;
    }

    this.invoiceService.searchInvoices({
      officeIds: [officeId],
      includeInactive: false,
      includePaid: false,
      startDate: null,
      endDate: null
    }).pipe(take(1)).subscribe({
      next: (invoices: InvoiceResponse[]) => {
        this.invoices = invoices || [];
        const allocatedLedgerLines = this.isAddMode ? [] : (this.payment?.invoiceAllocations ?? this.payment?.ledgerLines ?? []);
        this.allocationOptions = this.buildInvoiceOptions(this.invoices, allocatedLedgerLines);
        this.cdr.markForCheck();
      },
      error: () => {
        this.invoices = [];
        this.allocationOptions = [];
        this.cdr.markForCheck();
      }
    });
  }

  onBankAccountSelectionChange(value: number | string): void {
    this.form.patchValue({ chartOfAccountId: Number(value) || 0 });
    this.form.get('chartOfAccountId')?.markAsTouched();
  }

  buildBillOptions(bills: ReceiptResponse[], excludeReceiptIds: Set<string> = new Set<string>()): SearchableSelectOption<string>[] {
    return (bills || [])
      .filter(bill => this.isBillUnpaid(bill))
      .filter(bill => !excludeReceiptIds.has(bill.receiptId))
      .map(bill => ({
        value: bill.receiptId,
        label: this.buildBillOptionLabel(bill)
      }))
      .filter(option => option.value.length > 0)
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  }

  private buildBillOptionLabel(bill: ReceiptResponse): string {
    const receiptCode = (bill.receiptCode || '').trim();
    const vendor = this.resolveBillVendorLabel(bill);
    const balanceLabel = this.formatter.currencyUsd(this.getBillBalanceDueAmount(bill));
    const codePrefix = receiptCode.length > 0 ? `${receiptCode} — ` : '';
    return `${codePrefix}${vendor} — ${balanceLabel}`;
  }

  private resolveBillCostCodeId(bill: ReceiptResponse | undefined): number | null {
    if (!bill) {
      return null;
    }

    const officeId = Number(bill.officeId ?? 0);
    const eligibleSplits = (bill.splits || [])
      .filter(split => Number(split.receiptTypeId) !== 4 && Number(split.amount) !== 0)
      .sort((left, right) => Math.abs(Number(right.amount) || 0) - Math.abs(Number(left.amount) || 0));

    for (const split of eligibleSplits) {
      const chartOfAccountId = Number(split.chartOfAccountId ?? 0);
      if (!Number.isFinite(chartOfAccountId) || chartOfAccountId <= 0) {
        continue;
      }

      const account = this.officeChartOfAccounts.find(item =>
        Number(item.accountId) === chartOfAccountId && Number(item.officeId) === officeId);
      if (!account) {
        continue;
      }

      const accountCode = this.mappingService.normalizeAccountCodeForMatch(account.accountNo);
      if (!accountCode) {
        continue;
      }

      const matchingCostCode = this.officeCostCodes.find(code =>
        Number(code.officeId) === officeId
        && this.mappingService.normalizeAccountCodeForMatch(code.costCode) === accountCode);
      if (matchingCostCode?.costCodeId) {
        return Number(matchingCostCode.costCodeId);
      }
    }

    return null;
  }

  private resolveBillVendorLabel(bill: ReceiptResponse): string {
    const headerVendor = (bill.vendorName || '').trim();
    if (headerVendor.length > 0) {
      return headerVendor;
    }

    const vendorId = (bill.vendorId || '').trim();
    if (vendorId.length > 0) {
      const vendor = this.contactService.getAllContactsValue().find(
        contact => String(contact.contactId || '').trim().toLowerCase() === vendorId.toLowerCase()
      );
      const vendorLabel = vendor ? this.utilityService.getVendorDropdownLabel(vendor).trim() : '';
      if (vendorLabel.length > 0) {
        return vendorLabel;
      }
    }

    const splitVendor = (bill.splits || [])
      .map(split => (split.vendorName || '').trim())
      .find(name => name.length > 0);
    return splitVendor || 'Unknown Vendor';
  }

  private isBillUnpaid(bill: ReceiptResponse): boolean {
    return this.getBillBalanceDueAmount(bill) > 0.005;
  }

  private getBillBalanceDueAmount(bill: ReceiptResponse): number {
    return Math.round(((Number(bill.amount) || 0) - (Number(bill.paidAmount) || 0)) * 100) / 100;
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
    return this.utilityService.roundCurrency(parseFloat(raw) || 0);
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
    this.markViewForCheck();
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
