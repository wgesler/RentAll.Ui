export interface AccountingErrorLogResponse {
  accountingErrorId: string;
  organizationId: string;
  officeId: number | null;
  trigger: string;
  sourceTypeId: number | null;
  sourceType?: string;
  sourceId: string | null;
  documentCode: string | null;
  accountingPeriod: string | null;
  amount: number | null;
  message: string;
  createdOn: string;
  createdBy: string;
}

export interface AccountingLogResponse {
  id: number;
  organizationId: string;
  officeId: number | null;
  propertyId: string | null;
  invoiceId: string | null;
  originalAmount: number | null;
  rentalLine: string | null;
  split: boolean;
  firstPeriod: string | null;
  secondPeriod: string | null;
  firstAmount: number | null;
  secondAmount: number | null;
  message: string | null;
  createdOn: string;
}

export interface ApplicationLogResponse {
  id: number;
  level: string;
  category: string;
  eventId: number | null;
  organizationId: string | null;
  officeId: number | null;
  traceId: string | null;
  message: string;
  exception: string | null;
  properties: string | null;
  createdOn: string;
}

export interface DatabaseErrorLogResponse {
  id: number;
  organizationId: string | null;
  officeId: number | null;
  tableName: string | null;
  message: string;
  exception: string | null;
  createdOn: string;
}

export interface GeneralErrorLogResponse {
  id: number;
  organizationId: string | null;
  officeId: number | null;
  reservationId: string | null;
  propertyId: string | null;
  invoiceId: string | null;
  receiptId: string | null;
  journalEntryId: string | null;
  message: string;
  exception: string | null;
  createdOn: string;
}
