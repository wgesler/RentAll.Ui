import { ChartOfAccountResponse } from './chart-of-accounts.model';
import { JournalEntryLineListDisplay, JournalEntryLineSearchResponse } from './journal-entry.model';
import { Class } from './accounting-enum';

export type FinancialReportKind = 'profitLoss' | 'balanceSheet';

export interface AsOfReportDateRange {
  asOfStart: string | null;
  asOfDate: string | null;
}

export type FinancialReportRowKind = 'section' | 'account' | 'total' | 'summary';

export type FinancialReportDrillDownMode = 'activity' | 'balance';

export interface FinancialReportDrillDownSpec {
  accountIds?: number[];
  accountTypeIds?: number[];
  includeProfitLossActivity?: boolean;
  mode: FinancialReportDrillDownMode;
}

export interface FinancialReportDrillDownContext {
  reportKind: FinancialReportKind;
  columnContext: FinancialReportColumnContext;
  scopedAccounts: ChartOfAccountResponse[];
  accountIdRemap: Map<number, number>;
  startDate: string | null;
  endDate: string | null;
}

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
  drillDownSpec?: FinancialReportDrillDownSpec;
  childNodes: FinancialReportTreeNode[];
}

export interface FinancialReportDrillDownView {
  title: string;
  subtitle: string;
  nodeId: string;
  columnId: string;
  lines: JournalEntryLineListDisplay[];
}

export interface FinancialReportResult {
  reportTitle: string;
  periodLabel: string;
  columns: FinancialReportColumn[];
  showTotalColumn: boolean;
  sections: FinancialReportTreeNode[];
  drillDownContext: FinancialReportDrillDownContext;
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
