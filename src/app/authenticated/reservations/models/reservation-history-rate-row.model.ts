import { ReservationListDisplay } from './reservation-model';

export interface ReservationHistoryRateRow extends ReservationListDisplay {
  historyRowId: string;
  reservationPaymentId: number | null;
  rateStart: string;
  rateEnd: string;
  rate: string;
}
