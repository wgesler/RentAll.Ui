export interface OwnerStatementSearchRequest {
  officeIds: number[];
  propertyId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface OwnerStatementResponse {
  propertyId: string;
  propertyCode: string;
  ownerName: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface OwnerStatementListDisplay {
  propertyId: string;
  propertyCode: string;
  ownerName: string;
  income: string;
  expenses: string;
  balance: string;
  incomeValue: number;
  expensesValue: number;
  balanceValue: number;
}
