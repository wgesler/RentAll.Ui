import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { AccountType } from '../models/accounting-enum';
import { DepositRequest, DepositResponse, DepositSplit } from '../models/deposit.model';
import { DepositService } from '../services/deposit.service';
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';

@Component({
  standalone: true,
  selector: 'app-deposit',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './deposit.component.html',
  styleUrl: './deposit.component.scss'
})
export class DepositComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() officeId: number | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() depositId: string | null = null;
  @Input() autoBackOnSave = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<DepositResponse>();
  @ViewChild('overallAmountInput') overallAmountInput?: ElementRef<HTMLInputElement>;

  form: FormGroup;
  isAddMode = true;
  isSubmitting = false;
  isPageReady = false;
  organizationId = '';
  deposit: DepositResponse | null = null;
  propertyOptions: PropertyCodeResponse[] = [];
  offices: OfficeResponse[] = [];
  bankAccountOptions: SearchableSelectOption<number>[] = [];
  splitAccountOptions: SearchableSelectOption<number>[] = [];
  splitTotalValidationError = false;
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';
  amountFocused = false;
  amountEditValue = '';
  saveValidationHighlightActive = false;
  isSyncingInitialSplit = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['deposit']));
  destroy$ = new Subject<void>();

  readonly requirePositiveAmount = (control: AbstractControl): ValidationErrors | null => {
    const raw = this.sanitizeSignedDecimalInput(control.value?.toString() ?? '').trim();
    const amount = parseFloat(raw);
    if (!raw || !Number.isFinite(amount) || Math.abs(amount) < 0.000001) {
      return { required: true };
    }
    return null;
  };

  readonly requireAccountId = (control: AbstractControl): ValidationErrors | null => {
    const accountId = Number(control.value ?? 0);
    return Number.isFinite(accountId) && accountId > 0 ? null : { required: true };
  };

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private depositService: DepositService,
    private propertyService: PropertyService,
    private officeService: OfficeService,
    private chartOfAccountsService: ChartOfAccountsService,
    private accountingOfficeService: AccountingOfficeService,
    private utilityService: UtilityService,
    public formatter: FormatterService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({});
  }

  //#region Deposit
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncPageReadyFromLoadItems());
    this.isAddMode = this.depositId == null;
    this.loadOffices();
    this.loadPropertyCodes();
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe();
    this.loadChartOfAccounts();
    if (this.isAddMode) {
      this.clearDepositLoading();
    } else {
      this.loadDeposit();
    }
    if (this.isAddMode) {
      this.applyShellOfficeToDeposit();
    }
  }

  ngAfterViewInit(): void {
    if (this.isAddMode) {
      this.applyPropertyInputToForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyShellOfficeToDeposit();
      this.loadChartOfAccounts();
    }
    if (changes['property']) {
      this.applyPropertyInputToForm();
    }
    if (changes['depositId'] && !changes['depositId'].firstChange) {
      this.isAddMode = this.depositId == null;
      this.loadDeposit();
    }
  }

  saveDeposit(): void {
    this.saveValidationHighlightActive = true;
    this.form.markAllAsTouched();
    this.cdr.markForCheck();

    if (!this.organizationId) {
      this.showValidationErrorToast();
      return;
    }
    if (this.form.invalid) {
      this.showValidationErrorToast();
      return;
    }

    const depositDateValue = this.utilityService.toDateOnlyJsonString(this.form.get('depositDate')?.value);
    const accountingPeriodValue = this.utilityService.toDateOnlyJsonString(this.form.get('accountingPeriod')?.value);
    if (!depositDateValue || !accountingPeriodValue) {
      this.form.get('depositDate')?.markAsTouched();
      this.form.get('accountingPeriod')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    const amountValue = parseFloat(this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '')) || 0;
    const payloadSplits = this.getPayloadSplitsFromForm();
    if (payloadSplits.length === 0) {
      this.showValidationErrorToast();
      return;
    }
    const splitTotalAmount = payloadSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    if (splitTotalAmount > amountValue) {
      this.splitTotalValidationError = true;
      this.showValidationErrorToast();
      return;
    }
    this.splitTotalValidationError = false;

    const bankAccountId = Number(this.form.get('bankAccountId')?.value ?? 0);
    if (!Number.isFinite(bankAccountId) || bankAccountId <= 0) {
      this.form.get('bankAccountId')?.markAsTouched();
      this.showValidationErrorToast();
      return;
    }

    const payload: DepositRequest = {
      depositId: this.deposit?.depositId,
      organizationId: this.organizationId,
      officeId: this.getDepositOfficeId() ?? 0,
      depositDate: depositDateValue,
      accountingPeriod: accountingPeriodValue,
      description: (this.form.get('description')?.value || '').trim(),
      amount: amountValue,
      propertyId: payloadSplits.find(split => (split.propertyId || '').trim().length > 0)?.propertyId ?? null,
      bankAccountId,
      splits: payloadSplits,
      journalEntryId: this.deposit?.journalEntryId ?? null,
      isActive: !!this.form.get('isActive')?.value
    };

    this.isSubmitting = true;
    const save$ = this.isAddMode
      ? this.depositService.createDeposit(payload)
      : this.depositService.updateDeposit(payload);

    save$.pipe(take(1), finalize(() => {
        this.isSubmitting = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (saved: DepositResponse) => {
        this.deposit = saved;
        this.isAddMode = false;
        this.saveValidationHighlightActive = false;
        this.toastr.success('Deposit saved successfully.', 'Success');
        this.savedEvent.emit(saved);
        if (this.autoBackOnSave) {
          this.backEvent.emit();
        }
      },
      error: () => this.toastr.error('Unable to save deposit.', 'Error')
    });
  }
  //#endregion

  //#region Build Form
  buildForm(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form = this.fb.group({
      officeName: new FormControl(''),
      depositDate: new FormControl<Date | null>(today, [Validators.required]),
      accountingPeriod: new FormControl<Date | null>(new Date(today.getTime()), [Validators.required]),
      amount: new FormControl('0.00', [Validators.required, this.requirePositiveAmount]),
      description: new FormControl('', [Validators.required]),
      bankAccountId: new FormControl<number>(0, [Validators.required, Validators.min(1)]),
      splits: this.fb.array([]),
      isActive: new FormControl(true)
    });
    this.ensureAtLeastOneSplit();
  }

  populateForm(deposit: DepositResponse): void {
    this.form.patchValue({
      officeName: deposit.officeName || this.property?.officeName || '',
      depositDate: this.getDateControlValue(deposit.depositDate),
      accountingPeriod: this.getDateControlValue(deposit.accountingPeriod || deposit.depositDate),
      description: deposit.description || '',
      amount: deposit.amount != null ? this.formatter.currency(deposit.amount) : '0.00',
      bankAccountId: deposit.bankAccountId ?? 0,
      isActive: deposit.isActive
    });
    this.replaceSplitLines(deposit.splits || []);
    this.splitTotalValidationError = false;
  }  
  //#endregion

  //#region Data Load Methods
  loadDeposit(): void {
    if (this.isAddMode || !this.depositId) {
      this.clearDepositLoading();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'deposit');
    this.depositService.getDepositById(this.depositId).pipe(take(1), finalize(() => this.clearDepositLoading())).subscribe({
      next: (deposit: DepositResponse) => {
        this.deposit = deposit;
        this.populateForm(deposit);
        this.loadChartOfAccounts();
        this.cdr.markForCheck();
      },
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to load deposit.', 'Error');
      }
    });
  }

  loadPropertyCodes(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'properties');
    this.propertyService.getPropertyCodes().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'))).subscribe({
      next: (properties) => {
        this.propertyOptions = properties || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.propertyOptions = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadOffices(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'offices');
    this.officeService.getOffices(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: (offices) => {
        this.offices = offices || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.offices = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadChartOfAccounts(): void {
    const officeId = this.getDepositOfficeId();
    if (!officeId) {
      this.bankAccountOptions = [];
      this.splitAccountOptions = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accounts');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'accounts');
    this.chartOfAccountsService.getChartOfAccountsByOfficeId(officeId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accounts')) ).subscribe({
      next: (accounts) => {
        const bankAccounts = (accounts || []).filter(account => Number(account.accountTypeId) === AccountType.Bank);
        this.bankAccountOptions = bankAccounts.map(account => ({
          value: account.accountId,
          label: this.utilityService.getChartOfAccountDropdownLabel(account)
        }));
        this.splitAccountOptions = this.buildSplitAccountOptions(accounts || [], officeId);
        this.applyDefaultSplitAccountIfNeeded();
        this.cdr.markForCheck();
      },
      error: () => {
        this.bankAccountOptions = [];
        this.splitAccountOptions = [];
        this.cdr.markForCheck();
      }
    });
  }
  //#endregion

  //#region Split Methods
  get splitsFormArray(): FormArray {
    return this.form.get('splits') as FormArray;
  }

  addSplitLine(): void {
    const newIndex = this.splitsFormArray.length;
    const defaultPropertyId = newIndex > 0
      ? (this.splitsFormArray.at(0).get('propertyId')?.value || null)
      : ((this.property?.propertyId || '').trim() || null);
    const overallDescription = (this.form.get('description')?.value || '').trim();
    let remainderAmount = 0;
    if (newIndex === 1) {
      const depositTotal = this.getDepositAmountValue();
      const existingTotal = this.getDisplayedSplitTotal();
      remainderAmount = Math.max(0, Math.round((depositTotal - existingTotal) * 100) / 100);
    }
    this.splitsFormArray.push(this.createSplitGroup({
      propertyId: defaultPropertyId,
      amount: newIndex === 1 ? remainderAmount : 0,
      description: overallDescription,
      chartOfAccountId: this.getDefaultSplitAccountId()
    }));
    this.applyDefaultSplitAccountIfNeeded();
    this.applyDescriptionToAllSplitLines();
    this.cdr.markForCheck();
  }

  removeSplitLine(index: number): void {
    if (this.splitsFormArray.length <= 1) {
      return;
    }
    this.splitsFormArray.removeAt(index);
    this.cdr.markForCheck();
  }

  ensureAtLeastOneSplit(): void {
    if (this.splitsFormArray.length === 0) {
      this.splitsFormArray.push(this.createSplitGroup({
        chartOfAccountId: this.getDefaultSplitAccountId()
      }));
      this.applyDefaultSplitAccountIfNeeded();
    }
  }

  replaceSplitLines(splits: DepositSplit[]): void {
    while (this.splitsFormArray.length > 0) {
      this.splitsFormArray.removeAt(0);
    }
    const rows = splits.length > 0 ? splits : [undefined];
    rows.forEach(split => this.splitsFormArray.push(this.createSplitGroup(split)));
    this.cdr.markForCheck();
  }

  getPayloadSplitsFromForm(): DepositSplit[] {
    return this.splitsFormArray.controls.map(control => {
      const group = control as FormGroup;
      const amount = parseFloat(this.sanitizeSignedDecimalInput(group.get('amount')?.value?.toString() ?? '')) || 0;
      return {
        depositSplitId: group.get('depositSplitId')?.value ?? null,
        amount,
        description: (group.get('description')?.value || '').toString().trim(),
        propertyId: this.normalizeSplitPropertyId(group.get('propertyId')?.value ?? null),
        reservationId: this.normalizeSplitPropertyId(group.get('reservationId')?.value ?? null),
        contactId: this.normalizeSplitPropertyId(group.get('contactId')?.value ?? null),
        journalEntryLineId: this.normalizeSplitPropertyId(group.get('journalEntryLineId')?.value ?? null),
        chartOfAccountId: Number(group.get('chartOfAccountId')?.value ?? 0) > 0
          ? Number(group.get('chartOfAccountId')?.value)
          : null
      };
    });
  }

  syncInitialSplitWithOverallIfNeeded(): void {
    if (this.isSyncingInitialSplit || this.splitsFormArray.length !== 1) {
      return;
    }

    const splitGroup = this.splitsFormArray.at(0) as FormGroup;
    const splitAmountControl = splitGroup.get('amount');
    const splitDescriptionControl = splitGroup.get('description');
    const splitAmountRaw = this.sanitizeSignedDecimalInput(splitAmountControl?.value?.toString() ?? '').trim();
    const splitAmountValue = parseFloat(splitAmountRaw);
    const splitDescription = (splitDescriptionControl?.value || '').trim();
    const overallAmount = this.getDepositAmountValue().toFixed(2);
    const overallDescription = (this.form.get('description')?.value || '').trim();
    const patch: { amount?: string; description?: string } = {};

    const isSplitAmountEmptyOrZero = !splitAmountRaw || !Number.isFinite(splitAmountValue) || Math.abs(splitAmountValue) < 0.000001;
    const hasUserEditedSplitAmount = splitAmountControl?.dirty === true;
    const shouldSyncSplitAmountToOverall = isSplitAmountEmptyOrZero || !hasUserEditedSplitAmount;
    if (shouldSyncSplitAmountToOverall && overallAmount) {
      patch.amount = overallAmount;
    }
    if (!splitDescription && overallDescription) {
      patch.description = overallDescription;
    }
    if (Object.keys(patch).length === 0) {
      return;
    }

    this.isSyncingInitialSplit = true;
    splitGroup.patchValue(patch, { emitEvent: false });
    splitAmountControl?.updateValueAndValidity({ emitEvent: false });
    splitDescriptionControl?.updateValueAndValidity({ emitEvent: false });
    this.isSyncingInitialSplit = false;
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
      control.get('description')?.setValue(overallDescription, { emitEvent: false });
    });
  }

  getDisplayedSplitTotal(): number {
    return this.getPayloadSplitsFromForm().reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  }

  isDisplayedSplitTotalInvalid(): boolean {
    return this.getDisplayedSplitTotal() > this.getDepositAmountValue();
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

  onSplitAccountSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const parsed = Number(value ?? 0);
    const accountId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.splitsFormArray.at(splitIndex)?.get('chartOfAccountId')?.setValue(accountId);
    this.splitsFormArray.at(splitIndex)?.get('chartOfAccountId')?.markAsTouched();
    this.splitsFormArray.at(splitIndex)?.get('chartOfAccountId')?.updateValueAndValidity({ emitEvent: false });
    this.cdr.markForCheck();
  }

  getSplitPropertyOptions(): Array<{ value: string; label: string }> {
    return (this.propertyOptions || [])
      .map(property => ({
        value: (property.propertyId || '').trim(),
        label: (property.propertyCode || '').trim()
      }))
      .filter(option => option.value.length > 0);
  }

  getSplitNullPropertyOptionLabel(): string {
    return 'Company';
  }

  normalizeSplitPropertyId(propertyId: string | null | undefined): string | null {
    const normalizedPropertyId = (propertyId || '').trim();
    return normalizedPropertyId.length > 0 ? normalizedPropertyId : null;
  }

  shouldShowControlError(control: AbstractControl | null | undefined): boolean {
    if (!control) {
      return false;
    }
    return control.invalid && (control.touched || this.saveValidationHighlightActive);
  }

  shouldShowSplitControlError(splitGroup: AbstractControl, controlName: string): boolean {
    return this.shouldShowControlError((splitGroup as FormGroup).get(controlName));
  }

  getSplitAccountSelectClass(splitGroup: AbstractControl): string {
    const baseClass = 'split-editable-input split-account-select-control';
    return this.shouldShowSplitControlError(splitGroup, 'chartOfAccountId')
      ? `${baseClass} split-input-invalid`
      : baseClass;
  }

  applyDefaultPropertyId(propertyId: string): void {
    const normalizedPropertyId = (propertyId || '').trim();
    if (!normalizedPropertyId || this.splitsFormArray.length === 0) {
      return;
    }
    this.splitsFormArray.at(0).patchValue({ propertyId: normalizedPropertyId });
    this.cdr.markForCheck();
  }

  createSplitGroup(split?: Partial<DepositSplit>): FormGroup {
    const amount = Number(split?.amount);
    return this.fb.group({
      depositSplitId: new FormControl(split?.depositSplitId ?? null),
      amount: new FormControl(Number.isFinite(amount) ? amount.toFixed(2) : '0.00', [Validators.required, this.requirePositiveAmount]),
      description: new FormControl(split?.description || '', [Validators.required]),
      propertyId: new FormControl(split?.propertyId || null),
      reservationId: new FormControl(split?.reservationId || null),
      contactId: new FormControl(split?.contactId || null),
      journalEntryLineId: new FormControl(split?.journalEntryLineId || null),
      chartOfAccountId: new FormControl(split?.chartOfAccountId ?? null, [Validators.required, this.requireAccountId])
    });
  }

  buildSplitAccountOptions(accounts: ChartOfAccountResponse[], officeId: number): SearchableSelectOption<number>[] {
    const undepositedAccounts = this.resolveUndepositedFundsAccounts(accounts, officeId);
    const options = undepositedAccounts.map(account => ({
      value: account.accountId,
      label: this.utilityService.getChartOfAccountDropdownLabel(account)
    }));

    const fallbackLabels = new Map<number, string>();
    (this.deposit?.splits || []).forEach(split => {
      const accountId = Number(split.chartOfAccountId ?? 0);
      if (accountId > 0 && split.chartOfAccountDisplayName) {
        fallbackLabels.set(accountId, split.chartOfAccountDisplayName.trim());
      }
    });

    this.splitsFormArray.controls.forEach(control => {
      const accountId = Number(control.get('chartOfAccountId')?.value ?? 0);
      if (accountId > 0 && !options.some(option => option.value === accountId)) {
        const fallbackLabel = fallbackLabels.get(accountId)
          || accounts.find(account => account.accountId === accountId)?.name
          || `Account ${accountId}`;
        options.push({ value: accountId, label: fallbackLabel });
      }
    });

    return options.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  }

  getDefaultSplitAccountId(): number | null {
    if (this.splitAccountOptions.length === 1) {
      return this.splitAccountOptions[0].value;
    }

    const officeId = this.getDepositOfficeId();
    if (!officeId) {
      return null;
    }

    const configuredDefaultAccountId = this.getDefaultUndepositedFundsAccountId(officeId);
    if (configuredDefaultAccountId != null
      && this.splitAccountOptions.some(option => option.value === configuredDefaultAccountId)) {
      return configuredDefaultAccountId;
    }

    return null;
  }

  applyDefaultSplitAccountIfNeeded(): void {
    const defaultAccountId = this.getDefaultSplitAccountId();
    if (!defaultAccountId) {
      return;
    }

    this.splitsFormArray.controls.forEach(control => {
      const currentAccountId = Number(control.get('chartOfAccountId')?.value ?? 0);
      if (!(currentAccountId > 0)) {
        control.patchValue({ chartOfAccountId: defaultAccountId }, { emitEvent: false });
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  onOverallBankAccountSelectionChange(value: number | string): void {
    this.form.patchValue({ bankAccountId: Number(value) || 0 });
  }

  showValidationErrorToast(): void {
    this.cdr.markForCheck();
    this.toastr.error('Please correct the highlighted fields before saving.', 'Error');
    this.focusOverallAmountFieldIfInvalid();
  }

  focusOverallAmountFieldIfInvalid(): void {
    if (!this.shouldShowControlError(this.form.get('amount'))) {
      return;
    }
    const input = this.overallAmountInput?.nativeElement;
    if (!input) {
      return;
    }
    input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.onAmountFocus({ target: input } as unknown as FocusEvent);
  }
 
  getDepositAmountValue(): number {
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
    this.selectAmountInputContents(input);
  }

  onAmountClick(event: Event): void {
    if (!this.amountFocused) {
      return;
    }
    this.selectAmountInputContents(event.target as HTMLInputElement);
  }

  selectAmountInputContents(input: HTMLInputElement | null | undefined): void {
    if (!input) {
      return;
    }
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
    this.syncInitialSplitWithOverallIfNeeded();
    this.amountFocused = false;
    this.amountEditValue = '';
  }

  onOverallDescriptionBlur(): void {
    if (this.amountFocused) {
      return;
    }
    this.syncInitialSplitWithOverallIfNeeded();
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
 
  resolveUndepositedFundsAccounts(accounts: ChartOfAccountResponse[], officeId: number): ChartOfAccountResponse[] {
    const undepositedByName = (accounts || []).filter(account =>
      Number(account.accountTypeId) === AccountType.OtherCurrentAsset
      && this.isUndepositedFundsAccount(account)
    );

    const defaultAccountId = this.getDefaultUndepositedFundsAccountId(officeId);
    if (defaultAccountId == null) {
      return undepositedByName;
    }

    const defaultAccount = accounts.find(account => account.accountId === defaultAccountId);
    if (!defaultAccount) {
      return undepositedByName;
    }

    if (undepositedByName.some(account => account.accountId === defaultAccountId)) {
      return undepositedByName;
    }

    return [defaultAccount, ...undepositedByName];
  }

  isUndepositedFundsAccount(account: ChartOfAccountResponse): boolean {
    const name = (account.name || '').toLowerCase();
    const accountNo = (account.accountNo || '').toLowerCase();
    return name.includes('undeposited') || accountNo.includes('undeposited');
  }

  getDefaultUndepositedFundsAccountId(officeId: number): number | null {
    const accountingOffice = this.accountingOfficeService.getAllAccountingOfficesValue()
      .find(office => Number(office.officeId) === officeId);
    const accountId = Number(accountingOffice?.defaultUndepFundsAccountId ?? 0);
    return accountId > 0 ? accountId : null;
  }

  getDepositOfficeId(): number | null {
    if (this.deposit?.officeId) {
      return this.deposit.officeId;
    }
    if (this.property?.officeId) {
      return this.property.officeId;
    }
    if (this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    const firstSplitPropertyId = this.splitsFormArray.controls
      .map(control => (control.get('propertyId')?.value || '').toString().trim())
      .find(id => id.length > 0);
    if (firstSplitPropertyId) {
      const match = this.propertyOptions.find(option => option.propertyId === firstSplitPropertyId);
      if (match?.officeId) {
        return match.officeId;
      }
    }
    return null;
  }

  applyShellOfficeToDeposit(): void {
    const officeId = this.getDepositOfficeId();
    if (!officeId) {
      return;
    }
    const office = this.offices.find(item => item.officeId === officeId);
    this.form.patchValue({ officeName: office?.name || '' }, { emitEvent: false });
    this.loadChartOfAccounts();
  }

  applyPropertyInputToForm(): void {
    const propertyId = (this.property?.propertyId || '').trim();
    if (!propertyId || !this.isAddMode) {
      return;
    }
    this.form.patchValue({
      officeName: this.property?.officeName || ''
    });
    this.applyDefaultPropertyId(propertyId);
    this.loadChartOfAccounts();
  }

  getDateControlValue(value: string | null | undefined): Date | null {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    return parsed ?? null;
  }

  clearDepositLoading(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposit');
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
  }
  //#endregion
}
