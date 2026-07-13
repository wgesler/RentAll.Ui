import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, catchError, finalize, map, of, Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DEFAULT_RECONCILE_VISIBLE_COLUMNS, RECONCILE_COLUMN_HEADERS, RECONCILE_TABLE_COLUMN_ORDER, ReconcileColumnKey, ReconcileColumnPreferencesState, ReconcileColumnsDialogResult, ReconcileLineDisplay, ReconcileSide } from '../models/reconcile.model';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { ReconcileColumnsDialogComponent } from './reconcile-columns-dialog.component';

interface ReconcileStickyFilterState {
  enabled: boolean;
  tableName: string;
  filterText: string;
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
  @Input() chartOfAccountId: number | null = null;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() leaveEvent = new EventEmitter<void>();

  readonly tableColumnOrder = RECONCILE_TABLE_COLUMN_ORDER;
  readonly tableName = 'reconcile-list';
  placeholderMessage = 'Select an Account to Reconcile.';
  filterVal = '';
  filterSticky = false;
  paymentsLines: ReconcileLineDisplay[] = [];
  depositsLines: ReconcileLineDisplay[] = [];
  paymentsVisibleColumns: ReconcileColumnKey[] = [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  depositsVisibleColumns: ReconcileColumnKey[] = [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  beginningBalance = 0;
  endingBalanceInput = '';
  serviceChargeInput = '';
  interestEarnedInput = '';
  showAdjustments = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$ = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  private readonly stickyFilterStorageKeyPrefix = 'rentall-datatable-sticky';
  private readonly columnPreferencesStorageKeyPrefix = 'rentall-reconcile-columns';

  constructor(
    private generalLedgerService: GeneralLedgerService,
    private authService: AuthService,
    private mappingService: MappingService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private dialog: MatDialog,
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
    return this.endingBalance - this.clearedBalance;
  }

  get isDifferenceZero(): boolean {
    return Math.abs(this.difference) < 0.005;
  }

  get canReconcileNow(): boolean {
    return this.isDifferenceZero && (this.endingBalanceInput.trim().length > 0 || this.clearedDepositsCount + this.clearedPaymentsCount > 0);
  }

  get isReconcileSelectPrompt(): boolean {
    return this.placeholderMessage === 'Select an Account to Reconcile.'
      || this.placeholderMessage === 'Select a Statement Date to Reconcile.';
  }

  get filteredPaymentsLines(): ReconcileLineDisplay[] {
    return this.filterLines(this.paymentsLines);
  }

  get filteredDepositsLines(): ReconcileLineDisplay[] {
    return this.filterLines(this.depositsLines);
  }

  getColumnHeader(columnKey: ReconcileColumnKey): string {
    return RECONCILE_COLUMN_HEADERS[columnKey];
  }

  isColumnVisible(side: ReconcileSide, columnKey: ReconcileColumnKey): boolean {
    const visibleColumns = side === 'payments' ? this.paymentsVisibleColumns : this.depositsVisibleColumns;
    return visibleColumns.includes(columnKey);
  }

  getVisibleColumnCount(side: ReconcileSide): number {
    const visibleColumns = side === 'payments' ? this.paymentsVisibleColumns : this.depositsVisibleColumns;
    return visibleColumns.length + 1;
  }

  getLineCellValue(line: ReconcileLineDisplay, columnKey: ReconcileColumnKey): string {
    switch (columnKey) {
      case 'date':
        return line.transactionDate;
      case 'type':
        return line.type;
      case 'checkRef':
        return line.checkRef;
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

  toggleAdjustments(): void {
    this.showAdjustments = !this.showAdjustments;
    this.markViewForCheck();
  }

  onEndingBalanceInputChange(value: string): void {
    this.endingBalanceInput = value;
    this.markViewForCheck();
  }

  onEndingBalanceFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

    const parsed = this.mappingService.parseCurrencyValue(this.endingBalanceInput);
    input.value = parsed === 0 ? '' : String(parsed);
    this.endingBalanceInput = input.value;
  }

  onEndingBalanceBlur(): void {
    this.endingBalanceInput = this.formatCurrencyInput(this.endingBalanceInput);
    this.markViewForCheck();
  }

  onServiceChargeInputChange(value: string): void {
    this.serviceChargeInput = value;
    this.markViewForCheck();
  }

  onServiceChargeFocus(event: FocusEvent): void {
    this.onCurrencyFieldFocus(event, this.serviceChargeInput);
  }

  onServiceChargeBlur(): void {
    this.serviceChargeInput = this.formatCurrencyInput(this.serviceChargeInput);
    this.markViewForCheck();
  }

  onInterestEarnedInputChange(value: string): void {
    this.interestEarnedInput = value;
    this.markViewForCheck();
  }

  onInterestEarnedFocus(event: FocusEvent): void {
    this.onCurrencyFieldFocus(event, this.interestEarnedInput);
  }

  onInterestEarnedBlur(): void {
    this.interestEarnedInput = this.formatCurrencyInput(this.interestEarnedInput);
    this.markViewForCheck();
  }

  formatCurrency(value: number): string {
    return this.formatterService.currencyUsd(value);
  }

  onReconcileNow(): void {
    if (!this.canReconcileNow) {
      return;
    }
    // Save cleared lines when backend support is added.
  }

  onLeave(): void {
    this.leaveEvent.emit();
  }
  //#endregion

  //#region Reconcile Columns Dialog Methods
  openColumnsDialog(): void {
    this.dialog.open(ReconcileColumnsDialogComponent, {
      width: '720px',
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
    this.showAdjustments = false;

    this.generalLedgerService.getReconcileBeginningBalance(this.officeId, this.chartOfAccountId, statementDate).pipe(
      takeUntil(this.destroy$),
      catchError(() => of(0))
    ).subscribe(beginningBalance => {
      this.beginningBalance = beginningBalance;
      this.markViewForCheck();
    });

    this.generalLedgerService.searchUnclearedJournalEntryLines(this.officeId, this.chartOfAccountId, statementDate).pipe(
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
        this.markViewForCheck();
      },
      error: () => {
        this.placeholderMessage = 'Unable to load uncleared journal entry lines.';
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

    const validColumns = RECONCILE_TABLE_COLUMN_ORDER.filter(key => columns.includes(key));
    return validColumns.length > 0 ? validColumns : [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  }
  //#endregion

  //#region Utility Methods
  private resetViewState(placeholderMessage = 'Select an Account to Reconcile.'): void {
    this.placeholderMessage = placeholderMessage;
    this.filterVal = '';
    this.beginningBalance = 0;
    this.endingBalanceInput = '';
    this.serviceChargeInput = '';
    this.interestEarnedInput = '';
    this.showAdjustments = false;
    this.paymentsLines = [];
    this.depositsLines = [];
    this.markViewForCheck();
  }

  private sumClearedAmounts(lines: ReconcileLineDisplay[]): number {
    return lines
      .filter(line => line.isCleared)
      .reduce((total, line) => total + line.amountValue, 0);
  }

  private formatCurrencyInput(value: string): string {
    const parsed = this.mappingService.parseCurrencyValue(value);
    return parsed === 0 && !value.trim() ? '' : this.formatterService.currencyUsd(parsed);
  }

  private onCurrencyFieldFocus(event: FocusEvent, currentValue: string): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) {
      return;
    }

    const parsed = this.mappingService.parseCurrencyValue(currentValue);
    input.value = parsed === 0 ? '' : String(parsed);
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
