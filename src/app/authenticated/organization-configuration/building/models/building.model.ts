export interface BuildingRequest {
  buildingId?: number;
  organizationId: string;
  officeId?: string;
  buildingCode: string;
  name: string;
  description?: string;
  hoaName?: string;
  hoaPhone?: string;
  hoaEmail?: string;
  isActive: boolean;
}

export interface BuildingResponse {
  buildingId: number;
  organizationId: string;
  officeId?: string;
  buildingCode: string;
  name: string;
  description?: string;
  hoaName?: string;
  hoaPhone?: string;
  hoaEmail?: string;
  isActive: boolean;
}

export interface BuildingListDisplay {
  buildingId: number;
  buildingCode: string;
  name: string;
  description?: string;
  officeId?: string;
  officeName?: string;
  hoaName?: string;
  hoaPhone?: string;
  hoaEmail?: string;
  isActive: boolean;
}


