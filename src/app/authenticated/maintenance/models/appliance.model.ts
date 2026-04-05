export interface ApplianceRequest {
  applianceId?: number;
  propertyId?: string | null;
  applianceName?: string | null;
  manufacturer?: string | null;
  modelNo?: string | null;
  serialNo?: string | null;
}

export interface ApplianceResponse {
  applianceId: number;
  propertyId: string;
  applianceName?: string | null;
  manufacturer?: string | null;
  modelNo?: string | null;
  serialNo?: string | null;
}
