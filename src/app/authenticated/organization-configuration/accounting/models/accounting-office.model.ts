import { FileDetails } from "../../../../shared/models/fileDetails";

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
  bankName: string;
  bankRouting: string;
  bankAccount: string;
  bankSwiftCode: string;
  bankAddress: string;
  bankPhone: string;
  email: string;
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
  bankName: string;
  bankRouting: string;
  bankAccount: string;
  bankSwiftCode: string;
  bankAddress: string;
  bankPhone: string;
  email: string;
  logoPath?: string; 
  fileDetails?: FileDetails;
  isActive: boolean;
}

export interface AccountingOfficeListDisplay {
  officeId: number;
  name: string;
  address: string;
  phone: string;
  fax?: string;
  bankName: string;
  email: string;
  isActive: boolean;
}
