import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { SourceType, isJournalEntrySourceNavigable } from '../models/accounting-enum';
import { JournalEntryLineListDisplay, JournalEntryRecapLineResponse, JournalEntryRecapRowDisplay } from '../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection } from '../models/owner-statement.model';
import { GeneralLedgerService } from '../services/general-ledger.service';
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
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() sourceLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();

  isPageReady = false;
  isServiceError = false;
  allLines: JournalEntryRecapLineResponse[] = [];
  rowsDisplay: JournalEntryRecapRowDisplay[] = [];
  noActivityMessage = 'No journal entry recap activity for the selected filters and date range.';

  displayedColumns: ColumnSet = {
    propertyCode: { displayAs: 'Property', maxWidth: '12ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '14ch' },
    source: { displayAs: 'Source', maxWidth: '15ch' },
    accountingPeriod: { displayAs: 'Period', maxWidth: '10ch' },
    journalEntryCode: { displayAs: 'Code', maxWidth: '14ch', sortType: 'natural' },
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    expectedIncome: { displayAs: 'Invoiced', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false },
    rentPlus4000: { displayAs: 'Rent+4000', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false },
    sdw: { displayAs: 'SDW', maxWidth: '10ch', alignment: 'right', headerAlignment: 'right', sort: false },
    fee: { displayAs: 'Fees', maxWidth: '10ch', alignment: 'right', headerAlignment: 'right', sort: false },
    payment: { displayAs: 'Payment', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false },
    prePayment: { displayAs: 'PrePay', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false },
    ownerRent: { displayAs: 'Owner Rent', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false },
    ownerExpense: { displayAs: 'Owner Exp', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false },
    ownerPayment: { displayAs: 'Owner Pay', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['recapLines']));
  destroy$ = new Subject<void>();

  constructor(
    private generalLedgerService: GeneralLedgerService,
    private journalEntrySourceService: JournalEntrySourceService,
    private mappingService: MappingService,
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
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadRecapLines();
    }

    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      this.loadRecapLines();
    }

    if (changes['reservationId'] && !changes['reservationId'].firstChange) {
      this.loadRecapLines();
    }

    if (changes['searchDateRange'] && !changes['searchDateRange'].firstChange) {
      this.loadRecapLines();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
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
  loadRecapLines(): void {
    const officeIds = this.officeId != null && this.officeId > 0 ? [this.officeId] : [];
    if (officeIds.length === 0) {
      this.allLines = [];
      this.rowsDisplay = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'recapLines');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'recapLines');
    this.generalLedgerService.searchJournalEntryRecap({
      officeIds,
      propertyId: this.propertyId?.trim() || null,
      reservationId: this.reservationId?.trim() || null,
      includeVoided: false,
      includeUnposted: true,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'recapLines'))).subscribe({
      next: lines => {
        this.allLines = lines || [];
        this.rowsDisplay = this.mappingService.mapJournalEntryRecapRowDisplay(this.allLines);
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Journal Entry Recap - error loading recap lines:', error);
        this.isServiceError = true;
        this.allLines = [];
        this.rowsDisplay = [];
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load journal entry recap: ${apiMessage}`
          : 'Unable to load journal entry recap.';
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
