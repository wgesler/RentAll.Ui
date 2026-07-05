export interface OwnerStatementSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface OwnerStatementSearchResponse {
  summaries: OwnerStatementResponse[];
  propertyActivityLines: OwnerStatementPropertyActivityLineResponse[];
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
  startingBalance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
  ownerPayment: number;
  endingBalance: number;
}

export interface OwnerStatementMonthLineSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface OwnerStatementMonthLineResponse {
  ownerStatementLineId: string;
  officeId: number;
  officeName: string;
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyCode: string;
  monthDate: string;
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  startingBalance?: number;
  ownerPayment?: number;
  endingBalance?: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
}

export interface OwnerStatementMonthLineListDisplay {
  ownerStatementLineId: string;
  officeId: number;
  ownerId: string;
  propertyId: string;
  officeName: string;
  ownerName: string;
  propertyCode: string;
  monthDate: string;
  monthDisplay: string;
  startingBalance: string;
  income: string;
  expenses: string;
  ownerPayment: string;
  endingBalance: string;
}

export interface OwnerStatementMonthLineSelection {
  ownerStatementLineId: string;
  officeId: number;
  ownerId: string;
  propertyId: string;
  monthDate: string;
}

export interface OwnerStatementStartingBalanceRequest {
  officeId: number;
  ownerId: string;
  propertyId: string;
  transactionDate: string;
  amount: number;
  currentPassword?: string | null;
}

export interface OwnerStatementStartingBalanceResponse {
  journalEntryId: string;
  officeId: number;
  ownerId: string;
  propertyId: string;
  transactionDate: string;
  amount: number;
  memo: string;
  isPosted: boolean;
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
  propertyId: string;
  officeId: number;
  activityId?: string | null;
  sourceId?: string | null;
  journalEntryLineId?: string | null;
  activityType: string;
  activityDate: string;
  documentCode: string;
  description: string;
  expectedIncome: number;
  receivedIncome: number;
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
  startingBalance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
  ownerPayment: number;
  endingBalance: number;
}

export interface OwnerStatementOfficeGroup {
  rowId: string;
  officeId: number;
  officeName: string;
  properties: OwnerStatementPropertyRow[];
  expected: number;
  prePaid: number;
  outstanding: number;
  income: number;
  expenses: number;
  balance: number;
  startingBalance: number;
  workingCapital: number;
  workingCapitalBalanceDue: number;
  ownerPayment: number;
  endingBalance: number;
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
  startingBalance: string;
  startingBalanceValue: number;
  workingCapital: string;
  workingCapitalValue: number;
  workingCapitalBalanceDue: string;
  workingCapitalBalanceDueValue: number;
  ownerPayment: string;
  ownerPaymentValue: number;
  endingBalance: string;
  endingBalanceValue: number;
  expandable: boolean;
  expanded: boolean;
}

export interface OwnerStatementPropertyActivityLineDisplay {
  rowId: string;
  activityId: string | null;
  sourceId: string | null;
  journalEntryLineId: string | null;
  activityType: string;
  activityDate: string;
  documentCode: string;
  description: string;
  expectedIncome: string;
  receivedIncome: string;
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
}

export interface OwnerStatementJournalEntryLineSelection {
  journalEntryId: string;
  journalEntryLineId: string;
}
