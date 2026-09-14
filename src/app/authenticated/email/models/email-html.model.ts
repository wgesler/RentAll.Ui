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
  schedules: string;
  missingReceipts: string;
  letterSubject: string;
  departureSubject: string;
  leaseSubject: string;
  invoiceSubject: string;
  ownerStatementSubject: string;
  scheduleSubject: string;
  missingReceiptsSubject: string;
  createdOn: string;
  modifiedOn?: string;
}
