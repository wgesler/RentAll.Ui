export interface ContactRequest {
  contactId?: string;
  organizationId: string;
  contactCode?: string;
  entityTypeId: number;
  entityId?: string | null;
  firstName: string;
  lastName: string;
  officeId?: number;
  companyId?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  email: string;
  notes?: string;
  isActive: boolean;
}

export interface ContactResponse {
  contactId: string;
  organizationId: string;
  contactCode: string;
  entityTypeId: number;
  entityId?: string | null;
  firstName: string;
  lastName: string;
  officeId?: number;
  companyId?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  email: string;
  notes?: string;
  isActive: boolean;
}

export interface ContactListDisplay {
  contactId: string;
  contactCode: string;
  office?: string;
  fullName: string;
  contactType: string;
  phone: string;
  email: string;
  isActive: boolean;
}

