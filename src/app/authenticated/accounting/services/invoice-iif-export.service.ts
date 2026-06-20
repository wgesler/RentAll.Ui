import { Injectable } from '@angular/core';
import { QbClassType, QbNameType } from '../../organizations/models/qb-type-enum';
import { TransactionType } from '../models/accounting-enum';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceIifExportFieldContext, InvoiceIifExportOptions, InvoiceResponse, LedgerLineResponse } from '../models/invoice.model';

@Injectable({
  providedIn: 'root'
})
export class InvoiceIifExportService {
  private static readonly quickBooksNameMaxLength = 41;

  private readonly iifHeaders: string[] = [
    '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tDOCNUM\tAMOUNT\tCLASS\tMEMO',
    '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tDOCNUM\tAMOUNT\tCLASS\tMEMO',
    '!ENDTRNS'
  ];

  //#region Quickbooks Support
  generateInvoicesIifContent(
    invoices: InvoiceResponse[],
    costCodes: CostCodesResponse[],
    chartOfAccounts: ChartOfAccountResponse[],
    options?: InvoiceIifExportOptions
  ): string {
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return this.iifHeaders.join('\r\n');
    }

    const costCodesById = new Map<number, CostCodesResponse>();
    costCodes.forEach(costCode => costCodesById.set(costCode.costCodeId, costCode));

    const accountsReceivableAccount = this.formatQuickBooksAccnt(options?.accountsReceivableAccount || 'Accounts Receivable');
    const defaultIncomeAccount = this.formatQuickBooksAccnt(options?.defaultIncomeAccount || 'Income');
    const chartOfAccountsByOfficeAndNo = this.buildChartOfAccountsLookup(chartOfAccounts);
    const chartOfAccountsByOfficeAndId = this.buildChartOfAccountsByOfficeAndIdLookup(chartOfAccounts);

    const rows: string[] = [...this.iifHeaders];
    invoices.forEach(invoice => {
      const ledgerLines = [...(invoice.ledgerLines || [])].sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0));
      if (ledgerLines.length === 0) {
        return;
      }

      const { otherLines } = this.partitionLedgerLines(ledgerLines, costCodesById);
      if (otherLines.length === 0) {
        return;
      }

      const customerName = this.formatQuickBooksName(options?.nameByInvoiceId?.[invoice.invoiceId] || invoice.responsibleParty || '');
      const invoiceNumber = this.formatQuickBooksDocNumber(invoice.invoiceCode || '');
      const invoiceClass = this.formatQuickBooksClass(options?.classByInvoiceId?.[invoice.invoiceId] || '');
      const transactionDate = this.formatDate(invoice.accountingPeriod ?? invoice.invoiceDate);

