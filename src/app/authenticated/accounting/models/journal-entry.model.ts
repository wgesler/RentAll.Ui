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
  propertyCode: string;
  reservationCode: string;
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
}

export interface JournalEntryLineDetailDisplay {
  journalEntryLineId: string;
  chartOfAccountId: number;
  accountNo: string;
  accountName: string;
  propertyCode: string;
  reservationCode: string;
  contactName: string;
  costCodeLabel: string;
  debit: string;
  credit: string;
  debitValue: number;
  creditValue: number;
  memo: string;
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
