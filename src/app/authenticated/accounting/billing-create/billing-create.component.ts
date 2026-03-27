import { AsyncPipe, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, firstValueFrom, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { EmailService } from '../../email/services/email.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { DocumentService } from '../../documents/services/document.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OrganizationService } from '../../organizations/services/organization.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { InvoiceResponse } from '../models/invoice.model';
import { InvoiceService } from '../services/invoice.service';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';

@Component({
    standalone: true,
    selector: 'app-billing-create',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, AsyncPipe, TitlebarSelectComponent],
    templateUrl: './billing-create.component.html',
    styleUrls: ['./billing-create.component.scss']
})
export class BillingCreateComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @Input() organizationId: string | null = null; 
  @Input() invoiceId: string | null = null; 

  form: FormGroup;
  organizations: OrganizationResponse[] = [];
  billingOrganization: OrganizationResponse | null = null;
  recipientOrganization: OrganizationResponse | null = null;
  selectedOrganizationId: string | null = null;
  
  orgLogo: string = '';
  accountingOfficeLogo: string = '';
  selectedAccountingOffice: AccountingOfficeResponse | null = null;

  invoices: InvoiceResponse[] = [];
  availableInvoices: { value: InvoiceResponse, label: string }[] = [];
  selectedInvoice: InvoiceResponse | null = null;

  emailHtml: EmailHtmlResponse | null = null;
  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey: number = 0;
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;
  isDownloading: boolean = false;
  isSubmitting: boolean = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organizations', 'emailHtml', 'billingHtml', 'accountingOffice']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  get organizationTitlebarOptions(): { value: string, label: string }[] {
    return (this.organizations || []).map((organization) => ({
      value: organization.organizationId,
      label: organization.name || ''
    }));
  }

  get invoiceCodeDisplay(): string {
    return this.selectedInvoice?.invoiceCode || ' ';
  }

  constructor(
    private accountingService: InvoiceService,
    private fb: FormBuilder,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    emailService: EmailService,
    private http: HttpClient,
    private authService: AuthService,
    private documentReloadService: DocumentReloadService,
    private sanitizer: DomSanitizer,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    private emailHtmlService: EmailHtmlService,
    private accountingOfficeService: AccountingOfficeService,
    private organizationService: OrganizationService,
    private route: ActivatedRoute,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  //#region Create Invoice Methods
  ngOnInit(): void {
    this.route.queryParams.pipe(take(1)).subscribe((queryParams) => {
      const organizationIdParam = queryParams['OrganizationId'] ?? queryParams['organizationId'];
      if (organizationIdParam) {
        this.selectedOrganizationId = organizationIdParam;
      } else if (this.organizationId) {
        this.selectedOrganizationId = this.organizationId;
      }
      const invoiceIdParam = queryParams['InvoiceId'] ?? queryParams['invoiceId'];
      if (invoiceIdParam && this.invoiceId === null) {
        this.invoiceId = invoiceIdParam;
      }
      
      this.loadOrganizationsList();
      this.loadEmailHtml();
      
      this.http.get('assets/billing.html', { responseType: 'text' }).pipe(
        take(1),
        finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'billingHtml'))
      ).subscribe({
        next: (html: string) => {
          if (html) {
            this.form.patchValue({ invoice: html });
          }
        }
      });

      if (this.invoiceId !== null) {
        setTimeout(() => {
          this.selectInvoiceAfterDataLoad(this.invoiceId);
        }, 300);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['organizationId']) {
      const newOrganizationId = changes['organizationId'].currentValue;
      if (newOrganizationId && newOrganizationId !== this.selectedOrganizationId) {
        this.selectedOrganizationId = newOrganizationId;
        this.onOrganizationSelected(newOrganizationId);
      }
    }
        
    if (changes['invoiceId']) {
      const newInvoiceId = changes['invoiceId'].currentValue;
      if (newInvoiceId && newInvoiceId !== (this.selectedInvoice?.invoiceId ?? null)) {
        this.selectInvoiceAfterDataLoad(newInvoiceId);
      }
    }
  }

  async saveInvoice(): Promise<void> {
    if (!this.selectedInvoice) {
      this.toastr.warning('Please select an invoice to generate the invoice', 'Missing Selection');
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;
    try {
      await this.ensureAllDataLoaded();

      const invoiceHtml = this.form.get('invoice')?.value || '';
      if (!invoiceHtml || !String(invoiceHtml).trim()) {
        throw new Error('Invoice HTML template is empty');
      }

      const processedHtml = this.replacePlaceholders(invoiceHtml);
      const processed = this.documentHtmlService.processHtml(processedHtml, true);
      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        processed.processedHtml,
        processed.extractedStyles,
        { marginBottom: '0.25in' }
      );

      const invoiceCode = this.selectedInvoice.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.selectedInvoice.invoiceId || 'Invoice';
      const fileName = this.utilityService.generateDocumentFileName('invoice', invoiceCode);

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: this.billingOrganization?.organizationId || '',
        officeId: this.selectedInvoice.officeId || 1,
        officeName: this.selectedInvoice.officeName || '',
        propertyId: null,
        reservationId: this.selectedInvoice.reservationId || this.recipientOrganization?.organizationId || null,
        documentTypeId: Number(DocumentType.Invoice),
        fileName: fileName
      };

      const documentResponse = await firstValueFrom(this.documentService.generate(generateDto));
      this.toastr.success('Document generated successfully', 'Success');
      this.isSubmitting = false;
      this.iframeKey++;
      this.documentReloadService.triggerReload();
    } catch (err: any) {
      this.toastr.error('Document generation failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
      console.error('Document save error:', err);
      console.error('Document save error payload:', err?.error);
      console.error('Document save validation errors:', err?.error?.errors);
      console.error('Document save validation errors (json):', JSON.stringify(err?.error?.errors || {}, null, 2));
      this.isSubmitting = false;
      this.iframeKey++;
    }
  }

  async ensureAllDataLoaded(): Promise<void> {
    if (!this.billingOrganization && this.organizations.length > 0) {
      const currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
      this.billingOrganization = currentUserOrganizationId
        ? this.organizations.find(o => o.organizationId === currentUserOrganizationId) || null
        : null;
    }
    if (this.billingOrganization && !this.orgLogo) {
       this.updateOrgLogo();
    }
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      selectedOrganizationId: new FormControl(null),
      selectedInvoiceId: new FormControl({ value: null, disabled: true }),
      invoice: new FormControl('')
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganizationsList(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'))).subscribe({
      next: (organizations) => {
        this.organizations = (organizations || []).filter(o => o.isActive);
        const currentUserOrganizationId = this.authService.getUser()?.organizationId || null;
        this.billingOrganization = currentUserOrganizationId ? this.organizations.find(o => o.organizationId === currentUserOrganizationId) || null : null;
        this.loadAccountingOffice();
        this.updateOrgLogo();

        const recipientOrganizationId = this.selectedOrganizationId || null;
        this.recipientOrganization = recipientOrganizationId ? this.organizations.find(o => o.organizationId === recipientOrganizationId) || null : null;

        if (this.recipientOrganization) {
          this.selectedOrganizationId = this.recipientOrganization.organizationId;
          this.form.patchValue({ selectedOrganizationId: this.selectedOrganizationId }, { emitEvent: false });
          this.loadInvoicesForRecipientOrganization();
        } else {
          this.selectedOrganizationId = null;
          this.invoices = [];
          this.availableInvoices = [];
          this.form.patchValue({ selectedOrganizationId: null, selectedInvoiceId: null }, { emitEvent: false });
          this.form.get('selectedInvoiceId')?.disable();
        }
      },
      error: () => {
        this.organizations = [];
        this.billingOrganization = null;
        this.recipientOrganization = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffice');
      }
    });
  }

  loadInvoicesForRecipientOrganization(): void {
    if (!this.billingOrganization?.organizationId || !this.recipientOrganization?.organizationId) {
      this.invoices = [];
      this.availableInvoices = [];
      this.form.get('selectedInvoiceId')?.disable();
      return;
    }

    this.accountingService.getAllInvoices().pipe(take(1)).subscribe({
      next: (invoices: InvoiceResponse[]) => {
        this.invoices = (invoices || []).filter(inv =>
          inv.organizationId === this.billingOrganization?.organizationId &&
          inv.reservationId === this.recipientOrganization?.organizationId
        );

        this.availableInvoices = this.invoices.map(inv => ({
          value: inv,
          label: inv.invoiceCode || `Invoice ${inv.invoiceId}`
        }));

        if (this.invoices.length > 0) {
          this.form.get('selectedInvoiceId')?.enable();
        } else {
          this.form.get('selectedInvoiceId')?.disable();
        }

        if (this.invoiceId && this.invoices.some(i => i.invoiceId === this.invoiceId)) {
          this.onInvoiceSelected(this.invoiceId);
        }
      },
      error: () => {
        this.invoices = [];
        this.availableInvoices = [];
        this.form.get('selectedInvoiceId')?.disable();
      }
    });
  }

  loadInvoice(): void {
    if (!this.selectedInvoice?.invoiceId) {
      return;
    }

    this.accountingService.getInvoiceByGuid(this.selectedInvoice.invoiceId).pipe(take(1)).subscribe({
      next: (response: InvoiceResponse) => {
        this.selectedInvoice = response;
        const formHtml = this.form.value.invoice;
        if (formHtml && formHtml.trim()) {
          const processedHtml = this.replacePlaceholders(formHtml);
          this.processAndSetHtml(processedHtml);
        } else {
          this.loadInvoiceHtml();
        }
      },
      error: () => {
      }
    });
  }

  loadInvoiceHtml(): void {
    this.http.get('assets/billing.html', { responseType: 'text' }).pipe(take(1)).subscribe({
      next: (html: string) => {
        if (html) {
          this.form.patchValue({ invoice: html });
          if (this.selectedInvoice) {
            const processedHtml = this.replacePlaceholders(html);
            this.processAndSetHtml(processedHtml);
          }
        } else {
          this.clearPreview();
          this.toastr.warning('No billing HTML template found in assets.', 'No Template');
        }
      },
      error: () => {
        this.clearPreview();
      }
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml'); })).subscribe({
      next: (response: EmailHtmlResponse) => {
        this.emailHtml = this.mappingService.mapEmailHtml(response as any);
      },
      error: () => {
      }
    });
  }

  loadAccountingOffice(): void {
    if (!this.billingOrganization?.organizationId) {
      this.selectedAccountingOffice = null;
      this.accountingOfficeLogo = '';
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffice');
      return;
    }

    this.accountingOfficeService.getAccountingOffices().pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffice'))
    ).subscribe({
      next: (offices: AccountingOfficeResponse[]) => {
        const organizationOffices = (offices || []).filter(o => o.organizationId === this.billingOrganization?.organizationId);
        const preferredOfficeId = this.selectedInvoice?.officeId || 1;
        this.selectedAccountingOffice =
          organizationOffices.find(o => o.officeId === preferredOfficeId) ||
          organizationOffices.find(o => o.officeId === 1) ||
          organizationOffices[0] ||
          null;
        this.updateAccountingOfficeLogo();
      },
      error: (err) => {
        console.error('Could not load accounting office list:', err);
        this.selectedAccountingOffice = null;
        this.accountingOfficeLogo = '';
      }
    });
  }
  //#endregion

  //#region Logo Update Methods
  updateAccountingOfficeLogo(): void {
    if (this.selectedAccountingOffice?.fileDetails?.dataUrl) {
      this.accountingOfficeLogo = this.selectedAccountingOffice.fileDetails.dataUrl;
      return;
    }
    if (this.selectedAccountingOffice?.fileDetails?.file && this.selectedAccountingOffice?.fileDetails?.contentType) {
      this.accountingOfficeLogo = `data:${this.selectedAccountingOffice.fileDetails.contentType};base64,${this.selectedAccountingOffice.fileDetails.file}`;
      return;
    }
    this.accountingOfficeLogo = '';
  }

  updateOrgLogo(): void {
    if (this.billingOrganization?.fileDetails?.dataUrl) {
      this.orgLogo = this.billingOrganization.fileDetails.dataUrl;
    } else if (this.billingOrganization?.fileDetails?.file && this.billingOrganization?.fileDetails?.contentType) {
      this.orgLogo = `data:${this.billingOrganization.fileDetails.contentType};base64,${this.billingOrganization.fileDetails.file}`;
    } else {
      this.orgLogo = '';
    }
  }
  //#endregion

  //#region Form Response Methods
  onOrganizationSelected(organizationId: string | null): void {
    this.selectedOrganizationId = organizationId;
    this.form.patchValue({ selectedOrganizationId: organizationId }, { emitEvent: false });

    this.recipientOrganization = organizationId
      ? this.organizations.find(o => o.organizationId === organizationId) || null
      : null;

    this.availableInvoices = [];
    this.selectedInvoice = null;
    this.form.patchValue({ selectedInvoiceId: null }, { emitEvent: false });
    this.form.get('selectedInvoiceId')?.disable();
    this.clearPreview();

    if (!this.recipientOrganization) {
      return;
    }

    this.loadInvoicesForRecipientOrganization();
  }

  onTitlebarOrganizationChange(value: string | number | null): void {
    this.onOrganizationSelected(value ? String(value) : null);
  }

  onInvoiceSelected(invoiceId: string | null): void {
    if (!invoiceId) {
      this.selectedInvoice = null;
      this.clearPreview();
      return;
    }
    
    this.selectedInvoice = this.invoices.find(i => i.invoiceId === invoiceId) || null;

    if (this.selectedInvoice) {
      this.form.patchValue({ selectedInvoiceId: invoiceId }, { emitEvent: false });
      this.form.get('selectedInvoiceId')?.enable();
      this.loadAccountingOffice();
    }

    if (this.selectedInvoice) {
      this.loadInvoice();
    }
  }

  selectInvoiceAfterDataLoad(invoiceId: string): void {
    if (!this.invoices.length) {
      setTimeout(() => this.selectInvoiceAfterDataLoad(invoiceId), 300);
      return;
    }

    this.onInvoiceSelected(invoiceId);
  }

  //#endregion

  //#region Form Replacement Methods
  replacePlaceholders(html: string): string {
    let result = html;

    // Replace invoice placeholders
    if (this.selectedInvoice) {
      const selectedInvoiceAny = this.selectedInvoice as any;
      const resolvedStartDate = this.selectedInvoice.startDate || selectedInvoiceAny.invoiceStartDate || '';
      const resolvedEndDate = this.selectedInvoice.endDate || selectedInvoiceAny.invoiceEndDate || '';
      const resolvedInvoicePeriod =
        this.selectedInvoice.invoicePeriod ||
        selectedInvoiceAny.InvoicePeriod ||
        (
          resolvedStartDate && resolvedEndDate
            ? `${this.formatterService.formatDateString(resolvedStartDate)} - ${this.formatterService.formatDateString(resolvedEndDate)}`
            : ''
        );

      result = result.replace(/\{\{invoiceName\}\}/g, this.selectedInvoice.invoiceCode || '');
      result = result.replace(/\{\{invoiceDate\}\}/g, this.formatterService.formatDateString(this.selectedInvoice.invoiceDate) || '');
      result = result.replace(/\{\{invoiceDueDate\}\}/g, this.formatterService.formatDateString(this.selectedInvoice.dueDate) || '');
      result = result.replace(/\{\{InvoiceDueDate\}\}/g, this.formatterService.formatDateString(this.selectedInvoice.dueDate) || '');
      result = result.replace(/\{\{invoicePeriod\}\}/g, resolvedInvoicePeriod);
      result = result.replace(/\{\{InvoicePeriod\}\}/g, resolvedInvoicePeriod);
      result = result.replace(/\{\{startDate\}\}/g, resolvedStartDate ? this.formatterService.formatDateString(resolvedStartDate) : '');
      result = result.replace(/\{\{endDate\}\}/g, resolvedEndDate ? this.formatterService.formatDateString(resolvedEndDate) : '');
      result = result.replace(/\{\{totalAmount\}\}/g, this.formatterService.currency(this.selectedInvoice.totalAmount || 0));
      result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(this.selectedInvoice.paidAmount || 0));
      result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency((this.selectedInvoice.totalAmount || 0) - (this.selectedInvoice.paidAmount || 0)));
    }

    // Replace contact placeholders
    if (this.recipientOrganization) {
      result = result.replace(/\{\{companyName\}\}/g, this.recipientOrganization.name || '');
      result = result.replace(/\{\{companyCode\}\}/g, this.recipientOrganization.organizationCode || '');
      result = result.replace(/\{\{contactName\}\}/g, this.recipientOrganization.contactName || '');
      result = result.replace(/\{\{contactEmail\}\}/g, this.recipientOrganization.contactEmail || '');
      result = result.replace(/\{\{contactPhone\}\}/g, this.formatterService.phoneNumber(this.recipientOrganization.phone) || '');
      result = result.replace(/\{\{contactAddress1\}\}/g, this.recipientOrganization.address1 || '');
      result = result.replace(/\{\{contactAddress2\}\}/g, this.recipientOrganization.address2 || '');
      result = result.replace(/\{\{contactCity\}\}/g, this.recipientOrganization.city || '');
      result = result.replace(/\{\{contactState\}\}/g, this.recipientOrganization.state || '');
      result = result.replace(/\{\{contactZip\}\}/g, this.recipientOrganization.zip || '');
      result = result.replace(/\{\{contactAddress\}\}/g, this.getOrganizationAddress() || '');
    }

    // Preferred logo: accounting office first, then billing organization logo.
    const preferredLogoDataUrl = this.accountingOfficeLogo || this.orgLogo || '';
    if (preferredLogoDataUrl) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, preferredLogoDataUrl);
      result = result.replace(/\{\{orgLogoBase64\}\}/g, preferredLogoDataUrl);
    }

    // Remove logo image tags if no logo is available at all.
    if (!preferredLogoDataUrl) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace accounting office placeholders
    if (this.selectedAccountingOffice) {
      result = result.replace(/\{\{accountingOfficeName\}\}/g, this.selectedAccountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.selectedAccountingOffice.address1 || '');
      result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, this.selectedAccountingOffice.city + ', ' + this.selectedAccountingOffice.state + ' ' + this.selectedAccountingOffice.zip|| '');
      result = result.replace(/\{\{accountingOfficeEmail\}\}/g, this.selectedAccountingOffice.email || '');
      result = result.replace(/\{\{accountingOfficePhone\}\}/g, this.formatterService.phoneNumber(this.selectedAccountingOffice.phone) || '');
      result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, this.selectedAccountingOffice.website || '');
      result = result.replace(/\{\{accountingOfficeBank\}\}/g, this.selectedAccountingOffice.bankName || '');
      result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, this.selectedAccountingOffice.bankRouting || '');
      result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, this.selectedAccountingOffice.bankAccount || '');
      result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, this.selectedAccountingOffice.bankSwiftCode || '');
      result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, this.selectedAccountingOffice.bankAddress || '');
      result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, this.formatterService.phoneNumber(this.selectedAccountingOffice.bankPhone) || '');
    }

    // Replace ledger lines placeholder
    const ledgerLinesRows = this.generateLedgerLinesRows();
    result = result.replace(/\{\{ledgerLinesRows\}\}/g, ledgerLinesRows);

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }

  generateLedgerLinesRows(): string {
    if (!this.selectedInvoice?.ledgerLines || this.selectedInvoice.ledgerLines.length === 0) {
      return '';
    }

    const rows = this.selectedInvoice.ledgerLines.map((line, index) => {
      const date = this.formatterService.formatDateString(this.selectedInvoice.invoiceDate) || '';
      const description = (line.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const amount = this.formatterService.currency(line.amount || 0);
      
      return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${description}</td>
                <td class="text-right">${amount}</td>
              </tr>`;
      }).join('\n');

    return rows;
  }

  getOrganizationAddress(): string {
    if (!this.recipientOrganization) return '';
      let address = this.recipientOrganization.address1 + ' ' + this.recipientOrganization.city + ', ' +  this.recipientOrganization.state + ' ' +   this.recipientOrganization.zip
      return address
  }

  //#endregion

  //#region Html Processing
  generatePreviewIframe(): void {
    if (!this.selectedInvoice) {
      this.clearPreview();
      return;
    }

    this.loadHtmlFiles().pipe(take(1)).subscribe({
      next: (htmlFiles) => {
        const selectedDocuments: string[] = [];

        if (htmlFiles.invoice) {
          selectedDocuments.push(htmlFiles.invoice);
        }

        if (selectedDocuments.length === 0) {
      this.previewIframeHtml = '';
      return;
    }

        try {
          if (selectedDocuments.length === 1) {
            let processedHtml = this.replacePlaceholders(selectedDocuments[0]);
            this.processAndSetHtml(processedHtml);
            return;
          }

          let combinedHtml = this.replacePlaceholders(selectedDocuments[0]);

          const allExtractedStyles: string[] = [];
          const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

          let match;
          styleRegex.lastIndex = 0;
          while ((match = styleRegex.exec(combinedHtml)) !== null) {
            if (match[1]) {
              let styleContent = match[1].trim();
              styleContent = styleContent.replace(/color:\s*#ccc\s*;/gi, 'color: #000 !important;');
              styleContent = styleContent.replace(/color:\s*#999\s*;/gi, 'color: #000 !important;');
              allExtractedStyles.push(styleContent);
            }
          }

          for (let i = 1; i < selectedDocuments.length; i++) {
            if (selectedDocuments[i]) {
              const processed = this.replacePlaceholders(selectedDocuments[i]);

              styleRegex.lastIndex = 0;
              while ((match = styleRegex.exec(processed)) !== null) {
                if (match[1]) {
                  let styleContent = match[1].trim();
                  styleContent = styleContent.replace(/color:\s*#ccc\s*;/gi, 'color: #000 !important;');
                  styleContent = styleContent.replace(/color:\s*#999\s*;/gi, 'color: #000 !important;');
                  allExtractedStyles.push(styleContent);
                }
              }
              
              const stripped = this.stripAndReplace(processed);
              combinedHtml += stripped;
            }
          }
          
          combinedHtml = combinedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

          if (allExtractedStyles.length > 0) {
            const combinedStyles = allExtractedStyles.join('\n\n');
            if (combinedHtml.includes('<head>')) {
              combinedHtml = combinedHtml.replace(/<head[^>]*>/i, `$&<style>${combinedStyles}</style>`);
            } else {
              if (combinedHtml.includes('<body>')) {
                combinedHtml = combinedHtml.replace(/<body[^>]*>/i, `<head><style>${combinedStyles}</style></head>$&`);
              } else {
                combinedHtml = `<head><style>${combinedStyles}</style></head>${combinedHtml}`;
              }
            }
          }

          this.processAndSetHtml(combinedHtml);
        } catch (error) {
          this.clearPreview();
        }
      },
      error: () => {
        this.clearPreview();
      }
    });
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(result.processedHtml);
    this.iframeKey++;
  }

  clearPreview(): void {
    this.previewIframeHtml = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
    this.previewIframeStyles = '';
  }

  stripAndReplace(html: string): string {
    return this.documentHtmlService.stripAndReplace(html);
  }

  loadHtmlFiles(): Observable<{ invoice: string}> {
    return this.http.get('assets/billing.html', { responseType: 'text' }).pipe(
      map(invoice => ({ invoice }))
    );
  }
  //#endregion

  onPreviewIframeLoad(): void {
    this.injectStylesIntoIframe();
    this.resizePreviewIframeToContent();
  }

  resizePreviewIframeToContent(): void {
    if (!this.previewIframe?.nativeElement) {
      return;
    }

    const iframeElement = this.previewIframe.nativeElement;

    setTimeout(() => {
      const doc = iframeElement.contentDocument || iframeElement.contentWindow?.document;
      if (!doc?.body) {
        return;
      }

      const bodyHeight = doc.body.scrollHeight;
      const documentHeight = doc.documentElement?.scrollHeight || 0;
      const targetHeight = Math.max(bodyHeight, documentHeight, 500);
      iframeElement.style.height = `${targetHeight}px`;
    }, 0);
  }

  //#region Abstract BaseDocumentComponent
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.billingOrganization?.organizationId || this.authService.getUser()?.organizationId || null,
      selectedOfficeId: this.selectedAccountingOffice?.officeId || this.selectedInvoice?.officeId || null,
      selectedOfficeName: this.selectedAccountingOffice?.name || this.selectedInvoice?.officeName || '',
      selectedReservationId: this.recipientOrganization?.organizationId || null,
      propertyId: null,
      contacts: [],
      isDownloading: this.isDownloading,
      printStyleOptions: { marginBottom: '0.25in' }
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }
 
  override async onDownload(): Promise<void> {
    if (!this.selectedInvoice) {
      this.toastr.warning('Please select an Invoice', 'No Invoice');
      return;
    }

    const invoiceCode = this.selectedInvoice.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.selectedInvoice.invoiceId;
    const fileName = `Invoice_${invoiceCode}_${new Date().toISOString().split('T')[0]}.pdf`;

    const downloadConfig: DownloadConfig = {
      fileName: fileName,
      documentType: DocumentType.Invoice,
      noPreviewMessage: 'Please select an Invoice to generate the invoice',
      noSelectionMessage: 'Organization or Invoice not available'
    };

    await super.onDownload(downloadConfig);
  }

  override onPrint(): void {
    super.onPrint('Please select an Invoice to generate the invoice');
  }

  override async onEmail(): Promise<void> {
    if (!this.selectedInvoice || !this.previewIframeHtml) {
      this.toastr.warning('Please select an Invoice to generate the invoice', 'No Invoice');
      return;
    }

    const toEmail = this.recipientOrganization?.contactEmail || '';
    const toName = this.recipientOrganization?.contactName || this.recipientOrganization?.name || '';
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const accountingName = this.selectedAccountingOffice?.name;
    const accountingPhone = this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '';
    const plainTextContent = '';
    const invoiceCode = this.selectedInvoice?.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.selectedInvoice?.invoiceId || 'Invoice';
    const attachmentFileName = `Invoice_${invoiceCode}_${new Date().toISOString().split('T')[0]}.pdf`;
    const emailSubject = (this.emailHtml?.invoiceSubject || 'Invoice {{invoiceCode}}').trim().replace(/\{\{invoiceCode\}\}/g, invoiceCode || '');
    const emailBodyHtml = (this.emailHtml?.invoice || '')
      .replace(/\{\{toName\}\}/g, toName)
      .replace(/\{\{accountingName\}\}/g, accountingName || '')
      .replace(/\{\{accountingPhone\}\}/g, accountingPhone || '');

    const emailConfig: EmailConfig = {
      subject: emailSubject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.Invoice,
      emailType: EmailType.Invoice,
      plainTextContent,
      htmlContent: emailBodyHtml,
      fileDetails: {
        fileName: attachmentFileName,
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });

    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }

  goBack(): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];
    
    const params: string[] = [];

    const invoiceId = this.selectedInvoice?.invoiceId || this.invoiceId;
    const organizationId = this.recipientOrganization?.organizationId || this.selectedOrganizationId;
    
    if (organizationId) {
      params.push(`OrganizationId=${organizationId}`);
    }
    if (invoiceId !== null && invoiceId !== undefined && invoiceId !== '') {
      params.push(`InvoiceId=${invoiceId}`);
    }
    
    if (returnTo === 'accounting' || !returnTo) {
      const accountingUrl = params.length > 0 
        ? `${RouterUrl.AccountingList}?${params.join('&')}`
        : RouterUrl.AccountingList;
      this.router.navigateByUrl(accountingUrl);
    } else if (returnTo === 'billing') {
      const billingUrl = params.length > 0
        ? `${RouterUrl.Billing.replace(':id', 'new')}?${params.join('&')}`
        : `${RouterUrl.Billing.replace(':id', 'new')}`;
      this.router.navigateByUrl(billingUrl);
    } else {
      const accountingUrl = params.length > 0 
        ? `${RouterUrl.AccountingList}?${params.join('&')}`
        : RouterUrl.AccountingList;
      this.router.navigateByUrl(accountingUrl);
    }
  }
 //#endregion
}
