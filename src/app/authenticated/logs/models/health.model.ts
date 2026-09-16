import { JournalEntrySyncResult } from '../../accounting/models/journal-entry.model';

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

const emptyGuid = '00000000-0000-0000-0000-000000000000';

function isJournalEntryDuplicateIssue(issueText: string): boolean {
  const normalized = issueText.toLowerCase();
  return normalized.includes('duplicate open invoice payment je')
    || normalized.includes('duplicate open invoice charge je')
    || normalized.includes('duplicate open deposit je');
}

function routeIssueDocumentId(issueText: string, documentId: string, ids: Set<string>): void {
  if (!documentId || documentId === emptyGuid) {
    return;
  }

  ids.add(documentId);
}

function routeIssueRelatedId(issueText: string, relatedId: string | null | undefined, ids: Set<string>): void {
  const id = String(relatedId ?? '').trim();
  if (!id || id === emptyGuid) {
    return;
  }

  const normalized = issueText.toLowerCase();
  if (isJournalEntryDuplicateIssue(normalized)) {
    return;
  }

  if (normalized.includes('duplicate invoice payment documents')) {
    ids.add(id);
  }
}

export function extractHealthFixDocumentIds(issues: DocumentHealthIssue[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const issue of issues ?? []) {
    const issueText = String(issue.issue ?? '');
    routeIssueDocumentId(issueText, String(issue.documentId ?? '').trim(), ids);
    routeIssueRelatedId(issueText, issue.relatedId, ids);
  }

  return Array.from(ids);
}

export function resolveHealthFixDocumentIds(
  checkResult: DocumentHealthResult,
  fallbackIssues?: DocumentHealthIssue[] | null
): string[] {
  const fromCheck = extractHealthFixDocumentIds(checkResult.issues);
  if (fromCheck.length > 0) {
    return fromCheck;
  }

  const issueCount =
    (checkResult.summary?.documentsMissingJe ?? 0) +
    (checkResult.summary?.duplicateOpenJes ?? 0);

  if (issueCount > 0) {
    return extractHealthFixDocumentIds(fallbackIssues);
  }

  return [];
}

/** Office scan → broken document IDs → one-by-one repair (not blind office-wide sync). */
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
      return `Repairing ${repairedCount ?? 0}/${brokenCount ?? 0}…`;
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
