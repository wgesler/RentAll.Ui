import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs';
import { DocumentExportService } from '../../services/document-export.service';
import { DocumentHtmlService, PrintStyleOptions } from '../../services/document-html.service';
import { ContactResponse } from '../contacts/models/contact.model';
import { DocumentType } from '../documents/models/document.enum';
import { EmailType } from '../email/models/email.enum';
import { GenerateDocumentFromHtmlDto } from '../documents/models/document.model';
import { ConfigService } from '../../services/config.service';
import { DocuSignService } from '../email/services/docusign.service';
import { EmailService } from '../email/services/email.service';
import { DocumentService } from '../documents/services/document.service';
import { FileDetails } from '../documents/models/document.model';
import { sendDocumentDocuSign } from '../email/utils/send-document-docusign';
import { sendDocumentEmail } from '../email/utils/send-document-email';

export interface DocumentConfig {
  previewIframeHtml: string;
  previewIframeStyles: string;
  organizationId: string | null;
  selectedOfficeId: number | null;
  selectedOfficeName?: string;
  selectedReservationId?: string | null;
  propertyId?: string | null;
  contacts?: ContactResponse[];
  isDownloading: boolean;
  printStyleOptions?: PrintStyleOptions;
}

export interface DownloadConfig {
  fileName: string;
  documentType: DocumentType;
  noPreviewMessage: string;
  noSelectionMessage: string;
  errorMessage?: string;
}
export interface EmailConfig {
  subject: string;
  toEmail: string;
  toName: string;
  ccEmails?: string[];
  bccEmails?: string[];
  fromEmail: string;
  fromName: string;
  documentType: DocumentType;
  emailType: EmailType;
  plainTextContent: string;
  htmlContent?: string;
  fileDetails?: FileDetails | null;
  errorMessage?: string;
}

export interface DocuSignSignerConfig {
  email: string;
  name: string;
  routingOrder: number;
}

export interface DocuSignConfig {
  subject: string;
  signers: DocuSignSignerConfig[];
  documentType: DocumentType;
  fileName: string;
  errorMessage?: string;
}

export abstract class BaseDocumentComponent {
  protected configService = inject(ConfigService);
  protected docuSignService = inject(DocuSignService);
  isSendingDocuSign = false;

  get docuSignEnabled(): boolean {
    return this.configService.config().featureFlags.docuSign;
  }

  protected abstract getDocumentConfig(): DocumentConfig;
  protected abstract setDownloading(value: boolean): void;

  constructor(
    public documentService: DocumentService,
    public documentExportService: DocumentExportService,
    public documentHtmlService: DocumentHtmlService,
    public toastr: ToastrService,
    protected emailService: EmailService
  ) {}


