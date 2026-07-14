import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, catchError, finalize, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DEFAULT_RECONCILE_VISIBLE_COLUMNS, RECONCILE_COLUMN_HEADERS, RECONCILE_CONFIGURABLE_COLUMN_ORDER, RECONCILE_DIALOG_COLUMN_ORDER, RECONCILE_FIXED_COLUMN_KEYS, RECONCILE_TABLE_COLUMN_ORDER, ReconcileColumnKey, ReconcileColumnPreferencesState, ReconcileColumnsDialogResult, ReconcileJournalEntryLineMark, ReconcileLineDisplay, ReconcileSide, BeginReconciliationDialogResult } from '../../models/reconcile.model';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { ReconcileDraftService } from '../../services/reconcile-draft.service';
import { ReconcileColumnsDialogComponent } from './reconcile-columns-dialog.component';

interface ReconcileStickyFilterState {
  enabled: boolean;
  tableName: string;
  filterText: string;
}

type ReconcileSortDirection = 'asc' | 'desc';

interface ReconcileSortState {
  column: ReconcileColumnKey | null;
  direction: ReconcileSortDirection;
}

@Component({
  selector: 'app-reconcile',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './reconcile.component.html',
  styleUrl: './reconcile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReconcileComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() organizationId = '';
  @Input() chartOfAccountId: number | null = null;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Input() setup: BeginReconciliationDialogResult | null = null;
  @Output() leaveEvent = new EventEmitter<void>();
  @Output() reconcileCompleteEvent = new EventEmitter<void>();
  @Output() modifyEvent = new EventEmitter<void>();

  readonly tableColumnOrder = RECONCILE_TABLE_COLUMN_ORDER;
  readonly tableName = 'reconcile-list';
  placeholderMessage = 'Select an Account to Reconcile.';
  filterVal = '';
  filterSticky = false;
  paymentsLines: ReconcileLineDisplay[] = [];
  depositsLines: ReconcileLineDisplay[] = [];
  paymentsVisibleColumns: ReconcileColumnKey[] = [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  depositsVisibleColumns: ReconcileColumnKey[] = [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  paymentsSort: ReconcileSortState = { column: null, direction: 'asc' };
  depositsSort: ReconcileSortState = { column: null, direction: 'asc' };
  beginningBalance = 0;
  endingBalanceInput = '';
  serviceChargeInput = '';
  interestEarnedInput = '';
  isSavingReconcile = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$ = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  private readonly stickyFilterStorageKeyPrefix = 'rentall-datatable-sticky';
  private readonly columnPreferencesStorageKeyPrefix = 'rentall-reconcile-columns';

  constructor(
    private generalLedgerService: GeneralLedgerService,
    private reconcileDraftService: ReconcileDraftService,
    private authService: AuthService,
    private mappingService: MappingService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private dialog: MatDialog,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef) {}

  //#region Reconcile
  ngOnInit(): void {
    this.resetViewState();
    this.applyStickyFilterFromStorage();
    this.applyColumnPreferencesFromStorage();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] || changes['chartOfAccountId'] || changes['searchDateRange'] || changes['refreshTrigger']) {
      this.loadJournalEntries();
    }
  }

  get showReconcileToolbar(): boolean {
    return !this.isReconcileSelectPrompt;
  }

  get showReconcileFooter(): boolean {
    return this.showReconcileToolbar && !this.placeholderMessage;
  }

  get clearedDepositsCount(): number {
    return this.depositsLines.filter(line => line.isCleared).length;
  }

  get clearedDepositsTotal(): number {
    return this.sumClearedAmounts(this.depositsLines);
  }

  get clearedPaymentsCount(): number {
    return this.paymentsLines.filter(line => line.isCleared).length;
  }

  get clearedPaymentsTotal(): number {
    return this.sumClearedAmounts(this.paymentsLines);
  }

  get endingBalance(): number {
    return this.mappingService.parseCurrencyValue(this.endingBalanceInput);
  }

  get serviceCharge(): number {
    return this.mappingService.parseCurrencyValue(this.serviceChargeInput);
  }

  get interestEarned(): number {
    return this.mappingService.parseCurrencyValue(this.interestEarnedInput);
  }

  get clearedBalance(): number {
    return this.beginningBalance
      + this.clearedDepositsTotal
      - this.clearedPaymentsTotal
      - this.serviceCharge
      + this.interestEarned;
  }

  get difference(): number {
    const value = this.endingBalance - this.clearedBalance;
    return Math.abs(value) < 0.005 ? 0 : value;
  }

  get isDifferenceZero(): boolean {
    return Math.abs(this.difference) < 0.005;
  }

  get canReconcileNow(): boolean {
    return this.isDifferenceZero && this.setup != null && !this.isSavingReconcile;
  }

  get canSaveReconcileMarks(): boolean {
    return this.setup != null
      && this.officeId != null
      && this.officeId > 0
      && this.chartOfAccountId != null
      && this.chartOfAccountId > 0
      && (this.paymentsLines.length > 0 || this.depositsLines.length > 0);
  }

  get isReconcileSelectPrompt(): boolean {
    return this.placeholderMessage === 'Select an Account to Reconcile.'
      || this.placeholderMessage === 'Select a Statement Date to Reconcile.';
  }

  get filteredPaymentsLines(): ReconcileLineDisplay[] {
    return this.sortLines(this.filterLines(this.paymentsLines), 'payments');
  }

  get filteredDepositsLines(): ReconcileLineDisplay[] {
    return this.sortLines(this.filterLines(this.depositsLines), 'deposits');
  }

  onSortColumn(side: ReconcileSide, columnKey: ReconcileColumnKey): void {
    const sortState = this.getSortState(side);
    if (sortState.column === columnKey) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.column = columnKey;
      sortState.direction = 'asc';
    }

    this.markViewForCheck();
  }

  getSortDirection(side: ReconcileSide, columnKey: ReconcileColumnKey): ReconcileSortDirection | null {
    const sortState = this.getSortState(side);
    return sortState.column === columnKey ? sortState.direction : null;
  }

  isSortActive(side: ReconcileSide, columnKey: ReconcileColumnKey): boolean {
    return this.getSortState(side).column === columnKey;
  }

  getColumnHeader(columnKey: ReconcileColumnKey): string {
    return RECONCILE_COLUMN_HEADERS[columnKey];
  }

  isColumnVisible(side: ReconcileSide, columnKey: ReconcileColumnKey): boolean {
    if (RECONCILE_FIXED_COLUMN_KEYS.includes(columnKey)) {
      return true;
    }

    const visibleColumns = side === 'payments' ? this.paymentsVisibleColumns : this.depositsVisibleColumns;
    return visibleColumns.includes(columnKey);
  }

  getVisibleColumnCount(side: ReconcileSide): number {
    const visibleColumns = side === 'payments' ? this.paymentsVisibleColumns : this.depositsVisibleColumns;
    return visibleColumns.length + RECONCILE_FIXED_COLUMN_KEYS.length + 1;
  }

  getLineCellValue(line: ReconcileLineDisplay, columnKey: ReconcileColumnKey): string {
    switch (columnKey) {
      case 'date':
        return line.transactionDate;
      case 'type':
        return line.type;
      case 'checkRef':
        return line.checkRef;
      case 'amount':
        return this.formatCurrency(line.amountValue);
      case 'payee':
        return line.payee;
      case 'memo':
        return line.memo;
      default:
        return '';
    }
  }

  onClearedChange(line: ReconcileLineDisplay, isCleared: boolean): void {
    line.isCleared = isCleared;
    this.markViewForCheck();
  }

  toggleCleared(line: ReconcileLineDisplay): void {
    this.onClearedChange(line, !line.isCleared);
  }

  markAll(): void {
    this.paymentsLines.forEach(line => { line.isCleared = true; });
    this.depositsLines.forEach(line => { line.isCleared = true; });
    this.markViewForCheck();
  }

  unmarkAll(): void {
    this.paymentsLines.forEach(line => { line.isCleared = false; });
    this.depositsLines.forEach(line => { line.isCleared = false; });
    this.markViewForCheck();
  }

  formatCurrency(value: number): string {
    return this.formatterService.currencyUsd(value);
  }

  onReconcileNow(): void {
    if (!this.canReconcileNow || this.isSavingReconcile) {
      return;
    }

    const request = this.buildCompleteReconcileRequest();
    if (!request) {
      this.toastr.error('Reconcile setup is incomplete.', CommonMessage.Error);
      return;
    }

    this.isSavingReconcile = true;
    this.generalLedgerService.completeReconcile(request).pipe(
      finalize(() => {
        this.isSavingReconcile = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success('Reconciliation completed.', 'Success');
        this.reconcileCompleteEvent.emit();
        this.leaveEvent.emit();
      },
      error: (error: HttpErrorResponse) => {
        const message = error.error?.message || error.message || 'Unable to complete reconciliation.';
        this.toastr.error(message, CommonMessage.Error);
      }
    });
  }

  onLeave(): void {
    if (this.isSavingReconcile) {
      return;
    }

    if (!this.canSaveReconcileDraft() && !this.canSaveReconcileMarks) {
      this.leaveEvent.emit();
      return;
    }

    this.isSavingReconcile = true;
    const persist$ = this.canSaveReconcileMarks
      ? this.saveReconcileMarks().pipe(switchMap(() => this.saveReconcileDraftOrSkip()))
      : this.saveReconcileDraftOrSkip();

    persist$.pipe(
      finalize(() => {
        this.isSavingReconcile = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.leaveEvent.emit();
      },
      error: (error: HttpErrorResponse) => {
        const message = error.error?.message || error.message || 'Unable to save reconcile state.';
        this.toastr.error(message, CommonMessage.Error);
      }
    });
  }

  onModify(): void {
    this.modifyEvent.emit();
  }
  //#endregion

  //#region Reconcile Columns Dialog Methods
  openColumnsDialog(): void {
    this.dialog.open(ReconcileColumnsDialogComponent, {
      width: '95vw',
      maxWidth: '56rem',
      maxHeight: '95vh',
      data: {
        paymentsVisibleColumns: [...this.paymentsVisibleColumns],
        depositsVisibleColumns: [...this.depositsVisibleColumns]
      }
    }).afterClosed().subscribe((result: ReconcileColumnsDialogResult | undefined) => {
      if (!result) {
        return;
      }

      this.paymentsVisibleColumns = [...result.paymentsVisibleColumns];
      this.depositsVisibleColumns = [...result.depositsVisibleColumns];
      this.persistColumnPreferences();
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Data Load Methods
  loadJournalEntries(): void {
    if (this.officeId == null || this.officeId <= 0 || this.chartOfAccountId == null || this.chartOfAccountId <= 0) {
      this.resetViewState('Select an Account to Reconcile.');
      return;
    }

    const statementDate = (this.searchDateRange?.endDate || '').trim();
    if (!statementDate) {
      this.resetViewState('Select a Statement Date to Reconcile.');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'reconcileLines');
    this.beginningBalance = 0;
    this.endingBalanceInput = '';
    this.serviceChargeInput = '';
    this.interestEarnedInput = '';

    this.generalLedgerService.getReconcileBeginningBalance(this.officeId, this.chartOfAccountId, statementDate).pipe(
      takeUntil(this.destroy$),
      catchError(() => of(0))
    ).subscribe(beginningBalance => {
      this.beginningBalance = beginningBalance;
      this.markViewForCheck();
    });

    this.generalLedgerService.searchReconcileJournalEntryLines(this.officeId, this.chartOfAccountId, statementDate).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reconcileLines'))
    ).subscribe({
      next: lines => {
        this.placeholderMessage = '';
        if (!this.filterSticky) {
          this.filterVal = '';
        }
        this.paymentsLines = this.mappingService.mapReconcileLineDisplays(lines, 'credit');
        this.depositsLines = this.mappingService.mapReconcileLineDisplays(lines, 'debit');
        this.applySetupValues();
        this.markViewForCheck();
      },
      error: () => {
        this.placeholderMessage = 'Unable to load reconcile journal entry lines.';
        if (!this.filterSticky) {
          this.filterVal = '';
        }
        this.paymentsLines = [];
        this.depositsLines = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  onFilterInput(): void {
    if (this.filterSticky) {
      this.persistStickyFilter();
    }
    this.markViewForCheck();
  }

  onStickyFilterToggle(): void {
    this.filterSticky = !this.filterSticky;
    if (this.filterSticky) {
      this.persistStickyFilter();
    } else {
      this.clearStickyStorage();
    }
    this.markViewForCheck();
  }

  clearFilter(filterInput: HTMLInputElement): void {
    this.filterVal = '';
    filterInput.value = '';
    if (this.filterSticky) {
      this.persistStickyFilter();
    }
    this.markViewForCheck();
  }

  private filterLines(lines: ReconcileLineDisplay[]): ReconcileLineDisplay[] {
    const term = (this.filterVal || '').trim().toLowerCase();
    if (!term) {
      return lines;
    }

    return lines.filter(line => this.lineMatchesFilter(line, term));
  }

  private lineMatchesFilter(line: ReconcileLineDisplay, term: string): boolean {
    const haystack = [
      line.transactionDate,
      line.type,
      line.checkRef,
      this.formatCurrency(line.amountValue),
      line.payee,
      line.memo
    ].join(' ').toLowerCase();

    return haystack.includes(term);
  }

  private applyStickyFilterFromStorage(): boolean {
    const stored = this.readStickyFromStorage();
    if (!stored?.enabled) {
      this.filterSticky = false;
      return false;
    }

    this.filterSticky = true;
    this.filterVal = stored.filterText ?? '';
    return true;
  }

  private persistStickyFilter(): void {
    if (!this.filterSticky) {
      return;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return;
    }

    const payload: ReconcileStickyFilterState = {
      enabled: true,
      tableName: this.tableName,
      filterText: this.filterVal ?? ''
    };

    localStorage.setItem(this.getStickyStorageKey(userId), JSON.stringify(payload));
  }

  private readStickyFromStorage(): ReconcileStickyFilterState | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return null;
    }

    const rawValue = localStorage.getItem(this.getStickyStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<ReconcileStickyFilterState>;
      if (parsed?.enabled !== true || parsed.tableName !== this.tableName) {
        return null;
      }

      return {
        enabled: true,
        tableName: this.tableName,
        filterText: String(parsed.filterText ?? '')
      };
    } catch {
      return null;
    }
  }

  private clearStickyStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return;
    }

    localStorage.removeItem(this.getStickyStorageKey(userId));
  }

  private getStickyStorageKey(userId: string): string {
    return `${this.stickyFilterStorageKeyPrefix}-${userId}-${this.tableName}`;
  }

  private applyColumnPreferencesFromStorage(): void {
    const stored = this.readColumnPreferencesFromStorage();
    if (!stored) {
      return;
    }

    this.paymentsVisibleColumns = stored.paymentsVisibleColumns;
    this.depositsVisibleColumns = stored.depositsVisibleColumns;
  }

  private persistColumnPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return;
    }

    const payload: ReconcileColumnPreferencesState = {
      tableName: this.tableName,
      paymentsVisibleColumns: this.paymentsVisibleColumns,
      depositsVisibleColumns: this.depositsVisibleColumns
    };

    localStorage.setItem(this.getColumnPreferencesStorageKey(userId), JSON.stringify(payload));
  }

  private readColumnPreferencesFromStorage(): ReconcileColumnPreferencesState | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const userId = this.authService.getUser()?.userId?.trim();
    if (!userId) {
      return null;
    }

    const rawValue = localStorage.getItem(this.getColumnPreferencesStorageKey(userId));
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<ReconcileColumnPreferencesState>;
      if (parsed?.tableName !== this.tableName) {
        return null;
      }

      return {
        tableName: this.tableName,
        paymentsVisibleColumns: this.normalizeVisibleColumns(parsed.paymentsVisibleColumns),
        depositsVisibleColumns: this.normalizeVisibleColumns(parsed.depositsVisibleColumns)
      };
    } catch {
      return null;
    }
  }

  private getColumnPreferencesStorageKey(userId: string): string {
    return `${this.columnPreferencesStorageKeyPrefix}-${userId}-${this.tableName}`;
  }

  private normalizeVisibleColumns(columns: unknown): ReconcileColumnKey[] {
    if (!Array.isArray(columns)) {
      return [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
    }

    const validColumns = RECONCILE_CONFIGURABLE_COLUMN_ORDER.filter(key => columns.includes(key));
    return validColumns.length > 0 ? validColumns : [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  }
  //#endregion

  //#region Utility Methods
  private applySetupValues(): void {
    if (!this.setup) {
      return;
    }

    if (this.setup.chartOfAccountId !== this.chartOfAccountId) {
      return;
    }

    const statementDate = (this.searchDateRange?.endDate || '').trim();
    if (this.setup.statementDate !== statementDate) {
      return;
    }

    this.beginningBalance = this.setup.beginningBalance;
    this.endingBalanceInput = this.setup.endingBalance === 0 ? '' : this.formatCurrencyInput(String(this.setup.endingBalance));
    this.serviceChargeInput = Math.abs(this.setup.serviceCharge) < 0.005 ? '' : this.formatCurrencyInput(String(this.setup.serviceCharge));
    this.interestEarnedInput = Math.abs(this.setup.interestEarned) < 0.005 ? '' : this.formatCurrencyInput(String(this.setup.interestEarned));
  }

  private resetViewState(placeholderMessage = 'Select an Account to Reconcile.'): void {
    this.placeholderMessage = placeholderMessage;
    this.filterVal = '';
    this.paymentsSort = { column: null, direction: 'asc' };
    this.depositsSort = { column: null, direction: 'asc' };
    this.beginningBalance = 0;
    this.endingBalanceInput = '';
    this.serviceChargeInput = '';
    this.interestEarnedInput = '';
    this.paymentsLines = [];
    this.depositsLines = [];
    this.markViewForCheck();
  }

  private sumClearedAmounts(lines: ReconcileLineDisplay[]): number {
    return lines
      .filter(line => line.isCleared)
      .reduce((total, line) => total + line.amountValue, 0);
  }

  private sortLines(lines: ReconcileLineDisplay[], side: ReconcileSide): ReconcileLineDisplay[] {
    const sortState = this.getSortState(side);
    if (!sortState.column) {
      return lines;
    }

    const directionMultiplier = sortState.direction === 'asc' ? 1 : -1;
    return [...lines].sort((left, right) => {
      const comparison = this.compareLinesByColumn(left, right, sortState.column!);
      if (comparison !== 0) {
        return comparison * directionMultiplier;
      }

      return left.journalEntryLineId.localeCompare(right.journalEntryLineId);
    });
  }

  private compareLinesByColumn(left: ReconcileLineDisplay, right: ReconcileLineDisplay, columnKey: ReconcileColumnKey): number {
    switch (columnKey) {
      case 'date':
        return (left.transactionDateSortValue || '').localeCompare(right.transactionDateSortValue || '');
      case 'amount':
        return left.amountValue - right.amountValue;
      case 'type':
        return (left.type || '').localeCompare(right.type || '', undefined, { sensitivity: 'base' });
      case 'checkRef':
        return (left.checkRef || '').localeCompare(right.checkRef || '', undefined, { sensitivity: 'base' });
      case 'payee':
        return (left.payee || '').localeCompare(right.payee || '', undefined, { sensitivity: 'base' });
      case 'memo':
        return (left.memo || '').localeCompare(right.memo || '', undefined, { sensitivity: 'base' });
      default:
        return 0;
    }
  }

  private getSortState(side: ReconcileSide): ReconcileSortState {
    return side === 'payments' ? this.paymentsSort : this.depositsSort;
  }

  private buildReconcileLineMarks(): ReconcileJournalEntryLineMark[] {
    return [...this.paymentsLines, ...this.depositsLines].map(line => ({
      journalEntryLineId: line.journalEntryLineId,
      isCleared: line.isCleared
    }));
  }

  private saveReconcileMarks() {
    const request = this.buildSaveReconcileMarksRequest();
    if (!request) {
      return of(void 0);
    }

    return this.generalLedgerService.saveReconcileMarks(request);
  }

  private canSaveReconcileDraft(): boolean {
    return this.setup != null && this.officeId != null && this.officeId > 0;
  }

  private saveReconcileDraftOrSkip() {
    if (!this.canSaveReconcileDraft() || !this.setup || this.officeId == null) {
      return of(void 0);
    }

    const request = this.reconcileDraftService.buildSaveReconcileDraftRequestFromSetup(this.officeId, this.setup);
    return this.reconcileDraftService.saveReconcileDraft(request).pipe(map(() => void 0));
  }

  private buildSaveReconcileMarksRequest() {
    if (!this.canSaveReconcileMarks || this.officeId == null || this.chartOfAccountId == null) {
      return null;
    }

    return {
      officeId: this.officeId,
      chartOfAccountId: this.chartOfAccountId,
      lines: this.buildReconcileLineMarks()
    };
  }

  private buildCompleteReconcileRequest() {
    if (!this.setup || this.officeId == null || this.chartOfAccountId == null) {
      return null;
    }

    const statementDate = (this.setup.statementDate || '').trim();
    if (!statementDate) {
      return null;
    }

    return {
      officeId: this.officeId,
      chartOfAccountId: this.chartOfAccountId,
      lines: this.buildReconcileLineMarks(),
      endingBalance: this.setup.endingBalance,
      statementDate
    };
  }

  private formatCurrencyInput(value: string): string {
    const parsed = this.mappingService.parseCurrencyValue(value);
    return parsed === 0 && !value.trim() ? '' : this.formatterService.currencyUsd(parsed);
  }

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
