export interface ContactRequest {
  contactId?: string;
  organizationId: string;
  contactCode?: string;
  entityTypeId: number;
  entityId?: string | null;
  firstName: string;
  lastName: string;
  officeId: number;
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
  fullName: string;
  officeId: number;
  officeName: string;
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
  officeId: number;
  officeName: string;
  fullName: string;
  contactType: string;
  entityTypeId?: number; // Add entityTypeId for filtering
  phone: string;
  email: string;
  isActive: boolean;
}

