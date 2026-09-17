import { JournalEntrySyncJobStatus, JournalEntrySyncResult } from '../../accounting/models/journal-entry.model';

export type HealthCheckKey =
  | 'receipt'
  | 'bill'
  | 'workOrder'
  | 'invoice'
  | 'paymentInvoice'
  | 'paymentBill'
  | 'paymentOwner'
  | 'deposit'
  | 'transfer'
  | 'documentLinks'
  | 'manualJournalEntry';

export interface DocumentHealthSummary {
  section: string;
  documentType: string;
  totalDocuments: number;
  documentsWithJe: number;
  documentsMissingJe: number;
  duplicateOpenJes: number;
  isClean: boolean;
}

export interface DocumentHealthIssue {
  issue: string;
  organizationId: string;
  officeId: number;
  documentCode: string;
  documentId: string;
  relatedCode: string | null;
  relatedId: string | null;
  amount: number | null;
  transactionDate: string | null;
  detail: string | null;
}

export interface DocumentHealthResult {
  summary: DocumentHealthSummary;
  issues: DocumentHealthIssue[];
}

export interface HealthCheckRowState {
  key: HealthCheckKey;
  label: string;
  canFix: boolean;
  checking: boolean;
  fixing: boolean;
  fixProgress: string | null;
  summary: DocumentHealthSummary | null;
  issues: DocumentHealthIssue[];
  errorMessage: string | null;
}

export type HealthFixSyncType = 'receipt' | 'bill' | 'workOrder' | 'invoice' | 'payment' | 'deposit' | 'transfer';

export function healthKeyToSyncType(key: HealthCheckKey): HealthFixSyncType | null {
  switch (key) {
    case 'receipt':
      return 'receipt';
    case 'bill':
      return 'bill';
    case 'workOrder':
      return 'workOrder';
    case 'invoice':
      return 'invoice';
    case 'paymentInvoice':
    case 'paymentBill':
    case 'paymentOwner':
      return 'payment';
    case 'deposit':
      return 'deposit';
    case 'transfer':
      return 'transfer';
    default:
      return null;
  }
}

export function healthKeyToPaymentKindId(key: HealthCheckKey): number | null {
  switch (key) {
    case 'paymentInvoice':
      return 0;
    case 'paymentBill':
      return 1;
    case 'paymentOwner':
      return 2;
    default:
      return null;
  }
}

/** Api scans office, repairs each broken document, then Ui re-checks to verify. */
export function describeOfficeScanRepairProgress(
  phase: 'scanning' | 'found' | 'repairing' | 'verifying' | 'clean' | 'no-ids',
  brokenCount?: number,
  repairedCount?: number
): string {
  switch (phase) {
    case 'scanning':
      return 'Scanning entire office…';
    case 'found':
      return `Found ${brokenCount ?? 0} broken document(s) — repairing one-by-one…`;
    case 'repairing':
      return `${repairedCount ?? 0}/${brokenCount ?? 0} processing`;
    case 'verifying':
      return 'Re-scanning office to verify…';
    case 'clean':
      return 'Office clean — nothing to repair.';
    case 'no-ids':
      return 'Scan found issues but no document IDs — run Check again.';
  }
}

export interface HealthIssueDisplayRow extends DocumentHealthIssue {
  transactionDateDisplay: string;
  amountDisplay: string;
  officeNameDisplay: string;
  detailDisplay: string;
  expanded: boolean;
}

export interface DocumentHealthSessionState {
  organizationId: string;
  selectedOfficeId: number | null;
  rows: HealthCheckRowState[];
  activeRowKey: HealthCheckKey | null;
  issueRows: HealthIssueDisplayRow[];
  showIssueHint: boolean;
  unresolvedHint: string;
}

export interface FixAllOutcome {
  key: HealthCheckKey;
  label: string;
  syncResult: JournalEntrySyncResult;
  checkResult: DocumentHealthResult;
}

export function countHealthFixDocuments(issues: DocumentHealthIssue[] | null | undefined): number {
  return new Set((issues ?? []).map(issue => String(issue.documentId ?? '').trim()).filter(id => !!id)).size;
}

export function sumHealthFixJobProgress(status: JournalEntrySyncJobStatus): { total: number; processed: number } {
  const types = status.types ?? [];
  return {
    total: types.reduce((sum, row) => sum + (row.total ?? 0), 0),
    processed: types.reduce((sum, row) => sum + (row.processed ?? 0), 0)
  };
}

export function mapHealthFixJobStatusToSyncResult(status: JournalEntrySyncJobStatus): JournalEntrySyncResult {
  const types = status.types ?? [];
  const errors = types.flatMap(row => row.errorMessages ?? []).filter(message => !!String(message).trim());
  const failedMessage = String(status.message ?? '').trim();
  if (failedMessage && /failed/i.test(failedMessage)) {
    errors.push(failedMessage);
  }

  return {
    documentsProcessed: types.reduce((sum, row) => sum + (row.processed ?? 0), 0),
    journalEntriesCreated: 0,
    journalEntriesSkipped: types.reduce((sum, row) => sum + (row.skipped ?? 0), 0),
    journalEntriesDeleted: 0,
    errors
  };
}
