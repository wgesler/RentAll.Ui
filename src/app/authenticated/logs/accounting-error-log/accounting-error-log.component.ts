import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { SourceType, SourceTypeLabels, getSourceTypeLabel } from '../../accounting/models/accounting-enum';
import { AccountingErrorLogResponse } from '../models/log.model';

@Component({
  standalone: true,
  selector: 'app-accounting-error-log',
  templateUrl: './accounting-error-log.component.html',
  styleUrl: './accounting-error-log.component.scss',
  imports: [CommonModule, MaterialModule]
})
export class AccountingErrorLogComponent implements OnInit, OnDestroy {
  @Input() row: AccountingErrorLogResponse | null = null;
  @Output() closed = new EventEmitter<void>();
  constructor(private router: Router, private formatter: FormatterService, private toastr: ToastrService) {}

  //#region Accounting-Error-Log
  ngOnInit(): void {}
  //#endregion

  //#region Get Methods
  getCreatedOnDate(): string {
    return this.formatter.formatDateTimeOffsetAsDateOnly(this.row?.createdOn) || '-';
  }

  getSourceTypeLabel(): string {
    return getSourceTypeLabel(this.row?.sourceTypeId, SourceTypeLabels) || '-';
  }

  getAccountingPeriod(): string {
    return this.formatPeriodAsMonthYear(this.row?.accountingPeriod);
  }

  getAmount(): string {
    if (this.row?.amount === null || this.row?.amount === undefined) {
      return '-';
    }
    return this.formatter.currencyUsd(Number(this.row.amount));
  }

  canOpenSource(): boolean {
    return !!this.row?.sourceId && !!this.resolveSourceUrl(this.row.sourceTypeId, this.row.sourceId);
  }

  openSource(): void {
    const sourceId = (this.row?.sourceId || '').trim();
    const sourceUrl = this.resolveSourceUrl(this.row?.sourceTypeId, sourceId);
    if (!sourceId || !sourceUrl) {
      this.toastr.error('Unable to open source document for this source type.', CommonMessage.Error);
      return;
    }

    this.router.navigateByUrl(sourceUrl);
  }
  //#endregion

  //#region Form Response Methods
  resolveSourceUrl(sourceTypeId: number | null | undefined, sourceId: string): string | null {
    if (!sourceTypeId || !sourceId) {
      return null;
    }

    switch (sourceTypeId) {
      case SourceType.Bill:
      case SourceType.BillPayment:
      case SourceType.Receipt:
      case SourceType.Check:
      case SourceType.Deposit:
      case SourceType.CreditCard:
      case SourceType.CreditCardCredit:
      case SourceType.CreditCardRefund:
      case SourceType.OwnerDistribution:
      case SourceType.Paycheck:
      case SourceType.PayrollLiabilityCheck:
      case SourceType.Transfer:
        return RouterUrl.replaceTokens(RouterUrl.Billing, [sourceId]);
      case SourceType.Invoice:
      case SourceType.InvoicePayment:
      case SourceType.InvoiceCredit:
      case SourceType.CreditMemo:
        return RouterUrl.replaceTokens(RouterUrl.Accounting, [sourceId]);
      case SourceType.WorkOrder:
        return RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, [sourceId]);
      default:
        return null;
    }
  }

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
  back(): void {
    this.closed.emit();
  }

  ngOnDestroy(): void {}
  //#endregion
}
