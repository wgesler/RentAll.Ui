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

export interface CreatePaymentWithAllocationsRequest extends PaymentRequest {
  allocations: PaymentInvoiceAllocationRequest[];
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

export interface PaymentRequest {
  paymentId?: string;
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

export interface PaymentResponse {
  paymentId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  paymentDate: string;
  amount: number;
  costCodeId: number;
  costCodeDescription: string;
  description: string;
  paymentTypeId?: number | null;
  paymentTypeDescription?: string;
  depositId?: string | null;
  depositCode?: string;
  postingStatusId?: number | null;
  isActive: boolean;
  ledgerLines: PaymentLedgerLine[];
  createdOn?: string;
  createdBy?: string;
  createdByName?: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface PaymentDisplayList {
  paymentId: string;
  officeId: number;
  officeName: string;
  paymentDate: string;
  amount: number;
  amountDisplay?: string;
  costCodeId: number;
  costCodeDescription: string;
  paymentTypeDescription?: string;
  depositCode?: string;
  hasDeposit: boolean;
  descriptionDisplay?: string;
  invoiceSummaryDisplay?: string;
  allocatedAmount?: number;
  allocatedAmountDisplay?: string;
  ledgerLineSummaryDisplay?: string;
  ledgerLines: PaymentLedgerLine[];
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
