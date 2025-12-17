export interface BuildingRequest {
  buildingId?: number;
  organizationId: string;
  buildingCode: string;
  description: string;
  isActive: boolean;
}

export interface BuildingResponse {
  buildingId: number;
  organizationId: string;
  buildingCode: string;
  description: string;
  isActive: boolean;
}

export interface BuildingListDisplay {
  buildingId: number;
  buildingCode: string;
  description: string;
  isActive: boolean;
}

