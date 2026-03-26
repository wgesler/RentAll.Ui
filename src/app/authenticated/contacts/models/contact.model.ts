import { FileDetails } from "../../documents/models/document.model";

export interface ContactRequest {
  contactId?: string;
  organizationId: string;
  contactCode?: string;
  entityTypeId: number;
  entityId?: string | null;
  ownerTypeId?: number | null;
  companyName?: string | null;
  companyEmail?: string | null;
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
  insurancePath?: string | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: string | null;
  agreementPath?: string | null;
  agreementFileDetails?: FileDetails | null;
  markup?: number | null;
  revenueSplitOwner?: number | null;
  revenueSplitOffice?: number | null;
  workingCapitalBalance?: number | null;
  linenAndTowelFee?: number | null;
  bankName?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
  isActive: boolean;
 }

export interface ContactResponse {
  contactId: string;
  organizationId: string;
  contactCode: string;
  entityTypeId: number;
  entityId?: string | null;
  ownerTypeId?: number | null;
  companyName?: string | null;
  companyEmail?: string | null;
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
  w9Path?: string | null;
  w9FileDetails?: FileDetails | null;
  insurancePath?: string | null;
  insuranceFileDetails?: FileDetails | null;
  insuranceExpiration?: string | null;
  agreementPath?: string | null;
  agreementFileDetails?: FileDetails | null;
  markup?: number | null;
  revenueSplitOwner?: number | null;
  revenueSplitOffice?: number | null;
  workingCapitalBalance?: number | null;
  linenAndTowelFee?: number | null;
  bankName?: string | null;
  routingNumber?: string | null;
  accountNumber?: string | null;
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
  ownerTypeId?: number | null;
  companyName?: string | null;
  companyEmail?: string | null;
  propertyCodesDisplay?: string;
  phone?: string | null;
  email: string;
  rating: number;
  ratingStars?: string;
  isActive: boolean;
}

