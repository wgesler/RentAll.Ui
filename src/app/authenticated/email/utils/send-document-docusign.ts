import { firstValueFrom } from 'rxjs';
import { DocumentConfig, DocuSignConfig } from '../../shared/base-document.component';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { SendDocumentForSignatureRequest } from '../models/docusign.model';
import { DocuSignService } from '../services/docusign.service';

export interface SendDocumentDocuSignDependencies {
  documentHtmlService: DocumentHtmlService;
  docuSignService: DocuSignService;
}

export async function sendDocumentDocuSign(
  deps: SendDocumentDocuSignDependencies,
  documentConfig: DocumentConfig,
  docuSignConfig: DocuSignConfig
): Promise<void> {
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
    signers: docuSignConfig.signers.map(signer => ({
      email: signer.email.trim(),
      name: signer.name.trim(),
      routingOrder: signer.routingOrder
    }))
  };

  await firstValueFrom(deps.docuSignService.sendForSignature(request));
}
