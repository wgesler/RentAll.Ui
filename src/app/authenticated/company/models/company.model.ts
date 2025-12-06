import { FileDetails } from "../../../shared/models/fileDetails";

export interface CompanyRequest {
  companyId?: string,
  companyCode: string,
  name: string,
  address1: string,
  address2?: string,
  city: string,
  state: string,
  zip: string,
  phone: string,
  website?: string,
  logoStorageId?: string,
  fileDetails?: FileDetails,
  isActive: number
}

export interface CompanyResponse {
  companyId: string;
  companyCode: string;
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoStorageId?: string;
  isActive: number;
}

export interface CompanyListDisplay {
  companyId: string;
  companyCode: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoStorageId?: string;
}

