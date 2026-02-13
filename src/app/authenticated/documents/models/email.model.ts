import { FileDetails } from '../../companies/models/file-details.model';

export interface EmailRequest {
  organizationId: string;
  officeId: number;
  fromEmail: string;
  fromName: string;
  companyName?: string;
  toEmail: string;
  toName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  fileDetails?: FileDetails | null;
}

export interface EmailResponse {
  organizationId: string;
  officeId: number;
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
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
