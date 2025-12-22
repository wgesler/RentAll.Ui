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
  website?: string;
  logoStorageId?: string;
  maintenanceEmail?: string;
  afterHoursPhone?: string;
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
  website?: string;
  logoStorageId?: string;
  maintenanceEmail?: string;
  afterHoursPhone?: string;
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


