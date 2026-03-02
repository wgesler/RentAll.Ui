export interface WorkOrderRequest {
  workOrderId?: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  maintenanceId: string;
  descriptionId: string;
  documentPath?: string | null;
  isActive: boolean;
}

export interface WorkOrderResponse {
  workOrderId: number;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  maintenanceId: string;
  descriptionId: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}

export interface WorkOrderDisplayList {
  workOrderId: number;
  officeId: number;
  officeName: string;
  propertyId: string;
  propertyCode: string;
  maintenanceId: string;
  descriptionId: string;
  documentPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
