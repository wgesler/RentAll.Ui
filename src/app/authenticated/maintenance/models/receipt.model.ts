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
  vendorId?: string | null;
  vendorName?: string | null;
  workOrder?: string;
}

export interface ReceiptRequest {
  receiptId?: number;
  organizationId: string;
  officeId: number;
  propertyIds: string[];
  receiptDate: string;
  ticketId: string;
  amount: number;
  description: string;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
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
  receiptDate: string;
  ticketId: string;
  description: string;
  amount: number;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  splits: Split[];
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  bankCardDisplayName?: string;
  isActive: boolean;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptDisplayList {
  receiptId: number;
  officeId: number;
  officeName: string;
  propertyIds: string[];
  receiptDate: string;
  receiptDateReadOnly?: boolean;
  propertyCode?: string;
  ticketId: string;
  amount: number;
  amountDisplay?: string; // formatted for list (e.g. $0.00)
  splits: Split[];
  splitTotalAmount?: number;
  splitTotalDisplay?: string;
  splitSummaryDisplay?: string;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  bankCardDisplayName?: string;
  bankCardDropdown?: {
    value: string;
    isOverridable: boolean;
    options: string[];
    toString: () => string;
  };
  vendorDisplay?: string | { value: string; isOverridable: boolean; options: string[]; toString: () => string; };
  vendorDisplayReadOnly?: boolean;
  vendorDisplayClickToEdit?: boolean;
  vendorDisplayEditing?: boolean;
  isSplitAmountValid?: boolean;
  workOrderDisplay?: string;
  receiptTypeDisplay?: string;
  descriptionDisplay?: string;
  isActive: boolean;
  receiptPath?: string | null;
  description: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptSelection {
  receiptId: number | null;
  officeId: number | null;
  propertyId: string | null;
}
