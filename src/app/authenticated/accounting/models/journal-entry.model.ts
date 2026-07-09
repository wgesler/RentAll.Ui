import type { CalendarDateString } from '../../../services/utility.service';

/** Body for POST accounting/journal-entry-line/search — matches API GetJournalEntryLineDto. */
export interface JournalEntryLineSearchRequest {
  officeIds: number[];
  chartOfAccountId?: number | null;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  reservationId?: string | null;
  propertyId?: string | null;
  contactId?: string | null;
  includeVoided: boolean;
  includeUnposted: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface JournalEntryLineSearchResponse {
  journalEntryLineId: string;
  journalEntryId: string;
  journalEntryCode: string;
  chartOfAccountId: number;
  costCodeId?: number | null;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  debit: number;
  credit: number;
  memo?: string | null;
  officeId: number;
  transactionDate: CalendarDateString;
  postingDate: CalendarDateString;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  journalEntryMemo?: string | null;
  isPosted: boolean;
  isVoided: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface JournalEntryLineRequest {
  journalEntryLineId?: string;
  journalEntryId?: string;
  chartOfAccountId: number;
  costCodeId?: number | null;
  propertyId?: string | null;
  reservationId?: string | null;
  contactId?: string | null;
  debit: number;
  credit: number;
  memo?: string | null;
}

export interface JournalEntryRequest {
  journalEntryId?: string;
  organizationId: string;
  officeId: number;
  transactionDate: CalendarDateString;
  postingDate: CalendarDateString;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  memo?: string | null;
  isPosted: boolean;
  isVoided: boolean;
  journalEntryLines: JournalEntryLineRequest[];
}

export interface JournalEntryLineResponse {
  journalEntryLineId: string;
  journalEntryId: string;
  chartOfAccountId: number;
  costCodeId?: number | null;
  propertyId?: string | null;
  propertyCode?: string | null;
  reservationId?: string | null;
  reservationCode?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  debit: number;
  credit: number;
  memo?: string | null;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface JournalEntryResponse {
  journalEntryId: string;
  organizationId: string;
  officeId: number;
  journalEntryCode: string;
  transactionDate: CalendarDateString;
  postingDate: CalendarDateString;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  memo?: string | null;
  isPosted: boolean;
  isVoided: boolean;
  journalEntryLines: JournalEntryLineResponse[];
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface JournalEntryLineListDisplay {
  journalEntryLineId: string;
  journalEntryId: string;
  officeId: number;
  transactionDate: string;
  journalEntryCode: string;
  source: string;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  sourceLinkable?: boolean;
  propertyId?: string | null;
  propertyCode: string;
  reservationId?: string | null;
  reservationCode: string;
  contactId?: string | null;
  contactName: string;
  account: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
  debitValue: number;
  creditValue: number;
  balanceValue: number;
  isPosted: boolean;
  isVoided: boolean;
  sortDateValue: number;
  selected?: boolean;
  disabled?: boolean;
}

export interface MakeDepositRequest {
  officeId: number;
  depositDate: string;
  bankChartOfAccountId: number;
  description: string;
  amount: number;
  journalEntryLineIds: string[];
  lines: JournalEntryLineListDisplay[];
}

export interface DepositRequest {
  officeId: number;
  depositDate: string;
  chartOfAccountId: number;
  description: string;
  amount: number;
  journalEntryLineIds: string[];
}

export interface DepositResponse {
  journalEntry: JournalEntryResponse;
}

/** Body for POST report/journal-entry-recap/search — matches API GetRecapReportDto. */
export interface JournalEntryRecapSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  reservationId?: string | null;
  includeVoided: boolean;
  includeUnposted: boolean;
  startDate?: string | null;
  endDate?: string | null;
  recapCategory?: string | null;
}

export interface RecapReportResponse {
  rows: JournalEntryRecapRowDisplay[];
}

/** Body for POST report/transfer/search — matches API GetTransferReportDto. */
export interface TransferReportSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  reservationId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface TransferReportResponse {
  rows: TransferReportRowDisplay[];
}

export interface TransferReportRowDisplay {
  propertyCode: string;
  reservationCode: string;
  accountingPeriod: string;
  source: string;
  journalEntryCode: string;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  sourceLinkable?: boolean;
  activityType: string;
  officeId?: number | null;
  propertyId?: string | null;
  reservationId?: string | null;
  transactionDate: string;
  expectedIncome: string;
  rentPlus4000: string;
  ownerRent: string;
  business: string;
  securityDeposit: string;
  sdw: string;
  fee: string;
  expectedIncomeValue: number;
  rentPlus4000Value: number;
  ownerRentValue: number;
  businessValue: number;
  securityDepositValue: number;
  sdwValue: number;
  feeValue: number;
  sortDateValue: number;
  journalEntryId?: string;
  journalEntryLineId?: string;
}

export interface JournalEntryRecapRowDisplay {
  propertyCode: string;
  reservationCode: string;
  accountingPeriod: string;
  source: string;
  journalEntryCode: string;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  sourceLinkable?: boolean;
  activityType: string;
  officeId?: number | null;
  propertyId?: string | null;
  reservationId?: string | null;
  transactionDate: string;
  expectedIncome: string;
  rentPlus4000: string;
  securityDeposit: string;
  sdw: string;
  fee: string;
  payment: string;
  prePayment: string;
  unPaid: string;
  ownerRent: string;
  ownerExpense: string;
  ownerPayment: string;
  expectedIncomeValue: number;
  rentPlus4000Value: number;
  securityDepositValue: number;
  sdwValue: number;
  feeValue: number;
  paymentValue: number;
  prePaymentValue: number;
  unPaidValue: number;
  ownerRentValue: number;
  ownerExpenseValue: number;
  ownerPaymentValue: number;
  sortDateValue: number;
  journalEntryId?: string;
  journalEntryLineId?: string;
}

export interface JournalEntryLineDetailDisplay {
  lineNo: number;
  journalEntryLineId: string;
  chartOfAccountId: number;
  account: string;
  propertyCode: string;
  reservationCode: string;
  contactName: string;
  memo: string;
  debit: string;
  credit: string;
  debitValue: number;
  creditValue: number;
}

export interface JournalEntrySyncRequest {
  officeIds: number[];
  startDate?: string | null;
  endDate?: string | null;
}

export interface JournalEntrySyncResult {
  documentsProcessed: number;
  journalEntriesCreated: number;
  journalEntriesSkipped: number;
  journalEntriesDeleted: number;
  errors: string[];
}

export interface StartJournalEntrySyncJobResponse {
  jobId: string;
}

export interface JournalEntrySyncJobTypeStatus {
  type: string;
  label: string;
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  status: string;
}

export interface JournalEntrySyncJobStatus {
  jobId: string;
  isRunning: boolean;
  isCompleted: boolean;
  message?: string | null;
  types: JournalEntrySyncJobTypeStatus[];
}
