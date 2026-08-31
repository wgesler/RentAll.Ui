import { Injectable, inject } from '@angular/core';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { OwnerStatementMonthLineListDisplay, OwnerStatementPropertyActivityLineResponse } from '../models/owner-statement.model';
import { OwnerStatementPrintContext } from '../models/owner-statement-print-context.model';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementHtmlBuilderService {
  private formatterService = inject(FormatterService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private documentHtmlService = inject(DocumentHtmlService);

  buildProcessedPreview(templateHtml: string, ctx: OwnerStatementPrintContext): { previewIframeHtml: string; previewIframeStyles: string } {
    const mergedHtml = this.replacePlaceholders(templateHtml, ctx);
    const { processedHtml, extractedStyles } = this.documentHtmlService.processHtml(mergedHtml, true);
    return {
      previewIframeHtml: processedHtml,
      previewIframeStyles: extractedStyles
    };
  }

  getStatementMonthLabel(line: OwnerStatementMonthLineListDisplay): string {
    if (!line) {
      return '';
    }

    const periodStartDate = (line.periodStartDate || line.monthDate || '').trim();
    const periodEndDate = (line.periodEndDate || line.monthDate || periodStartDate).trim();
    return this.mappingService.formatOwnerStatementPeriodMonthLabel(periodStartDate, periodEndDate)
      || (line.monthDisplay || '').trim();
  }

  buildOwnerStatementFileName(line: OwnerStatementMonthLineListDisplay): string {
    const propertyCode = (line?.propertyCode || 'OwnerStatement').replace(/[^a-zA-Z0-9-]/g, '');
    const month = (line?.monthDisplay || '').replace(/[^a-zA-Z0-9-]/g, '');
    return `OwnerStatement_${propertyCode}_${month || this.utilityService.todayAsCalendarDateString()}.pdf`;
  }

  replacePlaceholders(html: string, ctx: OwnerStatementPrintContext): string {
    const line = ctx.line;
    if (!line) {
      return html;
    }

    const periodStartDate = (line.periodStartDate || line.monthDate || '').trim();
    const periodEndDate = (line.periodEndDate || line.monthDate || '').trim();
    const periodDisplay = line.monthDisplay || '';
    const periodTitle = this.mappingService.formatOwnerStatementPeriodTitle(periodStartDate, periodEndDate) || periodDisplay;
    const openingBalanceDate = this.formatPreviousMonthEndDate(periodStartDate);
    const closingBalanceDate = this.formatReportingMonthEndDate(periodEndDate) || this.formatFullDate(periodEndDate);
    const startingBalance = this.mappingService.parseCurrencyValue(line.startingBalance);
    const income = this.mappingService.parseCurrencyValue(line.income);
    const expenses = this.mappingService.parseCurrencyValue(line.expenses);
    const workingCapital = this.mappingService.parseCurrencyValue(line.workingCapital);
    const ownerPaymentPaid = this.mappingService.parseCurrencyValue(line.ownerPaymentPaid);
    const incomeActivities = (ctx.statementActivityLines || [])
      .filter(activity => Number(activity.receivedIncome) !== 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.activityDate, b.activityDate));
    const expenseActivities = (ctx.statementActivityLines || [])
      .filter(activity => Number(activity.expenses) !== 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.activityDate, b.activityDate));

    let runningTotal = startingBalance;
    const openingBalanceRows = [
      this.buildSummaryBalanceRow('Starting Balance', openingBalanceDate, runningTotal, false)
    ].join('\n');

    let incomeRows = '';
    const unpaidIncomeEntries = this.getUnpaidAccrualEntries(ctx);
    const incomeLineRows: { sortDate: string; html: string }[] = [];

    if (incomeActivities.length > 0) {
      incomeActivities.forEach(activity => {
        const amount = Number(activity.receivedIncome) || 0;
        runningTotal += amount;
        const { refNo, description } = this.parseActivityRefAndDescription(activity, 'Income');
        incomeLineRows.push({
          sortDate: activity.activityDate,
          html: this.buildChargeRow(
            this.formatActivityDateForStatement(activity, closingBalanceDate),
            refNo,
            description,
            amount,
            runningTotal)
        });
      });
    } else if (income !== 0) {
      runningTotal += income;
      incomeLineRows.push({
        sortDate: periodEndDate,
        html: this.buildChargeRow(closingBalanceDate, '', 'Income', income, runningTotal)
      });
    }

    unpaidIncomeEntries.forEach(entry => {
      const { refNo, description } = this.parseActivityRefAndDescription(entry.line, 'Income');
      incomeLineRows.push({
        sortDate: entry.line.activityDate,
        html: this.buildChargeRow(
          this.formatActivityDateForStatement(entry.line, closingBalanceDate),
          refNo,
          description,
          entry.unpaidAmount,
          runningTotal,
          true)
      });
    });

    incomeLineRows.sort((a, b) => this.utilityService.compareCalendarDateStrings(a.sortDate, b.sortDate));
    incomeRows = incomeLineRows.map(row => row.html).join('\n');
    if (!incomeRows) {
      incomeRows = this.buildBlankLedgerRow();
    }

    let chargesRows = '';
    if (expenseActivities.length > 0) {
      chargesRows = expenseActivities.map(activity => {
        const amount = Number(activity.expenses) || 0;
        runningTotal -= amount;
        const { refNo, description } = this.parseActivityRefAndDescription(activity, 'Expense');
        return this.buildChargeRow(
          this.formatActivityDateForStatement(activity, closingBalanceDate),
          refNo,
          description,
          amount,
          runningTotal);
      }).join('\n');
    } else if (expenses !== 0) {
      runningTotal -= expenses;
      chargesRows = this.buildChargeRow(closingBalanceDate, '', 'Expenses', expenses, runningTotal);
    }
    if (!chargesRows) {
      chargesRows = this.buildBlankLedgerRow();
    }

    if (workingCapital > 0) {
      runningTotal -= workingCapital;
      chargesRows = [
        chargesRows,
        this.buildChargeRow(closingBalanceDate, '', 'Working Capital', workingCapital, runningTotal)
      ].filter(row => row.length > 0).join('\n');
    }

    let paymentsRows = '';
    if (ownerPaymentPaid > 0) {
      runningTotal -= ownerPaymentPaid;
      paymentsRows = this.buildChargeRow(closingBalanceDate, '', 'Owner Payment', ownerPaymentPaid, runningTotal);
    }
    if (!paymentsRows) {
      paymentsRows = this.buildBlankLedgerRow();
    }

    const closingBalanceAmount = Math.max(0, Math.round(runningTotal * 100) / 100);
    const closingBalanceRows = [
      this.buildSummaryBalanceRow('Ending Balance', closingBalanceDate, closingBalanceAmount, true)
    ].join('\n');

    const companyName = this.escapeHtml(ctx.organization?.name || '');
    const accountingOfficeName = this.escapeHtml(ctx.selectedAccountingOffice?.name || ctx.selectedOffice?.name || '');
    const accountingOfficeAddress = this.escapeHtml(this.getAccountingOfficeAddress(ctx.selectedAccountingOffice));
    const accountingOfficeAddressSingleLine = this.escapeHtml(this.getAccountingOfficeAddressSingleLine(ctx.selectedAccountingOffice));
    const accountingOfficeCityStateZip = this.escapeHtml(this.getAccountingOfficeCityStateZip(ctx.selectedAccountingOffice));
    const accountingOfficeEmail = this.escapeHtml(ctx.selectedAccountingOffice?.email || '');
    const accountingOfficePhone = this.escapeHtml(this.formatterService.phoneNumber(ctx.selectedAccountingOffice?.phone) || '');
    const accountingOfficeWebsite = this.escapeHtml(ctx.selectedAccountingOffice?.website || '');
    const accountingOfficeBank = this.escapeHtml(ctx.selectedAccountingOffice?.bankName || '');
    const accountingOfficeBankRouting = this.escapeHtml(ctx.selectedAccountingOffice?.bankRouting || '');
    const accountingOfficeBankAccount = this.escapeHtml(ctx.selectedAccountingOffice?.bankAccount || '');
    const accountingOfficeSwithCode = this.escapeHtml(ctx.selectedAccountingOffice?.bankSwiftCode || '');
    const accountingOfficeBankAddress = this.escapeHtml(ctx.selectedAccountingOffice?.bankAddress || '');
    const accountingOfficeBankPhone = this.escapeHtml(this.formatterService.phoneNumber(ctx.selectedAccountingOffice?.bankPhone) || '');
    const officeLogoBase64 = this.resolveOfficeLogo(ctx);
    const responsiblePartiesBlock = this.buildResponsiblePartiesBlock(ctx);
    const propertySideBlock = this.buildPropertySideBlock(ctx);
    const statementSubtitle = this.escapeHtml(periodTitle);

    let result = html;
    result = result.replace(/\{\{statementSubtitle\}\}/g, statementSubtitle);
    result = result.replace(/\{\{statementPeriodTitle\}\}/g, this.escapeHtml(periodTitle));
    result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, responsiblePartiesBlock);
    result = result.replace(/\{\{propertySideBlock\}\}/g, propertySideBlock);
    result = result.replace(/\{\{openingBalanceLedgerLineRows\}\}/g, openingBalanceRows);
    result = result.replace(/\{\{incomeLedgerLineRows\}\}/g, incomeRows);
    result = result.replace(/\{\{chargesLedgerLineRows\}\}/g, chargesRows);
    result = result.replace(/\{\{paymentsLedgerLineRows\}\}/g, paymentsRows);
    result = result.replace(/\{\{closingBalanceLedgerLineRows\}\}/g, closingBalanceRows);
    result = result.replace(/\{\{statementNotes\}\}/g, this.buildStatementNotesContent(ctx));
    result = result.replace(/\{\{paymentLedgerLineRows\}\}/g, '');
    result = result.replace(/\{\{totalCharges\}\}/g, this.formatterService.currencyUsd(closingBalanceAmount));
    result = result.replace(/\{\{totalPayments\}\}/g, this.formatterService.currencyUsd(ownerPaymentPaid));
    result = result.replace(/\{\{statementBalanceDue\}\}/g, this.formatterService.currencyUsd(closingBalanceAmount));
    result = result.replace(/\{\{totalChargesRowStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{balanceDueAfterChargesRowStyle\}\}/g, '');
    result = result.replace(/\{\{paymentsSectionStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{paymentsTotalRowStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{balanceDueBottomSectionStyle\}\}/g, 'display: none;');
    result = result.replace(/\{\{companyName\}\}/g, companyName);
    result = result.replace(/\{\{accountingOfficeName\}\}/g, accountingOfficeName);
    result = result.replace(/\{\{accountingOfficeAddress\}\}/g, accountingOfficeAddress);
    result = result.replace(/\{\{accountingOfficeAddressSingleLine\}\}/g, accountingOfficeAddressSingleLine);
    result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, accountingOfficeCityStateZip);
    result = result.replace(/\{\{accountingOfficeEmail\}\}/g, accountingOfficeEmail);
    result = result.replace(/\{\{accountingOfficePhone\}\}/g, accountingOfficePhone);
    result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, accountingOfficeWebsite);
    result = result.replace(/\{\{accountingOfficeBank\}\}/g, accountingOfficeBank);
    result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, accountingOfficeBankRouting);
    result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, accountingOfficeBankAccount);
    result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, accountingOfficeSwithCode);
    result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, accountingOfficeBankAddress);
    result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, accountingOfficeBankPhone);
    result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoBase64);
    result = result.replace(/\{\{orgLogoBase64\}\}/g, officeLogoBase64);
    result = result.replace(/\{\{startDate\}\}/g, this.escapeHtml(periodTitle) || '');
    result = result.replace(/\{\{endDate\}\}/g, this.escapeHtml(periodTitle) || '');
    result = result.replace(/\{\{statementDate\}\}/g, this.utilityService.todayAsCalendarDateString());
    result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currencyUsd(ownerPaymentPaid));
    result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currencyUsd(closingBalanceAmount));
    return result.replace(/\{\{[^}]+\}\}/g, '');
  }

  private buildStatementNotesContent(ctx: OwnerStatementPrintContext): string {
    const unpaidEntries = this.getUnpaidAccrualEntries(ctx);
    const blocks: string[] = [];

    if (unpaidEntries.length > 0) {
      const lines = unpaidEntries.map(({ line, unpaidAmount }, index) => {
        const { description } = this.parseActivityRefAndDescription(line, 'Income');
        const amount = this.formatterService.currencyUsd(unpaidAmount);
        const intro = index === 0 ? `${this.escapeHtml('* Funds not yet collected:')}\t` : '';
        return `<div class="statement-notes-unpaid-line">${intro}${this.escapeHtml(description)}\t${this.escapeHtml(amount)}</div>`;
      }).join('\n');

      blocks.push(`<div class="statement-notes-unpaid-block">${lines}</div>`);
    }

    const manualNotes = (ctx.line?.notes || '').trim();
    if (manualNotes) {
      blocks.push(`<div class="statement-notes-manual">${this.escapeHtml(manualNotes)}</div>`);
    }

    return blocks.join('\n');
  }

  private getUnpaidAccrualEntries(ctx: OwnerStatementPrintContext): { line: OwnerStatementPropertyActivityLineResponse; unpaidAmount: number }[] {
    const collectedIncomeBySourceRef = this.buildCollectedIncomeBySourceRef(ctx.statementActivityLines);

    return (ctx.statementAccrualActivityLines || [])
      .map(line => {
        const sourceRef = (line.sourceDocumentCode || '').trim().toLowerCase();
        const expectedIncome = Number(line.expectedIncome) || 0;
        const receivedIncome = Number(line.receivedIncome) || 0;
        const collectedOnCash = sourceRef ? (collectedIncomeBySourceRef.get(sourceRef) || 0) : 0;
        const unpaidAmount = Math.max(0, expectedIncome - Math.max(receivedIncome, collectedOnCash));
        return { line, unpaidAmount };
      })
      .filter(entry => entry.unpaidAmount > 0)
      .sort((a, b) => this.utilityService.compareCalendarDateStrings(a.line.activityDate, b.line.activityDate));
  }

  private buildCollectedIncomeBySourceRef(statementActivityLines: OwnerStatementPropertyActivityLineResponse[]): Map<string, number> {
    const collectedIncomeBySourceRef = new Map<string, number>();
    (statementActivityLines || []).forEach(line => {
      const sourceRef = (line.sourceDocumentCode || '').trim().toLowerCase();
      const receivedIncome = Number(line.receivedIncome) || 0;
      if (!sourceRef || receivedIncome === 0) {
        return;
      }

      collectedIncomeBySourceRef.set(
        sourceRef,
        (collectedIncomeBySourceRef.get(sourceRef) || 0) + receivedIncome
      );
    });

    return collectedIncomeBySourceRef;
  }

  private buildChargeRow(
    date: string,
    refNo: string,
    description: string,
    amount: number | null,
    total: number | null,
    isUnpaidAmount = false
  ): string {
    const amountCell = amount == null ? '' : this.formatStatementAmount(amount, isUnpaidAmount);
    const totalCell = total == null ? '' : this.formatterService.currencyUsd(total);
    return `              <tr class="ledger-line-row"><td>${this.escapeHtml(date)}</td><td>${this.escapeHtml(refNo)}</td><td>${this.escapeHtml(description)}</td><td class="amount-col">${amountCell}</td><td class="amount-col">${totalCell}</td></tr>`;
  }

  private formatStatementAmount(amount: number, isUnpaid = false): string {
    const formatted = this.formatterService.currencyUsd(amount);
    return isUnpaid ? `${formatted} *` : formatted;
  }

  private buildBlankLedgerRow(): string {
    return '              <tr class="ledger-line-row"><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td class="amount-col">&nbsp;</td><td class="amount-col">&nbsp;</td></tr>';
  }

  private buildSummaryBalanceRow(label: string, date: string, total: number, isEnding: boolean): string {
    const totalCell = this.formatterService.currencyUsd(total);
    const rowClass = isEnding
      ? 'ledger-line-row ledger-summary-balance-row ledger-summary-balance-row--ending'
      : 'ledger-line-row ledger-summary-balance-row ledger-summary-balance-row--opening';
    return `              <tr class="${rowClass}"><td>${this.escapeHtml(date)}</td><td></td><td>${this.escapeHtml(`${label}:`)}</td><td class="amount-col"></td><td class="amount-col">${totalCell}</td></tr>`;
  }

  private parseActivityRefAndDescription(
    activity: OwnerStatementPropertyActivityLineResponse,
    fallbackLabel: string
  ): { refNo: string; description: string } {
    const rawDescription = (activity.description || '').trim();

    if (this.isLinenAndTowelActivity(activity)) {
      return {
        refNo: this.formatTransactionDateAsMonthYear(activity.activityDate),
        description: rawDescription || fallbackLabel
      };
    }

    const sourceRef = (activity.sourceDocumentCode || '').trim();

    if (sourceRef) {
      const prefixPattern = new RegExp(`^${this.escapeRegExp(sourceRef)}\\s*:\\s*`, 'i');
      const description = prefixPattern.test(rawDescription)
        ? rawDescription.replace(prefixPattern, '').trim() || fallbackLabel
        : rawDescription || fallbackLabel;

      return { refNo: sourceRef, description };
    }

    const colonSplitMatch = rawDescription.match(
      /^((?:WO-[A-Za-z0-9-]+|R-\d+(?:-\d+)*|RC[A-Za-z0-9-]*))\s*:\s*(.+)$/i
    );
    if (colonSplitMatch) {
      return {
        refNo: colonSplitMatch[1].trim(),
        description: colonSplitMatch[2].trim()
      };
    }

    return {
      refNo: '',
      description: rawDescription || fallbackLabel
    };
  }

  private isLinenAndTowelActivity(activity: OwnerStatementPropertyActivityLineResponse): boolean {
    if ((activity.activityType || '').trim().toLowerCase() === 'linensandtowels') {
      return true;
    }

    return /(Monthly|Annual).*Linen\s*&\s*Towe/i.test((activity.description || '').trim());
  }

  private formatTransactionDateAsMonthYear(value: string): string {
    const date = this.utilityService.parseCalendarDateInput(value);
    if (!date) {
      return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear() % 100).padStart(2, '0');
    return `${month}.${year}`;
  }

  private formatActivityDateForStatement(
    activity: OwnerStatementPropertyActivityLineResponse,
    fallbackDate: string
  ): string {
    const activityDate = this.formatFullDate(activity.activityDate);
    if (activityDate) {
      return activityDate;
    }

    const accountingPeriodDate = this.formatAccountingPeriodAsFullDate(activity.accountingPeriod);
    if (accountingPeriodDate) {
      return accountingPeriodDate;
    }

    return fallbackDate;
  }

  private formatAccountingPeriodAsFullDate(accountingPeriod: string | undefined): string {
    const trimmed = (accountingPeriod || '').trim();
    if (!trimmed) {
      return '';
    }

    const monthYearMatch = trimmed.match(/^(\d{2})\.(\d{2})$/);
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1]);
      const year = 2000 + Number(monthYearMatch[2]);
      if (month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0);
        return this.formatFullDateFromDate(lastDay);
      }
    }

    return this.formatFullDate(trimmed);
  }

  private buildResponsiblePartiesBlock(ctx: OwnerStatementPrintContext): string {
    const line = ctx.line;
    const companyName = (line?.companyName || '').trim();
    const ownerNames = (line?.ownerNames || line?.ownerName || '').trim();
    const address1 = this.escapeHtml(ctx.ownerContact?.address1 || '');
    const address2 = this.escapeHtml(ctx.ownerContact?.address2 || '');
    const cityStateZip = this.escapeHtml(this.formatAddress2(ctx.ownerContact));

    const clientLines: string[] = [];
    if (companyName) {
      clientLines.push(`<span style="font-weight: bold">Client:</span> ${this.escapeHtml(companyName)}`);
      if (ownerNames) {
        clientLines.push(`&nbsp;&nbsp;&nbsp;&nbsp;${this.escapeHtml(ownerNames)}`);
      }
    } else if (ownerNames) {
      clientLines.push(`<span style="font-weight: bold">Client:</span> ${this.escapeHtml(ownerNames)}`);
    }

    return [
      ...clientLines,
      address1 ? `<span style="font-weight: bold">Address:</span> ${address1}` : '',
      address2 ? `&nbsp;&nbsp;&nbsp;&nbsp;${address2}` : '',
      cityStateZip ? `&nbsp;&nbsp;&nbsp;&nbsp;${cityStateZip}` : '',
      `<span style="font-weight: bold">Statement Month:</span> ${this.escapeHtml(this.getStatementMonthLabel(line))}`
    ].filter(Boolean).join('<br>');
  }

  private buildPropertySideBlock(ctx: OwnerStatementPrintContext): string {
    const line = ctx.line;
    const propertyCode = this.escapeHtml(line?.propertyCode || '');
    const propertyAddress1 = this.escapeHtml([ctx.property?.address1, ctx.property?.suite].filter(part => !!part).join(' '));
    const propertyAddress2 = this.escapeHtml(this.formatPropertyAddress2(ctx.property));
    return [
      `<span style="font-weight: bold">Property Code:</span> ${propertyCode}`,
      propertyAddress1 ? `<span style="font-weight: bold">Property Address:</span> ${propertyAddress1}` : '',
      propertyAddress2 ? `&nbsp;&nbsp;&nbsp;&nbsp;${propertyAddress2}` : '',
      `<span style="font-weight: bold">Working Capital:</span> ${this.escapeHtml(line?.workingCapital || this.formatterService.currencyUsd(0))}`
    ].filter(Boolean).join('<br>');
  }

  private formatAddress2(contact: ContactResponse | null): string {
    if (!contact) {
      return '';
    }
    const city = String(contact.city || '').trim();
    const state = String(contact.state || '').trim();
    const zip = String(contact.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => !!part).join(' ');
  }

  private formatFullDate(value: string): string {
    const date = this.utilityService.parseCalendarDateInput(value);
    if (!date) {
      return '';
    }

    return this.formatFullDateFromDate(date);
  }

  private formatFullDateFromDate(date: Date): string {
    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  private formatReportingMonthEndDate(value: string): string {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    if (!parsed) {
      return '';
    }

    const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
    return this.formatFullDateFromDate(lastDay);
  }

  private formatPreviousMonthEndDate(value: string): string {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    if (!parsed) {
      return '';
    }

    const lastDay = new Date(parsed.getFullYear(), parsed.getMonth(), 0);
    return this.formatFullDateFromDate(lastDay);
  }

  private formatPropertyAddress2(property: PropertyResponse | null): string {
    const city = String(property?.city || '').trim();
    const state = String(property?.state || '').trim();
    const zip = String(property?.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => !!part).join(' ');
  }

  private getAccountingOfficeAddress(accountingOffice: AccountingOfficeResponse | null): string {
    return [accountingOffice?.address1, accountingOffice?.suite, accountingOffice?.address2]
      .map(part => String(part || '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  private getAccountingOfficeAddressSingleLine(accountingOffice: AccountingOfficeResponse | null): string {
    const street = this.getAccountingOfficeAddress(accountingOffice);
    const cityStateZip = this.getAccountingOfficeCityStateZip(accountingOffice);
    return [street, cityStateZip].filter(part => part.length > 0).join(', ');
  }

  private getAccountingOfficeCityStateZip(accountingOffice: AccountingOfficeResponse | null): string {
    const city = String(accountingOffice?.city || '').trim();
    const state = String(accountingOffice?.state || '').trim();
    const zip = String(accountingOffice?.zip || '').trim();
    if (city && state) {
      return `${city}, ${state}${zip ? ` ${zip}` : ''}`;
    }
    return [city, state, zip].filter(part => !!part).join(' ');
  }

  private resolveOfficeLogo(ctx: OwnerStatementPrintContext): string {
    const details = ctx.selectedAccountingOffice?.fileDetails || ctx.selectedOffice?.fileDetails || ctx.organization?.fileDetails;
    if (!details) {
      return '';
    }
    if (details.dataUrl) {
      return details.dataUrl;
    }
    if (details.file && details.contentType) {
      return `data:${details.contentType};base64,${details.file}`;
    }
    return '';
  }

  private escapeRegExp(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
