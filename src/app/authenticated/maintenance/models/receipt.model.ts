import { FileDetails } from "../../documents/models/document.model";

export interface Split {
  receiptSplitId?: number | null;
  amount: number;
  description: string;
  workOrderId?: string | null;
  workOrderCode?: string | null;
  receiptTypeId: number;
  bankCardId?: number | null;
  bankCardDisplayName?: string | null;
  workOrder?: string;
}

export interface ReceiptRequest {
  receiptId?: number;
  organizationId: string;
  officeId: number;
  propertyIds: string[];
  maintenanceId: string;
  amount: number;
  description: string;
  splits: Split[];
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  isActive: boolean;
}

export interface ReceiptResponse {
  receiptId: number;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyIds: string[];
  maintenanceId: string;
  description: string;
  amount: number;
  splits: Split[];
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  bankCardDisplayName?: string;
  isActive: boolean;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptDisplayList {
  receiptId: number;
  officeId: number;
  officeName: string;
  propertyIds: string[];
  propertyCode?: string;
  maintenanceId: string;
  amount: number;
  amountDisplay?: string; // formatted for list (e.g. $0.00)
  splits: Split[];
  splitTotalAmount?: number;
  splitTotalDisplay?: string;
  splitSummaryDisplay?: string;
  bankCardDisplayName?: string;
  isSplitAmountValid?: boolean;
  workOrderDisplay?: string;
  receiptTypeDisplay?: string;
  descriptionDisplay?: string;
  isActive: boolean;
  receiptPath?: string | null;
  description: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptSelection {
  receiptId: number | null;
  officeId: number | null;
  propertyId: string | null;
}
