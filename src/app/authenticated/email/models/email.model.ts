import { FileDetails } from "../../companies/models/file-details.model";

export interface EmailRequest {
  organizationId: string;
  officeId: string;  
  propertyId?: string;  
  reservationId?: string;  
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  fileDetails: FileDetails;
}

export interface EmailResponse {
  emailId: string;
  organizationId: string;
  officeId: string;
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
  emailStatusId: number;
  createdOn: string;
}

export interface EmailListDisplay {
  emailId: string;
  officeId: string;
  officeName?: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  attachmentName: string;
  attachmentPath: string;
  documentId?: string;
  canView?: boolean;
  createdOn: string;
}