      this.appendInvoiceTransactionSet(rows, {
        ledgerLines: otherLines,
        transactionDate,
        accountsReceivableAccount,
        customerName,
        invoiceNumber,
        invoiceClass,
        officeId: invoice.officeId,
        costCodesById,
        chartOfAccountsByOfficeAndNo,
        chartOfAccountsByOfficeAndId,
        defaultIncomeAccount
      });
    });

    return rows.join('\r\n');
  }

  buildQuickBooksName(qbNameTypeId: number | null | undefined, context: InvoiceIifExportFieldContext): string {
    switch (qbNameTypeId ?? QbNameType.Unselected) {
      case QbNameType.CorporationCodeName: {
        const job = [context.reservationCode, context.occupantName].filter(value => !!value).join(' ');
        return job && context.recipient ? `${context.recipient} ${job}` : (context.recipient || job);
      }
      case QbNameType.CodeBoardName:
        return [context.reservationCode, context.reservationBoardLabel].filter(value => !!value).join(' ');
      default:
        return context.reservationCode;
    }
  }

  buildQuickBooksClass(qbClassTypeId: number | null | undefined, context: InvoiceIifExportFieldContext): string {
    switch (qbClassTypeId ?? QbClassType.Unselected) {
      case QbClassType.CityProperty:
        return [context.city, context.propertyCode].filter(value => !!value).join(':');
      case QbClassType.OfficeProperty:
        return [context.officeName, context.propertyCode].filter(value => !!value).join(':');
      default:
        return context.propertyCode;
    }
  }

  partitionLedgerLines(
    ledgerLines: LedgerLineResponse[],
    costCodesById: Map<number, CostCodesResponse>
  ): { paymentLines: LedgerLineResponse[]; otherLines: LedgerLineResponse[] } {
    const paymentLines: LedgerLineResponse[] = [];
    const otherLines: LedgerLineResponse[] = [];

    ledgerLines.forEach(line => {
      if (this.isPaymentLine(line, costCodesById)) {
        paymentLines.push(line);
      } else {
        otherLines.push(line);
      }
    });

    return { paymentLines, otherLines };
  }

  isPaymentLine(line: LedgerLineResponse, costCodesById: Map<number, CostCodesResponse>): boolean {
    const costCode = line.costCodeId != null ? costCodesById.get(line.costCodeId) : undefined;
    const transactionTypeId = line.transactionTypeId ?? costCode?.transactionTypeId;
    return transactionTypeId === TransactionType.Payment;
  }

  appendInvoiceTransactionSet(
    rows: string[],
    context: {
      ledgerLines: LedgerLineResponse[];
      transactionDate: string;
      accountsReceivableAccount: string;
      customerName: string;
      invoiceNumber: string;
      invoiceClass: string;
      officeId: number;
      costCodesById: Map<number, CostCodesResponse>;
      chartOfAccountsByOfficeAndNo: Map<string, ChartOfAccountResponse>;
      chartOfAccountsByOfficeAndId: Map<string, ChartOfAccountResponse>;
      defaultIncomeAccount: string;
    }
  ): void {
    const transactionTotal = context.ledgerLines.reduce(
      (sum, line) => sum + Number(line.amount || 0),
      0
    );
    const transactionMemo = this.sanitizeText(context.ledgerLines[0]?.description || '');

    rows.push(this.toRow([
      'TRNS',
      'INVOICE',
      context.transactionDate,
      context.accountsReceivableAccount,
      context.customerName,
      context.invoiceNumber,
      this.formatAmount(Math.abs(transactionTotal)),
      context.invoiceClass,
      transactionMemo
    ]));

    context.ledgerLines.forEach(line => {
      const costCode = line.costCodeId != null ? context.costCodesById.get(line.costCodeId) : undefined;
      const accountName = this.resolveAccountName(
        costCode,
        context.officeId,
        context.chartOfAccountsByOfficeAndNo,
        context.chartOfAccountsByOfficeAndId,
        context.defaultIncomeAccount
      );
      const quickBooksLineAmount = this.formatAmount(-Number(line.amount || 0));
      const description = this.sanitizeText(line.description || '');

      rows.push(this.toRow([
        'SPL',
        'INVOICE',
        context.transactionDate,
        accountName,
        context.customerName,
        context.invoiceNumber,
        quickBooksLineAmount,
        context.invoiceClass,
        description
      ]));
    });

    rows.push('ENDTRNS');
  }

  buildChartOfAccountsLookup(chartOfAccounts: ChartOfAccountResponse[]): Map<string, ChartOfAccountResponse> {
    const lookup = new Map<string, ChartOfAccountResponse>();
    (chartOfAccounts || []).forEach(account => {
      const accountNo = this.normalizeAccountCode(account.accountNo || '');
      if (!accountNo) {
        return;
      }
      lookup.set(`${account.officeId}|${accountNo}`, account);
    });
    return lookup;
  }

  buildChartOfAccountsByOfficeAndIdLookup(chartOfAccounts: ChartOfAccountResponse[]): Map<string, ChartOfAccountResponse> {
    const lookup = new Map<string, ChartOfAccountResponse>();
    (chartOfAccounts || []).forEach(account => {
      if (account.accountId == null) {
        return;
      }
      lookup.set(`${account.officeId}|${account.accountId}`, account);
    });
    return lookup;
  }

  resolveAccountName(
    costCode: CostCodesResponse | undefined,
    officeId: number | undefined,
    chartOfAccountsByOfficeAndNo: Map<string, ChartOfAccountResponse>,
    chartOfAccountsByOfficeAndId: Map<string, ChartOfAccountResponse>,
    defaultIncomeAccount: string
  ): string {
    if (!costCode || officeId == null) {
      return defaultIncomeAccount;
    }

    const accountCode = this.normalizeAccountCode(costCode.costCode || '');
    if (!accountCode) {
      return defaultIncomeAccount;
    }

    const chartOfAccount = chartOfAccountsByOfficeAndNo.get(`${officeId}|${accountCode}`);
    if (!chartOfAccount) {
      return defaultIncomeAccount;
    }

    return this.formatQuickBooksAccnt(
      this.formatQuickBooksAccountName(chartOfAccount, officeId, chartOfAccountsByOfficeAndId)
        || defaultIncomeAccount
    );
  }

  formatQuickBooksAccountName(
    chartOfAccount: ChartOfAccountResponse,
    officeId: number,
    chartOfAccountsByOfficeAndId: Map<string, ChartOfAccountResponse>
  ): string {
    const childName = this.sanitizeText(chartOfAccount.name || '');
    if (!childName) {
      return '';
    }

    if (!chartOfAccount.isSubaccount || chartOfAccount.subAccountId == null) {
      return childName;
    }

    const parentAccount = chartOfAccountsByOfficeAndId.get(`${officeId}|${chartOfAccount.subAccountId}`);
    const parentName = this.sanitizeText(parentAccount?.name || '');
    if (!parentName) {
      return childName;
    }

    return `${parentName}:${childName}`;
  }

  normalizeAccountCode(value: string): string {
    return this.sanitizeText(value);
  }

  toRow(values: string[]): string {
    return values.join('\t');
  }

  sanitizeText(value: string): string {
    return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  }

  formatQuickBooksName(value: string): string {
    return this.truncateText(this.sanitizeText(value), InvoiceIifExportService.quickBooksNameMaxLength);
  }

  formatQuickBooksAccnt(value: string): string {
    return this.sanitizeText(value);
  }

  formatQuickBooksClass(value: string): string {
    return this.sanitizeText(value);
  }

  truncateText(value: string, maxLength: number): string {
    if (maxLength <= 0) {
      return '';
    }
    return value.length <= maxLength ? value : value.slice(0, maxLength);
  }

  formatQuickBooksDocNumber(invoiceCode: string): string {
    return this.sanitizeText(invoiceCode).replace(/^R-/i, '');
  }

  formatAmount(value: number): string {
    const numericValue = Number.isFinite(value) ? value : 0;
    return numericValue.toFixed(2);
  }

  formatDate(value?: string): string {
    if (!value) {
      return '';
    }

    const calendarPrefix = String(value).split('T')[0]?.trim() || '';
    const calendarMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarPrefix);
    if (calendarMatch) {
      return `${calendarMatch[2]}/${calendarMatch[3]}/${calendarMatch[1]}`;
    }

    const parsedDate = new Date(value);
    if (isNaN(parsedDate.getTime())) {
      return '';
    }

    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const year = parsedDate.getFullYear();
    return `${month}/${day}/${year}`;
  }
  //#endregion
}
