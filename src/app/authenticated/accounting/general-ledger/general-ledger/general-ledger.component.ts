import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { BehaviorSubject, Subject, finalize, of, switchMap, take, takeUntil } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';
import { SourceType, SourceTypeLabels, getSourceTypeLabel } from '../../models/accounting-enum';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { JournalEntryLineDetailDisplay, JournalEntryLineRequest, JournalEntryRequest, JournalEntryResponse } from '../../models/journal-entry.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';

interface EditableJournalEntryLine {
  lineKey: string;
  chartOfAccountId: number | null;
  debit: number;
  credit: number;
  memo: string;
}

@Component({
  selector: 'app-general-ledger',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './general-ledger.component.html',
  styleUrls: ['./general-ledger.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneralLedgerComponent implements OnInit, OnDestroy, OnChanges {
  @Input() journalEntryId: string | null = null;
  @Input() selectedJournalEntryLineId: string | null = null;
  @Input() prefetchedJournalEntry: JournalEntryResponse | null = null;
  @Input() isCreateMode = false;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() reservationContactId: string | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<JournalEntryResponse | undefined>();
  @Output() officeValidationRequired = new EventEmitter<void>();

  isServiceError = false;
  isSaving = false;
  journalEntry: JournalEntryResponse | null = null;
  lineRows: JournalEntryLineDetailDisplay[] = [];
  editableLines: EditableJournalEntryLine[] = [];
  focusedLineAmount: { lineKey: string; field: 'debit' | 'credit' } | null = null;
  lineAmountEditValue = '';
  saveValidationHighlightActive = false;
  linesBalanceValidationError = false;
  organizationId = '';
  chartOfAccounts: ChartOfAccountResponse[] = [];
  private editableLineKeyCounter = 0;
  private formSubscriptionsInitialized = false;

  form = this.formBuilder.group({
    transactionDate: this.formBuilder.control<Date | null>(null),
    postingDate: this.formBuilder.control<Date | null>(null),
    memo: this.formBuilder.control<string>(''),
    isPosted: this.formBuilder.control<boolean>(false)
  });

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['journalEntry', 'referenceData']));
  destroy$ = new Subject<void>();

  constructor(
    public generalLedgerService: GeneralLedgerService,
    public mappingService: MappingService,
    public formatter: FormatterService,
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private chartOfAccountsService: ChartOfAccountsService,
    private utilityService: UtilityService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef) {
  }

  //#region General-Ledger
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.setupFormSubscriptions();
    this.loadReferenceData();
    this.initializeView();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['journalEntryId'] && !changes['journalEntryId'].firstChange && !this.isCreateMode) {
      this.tryApplyPrefetchedJournalEntry() || this.loadJournalEntry();
    }

    if (changes['prefetchedJournalEntry'] && !changes['prefetchedJournalEntry'].firstChange && !this.isCreateMode) {
      this.tryApplyPrefetchedJournalEntry();
    }

    if ((changes['isCreateMode'] || changes['officeId']) && this.isCreateMode) {
      this.initializeCreateForm();
    }
  }

  get canEdit(): boolean {
    return !!this.journalEntry && !this.journalEntry.isVoided;
  }

  get chartOfAccountOptions(): { value: number; label: string }[] {
    const officeId = this.officeId ?? this.journalEntry?.officeId ?? null;
    if (!officeId) {
      return [];
    }

    return this.chartOfAccounts
      .filter(account => account.officeId === officeId)
      .map(account => ({
        value: Number(account.accountId),
        label: this.utilityService.getChartOfAccountDropdownLabel(account)
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  }
  //#endregion

  //#region Get Methods
  getSourceTypeLabel(): string {
    if (this.isCreateMode) {
      return getSourceTypeLabel(SourceType.Journal, SourceTypeLabels);
    }

    const sourceCode = (this.journalEntry?.sourceCode || '').trim();
    if (sourceCode) {
      return sourceCode;
    }

    return getSourceTypeLabel(this.journalEntry?.sourceTypeId, SourceTypeLabels);
  }

  getTotalDebitDisplay(): string {
    if (this.isCreateMode) {
      return this.formatter.currency(this.getEditableTotalDebit());
    }

    const total = (this.journalEntry?.journalEntryLines ?? []).reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    return this.formatter.currency(total);
  }

  getTotalCreditDisplay(): string {
    if (this.isCreateMode) {
      return this.formatter.currency(this.getEditableTotalCredit());
    }

    const total = (this.journalEntry?.journalEntryLines ?? []).reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    return this.formatter.currency(total);
  }
  //#endregion

  //#region Save
  saveJournalEntry(): void {
    if (this.isSaving) {
      return;
    }

    this.saveValidationHighlightActive = true;
    this.linesBalanceValidationError = false;
    this.form.markAllAsTouched();
    this.markViewForCheck();

    if (!this.validateBeforeSave()) {
      this.showValidationErrorToast();
      return;
    }

    this.saveValidationHighlightActive = false;
    this.linesBalanceValidationError = false;

    if (this.isCreateMode) {
      this.createJournalEntry();
      return;
    }

    if (!this.journalEntry) {
      return;
    }

    const request = this.buildUpdateRequest();
    if (!request) {
      return;
    }

    const shouldPost = !!this.form.getRawValue().isPosted;
    this.isSaving = true;
    this.markViewForCheck();

    this.generalLedgerService.updateJournalEntry(request).pipe(
      switchMap(updated => {
        if (shouldPost && !updated.isPosted) {
          return this.generalLedgerService.postJournalEntry(updated.journalEntryId);
        }
        if (!shouldPost && updated.isPosted) {
          return this.generalLedgerService.unpostJournalEntry(updated.journalEntryId);
        }
        return of(updated);
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: updatedEntry => {
        this.journalEntry = updatedEntry;
        this.syncFormFromJournalEntry();
        this.applyLineDisplay();
        this.toastr.success('Journal entry saved.', 'Success');
        this.savedEvent.emit(updatedEntry);
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.showSaveError(error);
      }
    });
  }

  validateBeforeSave(): boolean {
    if (this.isCreateMode) {
      return this.validateCreateForm();
    }

    return this.validateEditForm();
  }

  validateCreateForm(): boolean {
    let isValid = true;

    if (!this.organizationId || !this.officeId) {
      if (!this.officeId) {
        this.officeValidationRequired.emit();
      }
      isValid = false;
    }

    this.form.get('transactionDate')?.setValidators(Validators.required);
    this.form.get('memo')?.setValidators(Validators.required);
    this.applyPostingDateValidators();
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.shouldShowControlError(this.form.get('transactionDate'))) {
      isValid = false;
    }

    if (this.shouldShowControlError(this.form.get('postingDate'))) {
      isValid = false;
    }

    if (this.shouldShowHeaderMemoError()) {
      isValid = false;
    }

    const activeLines = this.getActiveEditableLines();
    if (activeLines.length === 0) {
      isValid = false;
    }

    if (this.editableLines.some(line =>
      this.shouldShowLineAccountError(line)
      || this.shouldShowLineAmountError(line)
      || this.shouldShowLineDebitCreditConflict(line)
      || this.shouldShowLineMemoError(line))) {
      isValid = false;
    }

    if (activeLines.length > 0
      && Math.abs(this.getEditableTotalDebit() - this.getEditableTotalCredit()) > 0.005) {
      this.linesBalanceValidationError = true;
      isValid = false;
    }

    return isValid;
  }

  validateEditForm(): boolean {
    if (!this.journalEntry || !this.canEdit) {
      return false;
    }

    this.applyPostingDateValidators();
    this.form.updateValueAndValidity({ emitEvent: false });
    return !this.shouldShowControlError(this.form.get('postingDate'));
  }

  applyPostingDateValidators(): void {
    const postingDateControl = this.form.get('postingDate');
    if (!postingDateControl) {
      return;
    }

    if (this.form.getRawValue().isPosted) {
      postingDateControl.setValidators(Validators.required);
    } else {
      postingDateControl.clearValidators();
    }
    postingDateControl.updateValueAndValidity({ emitEvent: false });
  }

  shouldShowControlError(control: AbstractControl | null | undefined): boolean {
    if (!control) {
      return false;
    }

    return control.invalid && (control.touched || this.saveValidationHighlightActive);
  }

  shouldShowHeaderMemoError(): boolean {
    if (!this.isCreateMode || !this.saveValidationHighlightActive) {
      return false;
    }

    return !this.hasMemoValue(this.form.getRawValue().memo);
  }

  shouldShowLineMemoError(line: EditableJournalEntryLine): boolean {
    if (!this.saveValidationHighlightActive) {
      return false;
    }

    return !this.hasMemoValue(line.memo);
  }

  hasMemoValue(value: string | null | undefined): boolean {
    return !!(value || '').trim();
  }

  isLineEmpty(line: EditableJournalEntryLine): boolean {
    return !line.chartOfAccountId
      && line.debit <= 0
      && line.credit <= 0
      && !(line.memo || '').trim();
  }

  shouldShowLineAccountError(line: EditableJournalEntryLine): boolean {
    if (!this.saveValidationHighlightActive || line.chartOfAccountId) {
      return false;
    }

    if (line.debit > 0 || line.credit > 0 || !this.hasMemoValue(line.memo)) {
      return true;
    }

    return this.getActiveEditableLines().length === 0;
  }

  shouldShowLineAmountError(line: EditableJournalEntryLine): boolean {
    if (!this.saveValidationHighlightActive) {
      return false;
    }

    if (line.chartOfAccountId && line.debit <= 0 && line.credit <= 0) {
      return true;
    }

    return this.getActiveEditableLines().length === 0 && this.isLineEmpty(line);
  }

  shouldShowLineDebitCreditConflict(line: EditableJournalEntryLine): boolean {
    return this.saveValidationHighlightActive && line.debit > 0 && line.credit > 0;
  }

  shouldShowLineDebitError(line: EditableJournalEntryLine): boolean {
    return this.shouldShowLineAmountError(line) || this.shouldShowLineDebitCreditConflict(line);
  }

  shouldShowLineCreditError(line: EditableJournalEntryLine): boolean {
    return this.shouldShowLineAmountError(line) || this.shouldShowLineDebitCreditConflict(line);
  }

  getLineAccountSelectClass(line: EditableJournalEntryLine): string {
    const baseClass = 'split-editable-input split-account-select-control';
    return this.shouldShowLineAccountError(line) ? `${baseClass} split-input-invalid` : baseClass;
  }

  showValidationErrorToast(): void {
    this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
  }

  createJournalEntry(): void {
    const request = this.buildCreateRequest();
    if (!request) {
      return;
    }

    const shouldPost = !!this.form.getRawValue().isPosted;
    this.isSaving = true;
    this.markViewForCheck();

    this.generalLedgerService.createJournalEntry(request).pipe(
      switchMap(created => {
        if (shouldPost && !created.isPosted) {
          return this.generalLedgerService.postJournalEntry(created.journalEntryId);
        }
        return of(created);
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (created) => {
        this.toastr.success('Journal entry created.', 'Success');
        this.savedEvent.emit(created);
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.showSaveError(error);
      }
    });
  }

  buildUpdateRequest(): JournalEntryRequest | null {
    if (!this.journalEntry) {
      return null;
    }

    const postingDate = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().postingDate)
      ?? this.journalEntry.postingDate;

    return {
      journalEntryId: this.journalEntry.journalEntryId,
      organizationId: this.journalEntry.organizationId,
      officeId: this.journalEntry.officeId,
      transactionDate: this.journalEntry.transactionDate,
      postingDate,
      sourceTypeId: this.journalEntry.sourceTypeId ?? null,
      sourceId: this.journalEntry.sourceId ?? null,
      memo: this.form.getRawValue().memo?.trim() || null,
      isPosted: this.journalEntry.isPosted,
      isVoided: this.journalEntry.isVoided,
      journalEntryLines: (this.journalEntry.journalEntryLines ?? []).map(line => ({
        journalEntryLineId: line.journalEntryLineId,
        journalEntryId: line.journalEntryId,
        chartOfAccountId: line.chartOfAccountId,
        costCodeId: line.costCodeId ?? null,
        propertyId: line.propertyId ?? null,
        reservationId: line.reservationId ?? null,
        contactId: line.contactId ?? null,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? null
      }))
    };
  }

  buildCreateRequest(): JournalEntryRequest | null {
    const officeId = this.officeId;
    if (!officeId || !this.organizationId) {
      return null;
    }

    const transactionDate = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().transactionDate);
    const shouldPost = !!this.form.getRawValue().isPosted;
    const postingDateFromForm = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().postingDate);
    const postingDate = postingDateFromForm ?? (shouldPost ? null : transactionDate);
    if (!transactionDate || (shouldPost && !postingDate)) {
      return null;
    }

    const lineContext = this.resolveCreateLineContext();
    const journalEntryLines: JournalEntryLineRequest[] = this.getActiveEditableLines().map(line => ({
      chartOfAccountId: Number(line.chartOfAccountId),
      debit: this.roundCurrencyValue(line.debit),
      credit: this.roundCurrencyValue(line.credit),
      memo: line.memo.trim() || null,
      costCodeId: null,
      propertyId: lineContext.propertyId,
      reservationId: lineContext.reservationId,
      contactId: lineContext.contactId
    }));

    return {
      organizationId: this.organizationId,
      officeId,
      transactionDate,
      postingDate,
      sourceTypeId: SourceType.Journal,
      sourceId: null,
      memo: this.form.getRawValue().memo?.trim() || null,
      isPosted: false,
      isVoided: false,
      journalEntryLines
    };
  }
  //#endregion

  //#region Create Methods
  initializeView(): void {
    if (this.isCreateMode) {
      this.initializeCreateForm();
      return;
    }

    if (this.tryApplyPrefetchedJournalEntry()) {
      return;
    }

    this.loadJournalEntry();
  }

  tryApplyPrefetchedJournalEntry(): boolean {
    const journalEntryId = this.journalEntryId?.trim();
    const prefetched = this.resolvePrefetchedJournalEntry(journalEntryId);
    if (!prefetched) {
      return false;
    }

    this.applyLoadedJournalEntry(prefetched);
    return true;
  }

  resolvePrefetchedJournalEntry(journalEntryId: string | null | undefined): JournalEntryResponse | null {
    const targetId = (journalEntryId || '').trim();
    if (!targetId) {
      return null;
    }

    if (this.prefetchedJournalEntry?.journalEntryId === targetId) {
      return this.prefetchedJournalEntry;
    }

    const stateJournalEntry = history.state?.prefetchedJournalEntry as JournalEntryResponse | undefined;
    if (stateJournalEntry?.journalEntryId === targetId) {
      return stateJournalEntry;
    }

    return null;
  }

  applyLoadedJournalEntry(journalEntry: JournalEntryResponse): void {
    this.isServiceError = false;
    this.journalEntry = journalEntry;
    this.syncFormFromJournalEntry();
    this.applyLineDisplay();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
    this.markViewForCheck();
  }

  initializeCreateForm(): void {
    this.isServiceError = false;
    this.journalEntry = null;
    this.lineRows = [];
    this.editableLineKeyCounter = 0;
    this.editableLines = [this.createEditableLine(), this.createEditableLine()];
    this.saveValidationHighlightActive = false;
    this.linesBalanceValidationError = false;
    const today = new Date();
    this.form.reset({
      transactionDate: today,
      postingDate: null,
      memo: '',
      isPosted: false
    });
    this.form.get('transactionDate')?.setValidators(Validators.required);
    this.form.get('memo')?.clearValidators();
    this.applyPostingDateValidators();
    this.form.updateValueAndValidity({ emitEvent: false });
    this.form.enable();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
    this.markViewForCheck();
  }

  setupFormSubscriptions(): void {
    if (this.formSubscriptionsInitialized) {
      return;
    }
    this.formSubscriptionsInitialized = true;

    this.form.get('isPosted')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyPostingDateValidators();
      this.markViewForCheck();
    });

    this.form.get('memo')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(memo => {
      if (!this.isCreateMode) {
        return;
      }

      const normalizedMemo = (memo ?? '').toString();
      this.editableLines = this.editableLines.map(line => ({
        ...line,
        memo: normalizedMemo
      }));
      this.markViewForCheck();
    });
  }

  resolveCreateLineContext(): { propertyId: string | null; reservationId: string | null; contactId: string | null } {
    const propertyId = (this.propertyId || '').trim() || null;
    if (!propertyId) {
      return { propertyId: null, reservationId: null, contactId: null };
    }

    const reservationId = (this.reservationId || '').trim() || null;
    if (!reservationId) {
      return { propertyId, reservationId: null, contactId: null };
    }

    const contactId = (this.reservationContactId || '').trim() || null;
    return { propertyId, reservationId, contactId };
  }

  createEditableLine(): EditableJournalEntryLine {
    return {
      lineKey: `line-${++this.editableLineKeyCounter}`,
      chartOfAccountId: null,
      debit: 0,
      credit: 0,
      memo: (this.form.getRawValue().memo || '').toString()
    };
  }

  addEditableLine(): void {
    this.editableLines = [...this.editableLines, this.createEditableLine()];
    this.markViewForCheck();
  }

  removeEditableLine(lineKey: string): void {
    if (this.editableLines.length <= 1) {
      return;
    }

    this.editableLines = this.editableLines.filter(line => line.lineKey !== lineKey);
    this.markViewForCheck();
  }

  onEditableDebitChange(line: EditableJournalEntryLine, value: string | number): void {
    line.debit = this.roundCurrencyValue(Number(value || 0));
    if (line.debit > 0) {
      line.credit = 0;
    }
    this.markViewForCheck();
  }

  onEditableCreditChange(line: EditableJournalEntryLine, value: string | number): void {
    line.credit = this.roundCurrencyValue(Number(value || 0));
    if (line.credit > 0) {
      line.debit = 0;
    }
    this.markViewForCheck();
  }

  onAccountSelectionChange(lineKey: string, value: string | number | null | undefined): void {
    const line = this.editableLines.find(item => item.lineKey === lineKey);
    if (!line) {
      return;
    }

    const parsed = Number(value ?? 0);
    line.chartOfAccountId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.markViewForCheck();
  }

  isLineAmountFocused(lineKey: string, field: 'debit' | 'credit'): boolean {
    return this.focusedLineAmount?.lineKey === lineKey && this.focusedLineAmount?.field === field;
  }

  getLineAmountDisplay(line: EditableJournalEntryLine, field: 'debit' | 'credit'): string {
    const amount = field === 'debit' ? line.debit : line.credit;
    if (this.isLineAmountFocused(line.lineKey, field)) {
      return this.lineAmountEditValue;
    }

    const num = Number(amount) || 0;
    return num > 0 ? `$${this.formatter.currency(num)}` : '';
  }

  onLineAmountFocus(event: Event, line: EditableJournalEntryLine, field: 'debit' | 'credit'): void {
    const amount = field === 'debit' ? line.debit : line.credit;
    this.focusedLineAmount = { lineKey: line.lineKey, field };
    this.lineAmountEditValue = amount > 0 ? amount.toFixed(2) : '';
    setTimeout(() => (event.target as HTMLInputElement)?.select(), 0);
  }

  onLineAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.lineAmountEditValue = this.sanitizeDecimalInput(input?.value ?? '');
  }

  onLineAmountBlur(event: Event, line: EditableJournalEntryLine, field: 'debit' | 'credit'): void {
    const input = event.target as HTMLInputElement;
    const raw = this.sanitizeDecimalInput(input?.value ?? '');
    const amount = this.roundCurrencyValue(parseFloat(raw) || 0);
    if (field === 'debit') {
      this.onEditableDebitChange(line, amount);
    } else {
      this.onEditableCreditChange(line, amount);
    }

    if (this.isLineAmountFocused(line.lineKey, field)) {
      this.focusedLineAmount = null;
      this.lineAmountEditValue = '';
    }
  }

  onLineAmountKeydown(event: Event, line: EditableJournalEntryLine, field: 'debit' | 'credit'): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter') {
      return;
    }

    keyboardEvent.preventDefault();
    const raw = this.sanitizeDecimalInput(this.lineAmountEditValue);
    const amount = this.roundCurrencyValue(parseFloat(raw) || 0);
    if (field === 'debit') {
      this.onEditableDebitChange(line, amount);
    } else {
      this.onEditableCreditChange(line, amount);
    }

    this.focusedLineAmount = null;
    this.lineAmountEditValue = '';
    (event.target as HTMLInputElement)?.blur();
  }

  sanitizeDecimalInput(value: string): string {
    if (!value) {
      return '';
    }

    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
  }

  getActiveEditableLines(): EditableJournalEntryLine[] {
    return this.editableLines.filter(line => line.chartOfAccountId && (line.debit > 0 || line.credit > 0));
  }

  getEditableTotalDebit(): number {
    return this.roundCurrencyValue(
      this.getActiveEditableLines().reduce((sum, line) => sum + Number(line.debit || 0), 0)
    );
  }

  getEditableTotalCredit(): number {
    return this.roundCurrencyValue(
      this.getActiveEditableLines().reduce((sum, line) => sum + Number(line.credit || 0), 0)
    );
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }
  //#endregion

  //#region Data Loading Methods
  loadReferenceData(): void {
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'referenceData');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'referenceData');

    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyLineDisplay();
        this.markViewForCheck();
      });
    });

    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'referenceData');
  }

  loadJournalEntry(): void {
    const journalEntryId = this.journalEntryId?.trim();
    if (!journalEntryId) {
      this.journalEntry = null;
      this.lineRows = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
      this.markViewForCheck();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'journalEntry');
    this.isServiceError = false;

    this.generalLedgerService.getJournalEntryById(journalEntryId).pipe(
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry')),
      takeUntil(this.destroy$)
    ).subscribe({
      next: journalEntry => {
        this.applyLoadedJournalEntry(journalEntry);
      },
      error: (error: HttpErrorResponse) => {
        console.error('General Ledger - error loading journal entry:', error);
        this.isServiceError = true;
        this.journalEntry = null;
        this.lineRows = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  syncFormFromJournalEntry(): void {
    if (!this.journalEntry) {
      this.form.reset({
        transactionDate: null,
        postingDate: null,
        memo: '',
        isPosted: false
      });
      return;
    }

    this.form.reset({
      transactionDate: this.utilityService.parseDateOnlyStringToDate(this.journalEntry.transactionDate),
      postingDate: this.utilityService.parseDateOnlyStringToDate(this.journalEntry.postingDate),
      memo: this.journalEntry.memo ?? '',
      isPosted: this.journalEntry.isPosted
    });

    if (this.canEdit) {
      this.form.enable();
    } else {
      this.form.disable();
    }
  }

  applyLineDisplay(): void {
    if (!this.journalEntry) {
      this.lineRows = [];
      return;
    }

    this.lineRows = this.mappingService.mapJournalEntryLineDetailDisplay(
      this.journalEntry.journalEntryLines,
      this.chartOfAccounts,
      this.journalEntry.officeId
    );
  }

  showSaveError(error: HttpErrorResponse | Error): void {
    const apiMessage = error instanceof HttpErrorResponse
      ? (typeof error.error === 'string'
        ? error.error
        : error.error?.title || error.error?.message || error.message)
      : error.message;
    this.toastr.error(apiMessage || 'Unable to save journal entry.', 'Error');
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  back(): void {
    this.backEvent.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
