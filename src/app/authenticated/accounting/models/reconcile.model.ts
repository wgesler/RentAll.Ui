export type ReconcileColumnKey = 'date' | 'type' | 'checkRef' | 'amount' | 'payee' | 'memo';

export type ReconcileSide = 'payments' | 'deposits';

export interface ReconcileLineDisplay {
  journalEntryLineId: string;
  transactionDate: string;
  transactionDateSortValue: string;
  type: string;
  checkRef: string;
  payee: string;
  memo: string;
  amountValue: number;
  isCleared: boolean;
}

export interface ReconcileColumnsDialogData {
  paymentsVisibleColumns: ReconcileColumnKey[];
  depositsVisibleColumns: ReconcileColumnKey[];
}

export interface ReconcileColumnsDialogResult {
  paymentsVisibleColumns: ReconcileColumnKey[];
  depositsVisibleColumns: ReconcileColumnKey[];
}

export interface ReconcileColumnPreferencesState {
  tableName: string;
  paymentsVisibleColumns: ReconcileColumnKey[];
  depositsVisibleColumns: ReconcileColumnKey[];
}

export interface ReconcileBeginningBalanceResponse {
  beginningBalance: number;
}

export interface ReconcileJournalEntryLineMark {
  journalEntryLineId: string;
  isCleared: boolean;
}

export interface SaveReconcileMarksRequest {
  officeId: number;
  chartOfAccountId: number;
  lines: ReconcileJournalEntryLineMark[];
}

export interface CompleteReconcileRequest extends SaveReconcileMarksRequest {
  endingBalance: number;
  statementDate: string;
}

export interface ReconcileDraftResponse {
  accountId: number;
  organizationId: string;
  officeId: number;
  statementDate: string | null;
  endingBalance: number | null;
  serviceChargeAmount: number | null;
  serviceChargeDate: string | null;
  serviceChargeAccountId: number | null;
  interestAmount: number | null;
  interestDate: string | null;
  interestAccountId: number | null;
}

export interface ReconcileResponse {
  reconcileId: number;
  accountId: number;
  organizationId: string;
  officeId: number;
  statementDate: string | null;
  endingBalance: number | null;
  serviceChargeAmount: number | null;
  serviceChargeDate: string | null;
  serviceChargeAccountId: number | null;
  interestAmount: number | null;
  interestDate: string | null;
  interestAccountId: number | null;
}

export interface SaveReconcileDraftRequest {
  officeId: number;
  accountId: number;
  statementDate: string | null;
  endingBalance: number | null;
  serviceChargeAmount: number | null;
  serviceChargeDate: string | null;
  serviceChargeAccountId: number | null;
  interestAmount: number | null;
  interestDate: string | null;
  interestAccountId: number | null;
}

export interface BeginReconciliationAccountDefault {
  chartOfAccountId: number;
  endingBalance: number | null;
  statementDate: string | null;
}

export interface BeginReconciliationDialogData {
  organizationId: string;
  officeId: number | null;
  accountOptions: { value: number; label: string }[];
  adjustmentAccountOptions: { value: number; label: string }[];
  accountReconcileDefaults: BeginReconciliationAccountDefault[];
  defaultChartOfAccountId: number | null;
  defaultStatementDate: Date | null;
  existingSetup?: BeginReconciliationDialogResult | null;
}

export interface BeginReconciliationDialogResult {
  chartOfAccountId: number;
  statementDate: string;
  beginningBalance: number;
  endingBalance: number;
  serviceCharge: number;
  serviceChargeDate: string | null;
  serviceChargeAccountId: number | null;
  serviceChargeClassId: number | null;
  interestEarned: number;
  interestEarnedDate: string | null;
  interestEarnedAccountId: number | null;
  interestEarnedClassId: number | null;
  serviceChargeJournalEntryId?: string | null;
  interestEarnedJournalEntryId?: string | null;
}

export const RECONCILE_COLUMN_HEADERS: Record<ReconcileColumnKey, string> = {
  date: 'Date',
  type: 'Type',
  checkRef: 'Chk#',
  amount: 'Amount',
  payee: 'Payee',
  memo: 'Memo'
};

export const RECONCILE_FIXED_COLUMN_KEYS: ReconcileColumnKey[] = ['amount'];

export const RECONCILE_CONFIGURABLE_COLUMN_ORDER: ReconcileColumnKey[] = ['date', 'type', 'checkRef', 'payee', 'memo'];

export const RECONCILE_TABLE_COLUMN_ORDER: ReconcileColumnKey[] = ['date', 'type', 'checkRef', 'amount', 'payee', 'memo'];

export const RECONCILE_DIALOG_COLUMN_ORDER: ReconcileColumnKey[] = ['checkRef', 'date', 'payee', 'memo', 'type'];

export const DEFAULT_RECONCILE_VISIBLE_COLUMNS: ReconcileColumnKey[] = [...RECONCILE_CONFIGURABLE_COLUMN_ORDER];
