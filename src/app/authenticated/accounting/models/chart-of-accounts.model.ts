export interface ChartOfAccountRequest {
  accountId?: number;
  organizationId: string;
  officeId: number;
  accountNo: string;
  accountTypeId: number;
  name: string;
  isSubaccount: boolean;
  subAccountId?: number | null;
  description?: string | null;
  note?: string | null;
}

export interface ChartOfAccountResponse {
  organizationId: string;
  officeId: number;
  accountId: number;
  accountNo: string;
  accountTypeId: number;
  name: string;
  isSubaccount: boolean;
  subAccountId?: number | null;
  description?: string | null;
  note?: string | null;
}

export interface ChartOfAccountListDisplay {
  organizationId: string;
  officeId: number;
  officeName: string;
  accountId: number;
  accountNo: string;
  accountTypeId: number;
  accountType: string;
  name: string;
  isSubaccount: boolean;
  isSubaccountDisplay: string;
  subAccountId?: number | null;
  description: string;
  note: string;
}
