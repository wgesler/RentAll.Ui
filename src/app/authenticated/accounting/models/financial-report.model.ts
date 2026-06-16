import { ChartOfAccountResponse } from './chart-of-accounts.model';
import { JournalEntryLineSearchResponse } from './journal-entry.model';

export type FinancialReportKind = 'profitLoss' | 'balanceSheet';

export type FinancialReportRowKind = 'section' | 'account' | 'total' | 'summary';

export interface FinancialReportTreeNode {
  nodeId: string;
  label: string;
  amount: number;
  depth: number;
  rowKind: FinancialReportRowKind;
  accountId?: number;
  childNodes: FinancialReportTreeNode[];
}

export interface FinancialReportResult {
  reportTitle: string;
  periodLabel: string;
  sections: FinancialReportTreeNode[];
}

export interface FinancialReportBuildRequest {
  reportKind: FinancialReportKind;
  accounts: ChartOfAccountResponse[];
  lines: JournalEntryLineSearchResponse[];
  startDate: string | null;
  endDate: string | null;
  chartOfAccountId: number | null;
}
