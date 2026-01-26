import { TransactionType } from './accounting-enum';

export interface InvoiceRequest {
  invoiceId?: string;
  organizationId: string;
  officeId: number;
  officeName?: string;
  invoiceName?: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
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
  invoiceName: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
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
  invoiceName: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  isActive: boolean;
  ledgerLines: LedgerLineResponse[];
}

export interface InvoiceMonthlyDataResponse {
  invoice: string;
  ReservationId: string;
  ledgerLines: LedgerLineResponse[];
}

// LedgerLine models
export interface LedgerLineRequest {
  ledgerLineId?: number;
  invoiceId?: string | null;
  costCodeId?: string;
  transactionTypeId: number;
  reservationId?: string | null;
  amount: number;
  description: string;
}

export interface LedgerLineResponse {
  ledgerLineId: number;
  invoiceId: string;
  costCodeId?: string;
  transactionTypeId: number;
  reservationId?: string | null;
  amount: number;
  description: string; 
}

export interface LedgerLineListDisplay {
  Id: number;
  costCodeId: string | null; // ID reference for dropdowns and saving
  costCode: string | null; // Display value retrieved from CostCodes
  transactionType: string;
  description: string;
  amount: number;
  isNew?: boolean; // Track if this is a newly added line (should remain editable)
}
