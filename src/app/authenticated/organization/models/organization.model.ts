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
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  defaultDeposit?: number;
  utilityOneBed?: number;
  utilityTwoBed?: number;
  utilityThreeBed?: number;
  utilityFourBed?: number;
  utilityHouse?: number;
  maidOneBed?: number;
  maidTwoBed?: number;
  maidThreeBed?: number;
  maidFourBed?: number;
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
  maintenanceEmail?: string;
  afterHoursPhone?: string;
  defaultDeposit?: number;
  utilityOneBed?: number;
  utilityTwoBed?: number;
  utilityThreeBed?: number;
  utilityFourBed?: number;
  utilityHouse?: number;
  maidOneBed?: number;
  maidTwoBed?: number;
  maidThreeBed?: number;
  maidFourBed?: number;
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


