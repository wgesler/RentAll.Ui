import { Injectable } from '@angular/core';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { getBillingMethod } from '../../reservations/models/reservation-enum';
import { TransactionType } from '../models/accounting-enum';
import { InvoiceResponse, LedgerLineResponse } from '../models/invoice.model';
import { InvoicePrintContext } from '../models/invoice-print-context.model';

@Injectable({
  providedIn: 'root'
})
export class InvoiceHtmlBuilderService {
  constructor(
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private documentHtmlService: DocumentHtmlService
  ) {}

  buildProcessedPreview(templateHtml: string, ctx: InvoicePrintContext): { processedHtml: string; extractedStyles: string } {
    const processedHtml = this.replacePlaceholders(templateHtml, ctx);
    const normalized = this.normalizeInvoiceLayoutHtml(processedHtml);
    return this.documentHtmlService.processHtml(normalized, true);
  }

  replacePlaceholders(html: string, ctx: InvoicePrintContext): string {
    let result = html;

    if (ctx.invoice) {
      const totals = this.getInvoiceDisplayTotals(ctx.invoice, ctx);
      result = result.replace(/\{\{invoiceName\}\}/g, ctx.invoice.invoiceCode || '');
      result = result.replace(/\{\{invoiceDate\}\}/g, this.formatterService.formatDateString(ctx.invoice.invoiceDate) || '');
      result = result.replace(/\{\{startDate\}\}/g, ctx.invoice.startDate ? this.formatterService.formatDateString(ctx.invoice.startDate) : '');
      result = result.replace(/\{\{endDate\}\}/g, ctx.invoice.endDate ? this.formatterService.formatDateString(ctx.invoice.endDate) : '');
      result = result.replace(/\{\{totalAmount\}\}/g, this.formatterService.currency(totals.totalCharges));
      result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(totals.totalPayments));
      result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency(totals.totalDue));
    }

    if (ctx.reservation) {
      result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, this.getResponsiblePartiesBlock(ctx) || '');
    }

    if (ctx.property) {
      result = result.replace(/\{\{propertySideBlock\}\}/g, this.getPropertySideBlock(ctx) || '');
    }

    if (ctx.selectedOffice) {
      result = result.replace(/\{\{officeName\}\}/g, ctx.selectedOffice.name || '');
    }

    const preferredLogoDataUrl = ctx.accountingOfficeLogo || ctx.orgLogo;
    if (preferredLogoDataUrl) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, preferredLogoDataUrl);
    }

    if (ctx.orgLogo) {
      result = result.replace(/\{\{orgLogoBase64\}\}/g, ctx.orgLogo);
    }

    if (!preferredLogoDataUrl && !ctx.orgLogo) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    if (ctx.selectedAccountingOffice) {
      result = result.replace(/\{\{companyName\}\}/g, ctx.organization?.name || '');
      result = result.replace(/\{\{accountingOfficeName\}\}/g, ctx.selectedAccountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.getAccountingOfficeAddress(ctx) || '');
      result = result.replace(/\{\{accountingOfficeAddressSingleLine\}\}/g, this.getAccountingOfficeAddressSingleLine(ctx) || '');
      result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, ctx.selectedAccountingOffice.city + ', ' + ctx.selectedAccountingOffice.state + ' ' + ctx.selectedAccountingOffice.zip || '');
      result = result.replace(/\{\{accountingOfficeEmail\}\}/g, ctx.selectedAccountingOffice.email || '');
      result = result.replace(/\{\{accountingOfficePhone\}\}/g, this.formatterService.phoneNumber(ctx.selectedAccountingOffice.phone) || '');
      result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, ctx.selectedAccountingOffice.website || '');
      result = result.replace(/\{\{accountingOfficeBank\}\}/g, ctx.selectedAccountingOffice.bankName || '');
      result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, ctx.selectedAccountingOffice.bankRouting || '');
      result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, ctx.selectedAccountingOffice.bankAccount || '');
      result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, ctx.selectedAccountingOffice.bankSwiftCode || '');
      result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, ctx.selectedAccountingOffice.bankAddress || '');
      result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, this.formatterService.phoneNumber(ctx.selectedAccountingOffice.bankPhone) || '');
    }

    result = this.applyInvoiceLedgerSectionPlaceholders(result, ctx);

    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  applyInvoiceLedgerSectionPlaceholders(html: string, ctx: InvoicePrintContext): string {
    let result = html;
    const invoice = ctx.invoice;
    const emptyRows = '';
    const zeroMoney = this.formatterService.currency(0);

    if (!invoice?.ledgerLines?.length) {
      result = result.replace(/\{\{chargeLedgerLineRows\}\}/g, emptyRows);
      result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, emptyRows);
      result = result.replace(/\{\{totalCharges\}\}/g, zeroMoney);
      result = result.replace(/\{\{totalPayments\}\}/g, zeroMoney);
      const apiBalanceDue = invoice
        ? (invoice.totalAmount || 0) - (invoice.paidAmount || 0)
        : 0;
      result = result.replace(/\{\{invoiceLedgerBalanceDue\}\}/g, this.formatterService.currency(apiBalanceDue));
      result = result.replace(/\{\{totalChargesRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, '');
      result = result.replace(/\{\{paymentsSectionStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, 'display: none;');
      return this.applyInvoiceLayoutClass(result, 0);
    }

    const paymentLines = invoice.ledgerLines.filter(l => this.isPaymentLedgerLine(l, ctx));
    const chargeLines = invoice.ledgerLines.filter(l => !this.isPaymentLedgerLine(l, ctx));
    const displayChargeLines = this.collapseChargeLinesForDisplay(chargeLines, ctx);
    const totalLedgerLines = displayChargeLines.length + paymentLines.length;
    const hasPayments = paymentLines.length > 0;

    const chargeRows = displayChargeLines.map(l => this.formatInvoiceLedgerRowHtml(l, ctx)).join('\n');
    const paymentRows = paymentLines.map(l => this.formatInvoiceLedgerRowHtml(l, ctx)).join('\n');

    const totalChargesAmount = chargeLines.reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalPaymentsAmount = paymentLines.reduce((sum, l) => sum + (l.amount || 0), 0);
    const balanceDueFromLedger = totalChargesAmount - totalPaymentsAmount;

    result = result.replace(/\{\{chargeLedgerLineRows\}\}/g, chargeRows);
    result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, paymentRows);
    result = result.replace(/\{\{totalCharges\}\}/g, this.formatterService.currency(totalChargesAmount));
    result = result.replace(/\{\{totalPayments\}\}/g, this.formatterService.currency(totalPaymentsAmount));
    result = result.replace(/\{\{invoiceLedgerBalanceDue\}\}/g, this.formatterService.currency(balanceDueFromLedger));

    if (hasPayments) {
      result = result.replace(/\{\{totalChargesRowStyle\}\}/g, '');
      result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{paymentsSectionStyle\}\}/g, '');
      result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, '');
      result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, '');
    } else {
      result = result.replace(/\{\{totalChargesRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, '');
      result = result.replace(/\{\{paymentsSectionStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, 'display: none;');
      result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, 'display: none;');
    }

    return this.applyInvoiceLayoutClass(result, totalLedgerLines);
  }

  applyInvoiceLayoutClass(html: string, totalLedgerLines: number): string {
    const layoutClasses: string[] = [];
    if (totalLedgerLines > 2) {
      layoutClasses.push('rentall-ledger-lines-many');
    }
    if (totalLedgerLines >= 5) {
      layoutClasses.push('rentall-ledger-lines-dense');
    }
    return html.replace(/<div class="page([^"]*)">/i, (_match, extraClasses: string) => {
      const cleaned = extraClasses
        .replace(/\s*rentall-ledger-lines-(?:sparse|many|dense)\s*/g, ' ')
        .trim();
      const classes = ['page', cleaned, ...layoutClasses].filter(part => part.length > 0).join(' ');
      return `<div class="${classes}">`;
    });
  }

  formatInvoiceLedgerRowHtml(line: LedgerLineResponse, ctx: InvoicePrintContext): string {
    const date = this.formatterService.formatDateString(line.ledgerLineDate || ctx.invoice.invoiceDate) || '';
    const description = (line.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const amount = this.formatterService.currency(line.amount || 0);
    return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${description}</td>
                <td class="amount-col">${amount}</td>
              </tr>`;
  }

  isPaymentLedgerLine(line: LedgerLineResponse, ctx: InvoicePrintContext): boolean {
    const costCodeId = Number(line.costCodeId);
    if (Number.isFinite(costCodeId) && ctx.paymentCostCodeIds.has(costCodeId))
      return true;

    return line.transactionTypeId === TransactionType.Payment;
  }

  isRentChargeLedgerLine(line: LedgerLineResponse, ctx: InvoicePrintContext): boolean {
    const costCodeId = Number(line.costCodeId);
    if (Number.isFinite(costCodeId) && this.getRentChargeCostCodeIds(ctx).has(costCodeId))
      return true;

    return /^Rental Fee/i.test(line.description || '');
  }

  getRentChargeCostCodeIds(ctx: InvoicePrintContext): Set<number> {
    const ids = new Set<number>();
    const office = ctx.selectedOffice;
    if (office?.furnishedRentChargeCcId != null)
      ids.add(Number(office.furnishedRentChargeCcId));
    if (office?.unfurnishedRentChargeCcId != null)
      ids.add(Number(office.unfurnishedRentChargeCcId));
    return ids;
  }

  collapseChargeLinesForDisplay(chargeLines: LedgerLineResponse[], ctx: InvoicePrintContext): LedgerLineResponse[] {
    if (!ctx.reservation?.collapseCharges || chargeLines.length <= 1)
      return chargeLines;

    const rentLine = chargeLines.find(line => this.isRentChargeLedgerLine(line, ctx));
    if (!rentLine)
      return chargeLines;

    const totalAmount = chargeLines.reduce((sum, line) => sum + (line.amount || 0), 0);
    return [{ ...rentLine, amount: totalAmount }];
  }

  getInvoiceDisplayTotals(invoice: InvoiceResponse, ctx: InvoicePrintContext): { totalCharges: number; totalPayments: number; totalDue: number } {
    if (!invoice?.ledgerLines?.length) {
      const totalCharges = Number(invoice?.totalAmount || 0);
      const totalPayments = Number(invoice?.paidAmount || 0);
      return {
        totalCharges,
        totalPayments,
        totalDue: totalCharges - totalPayments
      };
    }

    const paymentLines = invoice.ledgerLines.filter(line => this.isPaymentLedgerLine(line, ctx));
    const chargeLines = invoice.ledgerLines.filter(line => !this.isPaymentLedgerLine(line, ctx));
    const totalCharges = chargeLines.reduce((sum, line) => sum + (line.amount || 0), 0);
    const totalPayments = paymentLines.reduce((sum, line) => sum + (line.amount || 0), 0);
    return {
      totalCharges,
      totalPayments,
      totalDue: totalCharges - totalPayments
    };
  }

  getResponsiblePartiesBlock(ctx: InvoicePrintContext): string {
    const contacts = this.getResponsibleContacts(ctx);
    if (contacts.length === 0) {
      return '';
    }

    return contacts.map(contact => {
      const pContact = ctx.contacts.find(c => c.contactId === ctx.reservation.companyId) ?? contact;
      const responsibleParty = this.escapeHtml(this.utilityService.getResponsibleParty(ctx.reservation, pContact));
      const responsiblePartyAddress1Raw = this.utilityService.getResponsiblePartyAddress1(ctx.reservation, pContact);
      const responsiblePartyAddress2Raw = this.utilityService.getResponsiblePartyAddress2(ctx.reservation, pContact);
      const responsiblePartyAddress1 = this.escapeHtml(responsiblePartyAddress1Raw);
      const responsiblePartyAddress2 = this.escapeHtml(responsiblePartyAddress2Raw);
      const responsiblePartyAddressSingleLine = [responsiblePartyAddress1, responsiblePartyAddress2].filter(part => part).join(', ');
      const responsiblePartyOccupant = this.escapeHtml(ctx.reservation.tenantName);
      const responsiblePartyRefNo = this.escapeHtml(ctx.reservation.referenceNo);
      const useSingleAddressLine = this.utilityService.isAddressSingleLine('Address:', responsiblePartyAddress1Raw, responsiblePartyAddress2Raw);

      const lines = [
        `<span style="font-weight: bold">Client:</span> ${responsibleParty}`,
        useSingleAddressLine
          ? `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddressSingleLine}`
          : `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddress1}`,
        ...(!useSingleAddressLine && responsiblePartyAddress2 ? [`&nbsp;&nbsp;&nbsp;&nbsp;${responsiblePartyAddress2}`] : []),
        `<span style="font-weight: bold">Occupant:</span> ${responsiblePartyOccupant}`,
        ...(responsiblePartyRefNo ? [`<span style="font-weight: bold">Ref No:</span> ${responsiblePartyRefNo}`] : [])
      ];
      return lines.join('<br>');
    }).join('<br>');
  }

  getPropertySideBlock(ctx: InvoicePrintContext): string {
    if (!ctx.property)
      return '';

    const propertyAddress1Raw = this.getPropertyAddress1(ctx);
    const propertyAddress2Raw = this.getPropertyAddress2(ctx);
    const propertyAddress1 = this.escapeHtml(propertyAddress1Raw);
    const propertyAddress2 = this.escapeHtml(propertyAddress2Raw);
    const propertyAddressSingleLine = [propertyAddress1, propertyAddress2].filter(part => part).join(', ');
    const propertyCode = this.escapeHtml(ctx.property.propertyCode || '');
    const billingType = this.escapeHtml(getBillingMethod(ctx.reservation?.billingMethodId));
    const useSingleAddressLine = this.utilityService.isAddressSingleLine('Property Address:', propertyAddress1Raw, propertyAddress2Raw);

    const lines = [
      `<span style="font-weight: bold">Property Code:</span> ${propertyCode}`,
      useSingleAddressLine
        ? `<span style="font-weight: bold">Property Address:</span> ${propertyAddressSingleLine}`
        : `<span style="font-weight: bold">Property Address:</span> ${propertyAddress1}`,
      ...(!useSingleAddressLine ? [`&nbsp;&nbsp;&nbsp;&nbsp;${propertyAddress2}`] : []),
      `<span style="font-weight: bold">Billing Type:</span> ${billingType}`
    ];
    return lines.join('<br>');
  }

  getPropertyAddress1(ctx: InvoicePrintContext): string {
    if (!ctx.property) {
      return '';
    }
    return [ctx.property.address1, ctx.property.suite]
      .map(part => String(part ?? '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  getPropertyAddress2(ctx: InvoicePrintContext): string {
    if (!ctx.property) {
      return '';
    }
    const city = String(ctx.property.city ?? '').trim();
    const state = String(ctx.property.state ?? '').trim();
    const zip = String(ctx.property.zip ?? '').trim();
    const stateZip = [state, zip].filter(part => part.length > 0).join(' ');
    return [city, stateZip].filter(part => part.length > 0).join(', ');
  }

  getResponsibleContacts(ctx: InvoicePrintContext): ContactResponse[] {
    const selectedContactIds = ctx.reservation?.contactIds || [];
    const uniqueContactIds = new Set<string>();
    const contacts: ContactResponse[] = [];

    selectedContactIds.forEach(contactId => {
      const normalizedContactId = String(contactId || '').trim();
      if (!normalizedContactId || uniqueContactIds.has(normalizedContactId)) {
        return;
      }
      const reservationContact = ctx.contacts.find(c => c.contactId === normalizedContactId);
      if (reservationContact) {
        uniqueContactIds.add(normalizedContactId);
        contacts.push(reservationContact);
      }
    });

    if (contacts.length === 0 && ctx.contact) {
      contacts.push(ctx.contact);
    }

    return contacts;
  }

  escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getAccountingOfficeAddress(ctx: InvoicePrintContext): string {
    if (!ctx.selectedAccountingOffice) return '';
    return this.getAccountingOfficeStreetLine(ctx.selectedAccountingOffice);
  }

  getAccountingOfficeAddressSingleLine(ctx: InvoicePrintContext): string {
    if (!ctx.selectedAccountingOffice) return '';
    const street = this.getAccountingOfficeStreetLine(ctx.selectedAccountingOffice);
    const cityStateZip = this.getAccountingOfficeCityStateZip(ctx.selectedAccountingOffice);
    return [street, cityStateZip].filter(part => part.length > 0).join(', ');
  }

  getAccountingOfficeStreetLine(office: AccountingOfficeResponse): string {
    return [office.address1, office.suite, office.address2]
      .map(part => String(part || '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  getAccountingOfficeCityStateZip(office: AccountingOfficeResponse): string {
    const city = String(office.city || '').trim();
    const state = String(office.state || '').trim();
    const zip = String(office.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => part.length > 0).join(' ');
  }

  normalizeInvoiceLayoutHtml(html: string): string {
    let result = this.tagInvoiceFooterDiagnostics(this.tagInvoiceHeaderDiagnostics(html));

    if (/rentall-row-client/i.test(result)) {
      return result;
    }

    const containerBounds = this.findContainerTableBounds(result);
    if (!containerBounds) {
      return result;
    }

    const containerHtml = result.substring(containerBounds.start, containerBounds.end);
    const tbodyMatch = containerHtml.match(/<tbody[^>]*>([\s\S]*)<\/tbody>/i);
    if (!tbodyMatch) {
      return result;
    }

    let rows = this.extractDirectTbodyRows(tbodyMatch[1]).filter((row) => !/rentall-section-gap/i.test(row));
    if (rows.length > 0) {
      rows[0] = this.tagInvoiceRow(rows[0], 'rentall-row-client');
      rows[0] = this.tagInvoiceZone(rows[0], 'rentall-zone-client', 0);
      rows[0] = this.tagInvoiceZone(rows[0], 'rentall-zone-property', 1);
    }
    if (rows.length > 1) {
      rows[1] = this.tagInvoiceRow(rows[1], 'rentall-row-charges');
      rows[1] = this.tagInvoiceSubzone(rows[1], 'invoice-payments-section', 'rentall-zone-payments');
      rows[1] = this.tagInvoiceSubzone(rows[1], 'invoice-balance-due-bottom', 'rentall-zone-balance');
      rows[1] = this.tagInvoiceZone(rows[1], 'rentall-zone-charges', 0);
    }
    if (rows.length > 2) {
      rows[2] = this.tagInvoiceRow(rows[2], 'rentall-row-payment');
      rows[2] = this.tagInvoiceZone(rows[2], 'rentall-zone-payment', 0);
      rows[2] = this.tagInvoicePaymentBankZones(rows[2]);
      rows[2] = rows[2].replace(
        /<h3([^>]*style=["'][^"']*padding-left:\s*15px[^"']*["'][^>]*)>/i,
        '<h3 class="rentall-payment-indent">'
      );
      rows[2] = rows[2].replace(
        /<p([^>]*style=["']padding-left:\s*15px[^"']*["'][^>]*)>\s*(?!Thank you)/gi,
        '<p class="rentall-payment-indent">'
      );
      rows[2] = rows[2].replace(
        /<p(?![^>]*rentall-thank-you)([^>]*)>\s*Thank you/i,
        '<p class="rentall-payment-indent rentall-thank-you">Thank you'
      );
    }

    const rebuiltContainer = containerHtml.replace(
      /<tbody[^>]*>[\s\S]*<\/tbody>/i,
      `<tbody>${rows.join('')}</tbody>`
    );
    return result.substring(0, containerBounds.start) + rebuiltContainer + result.substring(containerBounds.end);
  }

  tagInvoiceHeaderDiagnostics(html: string): string {
    let result = html;

    result = result.replace(
      /<div class="header-row([^"]*)">/i,
      (match) => /rentall-header-row/i.test(match) ? match : match.replace('header-row', 'header-row rentall-header-row')
    );
    result = result.replace(
      /<div class="logo-container([^"]*)">/i,
      (match) => /rentall-zone-header-left/i.test(match) ? match : match.replace('logo-container', 'logo-container rentall-zone-header-left')
    );
    result = result.replace(
      /<div class="accounting-office-container([^"]*)">/i,
      (match) => /rentall-zone-office/i.test(match) ? match : match.replace('accounting-office-container', 'accounting-office-container rentall-zone-office')
    );
    result = result.replace(
      /class="accounting-office-logo-cell([^"]*)"/i,
      (match) => /rentall-zone-logo/i.test(match) ? match : match.replace('accounting-office-logo-cell', 'accounting-office-logo-cell rentall-zone-logo')
    );
    if (!/accounting-office-logo-wrap/i.test(result)) {
      result = result.replace(
        /(<td class="accounting-office-logo-cell[^"]*">)\s*(<img\b[^>]*>)/i,
        '$1<div class="accounting-office-logo-wrap">$2</div>'
      );
    }
    result = result.replace(
      /class="accounting-office-info-cell([^"]*)"/i,
      (match) => /rentall-zone-office-info/i.test(match) ? match : match.replace('accounting-office-info-cell', 'accounting-office-info-cell rentall-zone-office-info')
    );
    result = result.replace(
      /<div class="invoice-info-header([^"]*)">/i,
      (match) => /rentall-zone-header-right/i.test(match) ? match : match.replace('invoice-info-header', 'invoice-info-header rentall-zone-header-right')
    );

    if (!/rentall-invoice-title-block/i.test(result)) {
      result = result.replace(
        /<\/div>\s*(<!-- =+ MAIN CONTENT =+ -->)?\s*<h3([^>]*text-align:\s*center[^>]*)>\s*<span class="label">Client Invoice #:<\/span>/i,
        '</div>\n\n  <!-- ===================== MAIN CONTENT ===================== -->\n  <div class="rentall-invoice-title-block">\n    <h3$1 style="text-align: center;"><span class="label">Client Invoice #:</span>'
      );
      result = result.replace(
        /(<div class="rentall-invoice-title-block">\s*<h3[^>]*>\s*<span class="label">Client Invoice #:<\/span>[^<]*<\/span>\s*\{\{invoiceName\}\}\s*<\/h3>)(?!\s*<\/div>)/i,
        '$1\n  </div>'
      );
    }

    return result;
  }

  tagInvoiceFooterDiagnostics(html: string): string {
    let result = html;

    result = result.replace(
      /<table([^>]*\bid=["']footer["'])([^>]*)>/i,
      (match, idPart: string, rest: string) => /rentall-footer/i.test(match) ? match : `<table${idPart} class="rentall-footer"${rest}>`
    );
    result = result.replace(
      /(<table[^>]*\bid=["']footer["'][^>]*>[\s\S]*?<tbody>[\s\S]*?<tr)([^>]*)(>)/i,
      (match, prefix: string, trAttrs: string, suffix: string) => /rentall-footer-row/i.test(match) ? match : `${prefix}${trAttrs} class="rentall-footer-row"${suffix}`
    );
    result = result.replace(
      /(<table[^>]*\bid=["']footer["'][^>]*>[\s\S]*?<tr[^>]*>[\s\S]*?<td)([^>]*)(>)/i,
      (match, prefix: string, tdAttrs: string, suffix: string) => /rentall-zone-footer/i.test(match) ? match : `${prefix}${tdAttrs} class="rentall-zone-footer"${suffix}`
    );

    return result;
  }

  findContainerTableBounds(html: string): { start: number; end: number } | null {
    const startMatch = html.match(/<table[^>]*\bid=["']container["'][^>]*>/i);
    if (!startMatch || startMatch.index === undefined) {
      return null;
    }

    const start = startMatch.index;
    let depth = 1;
    let pos = start + startMatch[0].length;
    const lower = html.toLowerCase();

    while (pos < html.length && depth > 0) {
      const nextOpen = lower.indexOf('<table', pos);
      const nextClose = lower.indexOf('</table>', pos);
      if (nextClose === -1) {
        return null;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 6;
        continue;
      }

      depth--;
      if (depth === 0) {
        return { start, end: nextClose + 8 };
      }
      pos = nextClose + 8;
    }

    return null;
  }

  extractDirectTbodyRows(tbodyHtml: string): string[] {
    const rows: string[] = [];
    let pos = 0;

    while (pos < tbodyHtml.length) {
      const trStart = tbodyHtml.toLowerCase().indexOf('<tr', pos);
      if (trStart === -1) {
        break;
      }

      const before = tbodyHtml.substring(0, trStart);
      const openTables = (before.match(/<table\b/gi) ?? []).length;
      const closeTables = (before.match(/<\/table>/gi) ?? []).length;
      if (openTables > closeTables) {
        pos = trStart + 3;
        continue;
      }

      let depth = 1;
      let scan = trStart + 3;
      let trEnd = -1;
      const lower = tbodyHtml.toLowerCase();

      while (scan < tbodyHtml.length) {
        const nextOpen = lower.indexOf('<tr', scan);
        const nextClose = lower.indexOf('</tr>', scan);
        if (nextClose === -1) {
          break;
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          scan = nextOpen + 3;
          continue;
        }

        depth--;
        if (depth === 0) {
          trEnd = nextClose + 5;
          break;
        }

        scan = nextClose + 5;
      }

      if (trEnd === -1) {
        break;
      }

      rows.push(tbodyHtml.substring(trStart, trEnd));
      pos = trEnd;
    }

    return rows;
  }

  tagInvoiceRow(rowHtml: string, classNames: string): string {
    if (/class=["']/i.test(rowHtml)) {
      return rowHtml.replace(/<tr([^>]*?)class=["']([^"']*)["']/i, (match, prefix: string, existing: string) => {
        const additions = classNames.split(/\s+/).filter((name) => name && !existing.includes(name));
        if (additions.length === 0) {
          return match;
        }
        return `<tr${prefix}class="${existing} ${additions.join(' ')}"`;
      });
    }
    return rowHtml.replace(/<tr/i, `<tr class="${classNames}"`);
  }

  addClassToElementTag(tagHtml: string, className: string): string {
    if (new RegExp(`\\b${className}\\b`).test(tagHtml)) {
      return tagHtml;
    }
    if (/class=["']/i.test(tagHtml)) {
      return tagHtml.replace(/class=["']([^"']*)["']/i, (_match, existing: string) => `class="${existing} ${className}"`);
    }
    return tagHtml.replace(/<(\w+)/i, `<$1 class="${className}"`);
  }

  tagInvoiceZone(rowHtml: string, zoneClass: string, zoneIndex: number): string {
    const pattern = /<div class="[^"]*\bborder\b[^"]*"/gi;
    let matchIndex = 0;
    return rowHtml.replace(pattern, (match) => {
      if (matchIndex !== zoneIndex) {
        matchIndex++;
        return match;
      }
      matchIndex++;
      return this.addClassToElementTag(match, zoneClass);
    });
  }

  tagInvoiceSubzone(rowHtml: string, subzoneClass: string, rentallClass: string): string {
    const pattern = new RegExp(`<div class="([^"]*\\b${subzoneClass}\\b[^"]*)"`, 'i');
    return rowHtml.replace(pattern, (match) => this.addClassToElementTag(match, rentallClass));
  }

  tagInvoicePaymentBankZones(rowHtml: string): string {
    const pattern = /<div class="[^"]*\bborder\b[^"]*"/gi;
    let bankIndex = 0;
    return rowHtml.replace(pattern, (match) => {
      if (/rentall-zone-payment/i.test(match)) {
        return match;
      }
      const zoneClass = bankIndex === 0 ? 'rentall-zone-bank-left' : 'rentall-zone-bank-right';
      bankIndex++;
      return this.addClassToElementTag(match, zoneClass);
    });
  }
}
