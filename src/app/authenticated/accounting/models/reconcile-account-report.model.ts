import { ChartOfAccountResponse } from './chart-of-accounts.model';
import { JournalEntryLineSearchResponse } from './journal-entry.model';
import { ReconcileResponse } from './reconcile.model';

export type ReconcileAccountReportView = 'summary' | 'detail';

export type ReconcileAccountReportRowKind =
  | 'columnHeader'
  | 'beginning'
  | 'section'
  | 'subsection'
  | 'line'
  | 'total'
  | 'summary'
  | 'ending';

export interface ReconcileAccountReportContext {
  statementDate?: string | null;
  endingBalance: number | null;
  periodStartDate?: string | null;
  periodBeginningBalance?: number | null;
}

export interface ReconcileAccountReportBuildRequest {
  view: ReconcileAccountReportView;
  account: ChartOfAccountResponse;
  companyName: string;
  officeName?: string | null;
  statementDate: string;
  periodStartDate?: string | null;
  beginningBalance: number;
  endingBalance: number;
  lines: JournalEntryLineSearchResponse[];
}

function calendarDatePlusDays(dateStr: string, days: number): string | null {
  const datePart = String(dateStr || '').trim().split('T')[0]?.split(' ')[0] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null;
  }

  const [year, month, day] = datePart.split('-').map(part => Number(part));
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

/** Same source as Begin Reconciliation dialog last-reconciled date (chart of account fields). */
export function buildReconcileAccountReportContextFromAccount(
  account: Pick<ChartOfAccountResponse, 'statementDate' | 'endingBalance'> | null | undefined
): ReconcileAccountReportContext | null {
  if (!account) {
    return null;
  }

  const statementDate = String(account.statementDate || '').trim();
  if (!statementDate) {
    return null;
  }

  return {
    statementDate,
    endingBalance: account.endingBalance ?? null,
    periodStartDate: null,
    periodBeginningBalance: null
  };
}

/** History rows are newest-first (see Reconcile_GetAllByAccountId). */
export function buildReconcileAccountReportContext(
  reconcile: Pick<ReconcileResponse, 'reconcileId' | 'statementDate' | 'endingBalance'> | null | undefined,
  historyRows: ReconcileResponse[],
  overrides?: { periodBeginningBalance?: number | null }
): ReconcileAccountReportContext | null {
  if (!reconcile) {
    return null;
  }

  const statementDate = String(reconcile.statementDate || '').trim();
  if (!statementDate) {
    return null;
  }

  let previous: ReconcileResponse | null = null;
  const reconcileIndex = historyRows.findIndex(row => row.reconcileId === reconcile.reconcileId);
  if (reconcileIndex >= 0) {
    previous = historyRows[reconcileIndex + 1] ?? null;
  } else {
    previous = historyRows.find(row => {
      const priorStatementDate = String(row.statementDate || '').trim();
      return priorStatementDate && priorStatementDate < statementDate;
    }) ?? null;
  }

  const periodStartDate = previous?.statementDate
    ? calendarDatePlusDays(String(previous.statementDate), 1)
    : null;

  return {
    statementDate,
    endingBalance: reconcile.endingBalance ?? null,
    periodStartDate,
    periodBeginningBalance: overrides?.periodBeginningBalance ?? previous?.endingBalance ?? null
  };
}

export interface ReconcileAccountReportRow {
  rowId: string;
  rowKind: ReconcileAccountReportRowKind;
  label?: string;
  type?: string;
  date?: string;
  num?: string;
  name?: string;
  clr?: string;
  amount?: number | null;
  balance?: number | null;
  depth?: number;
}

export interface ReconcileAccountReportResult {
  reportTitle: string;
  entityLine: string;
  periodLine: string;
  view: ReconcileAccountReportView;
  rows: ReconcileAccountReportRow[];
}
