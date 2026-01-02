import { FileDetails } from "../../../../shared/models/fileDetails";

export interface OfficeRequest {
  officeId?: number;
  organizationId: string;
  officeCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax?: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/organization-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  isActive: boolean;
}

export interface OfficeResponse {
  officeId: number;
  organizationId: string;
  officeCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax?: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/organization-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  isActive: boolean;
}

export interface OfficeListDisplay {
  officeId: number;
  officeCode: string;
  name: string;
  phone: string;
  fax?: string;
  website?: string;
  isActive: boolean;
}



