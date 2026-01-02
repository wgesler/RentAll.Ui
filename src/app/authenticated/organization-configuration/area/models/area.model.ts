export interface AreaRequest {
  areaId?: number;
  organizationId: string;
  officeId?: string;
  areaCode: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface AreaResponse {
  areaId: number;
  organizationId: string;
  officeId?: string;
  areaCode: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface AreaListDisplay {
  areaId: number;
  areaCode: string;
  officeId?: string;
  officeName?: string;
  name: string;
  description?: string;
  isActive: boolean;
}


