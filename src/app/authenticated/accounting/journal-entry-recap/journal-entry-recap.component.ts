import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { SourceType, isJournalEntrySourceNavigable } from '../models/accounting-enum';
import { JournalEntryLineListDisplay, JournalEntryRecapRowDisplay } from '../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection } from '../models/owner-statement.model';
import { OwnerReportsCacheService } from '../services/owner-reports-cache.service';
import { JournalEntrySourceService } from '../services/journal-entry-source.service';

@Component({
  selector: 'app-journal-entry-recap',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './journal-entry-recap.component.html',
  styleUrls: ['./journal-entry-recap.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JournalEntryRecapComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() sourceLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();

  isPageReady = false;
  isServiceError = false;
  rowsDisplay: JournalEntryRecapRowDisplay[] = [];
  noActivityMessage = 'Press Go to run the report.';
  private readonly noDataMessage = 'No journal entry recap activity for the selected filters and date range.';

  displayedColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false, alignment: 'center' },
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '12ch' },
    source: { displayAs: 'Source', maxWidth: '15ch' },
    journalEntryCode: { displayAs: 'JEntry', maxWidth: '14ch', sortType: 'natural' },
    accountingPeriod: { displayAs: 'Period', maxWidth: '10ch' },
    expectedIncome: { displayAs: 'Invoiced', maxWidth: '12ch', alignment: 'right', sort: false },
    rentPlus4000: { displayAs: 'Rent/4000', maxWidth: '12ch', alignment: 'right', sort: false },
    ownerRent: { displayAs: 'OwnRent', maxWidth: '12ch', alignment: 'right', sort: false },
    securityDeposit: { displayAs: 'SecDep', maxWidth: '10ch', alignment: 'right', sort: false },
    sdw: { displayAs: 'SDW', maxWidth: '10ch', alignment: 'right', sort: false },
    fee: { displayAs: 'Fees', maxWidth: '10ch', alignment: 'right', sort: false },
    payment: { displayAs: 'Payment', maxWidth: '12ch', alignment: 'right', sort: false },
    prePayment: { displayAs: 'PrePay', maxWidth: '12ch', alignment: 'right', sort: false },
    unPaid: { displayAs: 'UnPaid', maxWidth: '12ch', alignment: 'right', sort: false },
    ownerRentActual: { displayAs: 'OwnAct', maxWidth: '12ch', alignment: 'right', sort: false },
    ownerExpense: { displayAs: 'OwnExp', maxWidth: '12ch', alignment: 'right', sort: false },
    ownerPayment: { displayAs: 'OwnPay', maxWidth: '12ch', alignment: 'right', sort: false }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  constructor(
    private ownerReportsCacheService: OwnerReportsCacheService,
    private journalEntrySourceService: JournalEntrySourceService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Journal Entry Recap
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadRecapLines();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading'] || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)) {
      this.loadRecapLines();
    }
  }

  onRowSelect(row: JournalEntryRecapRowDisplay): void {
    if (!row?.journalEntryId) {
      return;
    }

    this.lineSelectEvent.emit({
      journalEntryId: row.journalEntryId,
      journalEntryLineId: row.journalEntryLineId || ''
    });
  }

  onJournalEntryCodeClick(row: JournalEntryRecapRowDisplay): void {
    this.onRowSelect(row);
  }

  onSourceClick(row: JournalEntryRecapRowDisplay): void {
    if (!row?.sourceLinkable || row.officeId == null) {
      return;
    }

    const navigate = (activityId: string | null) => {
      this.sourceLinkSelect.emit({
        activityId,
        activityCode: row.source,
        activityType: row.activityType,
        officeId: row.officeId!,
        propertyId: row.propertyId || ''
      });
    };

    if (
      row.sourceTypeId === SourceType.InvoicePayment
      && isJournalEntrySourceNavigable(row.sourceTypeId)
      && (row.sourceId || '').trim()
    ) {
      this.journalEntrySourceService.resolveSource(this.toJournalEntryLineListDisplay(row)).pipe(take(1)).subscribe({
        next: target => {
          if (target?.kind === 'invoice' && target.invoice?.invoiceId) {
            navigate(target.invoice.invoiceId);
            return;
          }

          navigate(row.sourceId || null);
        },
        error: () => navigate(row.sourceId || null)
      });
      return;
    }

    navigate(row.sourceId || null);
  }

  private toJournalEntryLineListDisplay(row: JournalEntryRecapRowDisplay): JournalEntryLineListDisplay {
    return {
      journalEntryLineId: row.journalEntryLineId || '',
      journalEntryId: row.journalEntryId || '',
      officeId: row.officeId || 0,
      transactionDate: row.transactionDate,
      journalEntryCode: row.journalEntryCode,
      source: row.source,
      sourceTypeId: row.sourceTypeId ?? null,
      sourceId: row.sourceId ?? null,
      sourceLinkable: row.sourceLinkable,
      propertyId: row.propertyId ?? null,
      propertyCode: row.propertyCode,
      reservationId: row.reservationId ?? null,
      reservationCode: row.reservationCode,
      contactId: null,
      contactName: '',
      account: '',
      description: '',
      journalEntryMemo: '',
      debit: '',
      credit: '',
      balance: '',
      debitValue: 0,
      creditValue: 0,
      balanceValue: 0,
      isPosted: true,
      isVoided: false,
      sortDateValue: row.sortDateValue
    };
  }
  //#endregion

  //#region Data Loading Methods
  clearRecapDisplay(): void {
    this.rowsDisplay = [];
    this.isServiceError = false;
    this.noActivityMessage = 'Loading journal entry recap...';
    this.markViewForCheck();
  }

  loadRecapLines(): void {
    if (this.isLoading) {
      this.clearRecapDisplay();
      return;
    }

    const officeIds = this.officeId != null && this.officeId > 0 ? [this.officeId] : [];
    if (officeIds.length === 0) {
      this.rowsDisplay = [];
      this.isServiceError = false;
      this.noActivityMessage = 'Select an office, then press Go to run the report.';
      this.markViewForCheck();
      return;
    }

    const recapRequest = {
      officeIds,
      propertyId: this.propertyId?.trim() || null,
      reservationId: this.reservationId?.trim() || null,
      includeVoided: false,
      includeUnposted: true,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    };

    if (!this.ownerReportsCacheService.matchesRecapSearchRequest(recapRequest)) {
      this.isServiceError = false;
      this.rowsDisplay = [];
      this.noActivityMessage = 'Press Go to run the report.';
      this.markViewForCheck();
      return;
    }

    const cachedReport = this.ownerReportsCacheService.getRecapReport();
    if (!cachedReport) {
      this.isServiceError = false;
      this.rowsDisplay = [];
      this.noActivityMessage = 'Press Go to run the report.';
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.rowsDisplay = this.applyRecapRowFilters(cachedReport.rows || []);
    this.noActivityMessage = this.noDataMessage;
    this.markViewForCheck();
  }

  private applyRecapRowFilters(rows: JournalEntryRecapRowDisplay[]): JournalEntryRecapRowDisplay[] {
    let filtered = rows;

    if (this.officeId != null && this.officeId > 0) {
      filtered = filtered.filter(row => row.officeId === this.officeId);
    }

    const reservationId = (this.reservationId || '').trim();
    if (reservationId) {
      filtered = filtered.filter(row => (row.reservationId || '').trim() === reservationId);
    }

    return filtered;
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
