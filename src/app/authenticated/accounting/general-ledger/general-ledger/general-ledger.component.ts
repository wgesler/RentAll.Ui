import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { ErrorStateMatcher } from '@angular/material/core';
import { AbstractControl, FormBuilder, FormControl, FormGroupDirective, FormsModule, NgForm, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { BehaviorSubject, Subject, catchError, finalize, of, switchMap, take, takeUntil } from 'rxjs';
import { AuthService } from '../../../../services/auth.service';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../../shared/searchable-select/searchable-select.component';
import { EntityType } from '../../../contacts/models/contact-enum';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { PropertyCodeResponse } from '../../../properties/models/property.model';
import { PropertyService } from '../../../properties/services/property.service';
import { ReservationCodeResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { PostingStatus, SourceType, SourceTypeLabels, getSourceTypeLabel, isJournalEntryHardClosed, isJournalEntryPosted, isJournalEntrySoftClosed } from '../../models/accounting-enum';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { JournalEntryLineDetailDisplay, JournalEntryLineRequest, JournalEntryRequest, JournalEntryResponse } from '../../models/journal-entry.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';

type JournalEntryLineContextMode = 'default' | 'accountsPayable' | 'accountsReceivable' | 'ownerPayable';

interface EditableJournalEntryLine {
  lineKey: string;
  journalEntryLineId?: string;
  chartOfAccountId: number | null;
  debit: number;
  credit: number;
  memo: string;
  costCodeId?: number | null;
  propertyId?: string | null;
  reservationId?: string | null;
  contactId?: string | null;
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
  /** When create mode opens, seed form/lines from this entry (JE#/ids omitted). */
  @Input() copyFromJournalEntry: JournalEntryResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() reservationContactId: string | null = null;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<JournalEntryResponse | undefined>();
  @Output() officeValidationRequired = new EventEmitter<void>();
  generalLedgerService = inject(GeneralLedgerService);
  mappingService = inject(MappingService);
  formatter = inject(FormatterService);
  private formBuilder = inject(FormBuilder);
  private authService = inject(AuthService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

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
  properties: PropertyCodeResponse[] = [];
  reservations: ReservationCodeResponse[] = [];
  contacts: ContactResponse[] = [];
  accountingOfficeDefaults: Pick<
    AccountingOfficeResponse,
    'defaultActPayableAccountId' | 'defaultActRcvableAccountId' | 'defaultOwnActPayableAccountId'
  > | null = null;
  entryPropertyId: string | null = null;
  entryReservationId: string | null = null;
  entryContactId: string | null = null;
  headerMemoErrorStateMatcher: ErrorStateMatcher = {
    isErrorState: (_control: FormControl | null, _form: FormGroupDirective | NgForm | null): boolean =>
      this.shouldShowHeaderMemoError()
  };
  private editableLineKeyCounter = 0;
  private formSubscriptionsInitialized = false;

  form = this.formBuilder.group({
    transactionDate: this.formBuilder.control<Date | null>(null),
    accountingPeriod: this.formBuilder.control<Date | null>(null),
    memo: this.formBuilder.control<string>(''),
    isPosted: this.formBuilder.control<boolean>(false)
  });

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['journalEntry']));
  destroy$ = new Subject<void>();

  get isAddMode(): boolean {
    return this.journalEntryId === 'new';
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
    if (changes['journalEntryId'] && !changes['journalEntryId'].firstChange) {
      if (this.isAddMode) {
        this.resetForm();
      } else {
        this.loadJournalEntry();
      }
      return;
    }

    if (changes['copyFromJournalEntry'] && this.isAddMode) {
      this.resetForm();
    }

    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadAccountingOfficeDefaults();
    }
  }

  get canEdit(): boolean {
    return this.isAddMode
      || (
        !!this.journalEntry
        && !isJournalEntrySoftClosed(this.journalEntry.postingStatusId)
        && !isJournalEntryHardClosed(this.journalEntry.postingStatusId)
      );
  }

  /** Create and non-closed edit both use the editable lines grid. */
  get canEditLines(): boolean {
    return this.canEdit;
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

  get effectiveOfficeId(): number | null {
    return this.officeId ?? this.journalEntry?.officeId ?? null;
  }
  //#endregion

  //#region Entry Context Dropdowns
  getLineContextMode(line: EditableJournalEntryLine): JournalEntryLineContextMode {
    const accountId = Number(line.chartOfAccountId ?? 0);
    if (!accountId || !this.accountingOfficeDefaults) {
      return 'default';
    }

    if (accountId === Number(this.accountingOfficeDefaults.defaultActPayableAccountId ?? 0)) {
      return 'accountsPayable';
    }

    if (accountId === Number(this.accountingOfficeDefaults.defaultActRcvableAccountId ?? 0)) {
      return 'accountsReceivable';
    }

    if (accountId === Number(this.accountingOfficeDefaults.defaultOwnActPayableAccountId ?? 0)) {
      return 'ownerPayable';
    }

    return 'default';
  }

  getLinesWithSelectedAccounts(): EditableJournalEntryLine[] {
    return this.editableLines.filter(line => !!line.chartOfAccountId);
  }

  getSelectedLineContextModes(): Set<JournalEntryLineContextMode> {
    const modes = new Set<JournalEntryLineContextMode>();
    this.getLinesWithSelectedAccounts().forEach(line => modes.add(this.getLineContextMode(line)));
    return modes;
  }

  hasSelectedLineContextMode(mode: JournalEntryLineContextMode): boolean {
    return this.getSelectedLineContextModes().has(mode);
  }

  getActiveLineContextModes(): Set<JournalEntryLineContextMode> {
    const modes = new Set<JournalEntryLineContextMode>();
    this.getActiveEditableLines().forEach(line => modes.add(this.getLineContextMode(line)));
    return modes;
  }

  hasActiveLineContextMode(mode: JournalEntryLineContextMode): boolean {
    return this.getActiveLineContextModes().has(mode);
  }

  shouldShowEntryProperty(): boolean {
    return this.hasSelectedLineContextMode('accountsPayable')
      || this.hasSelectedLineContextMode('ownerPayable')
      || this.hasSelectedLineContextMode('accountsReceivable');
  }

  shouldShowEntryContact(): boolean {
    return this.hasSelectedLineContextMode('accountsPayable');
  }

  shouldShowEntryReservation(): boolean {
    return this.hasSelectedLineContextMode('accountsReceivable');
  }

  shouldShowEntryContextRow(): boolean {
    return this.shouldShowEntryProperty()
      || this.shouldShowEntryReservation()
      || this.shouldShowEntryContact();
  }

  getEntryContactLabel(): string {
    return 'Vendor';
  }

  getEntryPropertyNullLabel(): string {
    if (this.hasSelectedLineContextMode('accountsReceivable')
      || this.hasSelectedLineContextMode('ownerPayable')) {
      return 'Select Property';
    }

    return 'Company';
  }

  getEntryReservationNullLabel(): string {
    return 'Select Reservation';
  }

  getEntryContactNullLabel(): string {
    return 'Select Vendor';
  }

  getEntryPropertyOptions(): SearchableSelectOption<string>[] {
    const officeId = this.effectiveOfficeId;
    const filteredProperties = officeId == null
      ? this.properties
      : this.properties.filter(property => property.officeId === officeId);

    const options = filteredProperties.map(property => ({
      value: property.propertyId,
      label: property.propertyCode
    }));

    return this.ensureSelectedPropertyOption(options, this.entryPropertyId);
  }

  getEntryReservationOptions(): SearchableSelectOption<string>[] {
    const options = this.buildEntryReservationOptions();
    return this.ensureSelectedReservationOption(options, this.entryReservationId);
  }

  buildEntryReservationOptions(): SearchableSelectOption<string>[] {
    const filteredReservations = this.getReservationsForProperty(this.entryPropertyId);

    return filteredReservations.map(reservation => ({
      value: reservation.reservationId,
      label: this.utilityService.getReservationDropdownLabel(reservation, null)
    }));
  }

  getReservationsForProperty(propertyId: string | null | undefined): ReservationCodeResponse[] {
    const officeId = this.effectiveOfficeId;
    const officeFilteredReservations = officeId == null
      ? this.reservations
      : this.reservations.filter(reservation => reservation.officeId === officeId);
    const normalizedPropertyId = this.normalizeLinePropertyId(propertyId);

    if (!normalizedPropertyId) {
      return this.hasSelectedLineContextMode('accountsReceivable') ? [] : officeFilteredReservations;
    }

    return officeFilteredReservations.filter(reservation => reservation.propertyId === normalizedPropertyId);
  }

  getEntryContactOptions(): SearchableSelectOption<string>[] {
    const officeId = this.effectiveOfficeId;
    const filteredContacts = officeId == null
      ? this.contacts.filter(contact => contact.entityTypeId === EntityType.Vendor)
      : this.contacts.filter(contact =>
        contact.entityTypeId === EntityType.Vendor
        && this.utilityService.contactHasOfficeAccess(contact, officeId));

    const options = filteredContacts.map(contact => ({
      value: String(contact.contactId || '').trim(),
      label: this.utilityService.getVendorDropdownLabel(contact)
    })).filter(option => option.value.length > 0);

    return this.ensureSelectedOption(options, this.entryContactId, this.resolveContactLabel(this.entryContactId));
  }

  onEntryPropertySelectionChange(value: string | number | null | undefined): void {
    this.entryPropertyId = value == null || value === '' ? null : String(value);
    this.clearInvalidEntryReservationSelection();
    this.markViewForCheck();
  }

  onEntryReservationSelectionChange(value: string | number | null | undefined): void {
    this.entryReservationId = value == null || value === '' ? null : String(value);
    if (this.entryReservationId) {
      const reservation = this.reservations.find(item => item.reservationId === this.entryReservationId);
      if (reservation?.propertyId) {
        this.entryPropertyId = reservation.propertyId;
      }
      if (reservation?.contactId && this.shouldShowEntryContact()) {
        this.entryContactId = reservation.contactId;
      }
    }

    this.markViewForCheck();
  }

  onEntryContactSelectionChange(value: string | number | null | undefined): void {
    this.entryContactId = value == null || value === '' ? null : String(value);
    this.markViewForCheck();
  }

  shouldShowEntryPropertyError(): boolean {
    if (!this.saveValidationHighlightActive) {
      return false;
    }

    if (!this.hasSelectedLineContextMode('accountsReceivable')
      && !this.hasSelectedLineContextMode('ownerPayable')) {
      return false;
    }

    return !this.normalizeLinePropertyId(this.entryPropertyId);
  }

  shouldShowEntryReservationError(): boolean {
    if (!this.saveValidationHighlightActive) {
      return false;
    }

    if (!this.hasSelectedLineContextMode('accountsReceivable')) {
      return false;
    }

    return !(this.entryReservationId || '').trim();
  }

  shouldShowEntryContactError(): boolean {
    if (!this.saveValidationHighlightActive) {
      return false;
    }

    if (!this.hasSelectedLineContextMode('accountsPayable')) {
      return false;
    }

    return !(this.entryContactId || '').trim();
  }

  getEntryContextSelectClass(field: 'property' | 'reservation' | 'contact'): string {
    const baseClass = 'split-editable-input split-account-select-control';
    const hasError = field === 'property'
      ? this.shouldShowEntryPropertyError()
      : field === 'reservation'
        ? this.shouldShowEntryReservationError()
        : this.shouldShowEntryContactError();
    return hasError ? `${baseClass} split-input-invalid` : baseClass;
  }

  syncEntryContextFromLines(): void {
    const sourceLine = this.getActiveEditableLines()[0]
      ?? this.editableLines.find(line => line.propertyId || line.reservationId || line.contactId)
      ?? this.editableLines[0];
    if (!sourceLine) {
      this.entryPropertyId = null;
      this.entryReservationId = null;
      this.entryContactId = null;
      return;
    }

    this.entryPropertyId = sourceLine.propertyId ?? null;
    this.entryReservationId = sourceLine.reservationId ?? null;
    this.entryContactId = sourceLine.contactId ?? null;
    this.applyEntryContextVisibilityRules();
  }

  applyEntryContextVisibilityRules(): void {
    if (!this.shouldShowEntryProperty()) {
      this.entryPropertyId = null;
    }

    if (!this.shouldShowEntryReservation()) {
      this.entryReservationId = null;
    }

    if (!this.shouldShowEntryContact()) {
      this.entryContactId = null;
    }

    this.clearInvalidEntryReservationSelection();
  }

  applyEntryContextToLines(): void {
    const propertyId = this.shouldShowEntryProperty()
      ? this.normalizeLinePropertyId(this.entryPropertyId)
      : null;
    const reservationId = this.shouldShowEntryReservation()
      ? ((this.entryReservationId || '').trim() || null)
      : null;
    const contactId = this.shouldShowEntryContact()
      ? ((this.entryContactId || '').trim() || null)
      : null;

    this.editableLines = this.editableLines.map(line => ({
      ...line,
      propertyId,
      reservationId,
      contactId
    }));
  }

  clearInvalidEntryReservationSelection(): void {
    if (!this.entryReservationId) {
      return;
    }

    const reservationIds = new Set(
      this.buildEntryReservationOptions().map(option => String(option.value))
    );
    if (!reservationIds.has(this.entryReservationId)) {
      this.entryReservationId = null;
    }
  }

  normalizeLinePropertyId(propertyId: string | null | undefined): string | null {
    const normalized = (propertyId || '').trim();
    return normalized || null;
  }

  getContactDropdownLabel(contact: ContactResponse): string {
    if (contact.entityTypeId === EntityType.Company) {
      return (contact.companyName || contact.displayName || contact.fullName || '').trim();
    }

    const personName = (`${contact.firstName || ''} ${contact.lastName || ''}`).trim();
    return personName || (contact.companyName || contact.displayName || contact.fullName || '').trim();
  }

  findContactById(contactId: string | null | undefined): ContactResponse | null {
    const normalized = (contactId || '').trim();
    if (!normalized) {
      return null;
    }

    return this.contacts.find(contact => contact.contactId === normalized) ?? null;
  }

  resolveContactLabel(contactId: string | null | undefined): string {
    const contact = this.findContactById(contactId);
    if (contact) {
      return this.getContactDropdownLabel(contact);
    }

    const line = this.journalEntry?.journalEntryLines?.find(item => item.contactId === contactId);
    return (line?.contactName || contactId || '').trim();
  }

  resolveReservationLabel(reservationId: string | null | undefined): string {
    const normalized = (reservationId || '').trim();
    if (!normalized) {
      return '';
    }

    const reservation = this.reservations.find(item => item.reservationId === normalized);
    if (reservation) {
      return this.utilityService.getReservationDropdownLabel(reservation, null);
    }

    const line = this.journalEntry?.journalEntryLines?.find(item => item.reservationId === normalized);
    return (line?.reservationCode || normalized).trim();
  }

  resolvePropertyLabel(propertyId: string | null | undefined): string {
    const normalized = this.normalizeLinePropertyId(propertyId);
    if (!normalized) {
      return 'Company';
    }

    const property = this.properties.find(item => item.propertyId === normalized);
    return (property?.propertyCode || normalized).trim();
  }

  ensureSelectedPropertyOption(
    options: SearchableSelectOption<string>[],
    selectedPropertyId: string | null | undefined
  ): SearchableSelectOption<string>[] {
    const normalized = this.normalizeLinePropertyId(selectedPropertyId);
    if (!normalized || options.some(option => String(option.value) === normalized)) {
      return options;
    }

    return [
      ...options,
      { value: normalized, label: this.resolvePropertyLabel(normalized) }
    ];
  }

  ensureSelectedReservationOption(
    options: SearchableSelectOption<string>[],
    selectedReservationId: string | null | undefined
  ): SearchableSelectOption<string>[] {
    const normalized = (selectedReservationId || '').trim();
    if (!normalized || options.some(option => String(option.value) === normalized)) {
      return options;
    }

    return [
      ...options,
      { value: normalized, label: this.resolveReservationLabel(normalized) }
    ];
  }

  ensureSelectedOption(
    options: SearchableSelectOption<string>[],
    selectedValue: string | null | undefined,
    selectedLabel: string
  ): SearchableSelectOption<string>[] {
    const normalized = (selectedValue || '').trim();
    if (!normalized || options.some(option => String(option.value) === normalized)) {
      return options.sort((left, right) =>
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
    }

    return [
      ...options,
      { value: normalized, label: selectedLabel || normalized }
    ].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
  }
  //#endregion

  //#region Get Methods
  getSourceTypeLabel(): string {
    if (this.isAddMode) {
      return getSourceTypeLabel(SourceType.Journal, SourceTypeLabels);
    }

    const sourceCode = (this.journalEntry?.sourceCode || '').trim();
    if (sourceCode) {
      return sourceCode;
    }

    return getSourceTypeLabel(this.journalEntry?.sourceTypeId, SourceTypeLabels);
  }

  getTotalDebitDisplay(): string {
    if (this.canEditLines) {
      return this.formatter.currency(this.getEditableTotalDebit());
    }

    const total = (this.journalEntry?.journalEntryLines ?? []).reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    return this.formatter.currency(total);
  }

  getTotalCreditDisplay(): string {
    if (this.canEditLines) {
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

    if (this.isAddMode) {
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
        if (shouldPost && !isJournalEntryPosted(updated.postingStatusId)) {
          const accountingPeriod = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().accountingPeriod) ?? updated.accountingPeriod;
          return this.generalLedgerService.postJournalEntry(updated.journalEntryId, accountingPeriod);
        }
        if (!shouldPost && isJournalEntryPosted(updated.postingStatusId)) {
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
    if (this.isAddMode) {
      return this.validateCreateForm();
    }

    if (this.canEditLines) {
      return this.validateEditableEditForm();
    }

    return this.validateEditForm();
  }

  validateEditableEditForm(): boolean {
    if (!this.journalEntry || !this.canEdit) {
      return false;
    }

    let isValid = true;
    this.form.get('transactionDate')?.setValidators(Validators.required);
    this.form.get('memo')?.setValidators(Validators.required);
    this.applyAccountingPeriodValidators();
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.shouldShowControlError(this.form.get('transactionDate'))) {
      isValid = false;
    }

    if (this.shouldShowControlError(this.form.get('accountingPeriod'))) {
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

    if (this.shouldShowEntryPropertyError()
      || this.shouldShowEntryReservationError()
      || this.shouldShowEntryContactError()) {
      isValid = false;
    }

    if (activeLines.length > 0
      && Math.abs(this.getEditableTotalDebit() - this.getEditableTotalCredit()) > 0.005) {
      this.linesBalanceValidationError = true;
      isValid = false;
    }

    return isValid;
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
    this.applyAccountingPeriodValidators();
    this.form.updateValueAndValidity({ emitEvent: false });

    if (this.shouldShowControlError(this.form.get('transactionDate'))) {
      isValid = false;
    }

    if (this.shouldShowControlError(this.form.get('accountingPeriod'))) {
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

    if (this.shouldShowEntryPropertyError()
      || this.shouldShowEntryReservationError()
      || this.shouldShowEntryContactError()) {
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

    this.applyAccountingPeriodValidators();
    this.form.updateValueAndValidity({ emitEvent: false });
    return !this.shouldShowControlError(this.form.get('accountingPeriod'));
  }

  applyAccountingPeriodValidators(): void {
    const accountingPeriodControl = this.form.get('accountingPeriod');
    if (!accountingPeriodControl) {
      return;
    }

    if (this.form.getRawValue().isPosted) {
      accountingPeriodControl.setValidators(Validators.required);
    } else {
      accountingPeriodControl.clearValidators();
    }
    accountingPeriodControl.updateValueAndValidity({ emitEvent: false });
  }

  shouldShowControlError(control: AbstractControl | null | undefined): boolean {
    if (!control) {
      return false;
    }

    return control.invalid && (control.touched || this.saveValidationHighlightActive);
  }

  shouldShowHeaderMemoError(): boolean {
    if (!this.canEditLines || !this.saveValidationHighlightActive) {
      return false;
    }

    return !this.hasMemoValue(this.form.getRawValue().memo);
  }

  shouldShowLineMemoError(line: EditableJournalEntryLine): boolean {
    if (!this.saveValidationHighlightActive || !this.shouldHighlightLineOnSave(line)) {
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

  shouldHighlightLineOnSave(line: EditableJournalEntryLine): boolean {
    if (!this.isLineEmpty(line)) {
      return true;
    }

    return this.getActiveEditableLines().length === 0;
  }

  shouldShowLineAccountError(line: EditableJournalEntryLine): boolean {
    if (!this.saveValidationHighlightActive || line.chartOfAccountId || !this.shouldHighlightLineOnSave(line)) {
      return false;
    }

    if (line.debit > 0 || line.credit > 0) {
      return true;
    }

    return !this.isLineEmpty(line) || this.getActiveEditableLines().length === 0;
  }

  shouldShowLineAmountError(line: EditableJournalEntryLine): boolean {
    if (!this.saveValidationHighlightActive || !this.shouldHighlightLineOnSave(line)) {
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
        if (shouldPost && !isJournalEntryPosted(created.postingStatusId)) {
          const accountingPeriod = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().accountingPeriod) ?? created.accountingPeriod;
          return this.generalLedgerService.postJournalEntry(created.journalEntryId, accountingPeriod);
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

    const transactionDate = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().transactionDate)
      ?? this.journalEntry.transactionDate;
    const accountingPeriod = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().accountingPeriod)
      ?? this.journalEntry.accountingPeriod;

    this.applyEntryContextToLines();
    const journalEntryLines: JournalEntryLineRequest[] = this.canEditLines
      ? this.getActiveEditableLines().map(line => ({
          journalEntryLineId: line.journalEntryLineId,
          journalEntryId: this.journalEntry!.journalEntryId,
          chartOfAccountId: Number(line.chartOfAccountId),
          costCodeId: line.costCodeId ?? null,
          propertyId: this.normalizeLinePropertyId(line.propertyId),
          reservationId: (line.reservationId || '').trim() || null,
          contactId: (line.contactId || '').trim() || null,
          debit: this.roundCurrencyValue(line.debit),
          credit: this.roundCurrencyValue(line.credit),
          memo: line.memo.trim() || null
        }))
      : (this.journalEntry.journalEntryLines ?? []).map(line => ({
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
        }));

    return {
      journalEntryId: this.journalEntry.journalEntryId,
      organizationId: this.journalEntry.organizationId,
      officeId: this.journalEntry.officeId,
      transactionDate,
      accountingPeriod,
      sourceTypeId: this.journalEntry.sourceTypeId ?? null,
      sourceId: this.journalEntry.sourceId ?? null,
      memo: this.form.getRawValue().memo?.trim() || null,
      postingStatusId: this.journalEntry.postingStatusId,
      isCashOnly: this.journalEntry.isCashOnly,
      journalEntryLines
    };
  }

  buildCreateRequest(): JournalEntryRequest | null {
    const officeId = this.officeId;
    if (!officeId || !this.organizationId) {
      return null;
    }

    const transactionDate = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().transactionDate);
    const shouldPost = !!this.form.getRawValue().isPosted;
    const accountingPeriodFromForm = this.utilityService.toDateOnlyJsonString(this.form.getRawValue().accountingPeriod);
    const accountingPeriod = accountingPeriodFromForm ?? (shouldPost ? null : transactionDate);
    if (!transactionDate || (shouldPost && !accountingPeriod)) {
      return null;
    }

    this.applyEntryContextToLines();
    const journalEntryLines: JournalEntryLineRequest[] = this.getActiveEditableLines().map(line => ({
      chartOfAccountId: Number(line.chartOfAccountId),
      debit: this.roundCurrencyValue(line.debit),
      credit: this.roundCurrencyValue(line.credit),
      memo: line.memo.trim() || null,
      costCodeId: line.costCodeId ?? null,
      propertyId: this.normalizeLinePropertyId(line.propertyId),
      reservationId: (line.reservationId || '').trim() || null,
      contactId: (line.contactId || '').trim() || null
    }));

    return {
      organizationId: this.organizationId,
      officeId,
      transactionDate,
      accountingPeriod,
      sourceTypeId: SourceType.Journal,
      sourceId: null,
      memo: this.form.getRawValue().memo?.trim() || null,
      postingStatusId: PostingStatus.Open,
      isCashOnly: false,
      journalEntryLines
    };
  }
  //#endregion

  //#region Build Form
  initializeView(): void {
    if (this.isAddMode) {
      this.resetForm();
      return;
    }

    // Always load by id for edit so account-filtered list prefetches (partial JE) cannot open incomplete/uneditable state.
    this.loadJournalEntry();
  }

  applyLoadedJournalEntry(journalEntry: JournalEntryResponse): void {
    this.isServiceError = false;
    this.journalEntry = journalEntry;
    this.syncFormFromJournalEntry();
    this.populateEditableLinesFromJournalEntry(journalEntry);
    this.applyLineDisplay();
    this.loadAccountingOfficeDefaults();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
    this.markViewForCheck();
  }

  populateEditableLinesFromJournalEntry(journalEntry: JournalEntryResponse): void {
    this.editableLineKeyCounter = 0;
    const lines = journalEntry.journalEntryLines ?? [];
    if (lines.length === 0) {
      this.editableLines = [this.createEditableLine(), this.createEditableLine()];
      this.syncEntryContextFromLines();
      return;
    }

    this.editableLines = lines.map(line => ({
      lineKey: `line-${++this.editableLineKeyCounter}`,
      journalEntryLineId: line.journalEntryLineId,
      chartOfAccountId: Number(line.chartOfAccountId) || null,
      debit: this.roundCurrencyValue(Number(line.debit || 0)),
      credit: this.roundCurrencyValue(Number(line.credit || 0)),
      memo: (line.memo || '').toString(),
      costCodeId: line.costCodeId ?? null,
      propertyId: line.propertyId ?? null,
      reservationId: line.reservationId ?? null,
      contactId: line.contactId ?? null
    }));
    this.syncEntryContextFromLines();
  }

  resetForm(): void {
    this.isServiceError = false;
    this.journalEntry = null;
    this.lineRows = [];
    this.editableLineKeyCounter = 0;
    this.saveValidationHighlightActive = false;
    this.linesBalanceValidationError = false;

    if (this.copyFromJournalEntry) {
      this.applyCreateFormFromCopy(this.copyFromJournalEntry);
      return;
    }

    this.editableLines = [this.createEditableLine(), this.createEditableLine()];
    this.entryPropertyId = null;
    this.entryReservationId = null;
    this.entryContactId = null;
    const today = new Date();
    this.form.reset({
      transactionDate: today,
      accountingPeriod: null,
      memo: '',
      isPosted: false
    });
    this.form.get('transactionDate')?.setValidators(Validators.required);
    this.form.get('memo')?.clearValidators();
    this.applyAccountingPeriodValidators();
    this.form.updateValueAndValidity({ emitEvent: false });
    this.form.enable();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
    this.markViewForCheck();
  }

  /** Seed a new (unsaved) journal entry from an existing one — no JE# / line ids. */
  applyCreateFormFromCopy(source: JournalEntryResponse): void {
    const lines = source.journalEntryLines ?? [];
    this.editableLines = lines.length > 0
      ? lines.map(line => ({
          lineKey: `line-${++this.editableLineKeyCounter}`,
          chartOfAccountId: Number(line.chartOfAccountId) || null,
          debit: this.roundCurrencyValue(Number(line.debit || 0)),
          credit: this.roundCurrencyValue(Number(line.credit || 0)),
          memo: (line.memo || '').toString(),
          costCodeId: line.costCodeId ?? null,
          propertyId: line.propertyId ?? null,
          reservationId: line.reservationId ?? null,
          contactId: line.contactId ?? null
        }))
      : [this.createEditableLine(), this.createEditableLine()];

    this.syncEntryContextFromLines();
    this.form.reset({
      transactionDate: this.utilityService.parseDateOnlyStringToDate(source.transactionDate) ?? new Date(),
      accountingPeriod: this.utilityService.parseDateOnlyStringToDate(source.accountingPeriod),
      memo: source.memo ?? '',
      isPosted: false
    });
    this.form.get('transactionDate')?.setValidators(Validators.required);
    this.form.get('memo')?.clearValidators();
    this.applyAccountingPeriodValidators();
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
      this.applyAccountingPeriodValidators();
      this.markViewForCheck();
    });

    this.form.get('memo')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(memo => {
      if (!this.isAddMode) {
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
    this.applyEntryContextVisibilityRules();
    this.markViewForCheck();
  }

  onEditableDebitChange(line: EditableJournalEntryLine, value: string | number): void {
    line.debit = this.roundCurrencyValue(Number(value || 0));
    if (line.debit > 0) {
      line.credit = 0;
    }
    this.applyEntryContextVisibilityRules();
    this.markViewForCheck();
  }

  onEditableCreditChange(line: EditableJournalEntryLine, value: string | number): void {
    line.credit = this.roundCurrencyValue(Number(value || 0));
    if (line.credit > 0) {
      line.debit = 0;
    }
    this.applyEntryContextVisibilityRules();
    this.markViewForCheck();
  }

  onAccountSelectionChange(lineKey: string, value: string | number | null | undefined): void {
    const line = this.editableLines.find(item => item.lineKey === lineKey);
    if (!line) {
      return;
    }

    const parsed = Number(value ?? 0);
    line.chartOfAccountId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    this.applyEntryContextVisibilityRules();
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
      return;
    }

    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyLineDisplay();
        this.markViewForCheck();
      });
    });

    this.propertyService.loadPropertyCodes().pipe(take(1)).subscribe(() => {
      this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe(properties => {
        this.properties = properties || [];
        this.markViewForCheck();
      });
    });

    this.reservationService.getReservationCodes().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: reservations => {
        this.reservations = reservations || [];
        this.markViewForCheck();
      },
      error: () => {
        this.reservations = [];
        this.markViewForCheck();
      }
    });

    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: contacts => {
        this.contacts = contacts || [];
        this.markViewForCheck();
      },
      error: () => {
        this.contacts = [];
        this.markViewForCheck();
      }
    });

    this.loadAccountingOfficeDefaults();
  }

  loadAccountingOfficeDefaults(): void {
    const officeId = this.effectiveOfficeId;
    if (!officeId) {
      this.accountingOfficeDefaults = null;
      this.markViewForCheck();
      return;
    }

    this.accountingOfficeService.getAccountingOfficeById(officeId).pipe(
      take(1),
      catchError(() => of(null))
    ).subscribe(office => {
      this.accountingOfficeDefaults = office;
      this.applyEntryContextVisibilityRules();
      this.markViewForCheck();
    });
  }

  loadJournalEntry(): void {
    if (this.isAddMode) {
      this.journalEntry = null;
      this.lineRows = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'journalEntry');
      this.markViewForCheck();
      return;
    }

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
        accountingPeriod: null,
        memo: '',
        isPosted: false
      });
      return;
    }

    this.form.reset({
      transactionDate: this.utilityService.parseDateOnlyStringToDate(this.journalEntry.transactionDate),
      accountingPeriod: this.utilityService.parseDateOnlyStringToDate(this.journalEntry.accountingPeriod),
      memo: this.journalEntry.memo ?? '',
      isPosted: isJournalEntryPosted(this.journalEntry.postingStatusId)
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
    const closedPeriodMessage = this.utilityService.getAccountingPeriodClosedErrorMessage(error);
    if (closedPeriodMessage) {
      this.toastr.error(closedPeriodMessage, 'Error');
      return;
    }

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
