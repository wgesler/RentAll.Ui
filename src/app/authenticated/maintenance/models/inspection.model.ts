export interface InspectionResponse {
  inspectionId: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  maintenanceId: string;
  inspectionCheckList: string;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface InspectionDisplayList {
  inspectionId: number;
  officeId: number;
  propertyId: string;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
