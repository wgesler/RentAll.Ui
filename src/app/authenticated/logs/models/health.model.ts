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

export function extractHealthFixDocumentIds(issues: DocumentHealthIssue[] | null | undefined): string[] {
  const ids = new Set<string>();
  for (const issue of issues ?? []) {
    const documentId = String(issue.documentId ?? '').trim();
    if (documentId.length > 0 && documentId !== '00000000-0000-0000-0000-000000000000') {
      ids.add(documentId);
    }
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

export interface FixAllOutcome {
  key: HealthCheckKey;
  label: string;
  syncResult: JournalEntrySyncResult;
  checkResult: DocumentHealthResult;
}
