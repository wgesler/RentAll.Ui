import { PrintStyleOptions } from '../../../services/document-html.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { DocumentType } from '../../documents/models/document.enum';
import { FileDetails } from '../../documents/models/document.model';
import { EmailType } from '../../email/models/email.enum';

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
  includeDocumentAttachment?: boolean;
  fileDetails?: FileDetails | null;
  additionalFileDetails?: FileDetails[];
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
