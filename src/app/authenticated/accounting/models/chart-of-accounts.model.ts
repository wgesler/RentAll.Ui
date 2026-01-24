import { AccountingType } from './accounting-enum';

export interface ChartOfAccountsRequest {
  chartOfAccountId?: number;
  organizationId: string;
  officeId: number;
  accountId: number;
  description: string;
  accountType: number;
  isActive: boolean;
}

export interface ChartOfAccountsResponse {
  chartOfAccountId: number;
  organizationId: string;
  officeId: number;
  accountId: number;
  description: string;
  accountType: number;
  isActive: boolean;
}

export interface ChartOfAccountsListDisplay {
  chartOfAccountId: number;
  officeId: number;
  officeName: string;
  accountId: number;
  description: string;
  accountType: string; // Display string, converted from number enum
  isActive: boolean;
}
