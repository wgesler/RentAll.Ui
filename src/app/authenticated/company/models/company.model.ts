import { FileDetails } from "../../../shared/models/fileDetails";

export interface CompanyRequest {
  companyId?: string;
  organizationId: string;
  companyCode?: string;
  name: string;
  contactId: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoStorageId?: string;
  fileDetails?: FileDetails;
  isActive: boolean;
}

export interface CompanyResponse {
  companyId: string;
  organizationId: string;
  companyCode: string;
  contactId: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoStorageId?: string;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface CompanyListDisplay {
  companyId: string;
  companyCode: string;
  name: string;
  contact: string;
  contactId: string;
  city: string;
  state: string;
  phone: string;
  website?: string;
  isActive: boolean;
}

