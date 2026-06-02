import type { CalendarDateString } from '../../../services/utility.service';

/** Body for POST accounting/invoice/search — matches API GetInvoiceDto. */
export interface InvoiceGetRequest {
  officeIds: number[];
  reservationId?: string | null;
  propertyId?: string | null;
  invoiceCode?: string | null;
  includeInactive: boolean;
  includePaid: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface InvoiceRequest {
  invoiceId?: string;
  organizationId: string;
  officeId: number;
  officeName?: string;
  invoiceCode?: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  responsibleParty?: string | null;
  startDate: string;
  endDate: string;
  invoiceDate: CalendarDateString;
  dueDate?: CalendarDateString;
  invoicePeriod?: string;
  totalAmount: number;
  paidAmount: number;
  notes?: string | null;
  isActive: boolean;
  ledgerLines?: LedgerLineRequest[];
}

export interface InvoiceResponse {
  invoiceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  invoiceCode: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  propertyId?: string | null;
  propertyCode?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  responsibleParty: string | null;
  startDate: string;
  endDate: string;
  invoiceDate: CalendarDateString;
  dueDate?: CalendarDateString;
  invoicePeriod?: string;
  totalAmount: number;
  paidAmount: number;
  notes?: string | null;
  ledgerLines: LedgerLineResponse[];
  isActive: boolean;
  createdOn: string;
  createdBy: string;
  modifiedOn: string;
  modifiedBy: string;
}

export interface InvoiceListDisplay {
  invoiceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  invoiceCode: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  propertyId?: string | null;
  propertyCode?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  responsibleParty: string | null;
  startDate: string;
  endDate: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  isActive: boolean;
  ledgerLines: LedgerLineResponse[];
}

export interface InvoiceMonthlyDataRequest {
  invoiceCode: string;
  reservationId: string;
  invoiceDate: string;
  startDate: string;
  endDate: string;
}

export interface InvoiceMonthlyDataResponse {
  invoiceCode: string;
  reservationId: string;
  ledgerLines: LedgerLineResponse[];
}

export interface BillingMonthlyDataRequest {
  invoiceCode: string;
  organizationId: string;
  invoiceDate: string;
  startDate: string;
  endDate: string;
}

export interface BillingMonthlyDataResponse {
  invoiceCode: string;
  organizationId: string;
  ledgerLines: LedgerLineResponse[];
}
export interface InvoicePaymentRequest {
  paymentDate: CalendarDateString;
  costCodeId: number;
  description: string;
  amount: number;
  invoices: string[];
}

export interface InvoicePaymentResponse {
  invoices: InvoiceResponse[];
}

// LedgerLine models
export interface LedgerLineRequest {
  ledgerLineId?: string;
  invoiceId?: string | null;
  lineNumber: number;
  costCodeId?: number;
  transactionTypeId: number;
  reservationId?: string | null;
  amount: number;
  description: string;
  ledgerLineDate: CalendarDateString;
}

export interface LedgerLineResponse {
  ledgerLineId: string;
  invoiceId: string;
  lineNumber: number;
  costCodeId?: number;
  transactionTypeId: number;
  reservationId?: string | null;
  amount: number;
  description: string;
  ledgerLineDate: CalendarDateString;
}

export interface LedgerLineListDisplay {
  ledgerLineId: string;
  lineNumber: number;
  costCodeId: number | null; // ID reference for dropdowns and saving
  costCode: string | null; // Display value retrieved from CostCodes
  transactionType: string;
  description: string;
  amount: number;
  ledgerLineDate?: CalendarDateString;
  isNew?: boolean; // Track if this is a newly added line (should remain editable)
  rowColor?: string; // Hidden column for row coloring
}
