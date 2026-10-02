import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../../app.routes';
import { Subject, firstValueFrom, forkJoin, of, take, takeUntil } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { EmailType } from '../../../email/models/email.enum';
import { EmailCreateDraftService } from '../../../email/services/email-create-draft.service';
import { EmailHtmlService } from '../../../email/services/email-html.service';
import { ReceiptResponse } from '../../../maintenance/models/receipt.model';
import { ReceiptService } from '../../../maintenance/services/receipt.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../../shared/base-document.component';

@Component({
  selector: 'app-bill-report',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './bill-report.component.html',
  styleUrl: './bill-report.component.scss'
})
export class BillReportComponent extends BaseDocumentComponent implements OnChanges, OnDestroy {
  @Input() receiptIds: string[] = [];
  @Input() companyName = '';
  @Input() startDate: Date | string | null = null;
  @Input() endDate: Date | string | null = null;
  @Input() shellMode = false;
  @Output() backEvent = new EventEmitter<void>();

  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);
  private auth = inject(AuthService);
  private utility = inject(UtilityService);
  private formatter = inject(FormatterService);
  private mapping = inject(MappingService);
  private emailHtmlService = inject(EmailHtmlService);
  private receiptService = inject(ReceiptService);
  private contactService = inject(ContactService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private documentReloadService = inject(DocumentReloadService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private router = inject(Router);

  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isDownloading = false;
  isSubmitting = false;
  isLoading = false;
  loadFailed = false;
  bills: ReceiptResponse[] = [];
  private offices: AccountingOfficeResponse[] = [];
  private contacts: ContactResponse[] = [];
  private destroy$ = new Subject<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['receiptIds']) {
      this.loadReport();
      return;
    }
    if ((changes['startDate'] || changes['endDate']) && this.bills.length > 0) {
      this.renderReport();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  override onPrint(): void {
    super.onPrint('No bill report is available to print.');
  }

  override async onDownload(): Promise<void> {
    await super.onDownload({
      fileName: this.buildFileName(),
      documentType: DocumentType.Attachment,
      noPreviewMessage: 'No bill report is available to download.',
      noSelectionMessage: 'Office or organization is not available.'
    });
  }

  override async onEmail(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('No bill report is available to email.', 'No Preview');
      return;
    }
    const recipient = this.resolveEmailRecipient();
    const currentUser = this.auth.getUser();
    const fromEmail = (currentUser?.email || '').trim();
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const emailHtml = await firstValueFrom(
      this.emailHtmlService.getEmailHtml().pipe(
        take(1),
        map(response => this.mapping.mapEmailHtml(response)),
        catchError(() => of(null))
      )
    );
    const vendor = this.findSingleVendor();
    const salutationName = this.utility.getContactSalutationName(vendor) || recipient?.name || '';
    const office = this.offices.find(item => Number(item.officeId) === Number(this.bills[0]?.officeId));
    const htmlContent = (emailHtml?.billReport || this.defaultBillReportEmail())
      .replace(/\{\{salutationName\}\}/g, salutationName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{companyName\}\}/g, (this.companyName || '').trim())
      .replace(/\{\{accountingName\}\}/g, office?.name || this.bills[0]?.officeName || '')
      .replace(/\{\{accountingPhone\}\}/g, this.formatter.phoneNumber(office?.phone) || '');
    const emailConfig: EmailConfig = {
      subject: (emailHtml?.billReportSubject || 'Bill Report').trim() || 'Bill Report',
      toEmail: recipient?.email || '',
      toName: recipient?.name || '',
      fromEmail,
      fromName,
      documentType: DocumentType.Attachment,
      emailType: EmailType.Other,
      plainTextContent: '',
      htmlContent,
      fileDetails: {
        fileName: this.buildFileName(),
        contentType: 'application/pdf',
        file: ''
      },
      errorMessage: 'Unable to email the bill report.'
    };
    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    await this.router.navigateByUrl(RouterUrl.EmailCreate);
  }

  async saveDocument(): Promise<void> {
    if (!this.previewIframeHtml) {
      this.toastr.warning('No bill report is available to save.', 'No Preview');
      return;
    }
    const config = this.getDocumentConfig();
    if (!config.organizationId || !config.selectedOfficeId) {
      this.toastr.warning('Office or organization is not available.', 'Missing Data');
      return;
    }
    this.isSubmitting = true;
    try {
      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: this.documentHtmlService.getPdfHtmlWithStyles(config.previewIframeHtml, config.previewIframeStyles),
        organizationId: config.organizationId,
        officeId: config.selectedOfficeId,
        officeName: config.selectedOfficeName || '',
        propertyId: null,
        reservationId: null,
        documentTypeId: DocumentType.Attachment,
        fileName: this.buildFileName(),
        generatePdf: true
      };
      await new Promise<void>((resolve, reject) => {
        this.documentService.generate(generateDto).pipe(take(1)).subscribe({ next: () => resolve(), error: reject });
      });
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
    } catch {
      this.toastr.error('Document generation failed. Please try again.', 'Error');
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  onPreviewIframeLoad(): void {
    const iframe = this.previewIframe?.nativeElement;
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    if (!iframe || !doc?.body) {
      return;
    }
    const height = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight || 0);
    if (height > 0) {
      iframe.style.height = `${height}px`;
    }
  }

  protected getDocumentConfig(): DocumentConfig {
    const bill = this.bills[0];
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: bill?.organizationId || this.auth.getUser()?.organizationId || null,
      selectedOfficeId: bill?.officeId || null,
      selectedOfficeName: bill?.officeName || '',
      propertyId: null,
      selectedReservationId: null,
      contacts: [],
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
    this.cdr.markForCheck();
  }

  private loadReport(): void {
    const receiptIds = (this.receiptIds || []).map(id => String(id || '').trim()).filter(id => id.length > 0);
    const organizationId = (this.auth.getUser()?.organizationId || '').trim();
    this.previewIframeHtml = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
    this.bills = [];
    this.loadFailed = false;
    if (receiptIds.length === 0 || !organizationId) {
      this.loadFailed = true;
      this.cdr.markForCheck();
      return;
    }

    this.isLoading = true;
    this.cdr.markForCheck();
    forkJoin({
      receipts: forkJoin(receiptIds.map(receiptId =>
        this.receiptService.getReceipt(organizationId, receiptId).pipe(catchError(() => of(null)))
      )),
      offices: this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), catchError(() => of([] as AccountingOfficeResponse[]))),
      contactsReady: this.contactService.ensureContactsLoaded().pipe(take(1), map(() => true), catchError(() => of(false)))
    }).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.offices = result.offices || [];
        this.contacts = this.contactService.getAllContactsValue() || [];
        const loaded = new Map((result.receipts || []).filter((bill): bill is ReceiptResponse => !!bill).map(bill => [bill.receiptId, bill]));
        this.bills = receiptIds.map(id => loaded.get(id)).filter((bill): bill is ReceiptResponse => !!bill);
        this.loadFailed = this.bills.length === 0;
        this.isLoading = false;
        if (!this.loadFailed) {
          this.renderReport();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.loadFailed = true;
        this.cdr.markForCheck();
      }
    });
  }

  private renderReport(): void {
    const html = this.buildReportHtml(this.bills);
    const processed = this.documentHtmlService.processHtml(html, false);
    this.previewIframeHtml = processed.processedHtml;
    this.previewIframeStyles = processed.extractedStyles;
    const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(processed.processedHtml, processed.extractedStyles);
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(htmlWithStyles);
    this.iframeKey++;
  }

  private buildReportHtml(bills: ReceiptResponse[]): string {
    const office = this.offices.find(item => Number(item.officeId) === Number(bills[0]?.officeId));
    const groups = this.groupBillsByVendor(bills);
    const sections = groups.map(group => this.buildVendorSection(group)).join('');
    const range = this.reportDateRange();
    const rangeLine = range ? `<p class="date-range">${this.escape(range)}</p>` : '';
    return `<!DOCTYPE html><html><head><style>${this.reportStyles()}</style></head><body><div class="page">${this.buildLetterhead(office)}<div class="title-block"><h3>Bills</h3>${rangeLine}</div><div class="sheet">${sections}</div></div></body></html>`;
  }

  private buildLetterhead(office: AccountingOfficeResponse | undefined): string {
    const logo = this.officeLogo(office);
    const logoCell = logo
      ? `<td class="logo-cell"><div class="logo-wrap"><img src="${logo}" alt=""></div></td>`
      : '';
    const organizationName = (this.companyName || '').trim();
    const officeName = (office?.name || this.bills[0]?.officeName || '').trim();
    const name = organizationName && officeName && organizationName.toLowerCase() !== officeName.toLowerCase()
      ? `${organizationName} ${officeName}`
      : (officeName || organizationName);
    return `
      <div class="letterhead">
        <table>
          <tr>
            ${logoCell}
            <td class="office-info">
              <p><strong>${this.escape(name)}</strong></p>
              <p>${this.escape(this.officeStreet(office))}</p>
              <p>${this.escape(this.officeCityLine(office))}</p>
              <p class="email">${this.escape(office?.email || '')}</p>
            </td>
          </tr>
        </table>
      </div>`;
  }

  private buildVendorSection(group: { vendorName: string; addressLines: string[]; bills: ReceiptResponse[] }): string {
    const original = group.bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
    const balance = group.bills.reduce((sum, bill) => sum + (Number(bill.amount || 0) - Number(bill.paidAmount || 0)), 0);
    const showBillNumber = group.bills.some(bill => (bill.billNumber || '').trim().length > 0);
    const billNumberHeader = showBillNumber ? '<th>Bill No.</th>' : '';
    const totalSpan = showBillNumber ? 6 : 5;
    const rows = group.bills.map((bill, index) => {
      const amount = Number(bill.amount || 0);
      const open = amount - Number(bill.paidAmount || 0);
      const billNumberCell = showBillNumber ? `<td>${this.escape((bill.billNumber || '').trim())}</td>` : '';
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${this.escape(this.formatter.formatDateString(bill.receiptDate))}</td>
          <td>Bill</td>
          ${billNumberCell}
          <td>${this.escape(bill.receiptCode || '')}</td>
          <td>${this.escape((bill.description || '').trim())}</td>
          <td class="amount">${this.money(amount)}</td>
          <td class="amount">${this.money(open)}</td>
        </tr>`;
    }).join('');
    const street = group.addressLines[0] || '';
    const cityLine = group.addressLines[1] || '';

    return `
      <section class="vendor-block">
        <table class="header-boxes">
          <tr>
            <td>
              <div class="border">
                <p><span class="label">Vendor:</span> ${this.escape(group.vendorName)}</p>
                <p><span class="label">Address:</span> ${this.escape(street)}</p>
                <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${this.escape(cityLine)}</p>
              </div>
            </td>
            <td>
              <div class="border">
                <p><span class="label">Report Date:</span> ${this.escape(this.formatter.formatDateString(this.utility.todayAsCalendarDateString()))}</p>
                <p><span class="label">Amount:</span> ${this.money(original)}</p>
                <p><span class="label">Balance:</span> ${this.money(balance)}</p>
              </div>
            </td>
          </tr>
        </table>
        <div class="border lines-wrap">
        <table class="lines">
          <thead>
            <tr>
              <th>No.</th>
              <th>Date</th>
              <th>Type</th>
              ${billNumberHeader}
              <th>Reference</th>
              <th>Description</th>
              <th class="amount">Amount</th>
              <th class="amount">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals-gap"><td colspan="${totalSpan + 2}">&nbsp;</td></tr>
            <tr class="totals-row">
              <td colspan="${totalSpan}">Total</td>
              <td class="amount">${this.money(original)}</td>
              <td class="amount">${this.money(balance)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>`;
  }

  private groupBillsByVendor(bills: ReceiptResponse[]): Array<{ vendorName: string; addressLines: string[]; bills: ReceiptResponse[] }> {
    const groups = new Map<string, { vendorName: string; addressLines: string[]; bills: ReceiptResponse[] }>();
    bills.forEach(bill => {
      const vendor = this.findVendor(bill);
      const key = String(bill.vendorId || bill.vendorName || 'vendor').trim().toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.bills.push(bill);
        return;
      }
      groups.set(key, {
        vendorName: vendor ? this.utility.getVendorDropdownLabel(vendor) : (bill.vendorName || ''),
        addressLines: this.vendorAddressLines(vendor),
        bills: [bill]
      });
    });
    return Array.from(groups.values());
  }

  private findVendor(bill: ReceiptResponse): ContactResponse | undefined {
    const vendorId = String(bill.vendorId || '').trim().toLowerCase();
    return this.contacts.find(contact => String(contact.contactId || '').trim().toLowerCase() === vendorId);
  }

  private officeLogo(office: AccountingOfficeResponse | undefined): string {
    const file = office?.fileDetails;
    if (file?.dataUrl) {
      return file.dataUrl;
    }
    if (file?.file && file.contentType) {
      return `data:${file.contentType};base64,${file.file}`;
    }
    return '';
  }

  private officeStreet(office: AccountingOfficeResponse | undefined): string {
    if (!office) {
      return '';
    }
    return [office.address1, office.suite, office.address2].map(part => (part || '').trim()).filter(part => part.length > 0).join(' ');
  }

  private officeCityLine(office: AccountingOfficeResponse | undefined): string {
    if (!office) {
      return '';
    }
    const cityLine = [office.city, office.state].map(part => (part || '').trim()).filter(part => part.length > 0).join(', ');
    return [cityLine, (office.zip || '').trim()].filter(part => part.length > 0).join(' ');
  }

  private reportDateRange(): string {
    const start = this.formatRangeDate(this.startDate);
    const end = this.formatRangeDate(this.endDate);
    if (start && end) {
      return `${start} - ${end}`;
    }
    return start || end;
  }

  private formatRangeDate(value: Date | string | null): string {
    if (!value) {
      return '';
    }
    const raw = value instanceof Date ? (this.utility.formatDateOnlyForApi(value) || '') : String(value);
    return this.formatter.formatDateString(raw);
  }

  private vendorAddressLines(vendor: ContactResponse | undefined): string[] {
    if (!vendor) {
      return [];
    }
    const street = [vendor.address1, vendor.address2].map(part => (part || '').trim()).filter(part => part.length > 0).join(' ');
    const cityLine = [vendor.city, vendor.state].map(part => (part || '').trim()).filter(part => part.length > 0).join(', ');
    const cityZip = [cityLine, (vendor.zip || '').trim()].filter(part => part.length > 0).join(' ');
    return [street, cityZip];
  }

  private defaultBillReportEmail(): string {
    return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;">
  <p>Dear {{salutationName}},</p>
  <p>Please find your bill report attached.</p>
  <p style="margin-top: 24px; margin-bottom: 0;">Best regards,<br>{{fromName}}</p>
  <p style="margin-top: 12px; margin-bottom: 0;">{{companyName}} {{accountingName}}<br>{{accountingPhone}}</p>
</div>`;
  }

  private findSingleVendor(): ContactResponse | undefined {
    const vendorIds = [...new Set(this.bills.map(bill => String(bill.vendorId || '').trim().toLowerCase()).filter(id => id.length > 0))];
    if (vendorIds.length !== 1) {
      return undefined;
    }
    return this.contacts.find(contact => String(contact.contactId || '').trim().toLowerCase() === vendorIds[0]);
  }

  private resolveEmailRecipient(): { email: string; name: string } | null {
    const vendor = this.findSingleVendor();
    const email = this.utility.getDisplayContactEmail(vendor?.companyEmail || vendor?.email || '');
    const name = vendor ? this.utility.getVendorDropdownLabel(vendor) : '';
    if (!email || !name) {
      return null;
    }
    return { email, name };
  }

  private buildFileName(): string {
    if (this.bills.length === 1) {
      const code = (this.bills[0].receiptCode || 'Bill').replace(/[^a-zA-Z0-9-]/g, '');
      return `Bill_${code}.pdf`;
    }
    return `Bills_${this.utility.todayAsCalendarDateString()}.pdf`;
  }

  private money(amount: number): string {
    const value = Number(amount) || 0;
    const display = this.formatter.currency(Math.abs(value));
    return value < 0 ? `-$${display}` : `$${display}`;
  }

  private escape(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private reportStyles(): string {
    return `
      @page { size: letter; margin: 0.5in; }
      html, body { margin: 0; background: #f5f5f5; color: #1f2933; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; }
      .page { width: 8.5in; min-height: 11in; margin: 12px auto; padding: 0.45in 0.5in; background: #fff; box-sizing: border-box; }
      .letterhead table { border-collapse: collapse; }
      .logo-cell { width: 150px; padding: 0 10px 0 0; vertical-align: middle; }
      .logo-wrap { display: inline-block; line-height: 0; padding: 4px 8px; }
      .letterhead img { max-height: 60px; max-width: 150px; display: block; }
      .office-info { vertical-align: top; }
      .letterhead p { margin: 2px 0; font-size: 9pt; line-height: 1.2; }
      .email { color: #0000ee; text-decoration: underline; }
      .title-block { text-align: center; }
      .title-block h3 { margin: 12px 0 0; padding: 8px 8px 0; font-size: 14pt; font-weight: 700; }
      .date-range { margin: 0 0 8px; font-size: 9pt; line-height: 1.2; }
      .sheet { border: 1px solid #ddd; padding: 3px; }
      .vendor-block { margin-top: 0; }
      .header-boxes { width: 100%; border-collapse: separate; border-spacing: 0; }
      .header-boxes td { width: 50%; vertical-align: top; padding: 8px 8px 0; height: 1px; }
      .border { border: 1px solid #ddd; padding: 10px; height: 100%; box-sizing: border-box; }
      .lines-wrap { margin: 8px; }
      .border p { margin: 0; font-size: 10pt; line-height: 1.45; }
      .label { font-weight: 700; }
      .lines { width: 100%; border-collapse: collapse; margin-top: 0; font-size: 8pt; }
      .lines th, .lines td { border-bottom: 1px solid #e5e7eb; padding: 2px 4px; white-space: nowrap; line-height: 1.2; }
      .lines th { border-bottom: 2px solid #1f2933; text-align: left; font-weight: 700; }
      .lines th.amount, .lines td.amount { text-align: right; }
      .lines tr.totals-gap td { border-bottom: none; padding: 0; height: 12px; }
      .lines tr.totals-row td { border-bottom: none; font-weight: 700; padding-top: 3px; }
      .lines tr.totals-row td.amount { border-top: 2px solid #1f2933; }
    `;
  }
}
