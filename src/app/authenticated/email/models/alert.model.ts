import { EmailAddress } from './email.model';

export interface AlertRequest {
  alertId?: string;
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
  emailTypeId: number;
  startDate: string;
  frequencyId: number;
}

export interface AlertResponse {
  alertId: string;
  organizationId: string;
  officeId: number;
  propertyId: string | null;
  propertyCode: string | null;
  reservationId: string | null;
  reservationCode: string | null; 
  toRecipients: EmailAddress[];
  ccRecipients: EmailAddress[];
  bccRecipients: EmailAddress[];
  fromRecipient: EmailAddress;
  subject: string;
  plainTextContent: string;
  emailTypeId: number;
  startDate: string;
  frequencyId: number;
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

export interface AlertListDisplay {
  alertId: string;
  officeId: string;
  propertyId?: string;
  propertyCode?: string;
  reservationId?: string;
  reservationCode?: string;
  officeName?: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  emailTypeId: number;
  startDate: string;
  frequencyId: number;
  frequencyLabel: string;
  lastNotifiedDate: string;
  createdOn: string;
}
