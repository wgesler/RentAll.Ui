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
  returnUrl: string;
  senderEmail: string;
  senderName: string;
  userId?: string | null;
  apiAccountId?: string | null;
  signers: DocuSignSigner[];
}

export interface SendDocumentForSignatureResponse {
  envelopeId: string;
  status: string;
  senderViewUrl: string;
}
