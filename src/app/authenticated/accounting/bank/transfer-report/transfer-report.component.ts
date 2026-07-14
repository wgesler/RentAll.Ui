import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { BehaviorSubject, finalize, merge, Subject, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { SourceType, isJournalEntrySourceNavigable } from '../../models/accounting-enum';
import { JournalEntryLineListDisplay, TransferReportRowDisplay } from '../../models/journal-entry.model';
import { OwnerStatementActivityLinkSelection } from '../../models/owner-statement.model';
import { JournalEntrySourceService } from '../../services/journal-entry-source.service';
import { ReportService } from '../../services/report.service';

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
  private reportService = inject(ReportService);
  private journalEntrySourceService = inject(JournalEntrySourceService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  rowsDisplay: TransferReportRowDisplay[] = [];
  noActivityMessage = 'No transfer report activity for the selected office and date range.';

  readonly displayedColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false, alignment: 'center' },
    transactionDate: { displayAs: 'Date', maxWidth: '12ch' },
    propertyCode: { displayAs: 'Property', maxWidth: '12ch' },
    reservationCode: { displayAs: 'Reservation', maxWidth: '14ch' },
    source: { displayAs: 'Source', maxWidth: '15ch' },
    journalEntryCode: { displayAs: 'JEntry', maxWidth: '14ch', sortType: 'natural' },
    accountingPeriod: { displayAs: 'Period', maxWidth: '10ch', alignment: 'center' },
    expectedIncome: { displayAs: 'Invoiced', maxWidth: '12ch', alignment: 'right', sort: false },
    rentPlus4000: { displayAs: 'Owner Escrow', maxWidth: '14ch', alignment: 'right', sort: false },
    securityDeposit: { displayAs: 'SecDep Escrow', maxWidth: '14ch', alignment: 'right', sort: false },
    sdw: { displayAs: 'SDW Escrow', maxWidth: '14ch', alignment: 'right', sort: false },
    business: { displayAs: 'Business', maxWidth: '12ch', alignment: 'right', sort: false },
    balance: { displayAs: 'Balance', maxWidth: '12ch', alignment: 'right', sort: false }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['transferReport']));
  destroy$ = new Subject<void>();
  private transferReportLoadId = 0;
  private cancelTransferReportLoad$ = new Subject<void>();

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadTransferReport();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadTransferReport();
    }

    if (changes['searchDateRange'] && !changes['searchDateRange'].firstChange) {
      this.loadTransferReport();
    }

    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadTransferReport();
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

  get totalsRow(): { [key: string]: string } | undefined {
    if (this.rowsDisplay.length === 0) {
      return undefined;
    }

    const totalBalance = this.sumColumn('balanceValue');

    return {
      propertyCode: 'Totals:',
      expectedIncome: this.formatter.currencyUsd(this.sumColumn('expectedIncomeValue')),
      rentPlus4000: this.formatter.currencyUsd(this.sumColumn('rentPlus4000Value')),
      securityDeposit: this.formatter.currencyUsd(this.sumColumn('securityDepositValue')),
      sdw: this.formatter.currencyUsd(this.sumColumn('sdwValue')),
      business: this.formatter.currencyUsd(this.sumColumn('businessValue')),
      balance: this.formatter.currencyUsd(totalBalance)
    };
  }

  get totalsRowAlerts(): Record<string, boolean> {
    const totalBalance = this.sumColumn('balanceValue');
    return { balance: totalBalance !== 0 };
  }

  private loadTransferReport(): void {
    const officeIds = this.officeId != null && this.officeId > 0 ? [this.officeId] : [];
    if (officeIds.length === 0) {
      this.rowsDisplay = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.cancelTransferReportLoad$.next();
    const loadId = ++this.transferReportLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'transferReport');

    this.reportService.searchTransferReport({
      officeIds,
      startDate: this.searchDateRange?.startDate ?? null,
      endDate: this.searchDateRange?.endDate ?? null
    }).pipe(
      takeUntil(merge(this.cancelTransferReportLoad$, this.destroy$)),
      finalize(() => {
        if (this.transferReportLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: report => {
        if (this.transferReportLoadId !== loadId) {
          return;
        }

        this.rowsDisplay = (report?.rows || [])
          .filter(row => this.hasMeaningfulAmount(row))
          .sort((left, right) => {
            const dateCompare = (left.transactionDate || '').localeCompare(right.transactionDate || '');
            if (dateCompare !== 0) {
              return dateCompare;
            }

            return (left.source || '').localeCompare(right.source || '', undefined, { sensitivity: 'base' });
          });
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (this.transferReportLoadId !== loadId) {
          return;
        }

        console.error('Transfer Report - error loading transfer report:', error);
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

  private hasMeaningfulAmount(row: TransferReportRowDisplay): boolean {
    return row.expectedIncomeValue !== 0
      || row.rentPlus4000Value !== 0
      || row.ownerRentValue !== 0
      || row.ownerRentActualValue !== 0
      || row.businessValue !== 0
      || row.securityDepositValue !== 0
      || row.sdwValue !== 0
      || row.feeValue !== 0;
  }

  private sumColumn(columnName: keyof TransferReportRowDisplay): number {
    return this.rowsDisplay.reduce((sum, row) => sum + Number(row[columnName] || 0), 0);
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
      journalEntryMemo: '',
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

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.cancelTransferReportLoad$.next();
    this.cancelTransferReportLoad$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
}
