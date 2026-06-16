import { ChartOfAccountResponse } from './chart-of-accounts.model';
import { JournalEntryLineSearchResponse } from './journal-entry.model';
import { Class } from './accounting-enum';

export type FinancialReportKind = 'profitLoss' | 'balanceSheet';

export type FinancialReportRowKind = 'section' | 'account' | 'total' | 'summary';

export const FINANCIAL_REPORT_TOTAL_COLUMN_ID = 'total';
export const FINANCIAL_REPORT_UNASSIGNED_COLUMN_ID = '__unassigned__';

export interface FinancialReportColumn {
  columnId: string;
  label: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface FinancialReportTreeNode {
  nodeId: string;
  label: string;
  amount: number;
  columnAmounts: Record<string, number>;
  depth: number;
  rowKind: FinancialReportRowKind;
  accountId?: number;
  childNodes: FinancialReportTreeNode[];
}

export interface FinancialReportResult {
  reportTitle: string;
  periodLabel: string;
  columns: FinancialReportColumn[];
  showTotalColumn: boolean;
  sections: FinancialReportTreeNode[];
}

export interface FinancialReportColumnContext {
  reportClass: Class;
  columns: FinancialReportColumn[];
  showTotalColumn: boolean;
  columnIds: string[];
  isTimeBased: boolean;
  balanceSheet: boolean;
}

export interface FinancialReportBuildRequest {
  reportKind: FinancialReportKind;
  accounts: ChartOfAccountResponse[];
  lines: JournalEntryLineSearchResponse[];
  startDate: string | null;
  endDate: string | null;
  chartOfAccountId: number | null;
  reportClass?: Class;
}
