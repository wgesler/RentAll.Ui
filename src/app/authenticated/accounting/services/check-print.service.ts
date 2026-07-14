import { Injectable } from '@angular/core';
import { FormatterService } from '../../../services/formatter-service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { JournalEntryLineListDisplay } from '../models/journal-entry.model';

export interface CheckPrintMergeContext {
  companyBlock: string;
  bankBlock: string;
  checkNumber: string;
  checkDate: string;
  payeeName: string;
  checkAmountFormatted: string;
  checkAmountPlain: string;
  amountInWords: string;
  payeeAddressBlock: string;
  memo: string;
  micrLine: string;
  vendorStubDetailRows: string;
  companyStubDetailRows: string;
}

@Injectable({
  providedIn: 'root'
})
export class CheckPrintService {
  constructor(private formatter: FormatterService) { }

  mergeCheckTemplate(template: string, context: CheckPrintMergeContext): string {
    let result = template;
    Object.entries(context).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    });
    return result;
  }

  buildMergedChecksHtml(template: string, lines: JournalEntryLineListDisplay[], accountingOffice: AccountingOfficeResponse | null): string {
    const pages = lines.map(line => {
      const context = this.buildMergeContext(line, accountingOffice);
      return this.extractPageContent(this.mergeCheckTemplate(template, context));
    });

    return this.wrapPages(pages, template);
  }

  buildMergeContext(line: JournalEntryLineListDisplay, accountingOffice: AccountingOfficeResponse | null): CheckPrintMergeContext {
    const amount = Number(line.creditValue || 0);
    const checkDate = (line.transactionDate || '').trim();
    const checkNumber = (line.checkNumber || '').trim() || this.resolveCheckNumber(line);
    const payeeName = (line.contactName || '').trim() || 'Payee';
    const memo = this.buildMemo(line);
    const detailRow = this.buildStubDetailRow(line, amount);

    return {
      companyBlock: '',
      bankBlock: '',
      checkNumber,
      checkDate,
      payeeName,
      checkAmountFormatted: `$${this.formatter.currency(amount)}`,
      checkAmountPlain: this.formatter.currency(amount),
      amountInWords: this.amountToWords(amount),
      payeeAddressBlock: '',
      memo,
      micrLine: '',
      vendorStubDetailRows: detailRow,
      companyStubDetailRows: this.buildCompanyStubDetailRow(line, amount)
    };
  }

  private wrapPages(pages: string[], template: string): string {
    if (pages.length === 0) {
      return template;
    }

    const styles = this.extractStyles(template);
    const combinedBody = pages.join('\n');
    if (!styles) {
      return combinedBody;
    }

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />${styles}</head><body>${combinedBody}</body></html>`;
  }

  private extractStyles(template: string): string {
    const match = template.match(/<style[\s\S]*?<\/style>/i);
    return match?.[0] ?? '';
  }

  private extractPageContent(html: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) {
      return bodyMatch[1].trim();
    }
    return html.trim();
  }

  private buildCompanyBlock(accountingOffice: AccountingOfficeResponse | null): string {
    if (!accountingOffice) {
      return 'RentAll Exchange';
    }

    const lines = [
      accountingOffice.name,
      this.joinParts([accountingOffice.address1, accountingOffice.address2, accountingOffice.suite]),
      this.joinParts([accountingOffice.city, accountingOffice.state], ', ') + (accountingOffice.zip ? ` ${accountingOffice.zip}` : '')
    ].filter(line => line.trim().length > 0);

    return lines.join('<br>');
  }

  private buildBankBlock(accountingOffice: AccountingOfficeResponse | null): string {
    if (!accountingOffice?.bankName) {
      return 'Bank';
    }

    return [accountingOffice.bankName, accountingOffice.bankAddress].filter(part => (part || '').trim()).join('<br>');
  }

  private buildMicrLine(checkNumber: string, accountingOffice: AccountingOfficeResponse | null): string {
    const routing = (accountingOffice?.bankRouting || '').replace(/\D/g, '');
    const account = (accountingOffice?.bankAccount || '').replace(/\D/g, '');
    const checkNo = checkNumber.replace(/\D/g, '') || checkNumber;
    if (!routing && !account) {
      return `⑆${checkNo}⑆`;
    }
    return `⑆${checkNo}⑆ ⑈${routing || '000000000'}⑈ ${account || '0000000000'}⑉`;
  }

  private buildMemo(line: JournalEntryLineListDisplay): string {
    const parts = [
      (line.description || '').trim(),
      (line.journalEntryCode || '').trim(),
      (line.propertyCode || '').trim()
    ].filter(part => part.length > 0);
    return parts.join(' - ');
  }

  private buildStubDetailRow(line: JournalEntryLineListDisplay, amount: number): string {
    return this.buildStubRow(
      (line.transactionDate || '').trim(),
      'Bill Payment',
      (line.journalEntryCode || '').trim(),
      this.buildMemo(line),
      amount
    );
  }

  private buildCompanyStubDetailRow(line: JournalEntryLineListDisplay, amount: number): string {
    return this.buildStubRow(
      (line.transactionDate || '').trim(),
      (line.account || '').trim() || 'Bank',
      (line.journalEntryCode || '').trim(),
      this.buildMemo(line),
      amount
    );
  }

  private buildStubRow(date: string, type: string, reference: string, memo: string, amount: number): string {
    const blankRows = Array.from({ length: 2 }, () =>
      '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>'
    ).join('');
    const amountPlain = this.formatter.currency(amount);

    return `
        <tr><td>${this.escapeHtml(date)}</td><td>${this.escapeHtml(type)}</td><td>${this.escapeHtml(reference)}</td><td>${this.escapeHtml(memo)}</td><td class="num">${amountPlain}</td></tr>
        ${blankRows}
        <tr class="total-row"><td colspan="4" class="num">Check Total</td><td class="num">$${amountPlain}</td></tr>`;
  }

  private resolveCheckNumber(line: JournalEntryLineListDisplay): string {
    const code = (line.journalEntryCode || '').trim();
    if (!code) {
      return '';
    }
    const numericSuffix = code.match(/(\d+)\s*$/);
    return numericSuffix?.[1] || code;
  }

  private amountToWords(amount: number): string {
    const normalized = Math.round(Math.abs(Number(amount) || 0) * 100) / 100;
    const dollars = Math.floor(normalized);
    const cents = Math.round((normalized - dollars) * 100);
    const words = this.numberToWords(dollars);
    const capitalized = words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Zero';
    return `${capitalized} and ${String(cents).padStart(2, '0')}/100`;
  }

  private numberToWords(value: number): string {
    if (!Number.isFinite(value) || value === 0) {
      return 'zero';
    }

    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const scales = ['', ' thousand', ' million'];

    const chunkToWords = (num: number): string => {
      let chunk = num;
      const parts: string[] = [];
      if (chunk >= 100) {
        parts.push(`${ones[Math.floor(chunk / 100)]} hundred`);
        chunk %= 100;
      }
      if (chunk >= 20) {
        parts.push(`${tens[Math.floor(chunk / 10)]}${chunk % 10 ? `-${ones[chunk % 10]}` : ''}`);
      } else if (chunk > 0) {
        parts.push(ones[chunk]);
      }
      return parts.join(' ');
    };

    let remaining = Math.floor(value);
    let scaleIndex = 0;
    const words: string[] = [];
    while (remaining > 0) {
      const chunk = remaining % 1000;
      if (chunk > 0) {
        words.unshift(`${chunkToWords(chunk)}${scales[scaleIndex]}`);
      }
      remaining = Math.floor(remaining / 1000);
      scaleIndex += 1;
    }
    return words.join(' ').replace(/\s+/g, ' ').trim();
  }

  private joinParts(parts: Array<string | null | undefined>, separator = ' '): string {
    return parts.map(part => (part || '').trim()).filter(Boolean).join(separator);
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
