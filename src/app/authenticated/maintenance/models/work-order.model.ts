import { FileDetails } from "../../documents/models/document.model";

export interface WorkOrderRequest {
  workOrderId?: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  maintenanceId: string;
  description: string;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null; 
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
  description: string;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null; 
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
  description: string;
  receiptPath?: string | null;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}
