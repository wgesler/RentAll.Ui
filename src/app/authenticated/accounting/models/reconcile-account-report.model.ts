import { ChartOfAccountResponse } from './chart-of-accounts.model';
import { JournalEntryLineSearchResponse } from './journal-entry.model';

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
  endingBalance: number | null;
}

export interface ReconcileAccountReportBuildRequest {
  view: ReconcileAccountReportView;
  account: ChartOfAccountResponse;
  companyName: string;
  officeName?: string | null;
  statementDate: string;
  beginningBalance: number;
  endingBalance: number;
  lines: JournalEntryLineSearchResponse[];
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
