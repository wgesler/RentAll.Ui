import { FileDetails } from "../../documents/models/document.model";

export interface ContactRequest {
  contactId?: string;
  organizationId: string;
  contactCode?: string;
  entityTypeId: number;
  entityId?: string | null;
  companyName?: string | null;
  displayName?: string |null;
  firstName?: string | null;
  lastName?: string | null;
  officeId: number;
  companyId?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  email: string;
  rating: number;
  notes?: string;
  isInternational: boolean;
  w9Path?: string | null;
  w9FileDetails?: FileDetails | null;
  w9Expiration?: string | null;
  insurancePath?: string | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: string | null;
  markup: number;
  isActive: boolean;
}

export interface ContactResponse {
  contactId: string;
  organizationId: string;
  contactCode: string;
  entityTypeId: number;
  entityId?: string | null;
  companyName?: string | null;
  displayName?: string |null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  officeId: number;
  officeName: string;
  companyId?: string | null;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  email: string;
  rating: number;
  notes?: string;
  isInternational: boolean;
  w9Path?: string;
  w9FileDetails?: FileDetails;
  w9Expiration?: string;
  insurancePath?: string;
  insuranceFileDetails?: FileDetails;
  insuranceExpiration?: string;
  markup: number;
  isActive: boolean;
}

export interface ContactListDisplay {
  contactId: string;
  contactCode: string;
  officeId: number;
  officeName: string;
  fullName?: string | null;
  contactType: string;
  entityTypeId?: number;
  companyName?: string | null; 
  phone?: string | null;
  email: string;
  rating: number;
  ratingStars?: string;
  isActive: boolean;
}

