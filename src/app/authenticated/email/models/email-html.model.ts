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
  paymentInformationRequest: string;
  letterSubject: string;
  departureSubject: string;
  leaseSubject: string;
  invoiceSubject: string;
  ownerStatementSubject: string;
  scheduleSubject: string;
  missingReceiptsSubject: string;
  billReportSubject: string;
  paymentInformationRequestSubject: string;
  createdOn: string;
  modifiedOn?: string;
}

export interface EmailTemplateDialogData {
  name: string;
  subject: string;
  body: string;
  hasSubject: boolean;
}

export interface EmailTemplateDialogResult {
  subject: string;
  body: string;
}

export interface EmailTemplateRow {
  key: string;
  name: string;
  subjectField: keyof EmailHtmlResponse | null;
  bodyField: keyof EmailHtmlResponse;
  subject: string;
  content: string;
}
