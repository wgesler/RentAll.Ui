import { firstValueFrom } from 'rxjs';
import { DocumentConfig, DocuSignConfig } from '../../shared/base-document.component';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { SendDocumentForSignatureRequest, SendDocumentForSignatureResponse } from '../models/docusign.model';
import { DocuSignService } from '../services/docusign.service';

export interface SendDocumentDocuSignDependencies {
  documentHtmlService: DocumentHtmlService;
  docuSignService: DocuSignService;
}

export async function sendDocumentDocuSign(
  deps: SendDocumentDocuSignDependencies,
  documentConfig: DocumentConfig,
  docuSignConfig: DocuSignConfig,
  senderContext: {
    returnUrl: string;
    senderEmail: string;
    senderName: string;
    userId?: string | null;
    apiAccountId?: string | null;
  }
): Promise<SendDocumentForSignatureResponse> {
  const htmlWithStyles = deps.documentHtmlService.getPdfHtmlWithStyles(
    documentConfig.previewIframeHtml,
    documentConfig.previewIframeStyles,
    documentConfig.printStyleOptions
  );

  const request: SendDocumentForSignatureRequest = {
    organizationId: documentConfig.organizationId!,
    officeId: documentConfig.selectedOfficeId!,
    propertyId: documentConfig.propertyId || null,
    reservationId: documentConfig.selectedReservationId || null,
    documentTypeId: Number(docuSignConfig.documentType),
    htmlContent: htmlWithStyles,
    fileName: docuSignConfig.fileName,
    subject: docuSignConfig.subject,
    returnUrl: senderContext.returnUrl,
    senderEmail: senderContext.senderEmail,
    senderName: senderContext.senderName,
    userId: senderContext.userId || null,
    apiAccountId: senderContext.apiAccountId || null,
    signers: docuSignConfig.signers.map(signer => ({
      email: signer.email.trim(),
      name: signer.name.trim(),
      routingOrder: signer.routingOrder
    }))
  };

  return firstValueFrom(deps.docuSignService.sendForSignature(request));
}
