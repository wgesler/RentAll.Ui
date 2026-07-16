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
  yearEndMonth: number;
  yearEndDay: number;
  workOrderNo: number;
  defaultTenantIncAccountId?: number | null;
  defaultTenantExpAccountId?: number | null;
  defaultOwnerIncAccountId?: number | null;
  defaultOwnerExpAccountId?: number | null;
  defaultCompanyExpAccountId?: number | null;
  defaultPmUtilityIncAccountId?: number | null;
  defaultLaborIncAccountId?: number | null;
  defaultLinenTowelIncAccountId?: number | null;
  defaultDepartureIncAccountId?: number | null;
  defaultDepartureExpAccountId?: number | null;
  defaultBankAccountId?: number | null;
  defaultActRcvableAccountId?: number | null;
  defaultActPayableAccountId?: number | null;
  defaultUndepFundsAccountId?: number | null;
  defaultEscrowDepositAccountId?: number | null;
  defaultEscrowOwnersAccountId?: number | null;
  defaultEscrowSecDepAccountId?: number | null;
  defaultEscrowSdwAccountId?: number | null;
  defaultOwnActPayableAccountId?: number | null;
  defaultPrePayAccountId?: number | null;
  defaultRetainedEarningsAccountId?: number | null;
  logoPath?: string; 
  fileDetails?: FileDetails;
  currentCheckNumber: number;
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
  yearEndMonth: number;
  yearEndDay: number;
  bankCards?: BankCardResponse[];
  workOrderNo: number;
  defaultTenantIncAccountId?: number | null;
  defaultTenantExpAccountId?: number | null;
  defaultOwnerIncAccountId?: number | null;
  defaultOwnerExpAccountId?: number | null;
  defaultCompanyExpAccountId?: number | null;
  defaultPmUtilityIncAccountId?: number | null;
  defaultLaborIncAccountId?: number | null;
  defaultLinenTowelIncAccountId?: number | null;
  defaultDepartureIncAccountId?: number | null;
  defaultDepartureExpAccountId?: number | null;
  defaultBankAccountId?: number | null;
  defaultActRcvableAccountId?: number | null;
  defaultActPayableAccountId?: number | null;
  defaultUndepFundsAccountId?: number | null;
  defaultEscrowDepositAccountId?: number | null;
  defaultEscrowOwnersAccountId?: number | null;
  defaultEscrowSecDepAccountId?: number | null;
  defaultEscrowSdwAccountId?: number | null;
  defaultOwnActPayableAccountId?: number | null;
  defaultPrePayAccountId?: number | null;
  defaultRetainedEarningsAccountId?: number | null;
  logoPath?: string; 
  fileDetails?: FileDetails;
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
  currentCheckNumber: number;
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

export interface AccountingOfficeCheckNumberUpdateRequest {
  currentCheckNumber: number;
}

export interface AccountingOfficeCheckNumberUpdateResponse {
  officeId: number;
  currentCheckNumber: number;
}

export interface AccountingOfficeCheckStockUpdateRequest {
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
}

export interface AccountingOfficeCheckStockUpdateResponse {
  officeId: number;
  checkStockPath?: string | null;
  checkStockFileDetails?: FileDetails | null;
}

export interface AssignCheckNumbersRequest {
  officeId: number;
  startingCheckNumber: number;
  journalEntryIds: string[];
}

export interface CheckPrintAssignment {
  journalEntryId: string;
  checkNumber: string;
}

export interface AssignCheckNumbersResponse {
  assignments: CheckPrintAssignment[];
  nextCheckNumber: number;
}
