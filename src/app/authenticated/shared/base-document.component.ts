import { DocumentService } from '../documents/services/document.service';
import { DocumentExportService } from '../../services/document-export.service';
import { DocumentHtmlService, PrintStyleOptions } from '../../services/document-html.service';
import { ToastrService } from 'ngx-toastr';
import { DocumentType } from '../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../documents/models/document.model';
import { OrganizationResponse } from '../organization/models/organization.model';
import { OfficeResponse } from '../organization-configuration/office/models/office.model';
import { ReservationResponse } from '../reservation/models/reservation-model';
import { ContactResponse } from '../contact/models/contact.model';
import { HttpErrorResponse } from '@angular/common/http';
import { take } from 'rxjs';

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
  noPreviewMessage: string;
  noEmailMessage: string;
  errorMessage?: string;
}


export abstract class BaseDocumentComponent {
  protected abstract getDocumentConfig(): DocumentConfig;
  protected abstract setDownloading(value: boolean): void;

  constructor(
    public documentService: DocumentService,
    public documentExportService: DocumentExportService,
    public documentHtmlService: DocumentHtmlService,
    public toastr: ToastrService
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
      documentType: downloadConfig.documentType,
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
      this.toastr.warning(emailConfig.noPreviewMessage, 'No Preview');
      return;
    }

    // Get tenant email by looking up contact from contactId
    let tenantEmail = '';
    if (config.selectedReservation?.contactId && config.contacts) {
      const contact = config.contacts.find(c => c.contactId === config.selectedReservation?.contactId);
      if (contact) {
        tenantEmail = contact.email || '';
      }
    }

    if (!tenantEmail) {
      this.toastr.warning(emailConfig.noEmailMessage, 'No Email');
      return;
    }

    try {
      await this.documentExportService.emailWithPDF({
        recipientEmail: tenantEmail,
        subject: emailConfig.subject,
        organizationName: config.organization?.name,
        tenantName: config.selectedReservation?.tenantName,
        htmlContent: '' // Not used anymore, but keeping for interface compatibility
      });
    } catch (error) {
      const errorMsg = emailConfig.errorMessage || 'Error opening email client. Please try again.';
      this.toastr.error(errorMsg, 'Error');
    }
  }

  injectStylesIntoIframe(): void {
    const config = this.getDocumentConfig();
    this.documentHtmlService.injectStylesIntoIframe(config.previewIframeStyles);
  }
}
