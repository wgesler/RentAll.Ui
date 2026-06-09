import { Injectable } from '@angular/core';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceResponse } from '../models/invoice.model';

export interface InvoiceIifExportOptions {
  accountsReceivableAccount?: string;
  defaultIncomeAccount?: string;
  classByInvoiceId?: Record<string, string>;
  nameByInvoiceId?: Record<string, string>;
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceIifExportService {
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

    const accountsReceivableAccount = this.sanitizeText(options?.accountsReceivableAccount || 'Accounts Receivable');
    const defaultIncomeAccount = this.sanitizeText(options?.defaultIncomeAccount || 'Income');
    const chartOfAccountsByOfficeAndNo = this.buildChartOfAccountsLookup(chartOfAccounts);

    const rows: string[] = [...this.iifHeaders];
    invoices.forEach(invoice => {
      const ledgerLines = [...(invoice.ledgerLines || [])].sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0));
      if (ledgerLines.length === 0) {
        return;
      }

      const transactionDate = this.formatDate(invoice.accountingPeriod ?? invoice.invoiceDate);
      const customerName = this.sanitizeText(options?.nameByInvoiceId?.[invoice.invoiceId] || invoice.responsibleParty || '');
      const invoiceNumber = this.sanitizeText(invoice.invoiceCode || '');
      const invoiceClass = this.sanitizeText(options?.classByInvoiceId?.[invoice.invoiceId] || '');
      const invoiceMemo = this.sanitizeText(ledgerLines[0]?.description || '');
      const invoiceTotal = this.formatAmount(Math.abs(Number(invoice.totalAmount || 0)));

      rows.push(this.toRow([
        'TRNS',
        'INVOICE',
        transactionDate,
        accountsReceivableAccount,
        customerName,
        invoiceNumber,
        invoiceTotal,
        invoiceClass,
        invoiceMemo
      ]));

      ledgerLines.forEach(line => {
        const costCode = line.costCodeId != null ? costCodesById.get(line.costCodeId) : undefined;
        const accountName = this.resolveAccountName(costCode, invoice.officeId, chartOfAccountsByOfficeAndNo, defaultIncomeAccount);
        const quickBooksLineAmount = this.formatAmount(-Number(line.amount || 0));
        const description = this.sanitizeText(line.description || '');

        rows.push(this.toRow([
          'SPL',
          'INVOICE',
          transactionDate,
          accountName,
          customerName,
          invoiceNumber,
          quickBooksLineAmount,
          invoiceClass,
          description
        ]));
      });

      rows.push('ENDTRNS');
    });

    return rows.join('\r\n');
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

  resolveAccountName(
    costCode: CostCodesResponse | undefined,
    officeId: number | undefined,
    chartOfAccountsByOfficeAndNo: Map<string, ChartOfAccountResponse>,
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
    const accountName = this.sanitizeText(chartOfAccount?.name || '');
    return accountName || defaultIncomeAccount;
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
