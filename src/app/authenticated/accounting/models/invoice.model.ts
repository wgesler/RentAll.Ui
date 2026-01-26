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
  LedgerLines?: LedgerLineRequest[];
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
  LedgerLines: LedgerLineResponse[];
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
  LedgerLines: LedgerLineResponse[];
}

export interface InvoiceMonthlyDataResponse {
  invoice: string;
  ReservationId: string;
  LedgerLines: LedgerLineResponse[];
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
  costCodeId: string | null;
  transactionType: string;
  description: string;
  amount: number;
}
