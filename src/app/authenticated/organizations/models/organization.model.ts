import { FileDetails } from '../../../shared/models/fileDetails';

export interface OrganizationRequest {
  organizationId?: string;
  organizationCode?: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  fax?: string;
  contactName?: string;
  contactEmail?: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/organization-logo.png')
  fileDetails?: FileDetails; // Used for upload - contains base64 image data
  isInternational: boolean;
  currentInvoiceNo: number;
  officeFee: number;
  userFee: number;
  unit50Fee: number;
  unit100Fee: number;
  unit200Fee: number;
  unit500Fee: number;
  sendGridName?: string;
  isActive: boolean;
}

export interface OrganizationResponse {
  organizationId: string;
  organizationCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  fax?: string;
  contactName?: string;
  contactEmail?: string;
  website?: string;
  logoPath?: string; // File path (e.g., '/images/logos/organization-logo.png')
  fileDetails?: FileDetails; // Contains base64 image data for display
  isInternational: boolean;
  currentInvoiceNo: number;
  officeFee: number;
  userFee: number;
  unit50Fee: number;
  unit100Fee: number;
  unit200Fee: number;
  unit500Fee: number;
  sendGridName?: string;
  isActive: boolean;
}

export interface OrganizationListDisplay {
  organizationId: string;
  organizationCode: string;
  name: string;
  address1: string;
  address2?: string;
  suite?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  website?: string;
  isInternational: boolean;
  isActive: boolean;
}


