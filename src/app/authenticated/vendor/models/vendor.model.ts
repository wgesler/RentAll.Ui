import { FileDetails } from "../../../shared/models/fileDetails";

export interface VendorRequest {
  vendorId?: string;
  organizationId: string;
  officeId: number;
  vendorCode?: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/vendor-logo.png')
  notes?: string;
  fileDetails?: FileDetails; // Used for upload - contains base64 image data
  isActive: boolean;
}

export interface VendorResponse {
  vendorId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  vendorCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/vendor-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  notes?: string;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface VendorListDisplay {
  vendorId: string;
  vendorCode: string;
  officeId: number;
  officeName: string;
  name: string;
  city: string;
  state: string;
  phone: string;
  website?: string;
  isActive: boolean;
}

