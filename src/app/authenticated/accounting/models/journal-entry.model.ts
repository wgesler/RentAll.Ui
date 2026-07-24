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
  unclearedOnly?: boolean;
  /** When true, include IsCashOnly journal entries (Owner AP Aging). Default false for GL / financial reports. */
  includeCashOnly?: boolean;
  /** Owner AP Aging: exclude JEs before each property's owner starting balance. */
  excludeBeforeOwnerStartingBalance?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

/** Body for POST accounting/owner-ap-aging/journal-entry-lines */
export interface OwnerApAgingJournalEntryLineSearchRequest {
  officeIds: number[];
  includeVoided: boolean;
  includeUnposted: boolean;
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
  isCleared?: boolean;
  clearedOn?: string | null;
  officeId: number;
  transactionDate: CalendarDateString;
  accountingPeriod: CalendarDateString;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  sourceCode?: string | null;
  checkNumber?: string | null;
  journalEntryMemo?: string | null;
  postingStatusId: number;
  journalEntryKindId?: number | null;
  perspectiveId?: number | null;
  journalEntryCreatedOn: string;
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
  perspectiveId?: number | null;
}

export interface JournalEntryRequest {
  journalEntryId?: string;
  organizationId: string;
  officeId: number;
  transactionDate: CalendarDateString;
  accountingPeriod: CalendarDateString;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  sourceCode?: string | null;
  memo?: string | null;
  postingStatusId: number;
  isCashOnly: boolean;
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
  perspectiveId?: number | null;
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
  accountingPeriod: CalendarDateString;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  sourceCode?: string | null;
  memo?: string | null;
  postingStatusId: number;
  journalEntryKindId?: number | null;
  isCashOnly: boolean;
  journalEntryLines: JournalEntryLineResponse[];
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface JournalEntryLineSelection {
  journalEntryId: string;
  journalEntryLineId: string;
  journalEntry?: JournalEntryResponse | null;
}

export function isBalancedJournalEntrySearchLines(lines: JournalEntryLineSearchResponse[]): boolean {
  if (!lines.length) {
    return false;
  }

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.005;
}

export function buildJournalEntryFromSearchLines(
  journalEntryId: string,
  lines: JournalEntryLineSearchResponse[],
  organizationId: string
): JournalEntryResponse | null {
  const entryLines = lines.filter(line => line.journalEntryId === journalEntryId);
  if (!entryLines.length || !isBalancedJournalEntrySearchLines(entryLines)) {
    return null;
  }

  const header = entryLines[0];
  return {
    journalEntryId,
    organizationId,
    officeId: header.officeId,
    journalEntryCode: header.journalEntryCode,
    transactionDate: header.transactionDate,
    accountingPeriod: header.accountingPeriod,
    sourceTypeId: header.sourceTypeId ?? null,
    sourceId: header.sourceId ?? null,
    sourceCode: header.sourceCode ?? null,
    memo: header.journalEntryMemo ?? null,
    postingStatusId: header.postingStatusId,
    isCashOnly: false,
    createdOn: header.journalEntryCreatedOn,
    createdBy: header.createdBy,
    modifiedOn: header.modifiedOn,
    modifiedBy: header.modifiedBy,
    journalEntryLines: entryLines.map(line => ({
      journalEntryLineId: line.journalEntryLineId,
      journalEntryId: line.journalEntryId,
      chartOfAccountId: line.chartOfAccountId,
      costCodeId: line.costCodeId ?? null,
      propertyId: line.propertyId ?? null,
      propertyCode: line.propertyCode ?? null,
      reservationId: line.reservationId ?? null,
      reservationCode: line.reservationCode ?? null,
      contactId: line.contactId ?? null,
      contactName: line.contactName ?? null,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo ?? null,
      perspectiveId: line.perspectiveId ?? 2,
      createdOn: line.createdOn,
      createdBy: line.createdBy,
      modifiedOn: line.modifiedOn,
      modifiedBy: line.modifiedBy
    }))
  };
}

export interface GeneralLedgerEntryDisplay {
  journalEntryId: string;
  journalEntryLineId: string;
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
  disabled?: boolean;
  isManual?: boolean;
  postingStatusId: number;
  deleteDisabled?: boolean;
  editDisabled?: boolean;
  selected?: boolean;
  journalEntryLines: JournalEntryLineListDisplay[];
  expand: string;
  expanded: boolean;
  expandClick: (event: Event, item: GeneralLedgerEntryDisplay) => void;
}

export interface JournalEntryLineListDisplay {
  journalEntryLineId: string;
  journalEntryId: string;
  officeId: number;
  transactionDate: string;
  journalEntryCode: string;
  checkNumber?: string;
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
  journalEntryMemo: string;
  debit: string;
  credit: string;
  balance: string;
  debitValue: number;
  creditValue: number;
  balanceValue: number;
  postingStatusId: number;
  journalEntryKindId?: number | null;
  perspectiveId?: number | null;
  perspective?: string;
  isManual?: boolean;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  sortDateValue: number;
  selected?: boolean;
  disabled?: boolean;
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
  ownerRentActual: string;
  business: string;
  securityDeposit: string;
  sdw: string;
  fee: string;
  balance: string;
  balanceIsAlert?: boolean;
  expectedIncomeValue: number;
  rentPlus4000Value: number;
  ownerRentValue: number;
  ownerRentActualValue: number;
  businessValue: number;
  securityDepositValue: number;
  sdwValue: number;
  feeValue: number;
  balanceValue: number;
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
  ownerRent: string;
  ownerRentActual: string;
  securityDeposit: string;
  sdw: string;
  fee: string;
  payment: string;
  prePayment: string;
  unPaid: string;
  ownerUnrec: string;
  ownerExpense: string;
  ownerPayment: string;
  expectedIncomeValue: number;
  rentPlus4000Value: number;
  ownerRentValue: number;
  ownerRentActualValue: number;
  securityDepositValue: number;
  sdwValue: number;
  feeValue: number;
  paymentValue: number;
  prePaymentValue: number;
  unPaidValue: number;
  ownerUnrecValue: number;
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
  perspective: string;
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

export type JournalEntryPostingAction = 'post' | 'softClose' | 'hardClose';

export interface JournalEntryPostingDialogEntry {
  journalEntryId: string;
  journalEntryCode: string;
  transactionDate: string;
  accountingPeriod: string;
  description: string;
  postingStatusId: number;
  postingStatusLabel: string;
}

export interface JournalEntryPostingDialogData {
  officeId: number;
  officeIds: number[];
  initialEntries: JournalEntryPostingDialogEntry[];
}

export interface JournalEntryPostingDialogResult {
  action: JournalEntryPostingAction;
  officeId: number;
  journalEntryIds: string[];
  startDate?: string | null;
  endDate?: string | null;
}

export interface CloseAccountingPeriodRequest {
  officeId: number;
  startDate: string;
  endDate: string;
  postingStatusId: number;
  journalEntryIds: string[];
}

export interface CloseAccountingPeriodResult {
  successCount: number;
  failedCount: number;
  closedDateId?: number | null;
  errors: string[];
}
