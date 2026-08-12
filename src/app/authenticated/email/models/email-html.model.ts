export interface EmailHtmlResponse {
  organizationId: string;
  welcomeLetter: string;
  departureLetter: string;
  corporateLetter: string;
  lease: string;
  corporateLease: string;
  invoice: string;
  corporateInvoice: string;
  ownerStatement: string;
  letterSubject: string;
  departureSubject: string;
  leaseSubject: string;
  invoiceSubject: string;
  ownerStatementSubject: string;
  createdOn: string;
  modifiedOn?: string;
}
