import { of } from "rxjs";

export interface RegionRequest {
  regionId?: number;
  organizationId: string;
  officeId?: string;
  regionCode: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface RegionResponse {
  regionId: number;
  organizationId: string;
  officeId?: string;
  regionCode: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface RegionListDisplay {
  regionId: number;
  regionCode: string;
  officeId?: string;
  officeName?: string;
  name: string;
  description?: string;
  isActive: boolean;
}


