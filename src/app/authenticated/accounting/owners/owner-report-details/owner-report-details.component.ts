import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { OwnerReportJournalEntryLineResponse, OwnerReportJournalEntryLineSearchRequest, OwnerReportJournalEntryLineSelection } from '../../models/owner-report.model';
import { OwnerReportService } from '../../services/owner-report.service';

@Component({
  selector: 'app-owner-report-details',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './owner-report-details.component.html',
  styleUrl: './owner-report-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerReportDetailsComponent implements OnInit, OnChanges, OnDestroy {

  @Input() request: OwnerReportJournalEntryLineSearchRequest | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<OwnerReportJournalEntryLineSelection>();
  private ownerReportService = inject(OwnerReportService);
  private formatter = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  lines: OwnerReportJournalEntryLineResponse[] = [];
  noDataMessage = 'No journal entries matched the selected owner report value.';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerReportJournalEntryLines']));
  destroy$ = new Subject<void>();

  //#region Owner-Report-Details
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
  //#endregion

  //#region Form Response Methods
  onLineSelect(line: OwnerReportJournalEntryLineResponse): void {
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

  //#region Data Loading Methods
  loadLines(): void {
    if (!this.request || !this.request.officeIds?.length || !(this.request.ownerId || '').trim() || !this.request.metric) {
      this.lines = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerReportJournalEntryLines');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerReportJournalEntryLines');
    this.ownerReportService.searchOwnerReportJournalEntryLines(this.request).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerReportJournalEntryLines'))).subscribe({
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
