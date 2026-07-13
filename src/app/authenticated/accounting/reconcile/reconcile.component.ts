import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, finalize, map, Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DEFAULT_RECONCILE_VISIBLE_COLUMNS, RECONCILE_COLUMN_HEADERS, RECONCILE_TABLE_COLUMN_ORDER, ReconcileColumnKey, ReconcileColumnsDialogResult, ReconcileLineDisplay, ReconcileSide } from '../models/reconcile.model';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { ReconcileColumnsDialogComponent } from './reconcile-columns-dialog.component';

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

  readonly tableColumnOrder = RECONCILE_TABLE_COLUMN_ORDER;
  placeholderMessage = 'Select an Account to Reconcile.';
  filterVal = '';
  paymentsLines: ReconcileLineDisplay[] = [];
  depositsLines: ReconcileLineDisplay[] = [];
  paymentsVisibleColumns: ReconcileColumnKey[] = [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  depositsVisibleColumns: ReconcileColumnKey[] = [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$ = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private generalLedgerService: GeneralLedgerService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef) {}

  //#region Reconcile
  ngOnInit(): void {
    this.resetViewState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] || changes['chartOfAccountId'] || changes['searchDateRange'] || changes['refreshTrigger']) {
      this.loadJournalEntries();
    }
  }

  get showReconcileToolbar(): boolean {
    return !this.placeholderMessage;
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
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Data Load Methods
  loadJournalEntries(): void {
    if (this.officeId == null || this.officeId <= 0 || this.chartOfAccountId == null || this.chartOfAccountId <= 0) {
      this.resetViewState();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'reconcileLines');
    this.generalLedgerService.searchUnclearedJournalEntryLines(this.officeId, this.chartOfAccountId).pipe(
      takeUntil(this.destroy$),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reconcileLines'))
    ).subscribe({
      next: lines => {
        this.placeholderMessage = '';
        this.filterVal = '';
        this.paymentsLines = this.mappingService.mapReconcileLineDisplays(lines, 'debit');
        this.depositsLines = this.mappingService.mapReconcileLineDisplays(lines, 'credit');
        this.markViewForCheck();
      },
      error: () => {
        this.placeholderMessage = 'Unable to load uncleared journal entry lines.';
        this.filterVal = '';
        this.paymentsLines = [];
        this.depositsLines = [];
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Filter Methods
  onFilterInput(): void {
    this.markViewForCheck();
  }

  clearFilter(filterInput: HTMLInputElement): void {
    this.filterVal = '';
    filterInput.value = '';
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
  //#endregion

  //#region Utility Methods
  private resetViewState(): void {
    this.placeholderMessage = 'Select an Account to Reconcile.';
    this.filterVal = '';
    this.paymentsLines = [];
    this.depositsLines = [];
    this.markViewForCheck();
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
