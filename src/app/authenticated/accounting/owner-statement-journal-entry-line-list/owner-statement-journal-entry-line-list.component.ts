import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { OwnerStatementJournalEntryLineResponse, OwnerStatementJournalEntryLineSearchRequest } from '../models/owner-statement.model';
import { OwnerStatementService } from '../services/owner-statement.service';

@Component({
  selector: 'app-owner-statement-journal-entry-line-list',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './owner-statement-journal-entry-line-list.component.html',
  styleUrl: './owner-statement-journal-entry-line-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementJournalEntryLineListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() request: OwnerStatementJournalEntryLineSearchRequest | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();

  isPageReady = false;
  isServiceError = false;
  lines: OwnerStatementJournalEntryLineResponse[] = [];
  noDataMessage = 'No journal entries matched the selected owner statement value.';
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerStatementJournalEntryLines']));
  destroy$ = new Subject<void>();

  constructor(private ownerStatementService: OwnerStatementService, private formatter: FormatterService, private utilityService: UtilityService, private cdr: ChangeDetectorRef) {}

  //#region Owner-Statement-Journal-Entry-Lines
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadLines();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['request'] && !changes['request'].firstChange) || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)) {
      this.loadLines();
    }
  }

  loadLines(): void {
    if (!this.request || !this.request.officeIds?.length || !(this.request.ownerId || '').trim() || !this.request.metric) {
      this.lines = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementJournalEntryLines');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerStatementJournalEntryLines');
    this.ownerStatementService.searchOwnerStatementJournalEntryLines(this.request).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerStatementJournalEntryLines'))).subscribe({
      next: lines => {
        this.lines = lines || [];
        this.isServiceError = false;
        this.markViewForCheck();
      },
      error: () => {
        this.lines = [];
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  onLineSelect(line: OwnerStatementJournalEntryLineResponse): void {
    const journalEntryId = (line?.journalEntryId || '').trim();
    const journalEntryLineId = (line?.journalEntryLineId || '').trim();
    if (!journalEntryId || !journalEntryLineId) {
      return;
    }
    this.lineSelectEvent.emit({ journalEntryId, journalEntryLineId });
  }

  formatDate(value: string): string {
    return this.formatter.formatDateString(value);
  }

  formatAmount(amount: number): string {
    return this.formatter.currencyUsd(Number(amount) || 0);
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
