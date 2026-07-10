import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { FormatterService } from '../../../services/formatter-service';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { ChartOfAccountsService } from '../../accounting/services/chart-of-accounts.service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyCodeResponse, PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { DepositRequest, DepositResponse, DepositSplit } from '../models/deposit.model';
import { DepositService } from '../services/deposit.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { AccountType } from '../../accounting/models/accounting-enum';

@Component({
  standalone: true,
  selector: 'app-deposit',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './deposit.component.html',
  styleUrl: './deposit.component.scss'
})
export class DepositComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() property: PropertyResponse | null = null;
  @Input() depositId: string | null = null;
  @Input() shellContext: 'maintenance' | 'accounting' | null = null;
  @Input() autoBackOnSave = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<DepositResponse>();

  form: FormGroup;
  isAddMode = true;
  isSubmitting = false;
  isPageReady = false;
  organizationId = '';
  deposit: DepositResponse | null = null;
  propertyOptions: PropertyCodeResponse[] = [];
  offices: OfficeResponse[] = [];
  bankAccountOptions: SearchableSelectOption<number>[] = [];
  expenseAccountOptions: SearchableSelectOption<number>[] = [];
  splitTotalValidationError = false;
  amountFocused = false;
  amountEditValue = '';
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['deposit']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private depositService: DepositService,
    private propertyService: PropertyService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private chartOfAccountsService: ChartOfAccountsService,
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
    this.loadChartOfAccounts();
    if (this.isAddMode) {
      this.clearDepositLoading();
    } else {
      this.loadDeposit();
    }
    if (this.isAddMode) {
      this.applyShellOfficeToDeposit();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get splitsFormArray(): FormArray {
    return this.form.get('splits') as FormArray;
  }

  get isAccountingShell(): boolean {
    return this.shellContext === 'accounting';
  }

  saveDeposit(): void {
    this.form.markAllAsTouched();
    if (!this.organizationId || this.form.invalid) {
      this.toastr.warning('Please correct validation errors before saving.', 'Validation');
      return;
    }

    const depositDateValue = this.utilityService.toDateOnlyJsonString(this.form.get('depositDate')?.value);
    const accountingPeriodValue = this.utilityService.toDateOnlyJsonString(this.form.get('accountingPeriod')?.value);
    if (!depositDateValue || !accountingPeriodValue) {
      this.toastr.warning('Deposit date and accounting period are required.', 'Validation');
      return;
    }

    const amountValue = parseFloat(this.sanitizeSignedDecimalInput(this.form.get('amount')?.value?.toString() ?? '')) || 0;
    const payloadSplits = this.getPayloadSplitsFromForm();
    if (payloadSplits.length === 0) {
      this.toastr.warning('At least one split is required.', 'Validation');
      return;
    }
    if (!payloadSplits.some(split => (split.propertyId || '').trim().length > 0)) {
      this.toastr.warning('At least one split must have a property.', 'Validation');
      return;
    }
    const splitTotalAmount = payloadSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    if (splitTotalAmount > amountValue) {
      this.splitTotalValidationError = true;
      this.toastr.warning('Split total cannot be greater than the deposit amount.', 'Invalid split total');
      return;
    }
    this.splitTotalValidationError = false;

    const bankAccountId = Number(this.form.get('bankAccountId')?.value ?? 0);
    if (!Number.isFinite(bankAccountId) || bankAccountId <= 0) {
      this.form.get('bankAccountId')?.markAsTouched();
      this.toastr.warning('Bank account is required.', 'Validation');
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
      bankAccountId,
      splits: payloadSplits,
      journalEntryId: this.deposit?.journalEntryId ?? null,
      isActive: !!this.form.get('isActive')?.value
    };

    this.isSubmitting = true;
    const save$ = this.isAddMode
      ? this.depositService.createDeposit(payload)
      : this.depositService.updateDeposit(payload);

    save$.pipe(
      take(1),
      finalize(() => {
        this.isSubmitting = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (saved: DepositResponse) => {
        this.deposit = saved;
        this.isAddMode = false;
        this.toastr.success('Deposit saved successfully.', 'Success');
        this.savedEvent.emit(saved);
        if (this.autoBackOnSave) {
          this.backEvent.emit();
        }
      },
      error: () => this.toastr.error('Unable to save deposit.', 'Error')
    });
  }

  addSplitLine(): void {
    const defaultPropertyId = this.splitsFormArray.length > 0
      ? (this.splitsFormArray.at(0).get('propertyId')?.value || null)
      : ((this.property?.propertyId || '').trim() || null);
    this.splitsFormArray.push(this.createSplitGroup({ propertyId: defaultPropertyId, amount: 0, description: '' }));
    this.cdr.markForCheck();
  }

  removeSplitLine(index: number): void {
    if (this.splitsFormArray.length <= 1) {
      return;
    }
    this.splitsFormArray.removeAt(index);
    this.cdr.markForCheck();
  }

  onOverallBankAccountSelectionChange(value: number | string): void {
    this.form.patchValue({ bankAccountId: Number(value) || 0 });
  }

  buildForm(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.form = this.fb.group({
      officeName: new FormControl(''),
      depositDate: new FormControl<Date | null>(today, [Validators.required]),
      accountingPeriod: new FormControl<Date | null>(new Date(today.getTime()), [Validators.required]),
      amount: new FormControl('0.00', [Validators.required]),
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
    this.depositService.getDepositById(this.depositId).pipe(
      take(1),
      finalize(() => this.clearDepositLoading())
    ).subscribe({
      next: (deposit: DepositResponse) => {
        this.deposit = deposit;
        this.populateForm(deposit);
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
      this.expenseAccountOptions = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accounts');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'accounts');
    this.chartOfAccountsService.getChartOfAccountsByOfficeId(officeId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accounts'))
    ).subscribe({
      next: (accounts) => {
        const bankAccounts = (accounts || []).filter(account => account.accountTypeId === AccountType.Bank);
        const expenseAccounts = (accounts || []).filter(account => account.accountTypeId === AccountType.Expense);
        this.bankAccountOptions = bankAccounts.map(account => ({
          value: account.accountId,
          label: `${account.accountNo} - ${account.name}`.trim()
        }));
        this.expenseAccountOptions = expenseAccounts.map(account => ({
          value: account.accountId,
          label: `${account.accountNo} - ${account.name}`.trim()
        }));
        this.cdr.markForCheck();
      },
      error: () => {
        this.bankAccountOptions = [];
        this.expenseAccountOptions = [];
        this.cdr.markForCheck();
      }
    });
  }
  //#endregion

  //#region Private Methods
  private ensureAtLeastOneSplit(): void {
    if (this.splitsFormArray.length === 0) {
      this.splitsFormArray.push(this.createSplitGroup());
    }
  }

  private createSplitGroup(split?: DepositSplit): FormGroup {
    return this.fb.group({
      depositSplitId: new FormControl(split?.depositSplitId ?? null),
      amount: new FormControl(split?.amount != null ? this.formatter.currency(split.amount) : '0.00', [Validators.required]),
      description: new FormControl(split?.description || ''),
      propertyId: new FormControl(split?.propertyId || null, [Validators.required]),
      chartOfAccountId: new FormControl(split?.chartOfAccountId ?? null)
    });
  }

  private replaceSplitLines(splits: DepositSplit[]): void {
    while (this.splitsFormArray.length > 0) {
      this.splitsFormArray.removeAt(0);
    }
    const rows = splits.length > 0 ? splits : [undefined];
    rows.forEach(split => this.splitsFormArray.push(this.createSplitGroup(split)));
  }

  private getPayloadSplitsFromForm(): DepositSplit[] {
    return this.splitsFormArray.controls.map(control => {
      const group = control as FormGroup;
      const amount = parseFloat(this.sanitizeSignedDecimalInput(group.get('amount')?.value?.toString() ?? '')) || 0;
      return {
        depositSplitId: group.get('depositSplitId')?.value ?? null,
        amount,
        description: (group.get('description')?.value || '').toString().trim(),
        propertyId: (group.get('propertyId')?.value || '').toString().trim() || null,
        chartOfAccountId: Number(group.get('chartOfAccountId')?.value ?? 0) > 0
          ? Number(group.get('chartOfAccountId')?.value)
          : null
      };
    });
  }

  private getDepositOfficeId(): number | null {
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

  private applyShellOfficeToDeposit(): void {
    const officeId = this.getDepositOfficeId();
    if (!officeId) {
      return;
    }
    const office = this.offices.find(item => item.officeId === officeId);
    this.form.patchValue({ officeName: office?.name || '' }, { emitEvent: false });
    this.loadChartOfAccounts();
  }

  private applyPropertyInputToForm(): void {
    const propertyId = (this.property?.propertyId || '').trim();
    if (!propertyId || !this.isAddMode) {
      return;
    }
    this.form.patchValue({
      officeName: this.property?.officeName || ''
    });
    if (this.splitsFormArray.length > 0) {
      this.splitsFormArray.at(0).patchValue({ propertyId });
    }
    this.loadChartOfAccounts();
  }

  private getDateControlValue(value: string | null | undefined): Date | null {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    return parsed ?? null;
  }

  private sanitizeSignedDecimalInput(value: string): string {
    return (value || '').replace(/[^0-9.-]/g, '');
  }

  private clearDepositLoading(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'deposit');
    this.cdr.markForCheck();
  }

  private syncPageReadyFromLoadItems(): void {
    this.isPageReady = this.itemsToLoad$.value.size === 0;
    this.cdr.markForCheck();
  }
  //#endregion
}
