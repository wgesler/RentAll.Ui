export interface EmailHtmlRequest {
  organizationId: string;
  welcomeLetter: string;
  corporateLetter: string;
  lease: string;
  invoice: string;
  letterSubject: string;
  leaseSubject: string;
  invoiceSubject: string;
}

export interface EmailHtmlResponse {
  organizationId: string;
  welcomeLetter: string;
  corporateLetter: string;
  lease: string;
  invoice: string;
  letterSubject: string;
  leaseSubject: string;
  invoiceSubject: string;
  createdOn: string;
  modifiedOn?: string;
}
