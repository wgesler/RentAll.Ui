import { FinancialReportKind } from './financial-report.model';

export type AccountingShellReportKind = FinancialReportKind | 'arAging';

export type AccountingShellBillsReceiptKind = 'bills' | 'receipts' | 'rentRoll';

export type AccountingShellBankActivityKind = 'undepositedFunds' | 'untransferredFunds' | 'deposits' | 'transfers' | 'transferReport' | 'printChecks' | 'reconcile';

export type AccountingShellOwnerKind =
  | 'utilities'
  | 'workOrders'
  | 'statements'
  | 'ownerStatements';

export type AccountingShellGeneralLedgerKind = 'ledger' | 'recap';
