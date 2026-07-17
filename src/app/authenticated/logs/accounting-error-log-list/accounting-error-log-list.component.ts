import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { SourceTypeLabels, getSourceTypeLabel } from '../../accounting/models/accounting-enum';
import { AccountingErrorLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-accounting-error-log-list',
  templateUrl: './accounting-error-log-list.component.html',
  styleUrl: './accounting-error-log-list.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class AccountingErrorLogListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() reloadToken = 0;
  @Output() openAccountingErrorLog = new EventEmitter<AccountingErrorLogResponse>();
  @Output() listActionCompleted = new EventEmitter<void>();
  private logService = inject(LogService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  rows: Array<AccountingErrorLogResponse & { amountDisplay: string; accountingPeriodDisplay: string; createdOnDate: string }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    sourceType: { displayAs: 'Source', maxWidth: '16ch' },
    documentCode: { displayAs: 'Document', maxWidth: '16ch' },
    accountingPeriodDisplay: { displayAs: 'Period', maxWidth: '12ch' },
    amountDisplay: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'left', headerAlignment: 'left' },
    message: { displayAs: 'Message', maxWidth: '100ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '12ch' }
  };

  //#region Accounting-Error-Log-List
  ngOnInit(): void {
    this.loadAccountingErrorLogs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reloadToken'] || changes['reloadToken'].firstChange) {
      return;
    }

    this.loadAccountingErrorLogs();
  }

  refreshAccountingErrorLogs(): void {
    this.loadAccountingErrorLogs(true);
  }

  deleteAllAccountingErrorLogs(): void {
    this.isDeleting = true;
    this.errorMessage = null;
    this.logService.deleteAllAccountingError().pipe(take(1), finalize(() => this.isDeleting = false)).subscribe({
      next: () => {
        this.loadAccountingErrorLogs(true);
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  openAccountingError(row: AccountingErrorLogResponse): void {
    if (!row?.accountingErrorId) {
      return;
    }
    this.openAccountingErrorLog.emit(row);
  }
  //#endregion

  //#region Data Loading Methods
  loadAccountingErrorLogs(emitCallback = false): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.logService.getAllAccountingError().pipe(take(1), finalize(() => {
      this.isLoading = false;
      this.cdr.markForCheck();
    })).subscribe({
      next: (rows: AccountingErrorLogResponse[]) => {
        this.rows = (rows || []).map(row => ({
          ...row,
          sourceType: getSourceTypeLabel(row.sourceTypeId, SourceTypeLabels),
          amountDisplay: row.amount === null || row.amount === undefined ? '-' : this.formatter.currencyUsd(Number(row.amount)),
          accountingPeriodDisplay: this.formatPeriodAsMonthYear(row.accountingPeriod),
          createdOnDate: this.formatter.formatDateTimeOffsetAsDateOnly(row.createdOn) || '-'
        }));
        if (emitCallback) {
          this.listActionCompleted.emit();
        }
      },
      error: () => {
        this.rows = [];
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  formatPeriodAsMonthYear(period: string | null | undefined): string {
    if (!period) {
      return '-';
    }

    const trimmed = period.trim();
    if (!trimmed) {
      return '-';
    }

    const isoMatch = /^(\d{4})-(\d{1,2})/.exec(trimmed);
    if (isoMatch) {
      const yearShort = isoMatch[1].slice(-2);
      const month = isoMatch[2].padStart(2, '0');
      return `${month}.${yearShort}`;
    }

    const slashMatch = /^(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
    if (slashMatch) {
      const month = slashMatch[1].padStart(2, '0');
      const yearShort = slashMatch[2].slice(-2);
      return `${month}.${yearShort}`;
    }

    return trimmed;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {}
  //#endregion
}
