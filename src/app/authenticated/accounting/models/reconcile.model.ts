export type ReconcileColumnKey = 'date' | 'type' | 'checkRef' | 'payee' | 'memo';

export type ReconcileSide = 'payments' | 'deposits';

export interface ReconcileLineDisplay {
  journalEntryLineId: string;
  transactionDate: string;
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

export const RECONCILE_COLUMN_HEADERS: Record<ReconcileColumnKey, string> = {
  date: 'Date',
  type: 'Type',
  checkRef: 'Chk#/Ref#',
  payee: 'Payee',
  memo: 'Memo'
};

export const RECONCILE_TABLE_COLUMN_ORDER: ReconcileColumnKey[] = ['date', 'type', 'checkRef', 'payee', 'memo'];

export const RECONCILE_DIALOG_COLUMN_ORDER: ReconcileColumnKey[] = ['checkRef', 'date', 'payee', 'memo', 'type'];

export const DEFAULT_RECONCILE_VISIBLE_COLUMNS: ReconcileColumnKey[] = [...RECONCILE_TABLE_COLUMN_ORDER];
