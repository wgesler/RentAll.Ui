import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { TransferFlatReportAccountIds, TransferFlatReportRowDisplay, TransferResponse } from '../../models/transfer.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { TransferService } from '../../services/transfer.service';

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
  @Input() transferId: string | null = null;
  @Input() prefetchedTransfer: TransferResponse | null = null;
  @Input() refreshTrigger = 0;
  private transferService = inject(TransferService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  rowsDisplay: TransferFlatReportRowDisplay[] = [];
  noActivityMessage = 'No transfer detail lines for the selected transfer.';
  displayedColumns: ColumnSet = this.buildDefaultColumns();
  accountingOffices: AccountingOfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  private currentTransfer: TransferResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['transferReport']));
  destroy$ = new Subject<void>();
  private transferReportLoadId = 0;

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadAccountingOffices();
    this.loadChartOfAccounts();
    this.loadTransferReport();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['transferId'] && !changes['transferId'].firstChange)
      || (changes['prefetchedTransfer'] && !changes['prefetchedTransfer'].firstChange)
      || (changes['officeId'] && !changes['officeId'].firstChange)
      || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)) {
      this.loadTransferReport();
    }
  }

  get totalsRow(): { [key: string]: string } | undefined {
    if (this.rowsDisplay.length === 0) {
      return undefined;
    }

    const escrowDeposit = this.sumColumn('escrowDepositValue');
    const business = this.sumColumn('businessValue');
    const ownerEscrow = this.sumColumn('ownerEscrowValue');
    const secDep = this.sumColumn('secDepValue');
    const sdw = this.sumColumn('sdwValue');
    const rowTotal = this.sumColumn('rowTotalValue');
    const outOfBalance = this.roundCurrency(escrowDeposit - (business + ownerEscrow + secDep + sdw));

    return {
      propertyCode: 'Totals:',
      escrowDeposit: this.formatter.currencyUsd(escrowDeposit),
      business: this.formatter.currencyUsd(business),
      ownerEscrow: this.formatter.currencyUsd(ownerEscrow),
      secDep: this.formatter.currencyUsd(secDep),
      sdw: this.formatter.currencyUsd(sdw),
      rowTotal: this.formatter.currencyUsd(rowTotal),
      outOfBalance: this.formatter.currencyUsd(outOfBalance)
    };
  }

  get totalsRowAlerts(): Record<string, boolean> {
    const escrowDeposit = this.sumColumn('escrowDepositValue');
    const destinations = this.sumColumn('businessValue')
      + this.sumColumn('ownerEscrowValue')
      + this.sumColumn('secDepValue')
      + this.sumColumn('sdwValue');
    return { outOfBalance: this.roundCurrency(escrowDeposit - destinations) !== 0 };
  }

  private loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.accountingOffices = offices || [];
          if (this.currentTransfer) {
            this.applyTransfer(this.currentTransfer);
            return;
          }
          this.applyColumnHeaders();
          this.markViewForCheck();
        });
      }
    });
  }

  private loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
          this.chartOfAccounts = accounts || [];
          if (this.currentTransfer) {
            this.applyTransfer(this.currentTransfer);
            return;
          }
          this.applyColumnHeaders();
          this.markViewForCheck();
        });
      }
    });
  }

  private loadTransferReport(): void {
    const transferId = (this.transferId || '').trim();
    if (!transferId) {
      this.rowsDisplay = [];
      this.isServiceError = false;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
      this.markViewForCheck();
      return;
    }

    if (this.prefetchedTransfer && (this.prefetchedTransfer.transferId || '').trim() === transferId) {
      this.applyTransfer(this.prefetchedTransfer);
      return;
    }

    this.isServiceError = false;
    const loadId = ++this.transferReportLoadId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'transferReport');

    this.transferService.getTransferById(transferId).pipe(
      take(1),
      finalize(() => {
        if (this.transferReportLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: transfer => {
        if (this.transferReportLoadId !== loadId) {
          return;
        }
        this.applyTransfer(transfer);
      },
      error: (error: HttpErrorResponse) => {
        if (this.transferReportLoadId !== loadId) {
          return;
        }
        console.error('Transfer Report - error loading transfer:', error);
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

  private applyTransfer(transfer: TransferResponse): void {
    this.currentTransfer = transfer;
    this.applyColumnHeaders(transfer);
    const accountIds = this.resolveAccountIds(transfer);
    this.rowsDisplay = this.mappingService.mapTransferToFlatReportRows(transfer, accountIds);
    this.isServiceError = false;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'transferReport');
    this.markViewForCheck();
  }

  private resolveAccountIds(transfer?: TransferResponse | null): TransferFlatReportAccountIds {
    const officeId = transfer?.officeId ?? this.officeId ?? 0;
    const accountingOffice = this.accountingOffices.find(office => Number(office.officeId) === officeId);
    return {
      escrowDepositAccountId: transfer?.bankAccountId
        ?? accountingOffice?.defaultEscrowDepositAccountId
        ?? null,
      businessAccountId: accountingOffice?.defaultBankAccountId ?? null,
      ownersAccountId: accountingOffice?.defaultEscrowOwnersAccountId ?? null,
      secDepAccountId: accountingOffice?.defaultEscrowSecDepAccountId ?? null,
      sdwAccountId: accountingOffice?.defaultEscrowSdwAccountId ?? null
    };
  }

  private applyColumnHeaders(transfer?: TransferResponse | null): void {
    const accountIds = this.resolveAccountIds(transfer ?? this.currentTransfer);
    const columns = this.buildDefaultColumns();
    this.applyAccountColumnHeader(columns, 'escrowDeposit', accountIds.escrowDepositAccountId, 'Escrow Deposits');
    this.applyAccountColumnHeader(columns, 'business', accountIds.businessAccountId, 'Business');
    this.applyAccountColumnHeader(columns, 'ownerEscrow', accountIds.ownersAccountId, 'Owner Escrow');
    this.applyAccountColumnHeader(columns, 'secDep', accountIds.secDepAccountId, 'Sec Dep');
    this.applyAccountColumnHeader(columns, 'sdw', accountIds.sdwAccountId, 'SDW Escrow');
    this.displayedColumns = columns;
  }

  private applyAccountColumnHeader(columns: ColumnSet, columnName: string, accountId: number | null | undefined, defaultLabel: string): void {
    const resolved = this.resolveAccountHeader(accountId, defaultLabel);
    const nameLines = this.splitAccountNameForHeader(resolved.accountName);
    columns[columnName].displayAs = resolved.accountNo;
    columns[columnName].headerLine2 = nameLines.line2;
    columns[columnName].headerLine3 = nameLines.line3;
  }

  private resolveAccountHeader(accountId: number | null | undefined, defaultLabel: string): { accountNo: string; accountName: string } {
    const id = Number(accountId ?? 0);
    if (!(id > 0)) {
      return { accountNo: defaultLabel, accountName: '' };
    }
    const account = this.chartOfAccounts.find(item => Number(item.accountId) === id);
    if (!account) {
      return { accountNo: defaultLabel, accountName: '' };
    }
    const accountNo = String(account.accountNo ?? '').trim() || defaultLabel;
    const accountName = String(account.name ?? '').trim();
    return { accountNo, accountName };
  }

  private splitAccountNameForHeader(name: string): { line2: string; line3: string } {
    const words = this.tokenizeAccountNameForHeader(name);
    if (words.length === 0) {
      return { line2: '', line3: '' };
    }
    if (words.length === 1) {
      return { line2: words[0], line3: '' };
    }

    let bestSplit = 1;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let index = 1; index < words.length; index++) {
      if (words[index] === '-' || words[index].startsWith('-')) {
        continue;
      }
      const left = words.slice(0, index).join(' ');
      const right = words.slice(index).join(' ');
      const diff = Math.abs(left.length - right.length);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestSplit = index;
      }
    }

    return {
      line2: words.slice(0, bestSplit).join(' '),
      line3: words.slice(bestSplit).join(' ')
    };
  }

  private tokenizeAccountNameForHeader(name: string): string[] {
    const rawWords = (name || '').trim().split(/\s+/).filter(word => word.length > 0);
    const words: string[] = [];
    for (const word of rawWords) {
      if ((word === '-' || word === '–' || word === '—') && words.length > 0) {
        words[words.length - 1] = `${words[words.length - 1]} ${word}`;
        continue;
      }
      if ((word.startsWith('-') || word.startsWith('–') || word.startsWith('—')) && words.length > 0) {
        words[words.length - 1] = `${words[words.length - 1]} ${word}`;
        continue;
      }
      words.push(word);
    }
    return words;
  }

  private buildDefaultColumns(): ColumnSet {
    return {
      transferDate: { displayAs: 'Date', maxWidth: '12ch', wrap: false },
      propertyCode: { displayAs: 'Property', maxWidth: '14ch', wrap: false },
      folio: { displayAs: 'Reservation', maxWidth: '14ch', wrap: false, sortType: 'natural' },
      dateRange: { displayAs: 'Description', maxWidth: '24ch', wrap: true },
      escrowDeposit: { displayAs: 'Escrow Deposits', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
      business: { displayAs: 'Business', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
      ownerEscrow: { displayAs: 'Owner Escrow', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
      secDep: { displayAs: 'Sec Dep', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
      sdw: { displayAs: 'SDW Escrow', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
      rowTotal: { displayAs: 'Total', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false },
      outOfBalance: { displayAs: 'Out of Balance', maxWidth: '12ch', alignment: 'center', headerAlignment: 'center', sort: false }
    };
  }

  private sumColumn(columnName: keyof TransferFlatReportRowDisplay): number {
    return this.roundCurrency(this.rowsDisplay.reduce((sum, row) => sum + Number(row[columnName] || 0), 0));
  }

  private roundCurrency(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
}
