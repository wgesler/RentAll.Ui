import { FileDetails } from "../../documents/models/document.model";

export interface ReceiptRequest {
  receiptId?: number;
  organizationId: string;
  officeId: number;
  propertyId: string;
  maintenanceId: string;
  description: string;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  isActive: boolean;
}

export interface ReceiptResponse {
  receiptId: number;
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

export interface ReceiptDisplayList {
  receiptId: number;
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
