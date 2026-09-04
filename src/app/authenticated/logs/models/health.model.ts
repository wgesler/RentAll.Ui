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
  summary: DocumentHealthSummary | null;
  issues: DocumentHealthIssue[];
  errorMessage: string | null;
}

export interface FixAllOutcome {
  key: HealthCheckKey;
  label: string;
  syncResult: JournalEntrySyncResult;
  checkResult: DocumentHealthResult;
}
