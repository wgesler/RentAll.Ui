export interface ContactRequest {
  contactId?: string;
  contactCode: string;
  contactTypeId: number;
  firstName: string;
  lastName: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  email: string;
  isActive: boolean;
}

export interface ContactResponse {
  contactId: string;
  contactCode: string;
  contactTypeId: number;
  firstName: string;
  lastName: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone: string;
  email: string;
  isActive: boolean;
}

export interface ContactListDisplay {
  contactId: string;
  contactCode: string;
  fullName: string;
  contactType: string;
  phone: string;
  email: string;
  isActive: boolean;
}

