export interface RegionRequest {
  regionId?: number;
  organizationId: string;
  regionCode: string;
  description: string;
  isActive: boolean;
}

export interface RegionResponse {
  regionId: number;
  organizationId: string;
  regionCode: string;
  description: string;
  isActive: boolean;
}

export interface RegionListDisplay {
  regionId: number;
  regionCode: string;
  description: string;
  isActive: boolean;
}

