import { firstValueFrom } from 'rxjs';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { EmailConfig, DocumentConfig } from '../../shared/base-document.component';
import { EmailAddress, EmailRequest } from '../models/email.model';
import { EmailService } from '../services/email.service';
import { DocumentHtmlService } from '../../../services/document-html.service';

export interface SendDocumentEmailDependencies {
  documentService: DocumentService;
  documentHtmlService: DocumentHtmlService;
  emailService: EmailService;
}

export function splitEmailList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map(email => email.trim())
    .filter(email => email.length > 0);
}

export async function sendDocumentEmail(
  deps: SendDocumentEmailDependencies,
  documentConfig: DocumentConfig,
  emailConfig: EmailConfig
): Promise<void> {
  const htmlWithStyles = deps.documentHtmlService.getPdfHtmlWithStyles(
    documentConfig.previewIframeHtml,
    documentConfig.previewIframeStyles,
    documentConfig.printStyleOptions
  );

  const attachmentFileName = emailConfig.fileDetails?.fileName || 'document.pdf';
  const generateDto: GenerateDocumentFromHtmlDto = {
    htmlContent: htmlWithStyles,
    organizationId: documentConfig.organization!.organizationId,
    officeId: documentConfig.selectedOffice!.officeId,
    officeName: documentConfig.selectedOffice!.name,
    propertyId: documentConfig.propertyId || null,
    reservationId: documentConfig.selectedReservation?.reservationId || null,
    documentTypeId: Number(emailConfig.documentType),
    fileName: attachmentFileName
  };

  const pdfBlob = await firstValueFrom(deps.documentService.generateDownload(generateDto));
  const pdfBase64 = await blobToBase64(pdfBlob);

  const toRecipient: EmailAddress = {
    email: emailConfig.toEmail,
    name: emailConfig.toName
  };
  const fromRecipient: EmailAddress = {
    email: emailConfig.fromEmail,
    name: emailConfig.fromName
  };
  const ccRecipients: EmailAddress[] = (emailConfig.ccEmails || [])
    .map(email => email.trim())
    .filter(Boolean)
    .map(email => ({ email, name: '' }));
  const bccRecipients: EmailAddress[] = (emailConfig.bccEmails || [])
    .map(email => email.trim())
    .filter(Boolean)
    .map(email => ({ email, name: '' }));

  const emailRequest: EmailRequest = {
    organizationId: documentConfig.organization!.organizationId,
    officeId: documentConfig.selectedOffice!.officeId,
    propertyId: documentConfig.propertyId || null,
    reservationId: documentConfig.selectedReservation?.reservationId || null,
    fromRecipient,
    toRecipients: [toRecipient],
    ccRecipients,
    bccRecipients,
    subject: emailConfig.subject,
    plainTextContent: emailConfig.plainTextContent,
    htmlContent: emailConfig.htmlContent?.trim() || '',
    emailTypeId: Number(emailConfig.emailType),
    fileDetails: {
      fileName: attachmentFileName,
      contentType: pdfBlob.type || 'application/pdf',
      file: pdfBase64
    }
  };

  await firstValueFrom(deps.emailService.sendEmail(emailRequest));
}

function blobToBase64(blob: Blob): Promise<string> {
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
