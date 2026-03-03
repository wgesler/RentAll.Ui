export interface ContractorRequest {
  contractorId?: string;
  organizationId: string;
  officeId: number;
  contractorCode?: string;
  name: string;
  phone?: string | null;
  website?: string | null;
  rating: number;
  notes?: string | null;
  isActive: boolean;
}

export interface ContractorResponse {
  contractorId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  contractorCode: string;
  name: string;
  phone?: string | null;
  website?: string | null;
  rating: number;
  notes?: string | null;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ContractorDisplayList {
  contractorId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  contractorCode: string;
  name: string;
  phone?: string | null;
  website?: string | null;
  rating: number;
  ratingStars?: string;
  notes?: string | null;
  isActive: boolean;
}
