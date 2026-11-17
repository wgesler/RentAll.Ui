import { FinancialReportKind } from './financial-report.model';
import { OwnerStatementReportKind } from './owner-statement.model';

export type AccountingShellInvoiceKind = 'invoices' | 'missingInvoiceReport' | 'preBillingReport' | 'payments';

export type AccountingShellReportKind = FinancialReportKind | 'arAging' | 'apAging' | 'reconcileAccountSummary' | 'reconcileAccountDetail';

export type AccountingShellBillsReceiptKind = 'bills' | 'receipts' | 'workOrders' | 'rentRoll' | 'payments';

export type AccountingShellBankActivityKind = 'undepositedFunds' | 'untransferredFunds' | 'deposits' | 'transfers' | 'transferReport' | 'printChecks' | 'securityDeposits' | 'reconcile';

export type AccountingShellOwnerKind =
  | 'utilities'
  | 'workOrders'
  | 'statements'
  | 'ownerStatements'
  | 'ownerPayments'
  | 'apAging'
  | 'escrow';

export type AccountingShellGeneralLedgerKind = 'ledger' | 'recap';

export type JournalEntrySyncProgressKey =
  | 'invoice'
  | 'payment'
  | 'bill'
  | 'receipt'
  | 'workOrder'
  | 'deposit'
  | 'transfer'
  | 'departureFee'
  | 'linenAndTowelFee'
  | 'retainedEarnings';

export interface JournalEntrySyncProgressRow {
  key: JournalEntrySyncProgressKey;
  label: string;
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  status: string;
}

export interface AccountingShellPinnedTopBarState {
  enabled: boolean;
  startDate: string;
  endDate: string;
  /** @deprecated Legacy pinned state; migrated to startDate/endDate on load. */
  asOfDate?: string;
  /** @deprecated Legacy pinned state; migrated to startDate/endDate on load. */
  asOfStart?: string;
}

export interface AccountingShellNavigationState {
  selectedTabIndex: number;
  selectedInvoiceKind?: AccountingShellInvoiceKind;
  selectedBillsReceiptKind?: AccountingShellBillsReceiptKind;
  selectedBankActivityKind?: AccountingShellBankActivityKind;
  selectedOwnerKind?: AccountingShellOwnerKind;
  selectedReportKind?: AccountingShellReportKind;
  selectedGeneralLedgerKind?: AccountingShellGeneralLedgerKind;
  selectedOwnerStatementReportKind?: OwnerStatementReportKind;
}
