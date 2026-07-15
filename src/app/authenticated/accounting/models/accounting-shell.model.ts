import { FinancialReportKind } from './financial-report.model';

export type AccountingShellReportKind = FinancialReportKind | 'arAging' | 'apAging' | 'reconcileAccountSummary' | 'reconcileAccountDetail';

export type AccountingShellBillsReceiptKind = 'bills' | 'receipts' | 'rentRoll';

export type AccountingShellBankActivityKind = 'undepositedFunds' | 'untransferredFunds' | 'deposits' | 'transfers' | 'transferReport' | 'printChecks' | 'reconcile';

export type AccountingShellOwnerKind =
  | 'utilities'
  | 'workOrders'
  | 'statements'
  | 'ownerStatements'
  | 'apAging'
  | 'escrow';

export type AccountingShellGeneralLedgerKind = 'ledger' | 'recap';
