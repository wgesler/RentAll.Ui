import { Injectable, inject } from '@angular/core';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { SecurityDepositDetailResponse, SecurityDepositDetailLineResponse } from '../models/security-deposit-report.model';
import { InvoiceHtmlBuilderService } from './invoice-html-builder.service';
import { InvoicePrintContext } from '../models/invoice-print-context.model';
import { InvoiceResponse } from '../models/invoice.model';

export interface SecurityDepositReportPrintContext {
  detail: SecurityDepositDetailResponse;
  reservation: ReservationResponse | null;
  property: PropertyResponse | null;
  contact: ContactResponse | null;
  contacts: ContactResponse[];
  selectedOffice: OfficeResponse | null;
  selectedAccountingOffice: AccountingOfficeResponse | null;
  accountingOfficeLogo: string;
  organization: OrganizationResponse | null;
  securityDepositReturnDate?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class SecurityDepositReportHtmlBuilderService {
  private formatterService = inject(FormatterService);
  private documentHtmlService = inject(DocumentHtmlService);
  private invoiceHtmlBuilder = inject(InvoiceHtmlBuilderService);

  private readonly chargesTableLayoutStyles = `
    .charges-table {
      table-layout: fixed;
    }

    .charges-table .col-date {
      width: 11ch;
    }

    .charges-table .col-ref {
      width: 14ch;
    }

    .charges-table .col-amount {
      width: 12ch;
    }

    .charges-table th.amount-col,
    .charges-table td.amount-col {
      width: 12ch;
      min-width: 12ch;
      max-width: 12ch;
      padding: 8px 8px 8px 4px;
      text-align: right;
      box-sizing: border-box;
      white-space: nowrap;
    }

    .charges-table .ledger-line-row td.amount-col {
      padding-right: 10px;
    }

    .charges-table .subtotal-row td.invoice-summary-cell {
      text-align: right;
      padding: 8px;
    }
  `;

  buildProcessedPreview(templateHtml: string, ctx: SecurityDepositReportPrintContext): { processedHtml: string; extractedStyles: string } {
    const processedHtml = this.replacePlaceholders(templateHtml, ctx);
    const { processedHtml: html, extractedStyles } = this.documentHtmlService.processHtml(processedHtml, true);
    return {
      processedHtml: html,
      extractedStyles: this.ensureChargesTableStyles(extractedStyles)
    };
  }

  replacePlaceholders(html: string, ctx: SecurityDepositReportPrintContext): string {
    const reservation = ctx.detail.reservation;
    let result = html;

    result = result.replace(/\{\{reservationCode\}\}/g, reservation.reservationCode || '');
    result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, this.buildResponsiblePartiesBlock(ctx) || '');
    result = result.replace(/\{\{propertySideBlock\}\}/g, this.buildPropertySideBlock(ctx) || '');

    const preferredLogoDataUrl = ctx.accountingOfficeLogo;
    if (preferredLogoDataUrl) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, preferredLogoDataUrl);
    } else {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    if (ctx.selectedAccountingOffice) {
      result = result.replace(/\{\{companyName\}\}/g, ctx.organization?.name || '');
      result = result.replace(/\{\{accountingOfficeName\}\}/g, ctx.selectedAccountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, ctx.selectedAccountingOffice.address1 || '');
      result = result.replace(/\{\{accountingOfficeAddressSingleLine\}\}/g, this.buildAccountingOfficeAddressSingleLine(ctx.selectedAccountingOffice));
      result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, [ctx.selectedAccountingOffice.city, ctx.selectedAccountingOffice.state, ctx.selectedAccountingOffice.zip].filter(Boolean).join(', '));
      result = result.replace(/\{\{accountingOfficeEmail\}\}/g, ctx.selectedAccountingOffice.email || '');
      result = result.replace(/\{\{accountingOfficePhone\}\}/g, this.formatterService.phoneNumber(ctx.selectedAccountingOffice.phone) || '');
      result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, ctx.selectedAccountingOffice.website || '');
    }

    result = result.replace(/\{\{securityDepositRows\}\}/g, this.buildSecurityDepositRows(ctx.detail.securityDepositPayments));
    result = result.replace(/\{\{chargeRows\}\}/g, this.buildChargeRows(ctx.detail.outstandingCharges));
    result = result.replace(/\{\{tenantPaymentRows\}\}/g, this.buildTenantPaymentRows(ctx.detail.returnPayments));
    result = result.replace(/\{\{balanceDueRow\}\}/g, this.buildBalanceDueRow(ctx.detail));
    result = result.replace(/\{\{returnPaymentsSectionClass\}\}/g, '');

    return result;
  }


  private buildSecurityDepositRows(lines: SecurityDepositDetailLineResponse[]): string {
    if (!lines.length) {
      return `<tr class="ledger-line-row"><td colspan="4">No security deposit payments found.</td></tr>`;
    }

    return lines.map(line => this.formatDetailLineRow(
      line.lineDate,
      line.journalEntryCode,
      line.description,
      line.amount
    )).join('');
  }

  private calculateBalanceDue(detail: SecurityDepositDetailResponse): number {
    const collectedAmount = Number(detail.collectedAmount ?? 0);
    const totalOutstandingCharges = this.sumLineAmounts(detail.outstandingCharges);
    const totalTenantPayments = this.sumReturnPaymentAmounts(detail.returnPayments);
    return Math.max(0, collectedAmount - totalOutstandingCharges - totalTenantPayments);
  }

  private sumLineAmounts(lines: SecurityDepositDetailLineResponse[]): number {
    return lines.reduce((total, line) => total + Number(line.amount ?? 0), 0);
  }

  private sumReturnPaymentAmounts(lines: SecurityDepositDetailResponse['returnPayments']): number {
    return lines.reduce((total, line) => total + Number(line.amount ?? 0), 0);
  }

  private buildChargeRows(lines: SecurityDepositDetailLineResponse[]): string {
    if (!lines.length) {
      return `<tr class="ledger-line-row"><td colspan="4">No outstanding charges found.</td></tr>`;
    }

    return lines.map(line => this.formatDetailLineRow(
      line.lineDate,
      line.invoiceCode,
      line.description,
      line.amount
    )).join('');
  }

  private buildTenantPaymentRows(lines: SecurityDepositDetailResponse['returnPayments']): string {
    if (!lines.length) {
      return `<tr class="ledger-line-row"><td colspan="4">No payments found.</td></tr>`;
    }

    return lines.map(line => this.formatDetailLineRow(
      line.transactionDate,
      line.journalEntryCode,
      line.memo || 'Security Deposit Return',
      line.amount
    )).join('');
  }

  private buildBalanceDueRow(detail: SecurityDepositDetailResponse): string {
    const balanceDue = this.calculateBalanceDue(detail);
    return `
      <tr class="subtotal-row">
        <td></td>
        <td></td>
        <td class="invoice-summary-cell"><span class="label invoice-summary-label">Balance Due:</span></td>
        <td class="amount-col">${this.formatterService.currencyUsd(balanceDue)}</td>
      </tr>`;
  }

  private formatDetailLineRow(dateValue: string | null | undefined, refNo: string, description: string, amount: number): string {
    return `<tr class="ledger-line-row">
      <td>${this.escapeHtml(this.formatterService.formatDateString(dateValue || '') || '')}</td>
      <td>${this.escapeHtml(refNo || '')}</td>
      <td>${this.escapeHtml(description || '')}</td>
      <td class="amount-col">${this.formatterService.currencyUsd(Number(amount ?? 0))}</td>
    </tr>`;
  }

  private buildResponsiblePartiesBlock(ctx: SecurityDepositReportPrintContext): string {
    const invoiceContext = this.toInvoicePrintContext(ctx);
    if (!invoiceContext) {
      return '';
    }

    const baseBlock = this.invoiceHtmlBuilder.getResponsiblePartiesBlock(invoiceContext);
    const reservation = ctx.reservation;
    const extraLines = [
      this.formatLabeledDateLine('Arrival', reservation?.arrivalDate),
      this.formatLabeledDateLine('Departure', reservation?.departureDate)
    ].filter((line): line is string => !!line);

    return [baseBlock, ...extraLines].filter(Boolean).join('<br>');
  }

  private buildPropertySideBlock(ctx: SecurityDepositReportPrintContext): string {
    const invoiceContext = this.toInvoicePrintContext(ctx);
    if (!invoiceContext) {
      return '';
    }

    const baseBlock = this.invoiceHtmlBuilder.getPropertySideBlock(invoiceContext, false);
    const reservation = ctx.reservation;
    const securityDepositLine = `<span style="font-weight: bold">Security Deposit:</span> ${this.formatterService.currencyUsd(Number(ctx.detail.depositAmount ?? 0))}`;
    const returnedByLine = this.formatLabeledDateLine('Return By', this.resolveSecurityDepositReturnDate(ctx));
    const extraLines = returnedByLine
      ? [securityDepositLine, returnedByLine]
      : [securityDepositLine];

    return [baseBlock, ...extraLines].filter(Boolean).join('<br>');
  }

  private toInvoicePrintContext(ctx: SecurityDepositReportPrintContext): InvoicePrintContext | null {
    if (!ctx.reservation || !ctx.selectedOffice) {
      return null;
    }

    return {
      invoice: {} as InvoiceResponse,
      reservation: ctx.reservation,
      property: ctx.property,
      contact: ctx.contact,
      contacts: ctx.contacts.length > 0 ? ctx.contacts : (ctx.contact ? [ctx.contact] : []),
      selectedOffice: ctx.selectedOffice,
      selectedAccountingOffice: ctx.selectedAccountingOffice,
      organization: ctx.organization,
      accountingOfficeLogo: ctx.accountingOfficeLogo,
      orgLogo: '',
      paymentCostCodeIds: new Set<number>()
    };
  }

  private resolveSecurityDepositReturnDate(ctx: SecurityDepositReportPrintContext): string | null {
    const fromListRow = String(ctx.securityDepositReturnDate || '').trim();
    if (fromListRow && fromListRow !== '01/01/1901' && fromListRow !== '1901-01-01') {
      return fromListRow;
    }

    const fromDetail = String(ctx.detail.reservation.securityDepositReturnDate || '').trim();
    if (fromDetail && fromDetail !== '01/01/1901' && fromDetail !== '1901-01-01') {
      return fromDetail;
    }

    return null;
  }

  private formatLabeledDateLine(label: string, dateValue: string | null | undefined): string | null {
    const formattedDate = this.formatterService.formatDateString(dateValue || '') || '';
    if (!formattedDate || formattedDate === '01/01/1901') {
      return null;
    }

    return `<span style="font-weight: bold">${label}:</span> ${this.escapeHtml(formattedDate)}`;
  }

  private buildAccountingOfficeAddressSingleLine(accountingOffice: AccountingOfficeResponse): string {
    return [accountingOffice.address1, accountingOffice.city, accountingOffice.state, accountingOffice.zip]
      .filter(Boolean)
      .join(', ');
  }

  private ensureChargesTableStyles(extractedStyles: string): string {
    if (extractedStyles.includes('.charges-table .col-date')) {
      return extractedStyles;
    }

    return `${extractedStyles}\n${this.chargesTableLayoutStyles}`;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
