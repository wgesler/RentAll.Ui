import { TransactionType } from './accounting-enum';

export interface InvoiceRequest {
  invoiceId?: string;
  organizationId: string;
  officeId: number;
  reservationId?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  notes?: string | null;
  isActive: boolean;
}

export interface InvoiceResponse {
  invoiceId: string;
  organizationId: string;
  officeId: number;
  officeName: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  notes?: string | null;
  LedgerLineResponse: LedgerLineResponse[];
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
  reservationId?: string | null;
  reservationCode?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount: number;
  isActive: boolean;
}

export interface InvoiceMonthlyDataResponse {
  invoice: string;
  ReservationId: string;
  LedgerLines: LedgerLineResponse[];
}

// LedgerLine models
export interface LedgerLineRequest {
  ledgerLineId?: number;
  invoice?: string | null;
  chartOfAccountId?: number;
  transactionTypeId: number;
  propertyId?: string | null;
  reservationId?: string | null;
  amount: number;
  description: string;
}

export interface LedgerLineResponse {
  ledgerLineId: number;
  invoiceId: string;
  chartOfAccountId?: number;
  transactionTypeId: number;
  propertyId?: string | null;
  reservationId?: string | null;
  amount: number;
  description: string; 
}

export interface LedgerLineListDisplay {
  Id: number;
  chartOfAccountId: number;
  transactionType: string;
  description: string;
  amount: number;
}
