import { FileDetails } from "../../../shared/models/fileDetails";

export interface VendorRequest {
  vendorId?: string;
  organizationId: string;
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
  logoStorageId?: string;
  notes?: string;
  fileDetails?: FileDetails;
  isActive: boolean;
}

export interface VendorResponse {
  vendorId: string;
  organizationId: string;
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
  logoStorageId?: string;
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
  name: string;
  city: string;
  state: string;
  phone: string;
  website?: string;
  isActive: boolean;
}

