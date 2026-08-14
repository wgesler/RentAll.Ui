import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { FormatterService } from '../../../../services/formatter-service';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { UtilityService } from '../../../../services/utility.service';
import { EntityType } from '../../../contacts/models/contact-enum';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { PropertyCodeResponse, PropertyResponse } from '../../../properties/models/property.model';
import { PropertyService } from '../../../properties/services/property.service';
import { ReservationCodeResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { AccountType } from '../../models/accounting-enum';
import { DepositRequest, DepositResponse, DepositSplit } from '../../models/deposit.model';
import { DepositService } from '../../services/deposit.service';
import { JournalEntryService } from '../../services/journal-entry.service';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';

type DepositSplitContextMode = 'default' | 'accountsPayable' | 'accountsReceivable' | 'ownerPayable';

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
  @Input() prefetchedDeposit: DepositResponse | null = null;
  @Input() shellChartOfAccounts: ChartOfAccountResponse[] | null = null;
  @Input() shellPropertyCodes: PropertyCodeResponse[] | null = null;
  @Input() autoBackOnSave = true;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<DepositResponse>();
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private depositService = inject(DepositService);
  private journalEntryService = inject(JournalEntryService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private officeService = inject(OfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private utilityService = inject(UtilityService);
  formatter = inject(FormatterService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  @ViewChild('overallAmountInput') overallAmountInput?: ElementRef<HTMLInputElement>;

  form: FormGroup;
  isAddMode = false;
  isSubmitting = false;
  isPageReady = false;
  isDepositContentReady = false;
  organizationId = '';
  deposit: DepositResponse | null = null;
  chartOfAccounts: ChartOfAccountResponse[] = [];
  propertyOptions: PropertyCodeResponse[] = [];
  reservationOptions: ReservationCodeResponse[] = [];
  contacts: ContactResponse[] = [];
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  bankAccountOptions: SearchableSelectOption<number>[] = [];
  splitAccountOptions: SearchableSelectOption<number>[] = [];
  splitTotalValidationError = false;
  focusedSplitAmountIndex: number | null = null;
  splitAmountEditValue = '';
  amountFocused = false;
  amountEditValue = '';
  saveValidationHighlightActive = false;
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

  readonly requireAccountId = (control: AbstractControl): ValidationErrors | null => {
    const accountId = Number(control.value ?? 0);
    return Number.isFinite(accountId) && accountId > 0 ? null : { required: true };
  };

  constructor() {
    this.form = this.fb.group({});
  }

  //#region Deposit
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.buildForm();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => this.syncPageReadyFromLoadItems());
    this.isAddMode = this.depositId === 'new';
    this.applyShellReferenceData();
    this.loadOffices();
    this.loadPropertyCodes();
    this.loadReservationCodes();
    this.loadContacts();
    this.loadAccountingOffices();
    this.loadChartOfAccounts();
    if (this.isAddMode) {
      this.isDepositContentReady = true;
      this.clearDepositLoading();
      this.applyShellOfficeToDeposit();
    } else if (this.prefetchedDeposit && this.prefetchedDeposit.depositId === this.depositId) {
      this.applyLoadedDeposit(this.prefetchedDeposit);
    } else {
      this.isDepositContentReady = false;
      this.loadDeposit();
    }
  }

  ngAfterViewInit(): void {
    if (this.isAddMode) {
      this.applyPropertyInputToForm();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['depositId'] && !changes['depositId'].firstChange) {
      this.isAddMode = this.depositId === 'new';
      if (this.isAddMode) {
        this.resetForm();
      } else {
        this.isDepositContentReady = false;
        if (this.prefetchedDeposit && this.prefetchedDeposit.depositId === this.depositId) {
          this.applyLoadedDeposit(this.prefetchedDeposit);
        } else {
          this.loadDeposit();
        }
      }
    }
    if (changes['prefetchedDeposit'] && !changes['prefetchedDeposit'].firstChange
      && this.prefetchedDeposit && this.prefetchedDeposit.depositId === this.depositId) {
      this.applyLoadedDeposit(this.prefetchedDeposit);
    }
    if (changes['shellChartOfAccounts'] || changes['shellPropertyCodes']) {
      this.applyShellReferenceData();
    }
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyShellOfficeToDeposit();
      this.applyChartOfAccountsForOffice();
      this.clearSplitPropertiesOutsideOffice();
      this.cdr.markForCheck();
    }
    if (changes['property']) {
      this.applyPropertyInputToForm();
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
    if (this.form.invalid || this.hasSplitContextValidationErrors()) {
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

    const amountValue = this.getDepositAmountValue();
    const payloadSplits = this.getPayloadSplitsFromForm();
    if (payloadSplits.length === 0) {
      this.showValidationErrorToast();
      return;
    }
    const splitTotalAmount = this.getDisplayedSplitTotal();
    if (this.utilityService.isSplitTotalGreaterThanDocumentAmount(splitTotalAmount, amountValue)) {
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

    const saveDeposit = () => {
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
        error: (err: HttpErrorResponse) => {
          const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(err);
          if (closedPeriodMessage) {
            this.toastr.error(closedPeriodMessage, 'Error');
            return;
          }
          this.toastr.error('Unable to save deposit.', 'Error');
        }
      });
    };

    if (this.isAddMode) {
      saveDeposit();
      return;
    }

    this.journalEntryService.confirmUpdateIfAllowed(this.deposit?.postingStatusId, 'Deposit').pipe(take(1)).subscribe(canProceed => {
      if (!canProceed) {
        return;
      }

      saveDeposit();
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
      amount: deposit.amount != null ? this.roundCurrency(deposit.amount).toFixed(2) : '0.00',
      bankAccountId: deposit.bankAccountId ?? 0,
      isActive: deposit.isActive
    });
    this.replaceSplitLines(deposit.splits || []);
    this.splitTotalValidationError = false;
  }

  resetForm(): void {
    this.deposit = null;
    this.isDepositContentReady = true;
    this.clearDepositLoading();
    this.buildForm();
    this.applyShellOfficeToDeposit();
    this.applyPropertyInputToForm();
  }
  //#endregion

  //#region Data Load Methods
  loadDeposit(): void {
    if (this.isAddMode || !this.depositId) {
      this.clearDepositLoading();
      return;
    }

    this.isDepositContentReady = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'deposit');
    this.depositService.getDepositById(this.depositId).pipe(take(1), finalize(() => this.clearDepositLoading())).subscribe({
      next: (deposit: DepositResponse) => this.applyLoadedDeposit(deposit),
      error: (_err: HttpErrorResponse) => {
        this.toastr.error('Unable to load deposit.', 'Error');
      }
    });
  }

  applyLoadedDeposit(deposit: DepositResponse): void {
    this.deposit = deposit;
    this.populateForm(deposit);
    this.applyChartOfAccountsForOffice();
    this.clearDepositLoading();
    this.isDepositContentReady = true;
    this.cdr.markForCheck();
  }

  applyShellReferenceData(): void {
    if (this.shellChartOfAccounts?.length) {
      this.chartOfAccounts = this.shellChartOfAccounts;
    }
    if (this.shellPropertyCodes?.length) {
      this.propertyOptions = this.shellPropertyCodes;
    }
    if (this.chartOfAccounts.length > 0) {
      this.applyChartOfAccountsForOffice();
    }
  }

  loadPropertyCodes(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe(() => {
      this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe(properties => {
        this.propertyOptions = properties || [];
        this.cdr.markForCheck();
      });
    });
  }

  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.cdr.markForCheck();
      });
    });
  }

  loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyChartOfAccountsForOffice();
      });
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe(() => {
      this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
        this.accountingOffices = accountingOffices || [];
        this.applyChartOfAccountsForOffice();
        this.applyAllSplitContextVisibilityRules();
        this.cdr.markForCheck();
      });
    });
  }

  loadReservationCodes(): void {
    this.reservationService.ensureReservationCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.reservationService.getAllReservationCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: reservations => {
            this.reservationOptions = reservations || [];
            this.applyAllSplitContextVisibilityRules();
            this.cdr.markForCheck();
          },
          error: () => {
            this.reservationOptions = [];
            this.cdr.markForCheck();
          }
        });
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe({
          next: contacts => {
            this.contacts = contacts || [];
            this.cdr.markForCheck();
          },
          error: () => {
            this.contacts = [];
            this.cdr.markForCheck();
          }
        });
      },
      error: () => {
        this.contacts = [];
        this.cdr.markForCheck();
      }
    });
  }

  applyChartOfAccountsForOffice(): void {
    const officeId = this.getDepositOfficeId();
    if (!officeId) {
      this.bankAccountOptions = [];
      this.splitAccountOptions = [];
      return;
    }

    const accounts = this.chartOfAccounts.filter(account => account.officeId === officeId);
    const bankAccounts = accounts.filter(account => Number(account.accountTypeId) === AccountType.Bank);
    this.bankAccountOptions = bankAccounts.map(account => ({
      value: account.accountId,
      label: this.utilityService.getChartOfAccountDropdownLabel(account)
    }));
    this.splitAccountOptions = this.buildSplitAccountOptions(accounts, officeId);
    this.applyDefaultSplitAccountIfNeeded();
    this.cdr.markForCheck();
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
    this.applyAllSplitContextVisibilityRules();
    this.cdr.markForCheck();
  }

  getPayloadSplitsFromForm(): DepositSplit[] {
    return this.splitsFormArray.controls.map(control => {
      const group = control as FormGroup;
      const amount = this.roundCurrency(parseFloat(this.sanitizeSignedDecimalInput(group.get('amount')?.value?.toString() ?? '')) || 0);
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
    return this.utilityService.sumCurrencyAmounts(
      this.getPayloadSplitsFromForm().map(split => split.amount)
    );
  }

  isDisplayedSplitTotalInvalid(): boolean {
    return this.utilityService.isSplitTotalGreaterThanDocumentAmount(
      this.getDisplayedSplitTotal(),
      this.getDepositAmountValue()
    );
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
    const splitGroup = this.splitsFormArray.at(splitIndex) as FormGroup | undefined;
    if (!splitGroup) {
      return;
    }

    splitGroup.get('chartOfAccountId')?.setValue(accountId);
    splitGroup.get('chartOfAccountId')?.markAsTouched();
    splitGroup.get('chartOfAccountId')?.updateValueAndValidity({ emitEvent: false });
    this.applySplitContextVisibilityRules(splitGroup);
    this.cdr.markForCheck();
  }

  onSplitPropertySelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const splitGroup = this.splitsFormArray.at(splitIndex) as FormGroup | undefined;
    if (!splitGroup) {
      return;
    }

    splitGroup.patchValue({ propertyId: value == null || value === '' ? null : String(value) }, { emitEvent: false });
    this.clearInvalidSplitReservationSelection(splitGroup);
    this.cdr.markForCheck();
  }

  onSplitReservationSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const splitGroup = this.splitsFormArray.at(splitIndex) as FormGroup | undefined;
    if (!splitGroup) {
      return;
    }

    const reservationId = value == null || value === '' ? null : String(value);
    const patch: { reservationId: string | null; propertyId?: string | null } = { reservationId };
    if (reservationId) {
      const reservation = this.reservationOptions.find(item => item.reservationId === reservationId);
      if (reservation?.propertyId) {
        patch.propertyId = reservation.propertyId;
      }
    }

    splitGroup.patchValue(patch, { emitEvent: false });
    this.cdr.markForCheck();
  }

  onSplitContactSelectionChange(splitIndex: number, value: string | number | null | undefined): void {
    const splitGroup = this.splitsFormArray.at(splitIndex) as FormGroup | undefined;
    if (!splitGroup) {
      return;
    }

    splitGroup.patchValue({ contactId: value == null || value === '' ? null : String(value) }, { emitEvent: false });
    this.cdr.markForCheck();
  }

  getSplitContextMode(splitGroup: AbstractControl): DepositSplitContextMode {
    const accountId = Number(splitGroup.get('chartOfAccountId')?.value ?? 0);
    const officeId = this.getDepositOfficeId();
    if (!accountId || !officeId) {
      return 'default';
    }

    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    if (!accountingOffice) {
      return 'default';
    }

    if (accountId === Number(accountingOffice.defaultActPayableAccountId ?? 0)) {
      return 'accountsPayable';
    }

    if (accountId === Number(accountingOffice.defaultActRcvableAccountId ?? 0)) {
      return 'accountsReceivable';
    }

    if (accountId === Number(accountingOffice.defaultOwnActPayableAccountId ?? 0)) {
      return 'ownerPayable';
    }

    return 'default';
  }

  shouldShowSplitProperty(splitGroup: AbstractControl): boolean {
    const mode = this.getSplitContextMode(splitGroup);
    return mode === 'accountsPayable' || mode === 'ownerPayable' || mode === 'accountsReceivable';
  }

  shouldShowSplitReservation(splitGroup: AbstractControl): boolean {
    return this.getSplitContextMode(splitGroup) === 'accountsReceivable';
  }

  shouldShowSplitContact(splitGroup: AbstractControl): boolean {
    return this.getSplitContextMode(splitGroup) === 'accountsPayable';
  }

  shouldShowSplitContactColumn(): boolean {
    return this.splitsFormArray.controls.some(control => this.shouldShowSplitContact(control));
  }

  getSplitPropertyNullLabel(splitGroup: AbstractControl): string {
    const mode = this.getSplitContextMode(splitGroup);
    if (mode === 'accountsReceivable' || mode === 'ownerPayable') {
      return 'Select Property';
    }

    return 'Company';
  }

  getSplitReservationNullLabel(): string {
    return 'Select Reservation';
  }

  getSplitContactNullLabel(): string {
    return 'Select Vendor';
  }

  getSplitPropertyOptions(_splitGroup?: AbstractControl): SearchableSelectOption<string>[] {
    const officeId = this.getDepositOfficeId();
    const properties = officeId == null
      ? (this.propertyOptions || [])
      : (this.propertyOptions || []).filter(property => property.officeId === officeId);

    return properties
      .map(property => ({
        value: (property.propertyId || '').trim(),
        label: (property.propertyCode || '').trim()
      }))
      .filter(option => option.value.length > 0);
  }

  getSplitReservationOptions(splitGroup: AbstractControl): SearchableSelectOption<string>[] {
    return this.buildSplitReservationOptions(splitGroup);
  }

  buildSplitReservationOptions(splitGroup: AbstractControl): SearchableSelectOption<string>[] {
    const officeId = this.getDepositOfficeId();
    const officeFiltered = officeId == null
      ? this.reservationOptions
      : this.reservationOptions.filter(reservation => reservation.officeId === officeId);
    const propertyId = this.normalizeSplitPropertyId(splitGroup.get('propertyId')?.value ?? null);
    const requireProperty = this.shouldShowSplitReservation(splitGroup);
    const filtered = !propertyId
      ? (requireProperty ? [] : officeFiltered)
      : officeFiltered.filter(reservation => reservation.propertyId === propertyId);

    return filtered.map(reservation => ({
      value: reservation.reservationId,
      label: this.utilityService.getReservationDropdownLabel(reservation, null)
    }));
  }

  getSplitContactOptions(_splitGroup?: AbstractControl): SearchableSelectOption<string>[] {
    const officeId = this.getDepositOfficeId();
    const filteredContacts = officeId == null
      ? this.contacts.filter(contact => contact.entityTypeId === EntityType.Vendor)
      : this.contacts.filter(contact =>
        contact.entityTypeId === EntityType.Vendor
        && this.utilityService.contactHasOfficeAccess(contact, officeId));

    return filteredContacts.map(contact => ({
      value: String(contact.contactId || '').trim(),
      label: this.utilityService.getVendorDropdownLabel(contact)
    })).filter(option => option.value.length > 0);
  }

  applySplitContextVisibilityRules(splitGroup: FormGroup): void {
    if (!this.shouldShowSplitProperty(splitGroup)) {
      splitGroup.patchValue({ propertyId: null }, { emitEvent: false });
    }

    if (!this.shouldShowSplitReservation(splitGroup)) {
      splitGroup.patchValue({ reservationId: null }, { emitEvent: false });
    }

    if (!this.shouldShowSplitContact(splitGroup)) {
      splitGroup.patchValue({ contactId: null }, { emitEvent: false });
    }

    this.clearInvalidSplitReservationSelection(splitGroup);
  }

  applyAllSplitContextVisibilityRules(): void {
    this.splitsFormArray.controls.forEach(control => this.applySplitContextVisibilityRules(control as FormGroup));
  }

  clearInvalidSplitReservationSelection(splitGroup: FormGroup): void {
    const reservationId = (splitGroup.get('reservationId')?.value || '').toString().trim();
    if (!reservationId) {
      return;
    }

    const reservationIds = new Set(this.buildSplitReservationOptions(splitGroup).map(option => String(option.value)));
    if (!reservationIds.has(reservationId)) {
      splitGroup.patchValue({ reservationId: null }, { emitEvent: false });
    }
  }

  shouldShowSplitPropertyError(splitGroup: AbstractControl): boolean {
    if (!this.saveValidationHighlightActive) {
      return false;
    }

    const mode = this.getSplitContextMode(splitGroup);
    if (mode !== 'accountsReceivable' && mode !== 'ownerPayable') {
      return false;
    }

    return !this.normalizeSplitPropertyId(splitGroup.get('propertyId')?.value ?? null);
  }

  shouldShowSplitReservationError(splitGroup: AbstractControl): boolean {
    if (!this.saveValidationHighlightActive || !this.shouldShowSplitReservation(splitGroup)) {
      return false;
    }

    return !(splitGroup.get('reservationId')?.value || '').toString().trim();
  }

  shouldShowSplitContactError(splitGroup: AbstractControl): boolean {
    if (!this.saveValidationHighlightActive || !this.shouldShowSplitContact(splitGroup)) {
      return false;
    }

    return !(splitGroup.get('contactId')?.value || '').toString().trim();
  }

  hasSplitContextValidationErrors(): boolean {
    return this.splitsFormArray.controls.some(control =>
      this.shouldShowSplitPropertyError(control)
      || this.shouldShowSplitReservationError(control)
      || this.shouldShowSplitContactError(control));
  }

  getSplitContextSelectClass(splitGroup: AbstractControl, field: 'property' | 'reservation' | 'contact'): string {
    const baseClass = 'split-editable-input split-account-select-control';
    const enabled = field === 'property'
      ? this.shouldShowSplitProperty(splitGroup)
      : field === 'reservation'
        ? this.shouldShowSplitReservation(splitGroup)
        : this.shouldShowSplitContact(splitGroup);
    const hasError = enabled && (field === 'property'
      ? this.shouldShowSplitPropertyError(splitGroup)
      : field === 'reservation'
        ? this.shouldShowSplitReservationError(splitGroup)
        : this.shouldShowSplitContactError(splitGroup));
    const classes = [baseClass];
    if (!enabled) {
      classes.push('split-context-disabled');
    }
    if (hasError) {
      classes.push('split-input-invalid');
    }
    return classes.join(' ');
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
      amount: new FormControl(Number.isFinite(amount) ? this.roundCurrency(amount).toFixed(2) : '0.00', [Validators.required, this.requirePositiveAmount]),
      description: new FormControl(split?.description || '', [Validators.required]),
      propertyId: new FormControl(split?.propertyId || null),
      reservationId: new FormControl(split?.reservationId || null),
      contactId: new FormControl(split?.contactId || null),
      journalEntryLineId: new FormControl(split?.journalEntryLineId || null),
      chartOfAccountId: new FormControl(split?.chartOfAccountId ?? null, [Validators.required, this.requireAccountId])
    });
  }

  buildSplitAccountOptions(accounts: ChartOfAccountResponse[], _officeId: number): SearchableSelectOption<number>[] {
    const options = (accounts || []).map(account => ({
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
    return this.utilityService.roundCurrency(parseFloat(raw) || 0);
  }

  roundCurrency(value: number): number {
    return this.utilityService.roundCurrency(value);
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
 
  getDefaultUndepositedFundsAccountId(officeId: number): number | null {
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    const accountId = Number(accountingOffice?.defaultUndepFundsAccountId ?? 0);
    return accountId > 0 ? accountId : null;
  }

  getDepositOfficeId(): number | null {
    // Add mode follows the accounting-shell office so property/account lists refilter with it.
    if (this.isAddMode && this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    if (this.deposit?.officeId) {
      return this.deposit.officeId;
    }
    if (this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    if (this.property?.officeId) {
      return this.property.officeId;
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

  clearSplitPropertiesOutsideOffice(): void {
    const officeId = this.getDepositOfficeId();
    if (officeId == null || this.splitsFormArray.length === 0) {
      return;
    }

    const allowedPropertyIds = new Set(
      (this.propertyOptions || [])
        .filter(property => property.officeId === officeId)
        .map(property => (property.propertyId || '').trim())
        .filter(propertyId => propertyId.length > 0)
    );

    for (const control of this.splitsFormArray.controls) {
      const propertyId = (control.get('propertyId')?.value || '').toString().trim();
      if (propertyId && !allowedPropertyIds.has(propertyId)) {
        control.patchValue({ propertyId: null }, { emitEvent: false });
      }
    }
  }

  applyShellOfficeToDeposit(): void {
    const officeId = this.getDepositOfficeId();
    if (!officeId) {
      return;
    }
    const office = this.offices.find(item => item.officeId === officeId);
    this.form.patchValue({ officeName: office?.name || '' }, { emitEvent: false });
    this.applyChartOfAccountsForOffice();
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
    this.applyChartOfAccountsForOffice();
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
  }
  //#endregion
}