  async onDownload(downloadConfig: DownloadConfig): Promise<void> {
    const config = this.getDocumentConfig();

    if (!config.previewIframeHtml) {
      this.toastr.warning(downloadConfig.noPreviewMessage, 'No Preview');
      return;
    }

    if (!config.organizationId || !config.selectedOfficeId) {
      this.toastr.warning(downloadConfig.noSelectionMessage, 'No Selection');
      return;
    }

    this.setDownloading(true);
    
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      config.previewIframeHtml,
      config.previewIframeStyles,
      config.printStyleOptions
    );

    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: config.organizationId,
      officeId: config.selectedOfficeId,
      officeName: config.selectedOfficeName || '',
      propertyId: config.propertyId || null,
      reservationId: config.selectedReservationId || null,
      documentTypeId: Number(downloadConfig.documentType), 
      fileName: downloadConfig.fileName
    };

    // Use server-side PDF generation
    this.documentService.generateDownload(generateDto).pipe(take(1)).subscribe({
      next: (pdfBlob: Blob) => {
        this.documentExportService.downloadBlob(pdfBlob, downloadConfig.fileName);
        this.setDownloading(false);
      },
      error: (error: HttpErrorResponse) => {
        this.setDownloading(false);
        const errorMsg = downloadConfig.errorMessage || 'Error generating PDF. Please try again.';
        this.toastr.error(errorMsg, 'Error');
        console.error('PDF generation error:', error);
      }
    });
  }

  onPrint(noPreviewMessage: string): void {
    const config = this.getDocumentConfig();

    if (!config.previewIframeHtml) {
      this.toastr.warning(noPreviewMessage, 'No Preview');
      return;
    }

    // Get the HTML with styles injected
    const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(
      config.previewIframeHtml,
      config.previewIframeStyles,
      config.printStyleOptions
    );
    this.documentExportService.printHTML(htmlWithStyles);
  }

  async onEmail(emailConfig: EmailConfig): Promise<void> {
    const config = this.getDocumentConfig();

    if (!config.previewIframeHtml) {
      this.toastr.warning('No preview available to email.', 'No Preview');
      return;
    }

    if (!config.organizationId || !config.selectedOfficeId) {
      this.toastr.warning('Organization or Office not available', 'No Selection');
      return;
    }

    const fromEmail = emailConfig?.fromEmail?.trim() || '';
    const fromName = emailConfig?.fromName?.trim() || '';
    if (!fromEmail || !fromName) {
      this.toastr.warning('Current user email sender information is not available.', 'No Sender');
      return;
    }

    const toEmail = emailConfig?.toEmail?.trim() || '';
    const toName = emailConfig?.toName?.trim() || '';
    if (!toEmail || !toName) {
      this.toastr.warning('Recipient email information is missing.', 'No Email');
      return;
    }

    const plainTextContent = emailConfig?.plainTextContent?.trim() || '';
    const htmlContent = emailConfig?.htmlContent?.trim() || '';
 
    try {
      await sendDocumentEmail(
        {
          documentService: this.documentService,
          documentHtmlService: this.documentHtmlService,
          emailService: this.emailService
        },
        config,
        {
          ...emailConfig,
          fromEmail,
          fromName,
          toEmail,
          toName,
          plainTextContent,
          htmlContent
        }
      );
      this.toastr.success('Email sent successfully.', 'Success');
    } catch (error) {
      const errorMsg = emailConfig.errorMessage || 'Error sending email. Please try again.';
      this.toastr.error(errorMsg, 'Error');
    }
  }

  async onDocuSign(docuSignConfig: DocuSignConfig): Promise<void> {
    if (!this.docuSignEnabled) {
      return;
    }

    const config = this.getDocumentConfig();

    if (!config.previewIframeHtml) {
      this.toastr.warning('No preview available to send for signature.', 'No Preview');
      return;
    }

    if (!config.organizationId || !config.selectedOfficeId) {
      this.toastr.warning('Organization or Office not available', 'No Selection');
      return;
    }

    const signers = (docuSignConfig?.signers || [])
      .map(signer => ({
        email: signer.email?.trim() || '',
        name: signer.name?.trim() || '',
        routingOrder: signer.routingOrder
      }))
      .filter(signer => signer.email && signer.name);

    if (signers.length === 0) {
      this.toastr.warning('Signer email information is missing.', 'No Signer');
      return;
    }

    const subject = docuSignConfig?.subject?.trim() || '';
    if (!subject) {
      this.toastr.warning('Email subject is required for DocuSign.', 'No Subject');
      return;
    }

    this.isSendingDocuSign = true;

    try {
      await sendDocumentDocuSign(
        {
          documentHtmlService: this.documentHtmlService,
          docuSignService: this.docuSignService
        },
        config,
        {
          ...docuSignConfig,
          subject,
          signers
        }
      );
      this.toastr.success('Document sent for signature.', 'Success');
    } catch (error) {
      const fallbackMsg = docuSignConfig.errorMessage || 'Error sending document for signature. Please try again.';
      const errorMsg = this.getDocuSignErrorMessage(error, fallbackMsg);
      this.toastr.error(errorMsg, 'Error');
      console.error('DocuSign error:', error);
    } finally {
      this.isSendingDocuSign = false;
    }
  }

  injectStylesIntoIframe(): void {
    const config = this.getDocumentConfig();
    this.documentHtmlService.injectStylesIntoIframe(config.previewIframeStyles);
  }

  private getDocuSignErrorMessage(error: unknown, fallbackMsg: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallbackMsg;
    }

    const payload = error.error;
    if (typeof payload === 'string' && payload.trim()) {
      return payload.trim();
    }

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }

    return fallbackMsg;
  }

}
