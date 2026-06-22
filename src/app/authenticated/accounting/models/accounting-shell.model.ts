import { FinancialReportKind } from './financial-report.model';

export type AccountingShellReportKind = FinancialReportKind | 'arAging';

export type AccountingShellBillsReceiptKind = 'bills' | 'receipts';

export type AccountingShellBankActivityKind = 'deposits' | 'printChecks' | 'reconcile';

export type AccountingShellOwnerKind = 'utilities' | 'workOrders' | 'statements';
