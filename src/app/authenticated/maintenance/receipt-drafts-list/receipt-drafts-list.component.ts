import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { ReceiptDraftDisplayList, ReceiptDraftResponse, ReceiptDraftSourceFlags } from '../models/receipt-draft.model';
import { ReceiptDraftService } from '../services/receipt-draft.service';

@Component({
  standalone: true,
  selector: 'app-receipt-drafts-list',
  imports: [CommonModule, FormsModule, MaterialModule, DataTableComponent],
  templateUrl: './receipt-drafts-list.component.html',
  styleUrl: './receipt-drafts-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptDraftsListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() refreshTrigger = 0;
  @Output() draftSelect = new EventEmitter<string>();
  @Output() addDraft = new EventEmitter<void>();

  private receiptDraftService = inject(ReceiptDraftService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private formatter = inject(FormatterService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  organizationId = '';
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  includePromoted = false;
  isLoading = false;
  isServiceError = false;
  drafts: ReceiptDraftResponse[] = [];
  draftsDisplay: ReceiptDraftDisplayList[] = [];
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['drafts']));
  destroy$ = new Subject<void>();

  displayedColumns: ColumnSet = {
    draftCode: { displayAs: 'Draft', maxWidth: '12ch', sortType: 'natural' },
    receiptDate: { displayAs: 'Date', maxWidth: '12ch' },
    description: { displayAs: 'Description', maxWidth: '30ch' },
    amount: { displayAs: 'Amount', alignment: 'right', maxWidth: '12ch' },
    officeName: { displayAs: 'Office', maxWidth: '16ch' },
    bankCardDisplayName: { displayAs: 'Card', maxWidth: '16ch' },
    sourceLabels: { displayAs: 'Source', maxWidth: '16ch' },
    statusLabel: { displayAs: 'Status', maxWidth: '12ch' }
  };

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.cdr.markForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.officeService.getOffices(this.organizationId).pipe(takeUntil(this.destroy$)).subscribe({
      next: offices => {
        this.offices = offices || [];
        this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
          this.selectedOfficeId = officeId && officeId > 0 ? officeId : (this.offices[0]?.officeId ?? null);
          this.loadDrafts();
        });
      },
      error: () => {
        this.isServiceError = true;
        this.clearLoading('drafts');
        this.cdr.markForCheck();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadDrafts();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onAddDraft(): void {
    this.addDraft.emit();
  }

  onRowClick(row: ReceiptDraftDisplayList): void {
    if (row?.receiptDraftId) {
      this.draftSelect.emit(row.receiptDraftId);
    }
  }

  onIncludePromotedChange(): void {
    this.loadDrafts();
  }

  reload(): void {
    this.loadDrafts();
  }

  private loadDrafts(): void {
    const officeIds = this.getSearchOfficeIds();
    if (officeIds.length === 0) {
      this.drafts = [];
      this.draftsDisplay = [];
      this.clearLoading('drafts');
      this.cdr.markForCheck();
      return;
    }

    this.isLoading = true;
    this.isServiceError = false;
    this.addLoading('drafts');

    this.receiptDraftService.searchReceiptDrafts({
      officeIds,
      includePromoted: this.includePromoted
    }).pipe(
      finalize(() => {
        this.isLoading = false;
        this.clearLoading('drafts');
        this.cdr.markForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: drafts => {
        this.drafts = drafts || [];
        this.draftsDisplay = this.mapDisplayRows(this.drafts);
      },
      error: () => {
        this.isServiceError = true;
        this.toastr.error('Unable to load receipt drafts');
      }
    });
  }

  private mapDisplayRows(drafts: ReceiptDraftResponse[]): ReceiptDraftDisplayList[] {
    return (drafts || []).map(draft => ({
      receiptDraftId: draft.receiptDraftId,
      draftCode: draft.draftCode,
      receiptDate: draft.receiptDate ? this.formatter.formatDateString(draft.receiptDate) : '',
      description: (draft.description || '').trim(),
      amount: this.formatter.currency(Number(draft.amount ?? 0) || 0),
      officeName: draft.officeName || '',
      bankCardDisplayName: draft.bankCardDisplayName || '',
      sourceLabels: this.buildSourceLabels(draft),
      statusLabel: draft.isPromoted ? `Promoted (${draft.promotedReceiptCode || ''})` : 'Open',
      isPromoted: !!draft.isPromoted,
      rowColor: draft.isPromoted ? '#f5f5f5' : undefined
    }));
  }

  private buildSourceLabels(draft: ReceiptDraftResponse): string {
    const labels: string[] = [];
    if (draft.hasUploadSource) {
      labels.push('Upload');
    }
    if (draft.hasStatementImportSource) {
      labels.push('Statement');
    }
    return labels.join(', ');
  }

  private getSearchOfficeIds(): number[] {
    if (this.selectedOfficeId && this.selectedOfficeId > 0) {
      return [this.selectedOfficeId];
    }
    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  private addLoading(key: string): void {
    const next = new Set(this.itemsToLoad$.value);
    next.add(key);
    this.itemsToLoad$.next(next);
  }

  private clearLoading(key: string): void {
    const next = new Set(this.itemsToLoad$.value);
    next.delete(key);
    this.itemsToLoad$.next(next);
  }
}
