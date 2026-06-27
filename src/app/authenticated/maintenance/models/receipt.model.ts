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
  chartOfAccountDisplayName?: string | null;
  bankCardId?: number | null;
  bankCardDisplayName?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  workOrder?: string;
}

export interface ReceiptRequest {
  receiptId?: string;
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
  agreementLineId?: number | null;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  paymentTypeId?: number;
  checkPrinted?: boolean;
  isUtility?: boolean;
  isActive: boolean;
}

export interface ReceiptResponse {
  receiptId: string;
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
  agreementLineId?: number | null;
  agreementLineNotes?: string | null;
  receiptPath?: string | null;
  fileDetails?: FileDetails | null;
  paymentTypeId?: number;
  checkPrinted?: boolean;
  bankCardDisplayName?: string;
  isUtility?: boolean;
  isActive: boolean;
  createdOn?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface ReceiptDisplayList {
  receiptId: string;
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
  amountDisplay?: string;
  splits: Split[];
  splitTotalAmount?: number;
  splitTotalDisplay?: string;
  splitSummaryDisplay?: string;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  agreementLineId?: number | null;
  notes?: string;
  infoHidden?: boolean;
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
  isUtility?: boolean;
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
  selected?: boolean;
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
  receiptId: string | null;
  officeId: number | null;
  propertyId: string | null;
  agreementLineId?: number | null;
  notes?: string | null;
  autoSaveValidationAttempt?: boolean;
}

export interface ReceiptPrefill {
  key: string;
  officeId?: number | null;
  propertyIds?: string[] | null;
  receiptDate?: CalendarDateString | null;
  dueDate?: CalendarDateString | null;
  accountingPeriod?: CalendarDateString | null;
  agreementLineNotes?: string | null;
  description?: string | null;
  amount?: number | null;
  bankCardId?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  agreementLineId?: number | null;
  billNumber?: string | null;
  split?: {
    amount?: number | null;
    description?: string | null;
    receiptTypeId?: number | null;
    chartOfAccountId?: number | null;
  } | null;
}

export interface BillPaymentRequest {
  paymentDate: CalendarDateString;
  chartOfAccountId: number;
  paymentTypeId: number;
  description: string;
  amount: number;
  bills: string[];
}

export interface BillPaymentResponse {
  bills: ReceiptResponse[];
}
