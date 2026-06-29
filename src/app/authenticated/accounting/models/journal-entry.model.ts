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
