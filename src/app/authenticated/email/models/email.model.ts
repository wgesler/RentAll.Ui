export interface EmailRequest {
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
}

export interface EmailResponse {
  emailId: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  plainTextContent: string;
  htmlContent: string;
  emailStatusId: number;
  createdOn: string;
}
