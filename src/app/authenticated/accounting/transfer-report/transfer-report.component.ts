import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { BehaviorSubject, finalize, merge, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { SourceType, isJournalEntrySourceNavigable } from '../models/accounting-enum';
import { JournalEntryLineListDisplay, TransferReportRowDisplay } from '../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection } from '../models/owner-statement.model';
import { ReportService } from '../services/report.service';
import { JournalEntrySourceService } from '../services/journal-entry-source.service';

@Component({
  selector: 'app-transfer-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './transfer-report.component.html',
  styleUrls: ['./transfer-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TransferReportComponent implements OnInit, OnChanges, OnDestroy {
  @Input() officeId: number | null = null;
  @Input() searchDateRange: { startDate: string | null; endDate: string | null } | null = null;
  @Input() refreshTrigger = 0;
  @Output() lineSelectEvent = new EventEmitter<{ journalEntryId: string; journalEntryLineId: string }>();
  @Output() sourceLinkSelect = new EventEmitter<OwnerStatementActivityLinkSelection>();

  isPageReady = false;
  isServiceError = false;
  rowsDisplay: TransferReportRowDisplay[] = [];
  noActivityMessage = 'No unposted transfer report activity for the selected filters and date range.';

  displayedColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false, alignment: 'center' },
    propertyCode: { displayAs: 'Property', maxWidth: '12ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '14ch' },
    source: { displayAs: 'Source', maxWidth: '15ch' },
    accountingPeriod: { displayAs: 'Period', maxWidth: '10ch' },
    journalEntryCode: { displayAs: 'JEntry', maxWidth: '14ch', sortType: 'natural' },
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    expectedIncome: { displayAs: 'Invoiced', maxWidth: '12ch', alignment: 'right', sort: false },
    rentPlus4000: { displayAs: 'Rent/4000', maxWidth: '12ch', alignment: 'right', sort: false },
    ownerRent: { displayAs: 'OwnRent', maxWidth: '12ch', alignment: 'right', sort: false },
    business: { displayAs: 'Business', maxWidth: '12ch', alignment: 'right', sort: false },
    securityDeposit: { displayAs: 'SecDep', maxWidth: '10ch', alignment: 'right', sort: false },
    sdw: { displayAs: 'SDW', maxWidth: '10ch', alignment: 'right', sort: false },
    fee: { displayAs: 'Fees', maxWidth: '10ch', alignment: 'right', sort: false }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['transferLines']));
  destroy$ = new Subject<void>();
  private transferLinesLoadId = 0;
  private cancelTransferLinesLoad$ = new Subject<void>();

  constructor(
    private reportService: ReportService,
    private journalEntrySourceService: JournalEntrySourceService,
    private utilityService: UtilityService,
    private formatter: FormatterService,
    private cdr: ChangeDetectorRef
  ) {}

  //#region Transfer Report
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadTransferLines();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadTransferLines();
    }

    if (changes['searchDateRange'] && !changes['searchDateRange'].firstChange) {
      this.loadTransferLines();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadTransferLines();
    }
  }

  onRowSelect(row: TransferReportRowDisplay): void {
    if (!row?.journalEntryId) {
      return;
    }

    this.lineSelectEvent.emit({
      journalEntryId: row.journalEntryId,
      journalEntryLineId: row.journalEntryLineId || ''
    });
  }

  onTransfer(): void {
    // TODO: implement transfer workflow
  }

  onJournalEntryCodeClick(row: TransferReportRowDisplay): void {
    this.onRowSelect(row);
  }

  onSourceClick(row: TransferReportRowDisplay): void {
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

  private toJournalEntryLineListDisplay(row: TransferReportRowDisplay): JournalEntryLineListDisplay {
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
      isPosted: false,
      isVoided: false,
      sortDateValue: row.sortDateValue
    };
  }
  //#endregion

  //#region Data Loading Methods
  loadTransferLines(): void {
    const officeIds = this.officeId != null && this.officeId > 0 ? [this.officeId] : [];
    if (officeIds.length === 0) {
      this.rowsDisplay = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferLines');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.cancelTransferLinesLoad$.next();
    const loadId = ++this.transferLinesLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'transferLines');
    this.reportService.searchTransferReport({
      officeIds,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(
      take(1),
      takeUntil(merge(this.cancelTransferLinesLoad$, this.destroy$)),
      finalize(() => {
        if (this.transferLinesLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferLines');
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: report => {
        if (this.transferLinesLoadId !== loadId) {
          return;
        }
        this.rowsDisplay = report?.rows || [];
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (this.transferLinesLoadId !== loadId) {
          return;
        }
        console.error('Transfer Report - error loading transfer lines:', error);
        this.isServiceError = true;
        this.rowsDisplay = [];
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load transfer report: ${apiMessage}`
          : 'Unable to load transfer report.';
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Total Row Methods
  get totalsRow(): { [key: string]: string } | undefined {
    if (this.rowsDisplay.length === 0) {
      return undefined;
    }

    return {
      propertyCode: 'Totals:',
      expectedIncome: this.formatter.currencyUsd(this.sumColumn('expectedIncomeValue')),
      rentPlus4000: this.formatter.currencyUsd(this.sumColumn('rentPlus4000Value')),
      ownerRent: this.formatter.currencyUsd(this.sumColumn('ownerRentValue')),
      business: this.formatter.currencyUsd(this.sumColumn('businessValue')),
      securityDeposit: this.formatter.currencyUsd(this.sumColumn('securityDepositValue')),
      sdw: this.formatter.currencyUsd(this.sumColumn('sdwValue')),
      fee: this.formatter.currencyUsd(this.sumColumn('feeValue'))
    };
  }

  private sumColumn(columnName: keyof TransferReportRowDisplay): number {
    return this.rowsDisplay.reduce((sum, row) => sum + Number(row[columnName] || 0), 0);
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelTransferLinesLoad$.next();
    this.cancelTransferLinesLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
