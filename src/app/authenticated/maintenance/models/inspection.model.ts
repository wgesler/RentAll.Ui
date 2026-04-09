export interface InspectionRequest {
  inspectionId?: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  reservationId?: string | null;
  maintenanceId: string;
  inspectionTypeId: number;
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
  reservationId: string;
  reservationCode: string; 
  maintenanceId: string;
  inspectionTypeId: number;
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
  reservationId: string;
  reservationCode: string; 
  maintenanceId: string;
  inspectionTypeId: number;
  inspectionType?: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
