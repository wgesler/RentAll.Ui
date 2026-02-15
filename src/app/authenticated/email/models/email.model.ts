import { FileDetails } from "../../companies/models/file-details.model";

export interface EmailRequest {
  organizationId: string;
  officeId: string;    
  propertyId?: string | null;  
  reservationId?: string | null;  
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  fileDetails: FileDetails;
  emailTypeId: number;
}

export interface EmailResponse {
  emailId: string;
  organizationId: string;
  officeId: string;
  propertyId?: string;
  reservationId?: string;
  reservationCode?: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  attachmentName: string;
  attachmentPath: string;
  documentId?: string;
  emailTypeId: number;
  emailStatusId: number;
  createdOn: string;
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
