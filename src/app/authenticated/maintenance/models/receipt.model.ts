import { FileDetails } from "../../documents/models/document.model";
import type { CalendarDateString } from '../../../services/utility.service';

export interface Split {
  receiptSplitId?: number | null;
  amount: number;
  description: string;
  workOrderId?: string | null;
  workOrderCode?: string | null;
  receiptTypeId: number;
  chartOfAccountId?: number | null;
  accountId?: number | null;
  chartOfAccountDisplayName?: string | null;
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
  dueDate?: string;
  accountingPeriod?: string;
  billNumber?: string | null;
  ticketId: string;
  amount: number;
  paidAmount?: number | null;
  paidDate?: string | null;
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
  receiptGuid: string;
  receiptCode: string;
  invoiceId?: string | null;
  organizationId: string;
  officeId: number;
  officeName: string;
  propertyIds: string[];
  receiptDate: string;
  dueDate: string;
  accountingPeriod: string;
  billNumber?: string | null;
  ticketId: string;
  description: string;
  amount: number;
  paidAmount?: number | null;
  paidDate?: string | null;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  splits: Split[];
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  bankCardDisplayName?: string;
  isActive: boolean;
  createdOn?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptDisplayList {
  receiptId: number;
  receiptGuid: string;
  receiptCode: string;
  invoiceId?: string | null;
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
  accountDisplay?: string;
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
  payableDisabled?: boolean;
  receiptPath?: string | null;
  description: string;
  billNumber?: string | null;
  dueDate: string;
  accountingPeriod: string;
  period?: string;
  created?: string;
  paidAmount?: string;
  paidDate?: string | null;
  dueAmount?: string;
  paidAmountValue?: number;
  dueAmountValue?: number;
  applyAmount?: string;
  applyAmountValue?: number;
  applyAmountDisplay?: string;
  applyAmountEditable?: boolean;
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

export interface BillPaymentRequest {
  paymentDate: CalendarDateString;
  costCodeId: number;
  description: string;
  amount: number;
  bills: number[];
}

export interface BillPaymentResponse {
  bills: ReceiptResponse[];
}
