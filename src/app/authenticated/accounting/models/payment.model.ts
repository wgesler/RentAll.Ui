import type { CalendarDateString } from '../../../services/utility.service';

export interface PaymentLedgerLine {
  ledgerLineId: string;
  invoiceId: string;
  invoiceCode: string;
  lineNumber: number;
  reservationId?: string | null;
  costCodeId: number;
  amount: number;
  description: string;
  ledgerLineDate: string;
  paymentId: string;
  createdOn?: string;
  createdBy?: string;
  modifiedOn?: string;
  modifiedBy?: string;
}

export interface PaymentSearchRequest {
  officeIds: number[];
  startDate?: CalendarDateString | null;
  endDate?: CalendarDateString | null;
}

export interface PaymentInvoiceAllocationRequest {
  invoiceId: string;
  amount: number;
  description?: string;
}

export interface PaymentBillAllocationRequest {
  receiptId: string;
  amount: number;
  description?: string;
  costCodeId?: number | null;
}

export interface CreatePaymentWithBillAllocationsRequest {
  organizationId: string;
  officeId: number;
  paymentDate: string;
  amount: number;
  description: string;
  paymentTypeId?: number | null;
  chartOfAccountId: number;
  isActive: boolean;
  allocations: PaymentBillAllocationRequest[];
}

export interface UpdatePaymentWithBillAllocationsRequest extends CreatePaymentWithBillAllocationsRequest {
  paymentId: string;
}

export interface PaymentBillAllocation {
  paymentBillAllocationId: string;
  paymentId: string;
  receiptId: string;
  receiptCode: string;
  vendorId?: string | null;
  vendorName?: string;
  lineNumber: number;
  amount: number;
  costCodeId?: number | null;
  costCodeDescription?: string;
  description: string;
}

export interface PaymentOwnerAllocation {
  paymentOwnerAllocationId: string;
  paymentId: string;
  ownerId: string;
  ownerName?: string;
  propertyId: string;
  propertyCode?: string;
  lineNumber: number;
  amount: number;
  description: string;
}

export interface OwnerOwedAllocationOption {
  allocationId: string;
  ownerId: string;
  propertyId: string;
  officeId: number;
  ownerName: string;
  propertyCode: string;
  owedAmount: number;
  paidAmount: number;
}

export interface PaymentOwnerAllocationRequest {
  ownerId: string;
  propertyId: string;
  amount: number;
  description?: string;
}

export interface CreatePaymentWithOwnerAllocationsRequest {
  organizationId: string;
  officeId: number;
  paymentDate: string;
  amount: number;
  description: string;
  paymentTypeId?: number | null;
  chartOfAccountId: number;
  isActive: boolean;
  allocations: PaymentOwnerAllocationRequest[];
}

export interface CreatePaymentWithInvoiceAllocationsRequest {
  organizationId: string;
  officeId: number;
  paymentDate: string;
  amount: number;
  costCodeId: number;
  description: string;
  paymentTypeId?: number | null;
  depositId?: string | null;
  isActive: boolean;
  allocations: PaymentInvoiceAllocationRequest[];
}

export interface UpdatePaymentWithInvoiceAllocationsRequest extends CreatePaymentWithInvoiceAllocationsRequest {
  paymentId: string;
}

export interface ApplyInvoicePaymentRequest {
  organizationId: string;
  officeId: number;
  paymentDate: string;
  amount: number;
  costCodeId: number;
  description: string;
  paymentTypeId?: number | null;
  isActive?: boolean;
  invoices?: string[];
  allocations?: PaymentInvoiceAllocationRequest[];
}

export interface UpdatePaymentInvoiceRequest {
  paymentId: string;
  organizationId: string;
  officeId: number;
  paymentDate: string;
  amount: number;
  costCodeId: number;
  description: string;
  paymentTypeId?: number | null;
  depositId?: string | null;
  isActive: boolean;
}

export interface UpdatePaymentBillRequest {
  paymentId: string;
  organizationId: string;
  officeId: number;
  paymentDate: string;
  amount: number;
  description: string;
  paymentTypeId?: number | null;
  chartOfAccountId: number;
  isActive: boolean;
}

export interface PaymentResponse {
  paymentId: string;
  organizationId: string;
  officeId: number;
  paymentCode: string;
  officeName: string;
  paymentDate: string;
  amount: number;
  costCodeId: number;
  costCodeDescription: string;
  description: string;
  paymentKindId: number;
  paymentTypeId?: number | null;
  paymentTypeDescription?: string;
  depositId?: string | null;
  depositCode?: string;
  postingStatusId?: number | null;
  isActive: boolean;
  invoiceAllocations: PaymentLedgerLine[];
  /** @deprecated Use invoiceAllocations — kept for internal component compatibility. */
  ledgerLines: PaymentLedgerLine[];
  billAllocations?: PaymentBillAllocation[];
  ownerAllocations?: PaymentOwnerAllocation[];
  chartOfAccountId?: number | null;
  createdOn?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface PaymentDisplayList {
  paymentId: string;
  paymentCode: string;
  officeId: number;
  officeName: string;
  paymentDate: string;
  amount: number;
  amountDisplay?: string;
  costCodeId: number;
  costCodeDescription: string;
  paymentKindDescription?: string;
  paymentTypeDescription?: string;
  depositCode?: string;
  hasDeposit: boolean;
  descriptionDisplay?: string;
  invoiceSummaryDisplay?: string;
  billSummaryDisplay?: string;
  vendorSummaryDisplay?: string;
  ownerSummaryDisplay?: string;
  propertySummaryDisplay?: string;
  allocatedAmount?: number;
  allocatedAmountDisplay?: string;
  ledgerLineSummaryDisplay?: string;
  ledgerLines: PaymentLedgerLine[];
  billAllocations?: PaymentBillAllocation[];
  ownerAllocations?: PaymentOwnerAllocation[];
  paymentKindId?: number;
  isActive: boolean;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
  postingStatusId?: number | null;
  deleteDisabled?: boolean;
}

export interface PaymentSelection {
  paymentId: string | null;
  officeId: number | null;
  payment?: PaymentResponse | null;
}
