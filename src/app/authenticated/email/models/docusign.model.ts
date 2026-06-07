export interface DocuSignSigner {
  email: string;
  name: string;
  routingOrder: number;
}

export interface SendDocumentForSignatureRequest {
  organizationId: string;
  officeId: number;
  propertyId?: string | null;
  reservationId?: string | null;
  documentTypeId: number;
  htmlContent: string;
  fileName: string;
  subject: string;
  signers: DocuSignSigner[];
}

export interface SendDocumentForSignatureResponse {
  envelopeId: string;
  status: string;
}
