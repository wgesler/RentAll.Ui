import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom, take } from 'rxjs';
import { DocumentExportService } from '../../services/document-export.service';
import { DocumentHtmlService, PrintStyleOptions } from '../../services/document-html.service';
import { ContactResponse } from '../contacts/models/contact.model';
import { DocumentType } from '../documents/models/document.enum';
import { EmailRequest } from '../documents/models/email.model';
import { GenerateDocumentFromHtmlDto } from '../documents/models/document.model';
import { EmailService } from '../email/services/email.service';
import { DocumentService } from '../documents/services/document.service';
import { OfficeResponse } from '../organizations/models/office.model';
import { OrganizationResponse } from '../organizations/models/organization.model';
import { ReservationResponse } from '../reservations/models/reservation-model';
import { FileDetails } from '../companies/models/file-details.model';

export interface DocumentConfig {
  previewIframeHtml: string;
  previewIframeStyles: string;
  organization: OrganizationResponse | null;
  selectedOffice: OfficeResponse | null;
  selectedReservation?: ReservationResponse | null;
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
  fromEmail: string;
  fromName: string;
  documentType: DocumentType;
  plainTextContent: string;
  htmlContent?: string;
  fileDetails?: FileDetails | null;
  errorMessage?: string;
}

export abstract class BaseDocumentComponent {
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

    if (!config.organization?.organizationId || !config.selectedOffice) {
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
      organizationId: config.organization.organizationId,
      officeId: config.selectedOffice.officeId,
      officeName: config.selectedOffice.name,
      propertyId: config.propertyId || null,
      reservationId: config.selectedReservation?.reservationId || null,
      documentTypeId: Number(downloadConfig.documentType), 
      fileName: downloadConfig.fileName
    };

    // Use server-side PDF generation
    this.documentService.generateDownload(generateDto).pipe(take(1)).subscribe({
      next: (pdfBlob: Blob) => {
        // Create download link and trigger download
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = downloadConfig.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 100);
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

    if (!config.organization?.organizationId || !config.selectedOffice?.officeId) {
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
      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        config.previewIframeHtml,
        config.previewIframeStyles,
        config.printStyleOptions
      );
      const attachmentFileName = emailConfig.fileDetails?.fileName || 'document.pdf';
      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: config.organization.organizationId,
        officeId: config.selectedOffice.officeId,
        officeName: config.selectedOffice.name,
        propertyId: config.propertyId || null,
        reservationId: config.selectedReservation?.reservationId || null,
        documentTypeId: Number(emailConfig.documentType),
        fileName: attachmentFileName
      };
      const pdfBlob = await firstValueFrom(this.documentService.generateDownload(generateDto));
      const pdfBase64 = await this.blobToBase64(pdfBlob);

      const emailRequest: EmailRequest = {
        organizationId: config.organization.organizationId,
        officeId: config.selectedOffice.officeId,
        fromEmail,
        fromName,
        companyName: config.organization.name || '',
        toEmail,
        toName,
        subject: emailConfig.subject,
        plainTextContent: plainTextContent,
        htmlContent,
        fileDetails: {
          fileName: attachmentFileName,
          contentType: pdfBlob.type || 'application/pdf',
          file: pdfBase64
        }
      };

      await firstValueFrom(this.emailService.sendEmail(emailRequest));
      this.toastr.success('Email sent successfully.', 'Success');
    } catch (error) {
      const errorMsg = emailConfig.errorMessage || 'Error sending email. Please try again.';
      this.toastr.error(errorMsg, 'Error');
    }
  }

  injectStylesIntoIframe(): void {
    const config = this.getDocumentConfig();
    this.documentHtmlService.injectStylesIntoIframe(config.previewIframeStyles);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result?.includes(',') ? result.split(',')[1] : result;
        resolve(base64 || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
