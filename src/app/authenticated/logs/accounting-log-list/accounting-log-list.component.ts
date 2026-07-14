import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { finalize, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { InvoiceResponse } from '../../accounting/models/invoice.model';
import { InvoiceService } from '../../accounting/services/invoice.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountingLogResponse } from '../models/log.model';
import { LogService } from '../services/log.service';

@Component({
  standalone: true,
  selector: 'app-accounting-log-list',
  templateUrl: './accounting-log-list.component.html',
  styleUrl: './accounting-log-list.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class AccountingLogListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() reloadToken = 0;
  @Output() openAccountingLog = new EventEmitter<AccountingLogResponse>();
  @Output() listActionCompleted = new EventEmitter<void>();
  private logService = inject(LogService);
  private propertyService = inject(PropertyService);
  private invoiceService = inject(InvoiceService);
  private formatter = inject(FormatterService);

  rows: Array<AccountingLogResponse & { propertyCodeDisplay: string; invoiceCodeDisplay: string; createdOnDate: string; firstPeriodDisplay: string; secondPeriodDisplay: string; originalAmountDisplay: string; firstAmountDisplay: string; secondAmountDisplay: string }> = [];
  isLoading = false;
  isDeleting = false;
  errorMessage: string | null = null;
  columns: ColumnSet = {
    propertyCodeDisplay: { displayAs: 'Property', maxWidth: '12ch' },
    invoiceCodeDisplay: { displayAs: 'Invoice', maxWidth: '12ch' },
    originalAmountDisplay: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'left', headerAlignment: 'left' },
    rentalLine: { displayAs: 'Rental Line', maxWidth: '20ch' },
    firstPeriodDisplay: { displayAs: 'First', maxWidth: '10ch' },
    firstAmountDisplay: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'left', headerAlignment: 'left' },
    secondPeriodDisplay: { displayAs: 'Second', maxWidth: '10ch' },
    secondAmountDisplay: { displayAs: 'Amount', maxWidth: '12ch', alignment: 'left', headerAlignment: 'left' },
    message: { displayAs: 'Message', maxWidth: '40ch' },
    createdOnDate: { displayAs: 'Created On', maxWidth: '12ch' }
  };

  //#region Accounting-Log-List
  ngOnInit(): void {
    this.loadAccountingLogs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['reloadToken'] || changes['reloadToken'].firstChange) {
      return;
    }

    this.loadAccountingLogs();
  }

  refreshAccountingLogs(): void {
    this.loadAccountingLogs(true);
  }

  deleteAllAccountingLogs(): void {
    this.isDeleting = true;
    this.errorMessage = null;
    this.logService.deleteAllAccountingLog().pipe(take(1), finalize(() => this.isDeleting = false)).subscribe({
      next: () => {
        this.loadAccountingLogs(true);
      },
      error: () => {
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  openAccounting(row: AccountingLogResponse): void {
    if (!row?.id) {
      return;
    }
    this.openAccountingLog.emit(row);
  }
  //#endregion

  //#region Data Loading Methods
  loadAccountingLogs(emitCallback = false): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.logService.getAllAccountingLog().pipe(take(1), finalize(() => this.isLoading = false)).subscribe({
      next: (rows: AccountingLogResponse[]) => {
        this.loadCodeDisplays(rows || [], emitCallback);
      },
      error: () => {
        this.rows = [];
        this.errorMessage = CommonMessage.ServiceError;
      }
    });
  }

  loadCodeDisplays(rows: AccountingLogResponse[], emitCallback = false): void {
    this.propertyService.getActivePropertyList().pipe(take(1)).subscribe({
      next: (properties: PropertyListResponse[]) => {
        const officeIds = Array.from(new Set(rows.map(row => row.officeId || 0).filter(id => id > 0)));
        if (officeIds.length === 0) {
          this.rows = this.buildDisplayRows(rows, properties || [], []);
          if (emitCallback) {
            this.listActionCompleted.emit();
          }
          return;
        }

        this.invoiceService.searchInvoices({ officeIds, includeInactive: true, includePaid: true }).pipe(take(1)).subscribe({
          next: (invoices: InvoiceResponse[]) => {
            this.rows = this.buildDisplayRows(rows, properties || [], invoices || []);
            if (emitCallback) {
              this.listActionCompleted.emit();
            }
          },
          error: () => {
            this.rows = this.buildDisplayRows(rows, properties || [], []);
            if (emitCallback) {
              this.listActionCompleted.emit();
            }
          }
        });
      },
      error: () => {
        this.rows = this.buildDisplayRows(rows, [], []);
        if (emitCallback) {
          this.listActionCompleted.emit();
        }
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  buildDisplayRows(rows: AccountingLogResponse[], properties: PropertyListResponse[], invoices: InvoiceResponse[]): Array<AccountingLogResponse & { propertyCodeDisplay: string; invoiceCodeDisplay: string; createdOnDate: string; firstPeriodDisplay: string; secondPeriodDisplay: string; originalAmountDisplay: string; firstAmountDisplay: string; secondAmountDisplay: string }> {
    const propertyCodeById = new Map<string, string>((properties || []).map(property => [property.propertyId, property.propertyCode]));
    const invoiceCodeById = new Map<string, string>((invoices || []).map(invoice => [invoice.invoiceId, invoice.invoiceCode]));

    return rows.map(row => {
      const propertyId = row.propertyId || '';
      const invoiceId = row.invoiceId || '';
      return {
        ...row,
        propertyCodeDisplay: propertyCodeById.get(propertyId) || '-',
        invoiceCodeDisplay: invoiceCodeById.get(invoiceId) || '-',
        createdOnDate: this.formatter.formatDateTimeOffsetAsDateOnly(row.createdOn) || '-',
        firstPeriodDisplay: this.formatPeriodAsMonthYear(row.firstPeriod),
        secondPeriodDisplay: this.formatPeriodAsMonthYear(row.secondPeriod),
        originalAmountDisplay: this.formatCurrencyAmount(row.originalAmount),
        firstAmountDisplay: this.formatCurrencyAmount(row.firstAmount),
        secondAmountDisplay: this.formatCurrencyAmount(row.secondAmount)
      };
    });
  }
  //#endregion

  //#region Get Methods
  formatCurrencyAmount(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) {
      return '-';
    }
    return this.formatter.currencyUsd(Number(amount));
  }

  formatPeriodAsMonthYear(period: string | null | undefined): string {
    if (!period) {
      return '-';
    }

    const trimmed = period.trim();
    if (!trimmed) {
      return '-';
    }

    const isoMatch = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
    if (isoMatch) {
      const yearShort = isoMatch[1].slice(-2);
      const month = isoMatch[2].padStart(2, '0');
      return `${month}.${yearShort}`;
    }

    const slashFullDateMatch = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(trimmed);
    if (slashFullDateMatch) {
      const month = slashFullDateMatch[1].padStart(2, '0');
      const yearShort = slashFullDateMatch[3].slice(-2);
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
