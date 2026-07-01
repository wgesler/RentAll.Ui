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
