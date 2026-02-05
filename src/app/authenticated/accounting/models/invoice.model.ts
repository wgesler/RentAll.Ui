export interface InvoiceRequest {
  invoiceId?: string;
  organizationId: string;
  officeId: number;
  officeName?: string;
  invoiceCode?: string;
  reservationId?: string | null;
  reservationCode?: string | null;
  startDate: string;
  endDate: string;
  invoiceDate: string;
  dueDate?: string;
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
  startDate: string;
  endDate: string;
  invoiceDate: string;
  dueDate?: string;
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
  startDate: string;
  endDate: string;
}

export interface InvoiceMonthlyDataResponse {
  invoiceCode: string;
  reservationId: string;
  ledgerLines: LedgerLineResponse[];
}


export interface InvoicePaymentRequest {
  costCodeId: number;
  description: string;
  amount: number;
  invoices: string[];
}

export interface InvoicePaymentResponse {
  invoices: InvoiceResponse[];
  creditRemaining: number;
}

// LedgerLine models
export interface LedgerLineRequest {
  ledgerLineId?: string;
  invoiceId?: string | null;
  costCodeId?: string;
  transactionTypeId: number;
  reservationId?: string | null;
  amount: number;
  description: string;
}

export interface LedgerLineResponse {
  ledgerLineId: string;
  invoiceId: string;
  costCodeId?: string;
  transactionTypeId: number;
  reservationId?: string | null;
  amount: number;
  description: string; 
}

export interface LedgerLineListDisplay {
  ledgerLineId: string;
  costCodeId: string | null; // ID reference for dropdowns and saving
  costCode: string | null; // Display value retrieved from CostCodes
  transactionType: string;
  description: string;
  amount: number;
  isNew?: boolean; // Track if this is a newly added line (should remain editable)
  rowColor?: string; // Hidden column for row coloring
}
