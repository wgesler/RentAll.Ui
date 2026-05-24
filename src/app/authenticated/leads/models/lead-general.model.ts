import type { LeadStateDropdownCell } from './lead-enums';

export interface LeadGeneralRequest {
  officeId: number;
  leadStateId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface LeadGeneralUpdateRequest extends LeadGeneralRequest {
  generalId: number;
}

export interface LeadGeneralResponse {
  generalId: number;
  organizationId: string;
  officeId: number;
  leadStateId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  notes: string | null;
  createdOn: string | null;
  createdBy: string | null;
  modifiedOn: string | null;
  modifiedBy: string | null;
  modifiedByName: string | null;
  isActive: boolean;
}

export interface LeadGeneralListDisplay extends LeadGeneralResponse {
  fullName: string;
  leadAttentionDot?: string;
  messagePreview: string;
  leadStateDropdown: LeadStateDropdownCell;
}
