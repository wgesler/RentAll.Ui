export interface EmailHtmlResponse {
  organizationId: string;
  officeId: number | null;
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
  billReport: string;
  billing: string;
  letterSubject: string;
  departureSubject: string;
  leaseSubject: string;
  invoiceSubject: string;
  ownerStatementSubject: string;
  scheduleSubject: string;
  missingReceiptsSubject: string;
  billReportSubject: string;
  createdOn: string;
  modifiedOn?: string;
}
