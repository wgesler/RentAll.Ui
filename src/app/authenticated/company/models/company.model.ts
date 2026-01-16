import { FileDetails } from "../../../shared/models/fileDetails";

export interface CompanyRequest {
  companyId?: string;
  organizationId: string;
  companyCode?: string;
  name: string;
  officeId: number;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/company-logo.png')
  notes?: string;
  fileDetails?: FileDetails; // Used for upload - contains base64 image data
  isActive: boolean;
}

export interface CompanyResponse {
  companyId: string;
  organizationId: string;
  companyCode: string;
  name: string;
  officeId: number;
  officeName: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/company-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  notes?: string;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface CompanyListDisplay {
  companyId: string;
  companyCode: string;
  officeId: number;
  officeName: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  website?: string;
  isActive: boolean;
}

