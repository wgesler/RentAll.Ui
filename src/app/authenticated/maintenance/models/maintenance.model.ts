export interface MaintenanceRequest {
  maintenanceId?: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  inspectionCheckList: string;
  inventoryCheckList: string;
  notes?: string | null;
  isActive: boolean;
}

export interface MaintenanceResponse {
  maintenanceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  inspectionCheckList: string;
  inventoryCheckList: string;
  notes?: string | null;
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}
