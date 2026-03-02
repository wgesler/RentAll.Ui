export interface InspectionRequest {
  inspectionId?: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  maintenanceId: string;
  inspectionCheckList: string;
  documentPath?: string | null;
  isActive: boolean;
}

export interface InspectionResponse {
  inspectionId: number;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  maintenanceId: string;
  inspectionCheckList: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
export interface InspectionDisplayList {
  inspectionId: number;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  maintenanceId: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
