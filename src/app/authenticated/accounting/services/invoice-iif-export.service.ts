import { Injectable } from '@angular/core';
import { TransactionType } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceResponse, LedgerLineResponse } from '../models/invoice.model';

export interface InvoiceIifExportOptions {
  costCodeToIncomeAccountMap?: Record<string, string>;
  accountsReceivableAccount?: string;
  defaultIncomeAccount?: string;
  classByInvoiceId?: Record<string, string>;
  memoByInvoiceId?: Record<string, string>;
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

  // Start with an explicit example mapping and extend as needed per office/accounting setup.
  private readonly defaultCostCodeToIncomeAccountMap: Record<string, string> = {
    '4300 Parking Charge': 'Parking Income'
  };

  //#region Quickbooks Support
  generateInvoicesIifContent(
    invoices: InvoiceResponse[],
    costCodes: CostCodesResponse[],
    options?: InvoiceIifExportOptions
  ): string {
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return this.iifHeaders.join('\r\n');
    }

    const costCodesById = new Map<number, CostCodesResponse>();
    costCodes.forEach(costCode => costCodesById.set(costCode.costCodeId, costCode));

    const accountsReceivableAccount = this.sanitizeText(options?.accountsReceivableAccount || 'Accounts Receivable');
    const defaultIncomeAccount = this.sanitizeText(options?.defaultIncomeAccount || 'Income');
    const accountMap = {
      ...this.defaultCostCodeToIncomeAccountMap,
      ...(options?.costCodeToIncomeAccountMap || {})
    };

    const rows: string[] = [...this.iifHeaders];
    invoices.forEach(invoice => {
      const chargeLines = (invoice.ledgerLines || []).filter(line => this.isChargeLine(line, costCodesById));
      if (chargeLines.length === 0) {
        return;
      }

      const invoiceDate = this.formatDate(invoice.invoiceDate);
      const customerName = this.sanitizeText(options?.nameByInvoiceId?.[invoice.invoiceId] || invoice.responsibleParty || '');
      const invoiceNumber = this.sanitizeText(invoice.invoiceCode || '');
      const invoiceClass = this.sanitizeText(options?.classByInvoiceId?.[invoice.invoiceId] || '');
      const invoiceMemo = this.sanitizeText(options?.memoByInvoiceId?.[invoice.invoiceId] || invoice.notes || '');
      const invoiceTotal = this.formatAmount(Math.abs(Number(invoice.totalAmount || 0)));

      rows.push(this.toRow([
        'TRNS',
        'INVOICE',
        invoiceDate,
        accountsReceivableAccount,
        customerName,
        invoiceNumber,
        invoiceTotal,
        invoiceClass,
        invoiceMemo
      ]));

      chargeLines.forEach(line => {
        const costCode = line.costCodeId != null ? costCodesById.get(line.costCodeId) : undefined;
        const incomeAccount = this.resolveIncomeAccount(costCode, accountMap, defaultIncomeAccount);
        const quickBooksLineAmount = this.formatAmount(-Number(line.amount || 0));
        const description = this.sanitizeText(line.description || '');

        rows.push(this.toRow([
          'SPL',
          'INVOICE',
          invoiceDate,
          incomeAccount,
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

  generateInvoicesIifBytes(
    invoices: InvoiceResponse[],
    costCodes: CostCodesResponse[],
    options?: InvoiceIifExportOptions
  ): Uint8Array {
    const iifContent = this.generateInvoicesIifContent(invoices, costCodes, options);
    return new TextEncoder().encode(iifContent);
  }

  private isChargeLine(line: LedgerLineResponse, costCodesById: Map<number, CostCodesResponse>): boolean {
    if (line.transactionTypeId === TransactionType.Charge || line.transactionTypeId === TransactionType.Deposit) {
      return true;
    }
    if (line.transactionTypeId === TransactionType.Payment) {
      return false;
    }

    if (line.costCodeId == null) {
      return false;
    }

    const costCode = costCodesById.get(line.costCodeId);
    return costCode?.transactionTypeId === TransactionType.Charge || costCode?.transactionTypeId === TransactionType.Deposit;
  }

  private resolveIncomeAccount(
    costCode: CostCodesResponse | undefined,
    accountMap: Record<string, string>,
    defaultIncomeAccount: string
  ): string {
    if (!costCode) {
      return defaultIncomeAccount;
    }

    const code = this.sanitizeText(costCode.costCode || '');
    const description = this.sanitizeText(costCode.description || '');
    const mapKeys = [
      `${code} ${description}`.trim(),
      `${code}: ${description}`.trim(),
      description,
      code
    ];

    const match = mapKeys.find(key => !!key && !!accountMap[key]);
    return this.sanitizeText(match ? accountMap[match] : defaultIncomeAccount);
  }

  private toRow(values: string[]): string {
    return values.join('\t');
  }

  private sanitizeText(value: string): string {
    return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  }

  private formatAmount(value: number): string {
    const numericValue = Number.isFinite(value) ? value : 0;
    return numericValue.toFixed(2);
  }

  private formatDate(value?: string): string {
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
