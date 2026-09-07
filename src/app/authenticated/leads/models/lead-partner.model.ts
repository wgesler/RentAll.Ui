import type { LeadStateDropdownCell } from './lead-enums';

export interface LeadPartnerRequest {
  partnerId?: number;
  leadStateId: number;
  officeId: number;
  name: string | null;
  companyName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  marketsCitiesServed: string | null;
  furnishedPropertiesInPortfolio: string | null;
  aboutYourBusiness: string | null;
  notes: string | null;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  isActive: boolean;
}

export interface LeadPartnerUpdateRequest extends LeadPartnerRequest {
  partnerId: number;
}

export interface LeadPartnerResponse {
  partnerId: number;
  organizationId: string;
  officeId: number;
  leadStateId: number;
  name: string | null;
  companyName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  marketsCitiesServed: string | null;
  furnishedPropertiesInPortfolio: string | null;
  aboutYourBusiness: string | null;
  notes: string | null;
  createdOn: string | null;
  createdBy: string | null;
  modifiedOn: string | null;
  modifiedBy: string | null;
  modifiedByName: string | null;
  emailPhoneConsent: boolean;
  smsConsent: boolean;
  isActive: boolean;
}

export interface LeadPartnerListDisplay extends LeadPartnerResponse {
  leadAttentionDot?: string;
  leadStateDropdown: LeadStateDropdownCell;
  businessPreview: string;
}

export type PartnerEditSelection = { partnerId: number; officeId: number | null };
