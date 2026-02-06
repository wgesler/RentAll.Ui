import { FileDetails } from '../../../shared/models/fileDetails';

export interface OrganizationRequest {
  organizationId?: string;
  organizationCode?: string;
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
  fileDetails?: FileDetails; // Used for upload - contains base64 image data
  isActive: boolean;
}

export interface OrganizationResponse {
  organizationId: string;
  organizationCode: string;
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

export interface OrganizationListDisplay {
  organizationId: string;
  organizationCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website?: string;
  isActive: boolean;
}


