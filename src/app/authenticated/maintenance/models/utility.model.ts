export interface UtilityRequest {
  utilityId?: number;
  propertyId: string;
  utilityName: string;
  phone?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  notes?: string | null;
}

export interface UtilityResponse {
  utilityId?: number;
  propertyId: string;
  utilityName: string;
  phone?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  notes?: string | null;
}
