import { FileDetails } from "../../../shared/models/fileDetails";
import { BankCardResponse } from "./bank.model";

export interface AccountingOfficeRequest {
  organizationId: string;
  officeId: number;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  bankName: string;
  bankRouting: string;
  bankAccount: string;
  bankSwiftCode: string;
  bankAddress: string;
  bankPhone: string;
  workOrderNo: number;
  defaultActRecvAccountId?: number | null;
  defaultEscrowAccountId?: number | null;
  defaultUndepFundsAccountId?: number | null;
  defaultBankAccountId?: number | null;
  defaultActPayableAccountId?: number | null;
  defaultOwnActPayableAccountId?: number | null;
  defaultPrePayAccountId?: number | null;
  defaultTenantExpAccountId?: number | null;
  defaultTenantIncAccountId?: number | null;
  defaultOwnerExpAccountId?: number | null;
  defaultOwnerIncAccountId?: number | null;
  defaultCompanyExpAccountId?: number | null;
  logoPath?: string; 
  fileDetails?: FileDetails;
  isActive: boolean;
}

export interface AccountingOfficeResponse {
  organizationId: string;
  officeId: number;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  bankName: string;
  bankRouting: string;
  bankAccount: string;
  bankSwiftCode: string;
  bankAddress: string;
  bankPhone: string;
  bankCards?: BankCardResponse[];
  workOrderNo: number;
  defaultActRecvAccountId?: number | null;
  defaultEscrowAccountId?: number | null;
  defaultUndepFundsAccountId?: number | null;
  defaultBankAccountId?: number | null;
  defaultActPayableAccountId?: number | null;
  defaultOwnActPayableAccountId?: number | null;
  defaultPrePayAccountId?: number | null;
  defaultTenantExpAccountId?: number | null;
  defaultTenantIncAccountId?: number | null;
  defaultOwnerExpAccountId?: number | null;
  defaultOwnerIncAccountId?: number | null;
  defaultCompanyExpAccountId?: number | null;
  logoPath?: string; 
  fileDetails?: FileDetails;
  isActive: boolean;
}

export interface AccountingOfficeListDisplay {
  officeId: number;
  officeName: string;
  name: string;
  address: string;
  phone: string;
  fax?: string;
  bankName: string;
  email: string;
  isActive: boolean;
}

export interface AccountingOfficeWorkOrderNoUpdateRequest {
  workOrderNo: number;
}

export interface AccountingOfficeWorkOrderNoUpdateResponse {
  officeId: number;
  workOrderNo: number;
}
