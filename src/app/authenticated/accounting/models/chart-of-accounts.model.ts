import { AccountingType } from './accounting-enum';

export interface ChartOfAccountsRequest {
  chartOfAccountId?: number;
  organizationId: string;
  accountNumber: string;
  description: string;
  accountType: AccountingType;
}

export interface ChartOfAccountsResponse {
  chartOfAccountId: number;
  organizationId: string;
  accountNumber: string;
  description: string;
  accountType: AccountingType;
}

export interface ChartOfAccountsListDisplay {
  chartOfAccountId: number;
  accountNumber: string;
  description: string;
  accountType: AccountingType;
}
