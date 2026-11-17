export interface SecurityDepositUndoDocument {
  id: string;
  code: string;
  date: string | null;
  amount: number;
  description: string;
  includesOtherReservations: boolean;
}

export interface SecurityDepositUndoPreviewResponse {
  reservationCode: string;
  transfers: SecurityDepositUndoDocument[];
  deposits: SecurityDepositUndoDocument[];
  payments: SecurityDepositUndoDocument[];
  invoices: SecurityDepositUndoDocument[];
}
