import { FileDetails } from "../../documents/models/document.model";
import type { CalendarDateString } from '../../../services/utility.service';

/** Persisted on receipt propertyIds when the user selects Company at the receipt level. */
export const RECEIPT_COMPANY_PROPERTY_ID = '00000000-0000-0000-0000-000000000000';

export function isReceiptCompanyPropertyId(propertyId: string | null | undefined): boolean {
  return (propertyId || '').trim().toLowerCase() === RECEIPT_COMPANY_PROPERTY_ID;
}

export function normalizeReceiptPropertyIdForApi(propertyId: string | null | undefined): string | null {
  const normalized = (propertyId || '').trim();
  if (!normalized) {
    return null;
  }
  if (isReceiptCompanyPropertyId(normalized)) {
    return RECEIPT_COMPANY_PROPERTY_ID;
  }
  return normalized;
}

export function resolveFirstRealReceiptPropertyId(propertyIds: string[] | null | undefined): string | null {
  return (propertyIds || [])
    .map(propertyId => (propertyId || '').trim())
    .find(propertyId => propertyId.length > 0 && !isReceiptCompanyPropertyId(propertyId)) ?? null;
}

export interface Split {
  receiptSplitId?: number | null;
  amount: number;
  description: string;
  propertyId?: string | null;
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

/** Expandable bill detail rows (splits + optional green payment line). */
export interface ReceiptSplitDetailLineDisplay {
  lineId: string;
  lineDate: string | null;
  description: string;
  workOrder: string;
  receiptType: string;
  account: string;
  amount: number;
  rowColor?: string;
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
  businessPrivate?: boolean;
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
  journalEntryId?: string | null;
  postingStatusId?: number | null;
  bankCardDisplayName?: string;
  isUtility?: boolean;
  businessPrivate?: boolean;
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
  receiptTypeTooltip?: string;
  descriptionDisplay?: string;
  isUtility?: boolean;
  businessPrivate?: boolean;
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
  expand?: string;
  expanded?: boolean;
  detailLines?: ReceiptSplitDetailLineDisplay[];
  expandClick?: (event: Event, item: ReceiptDisplayList) => void;
}

export interface ReceiptSelection {
  receiptId: string | null;
  officeId: number | null;
  propertyId: string | null;
  agreementLineId?: number | null;
  notes?: string | null;
  autoSaveValidationAttempt?: boolean;
  receipt?: ReceiptResponse | null;
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
