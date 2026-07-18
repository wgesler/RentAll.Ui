import { ReservationDepartureResponse } from '../../reservations/models/reservation-model';

export interface SecurityDepositDetailLineResponse {
  invoiceId?: string | null;
  invoiceCode: string;
  ledgerLineId?: string | null;
  lineDate?: string | null;
  description: string;
  amount: number;
  journalEntryId?: string | null;
  journalEntryCode: string;
}

export interface SecurityDepositDetailReturnLineResponse {
  journalEntryId: string;
  journalEntryCode: string;
  transactionDate: string;
  memo: string;
  amount: number;
}

export interface SecurityDepositDetailResponse {
  reservation: ReservationDepartureResponse;
  depositAmount: number;
  collectedAmount: number;
  owedAmount: number;
  balanceAmount: number;
  returnedAmount: number;
  remainingReturnAmount: number;
  securityDepositCharges: SecurityDepositDetailLineResponse[];
  outstandingCharges: SecurityDepositDetailLineResponse[];
  securityDepositPayments: SecurityDepositDetailLineResponse[];
  returnPayments: SecurityDepositDetailReturnLineResponse[];
}

export interface SecurityDepositReportSelection {
  reservationId: string;
  reservationCode?: string | null;
  officeId?: number | null;
  securityDepositReturnDate?: string | null;
}
