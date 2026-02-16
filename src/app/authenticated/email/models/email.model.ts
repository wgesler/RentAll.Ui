import { FileDetails } from "../../companies/models/file-details.model";

export interface EmailAddress {
  email: string;
  name: string;
}

export interface EmailRequest {
  organizationId: string;
  officeId: number;
  propertyId: string | null;
  reservationId: string | null;
  fromRecipient: EmailAddress;
  toRecipients: EmailAddress[];
  ccRecipients: EmailAddress[];
  bccRecipients: EmailAddress[];
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  fileDetails?: FileDetails | null;
  emailTypeId: number;
}

export interface EmailResponse {
  emailId: string;
  organizationId: string;
  officeId: number;
  propertyId: string | null;
  reservationId: string | null;
  toRecipients: EmailAddress[];
  ccRecipients: EmailAddress[];
  bccRecipients: EmailAddress[];
  fromRecipient: EmailAddress;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  documentId?: string | null;
  attachmentName: string;
  attachmentPath: string;
  fileDetails?: FileDetails | null;
  emailTypeId: number;
  emailStatusId: number;
  attemptCount: number;
  lastError: string;
  lastAttemptedOn?: string | null;
  sentOn?: string | null;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface EmailListDisplay {
  emailId: string;
  officeId: string;
  propertyId?: string;
  reservationId?: string;
  reservationCode?: string;
  officeName?: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  attachmentName: string;
  attachmentPath: string;
  documentId?: string;
  emailTypeId: number;
  canView?: boolean;
  createdOn: string;
}
