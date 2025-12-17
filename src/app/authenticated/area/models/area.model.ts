export interface AreaRequest {
  areaId?: number;
  organizationId: string;
  areaCode: string;
  description: string;
  isActive: boolean;
}

export interface AreaResponse {
  areaId: number;
  organizationId: string;
  areaCode: string;
  description: string;
  isActive: boolean;
}

export interface AreaListDisplay {
  areaId: number;
  areaCode: string;
  description: string;
  isActive: boolean;
}

