export interface OwnerStatementSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface OwnerStatementResponse {
  officeId: number;
  officeName: string;
  ownerId?: string | null;
  propertyId: string;
  propertyCode: string;
  ownerName: string;
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

export interface OwnerStatementJournalEntryLineSearchRequest {
  officeIds: number[];
  ownerId: string;
  propertyId?: string | null;
  metric: OwnerStatementDrillDownMetric;
  startDate?: string | null;
  endDate?: string | null;
}

export interface OwnerStatementJournalEntryLineResponse {
  journalEntryLineId: string;
  journalEntryId: string;
  journalEntryCode: string;
  transactionDate: string;
  officeId: number;
  propertyId: string;
  propertyCode: string;
  chartOfAccountId: number;
  accountNo: string;
  chartOfAccountName: string;
  description: string;
  debit: number;
  credit: number;
  category: string;
  amount: number;
}

export interface OwnerStatementPropertyActivityLineSearchRequest {
  officeIds: number[];
  propertyId: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface OwnerStatementPropertyActivityLineResponse {
  activityId?: string | null;
  activityType: string;
  activityDate: string;
  documentCode: string;
  description: string;
  expectedIncome: number;
  expenses: number;
}

export type OwnerStatementDrillDownMetric = 'expected' | 'prePaid' | 'outstanding' | 'income' | 'expenses' | 'balance';

export interface OwnerStatementListDisplay {
  officeId: number;
  officeName: string;
  ownerName: string;
  propertyCode: string;
  expected: string;
  prePaid: string;
  outstanding: string;
  income: string;
  expenses: string;
  balance: string;
  workingCapital: string;
  workingCapitalBalanceDue: string;
  expectedValue: number;
  prePaidValue: number;
  outstandingValue: number;
  incomeValue: number;
  expensesValue: number;
  balanceValue: number;
  workingCapitalValue: number;
  workingCapitalBalanceDueValue: number;
}

export interface OwnerStatementPropertyRow {
  propertyId: string;
  ownerName: string;
  ownerId: string;
  propertyCode: string;
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

export interface OwnerStatementOwnerGroup {
  rowId: string;
  ownerId: string;
  ownerName: string;
  properties: OwnerStatementPropertyRow[];
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

export interface OwnerStatementOfficeGroup {
  rowId: string;
  officeId: number;
  officeName: string;
  owners: OwnerStatementOwnerGroup[];
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

export type OwnerStatementVisibleRowKind = 'office' | 'owner' | 'property' | 'propertyActivity';

export interface OwnerStatementVisibleRow {
  rowId: string;
  kind: OwnerStatementVisibleRowKind;
  depth: number;
  ownerId?: string;
  officeId?: number;
  propertyId?: string;
  primaryLabel: string;
  propertyCode: string;
  itemDescription: string;
  activityCode: string;
  expected: string;
  expectedValue: number;
  prePaid: string;
  prePaidValue: number;
  outstanding: string;
  outstandingValue: number;
  income: string;
  incomeValue: number;
  expenses: string;
  expensesValue: number;
  balance: string;
  balanceValue: number;
  workingCapital: string;
  workingCapitalValue: number;
  workingCapitalBalanceDue: string;
  workingCapitalBalanceDueValue: number;
  expandable: boolean;
  expanded: boolean;
}

export interface OwnerStatementPropertyActivityLineDisplay {
  rowId: string;
  activityId: string | null;
  activityType: string;
  activityDate: string;
  documentCode: string;
  description: string;
  expectedIncome: string;
  expenses: string;
}

export interface OwnerStatementDescriptionSegment {
  text: string;
  code: string | null;
}

export type OwnerStatementReportKind = 'accrual' | 'cash';

export interface OwnerStatementActivityLinkSelection {
  activityId: string | null;
  activityCode: string;
  activityType: string;
  officeId: number;
  propertyId: string;
}

export interface OwnerStatementAmountDrillDownSelection {
  officeIds: number[];
  ownerId: string;
  propertyId?: string | null;
  metric: OwnerStatementDrillDownMetric;
}

export interface OwnerStatementListViewState {
  expandedRowIds: string[];
  propertyActivityByPropertyRowId: Record<string, OwnerStatementPropertyActivityLineDisplay[]>;
}

export interface OwnerStatementJournalEntryLineSelection {
  journalEntryId: string;
  journalEntryLineId: string;
}
