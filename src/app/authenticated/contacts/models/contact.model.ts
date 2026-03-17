import { FileDetails } from "../../documents/models/document.model";

export interface ContactRequest {
  contactId?: string;
  organizationId: string;
  contactCode?: string;
  entityTypeId: number;
  entityId?: string | null;
  ownerTypeId?: number | null;
  companyName?: string | null;
  displayName?: string |null;
  firstName?: string | null;
  lastName?: string | null;
  officeId: number;
  companyId?: string;
  properties: string[];
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
  /** Preserve on update when not editing (e.g. compact dialog). */
  agreements?: unknown[] | null;
 }

export interface ContactResponse {
  contactId: string;
  organizationId: string;
  contactCode: string;
  entityTypeId: number;
  entityId?: string | null;
  ownerTypeId?: number | null;
  companyName?: string | null;
  displayName?: string |null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  officeId: number;
  officeName: string;
  companyId?: string | null;
  properties: string[];
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
  /** Loaded from API; preserve and send back on update when not editing (e.g. compact dialog). */
  agreements?: unknown[];
}

export interface ContactListDisplay {
  contactId: string;
  contactCode: string;
  officeId: number;
  officeName: string;
  fullName?: string | null;
  contactType: string;
  entityTypeId?: number;
  ownerTypeId?: number | null;
  companyName?: string | null;
  propertyCodesDisplay?: string;
  phone?: string | null;
  email: string;
  rating: number;
  ratingStars?: string;
  isActive: boolean;
}

