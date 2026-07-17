import type { CalendarDateString } from '../../../../services/utility.service';

export interface SecurityDepositReturnPaymentSubmit {
  reservationId: string;
  paymentDate: CalendarDateString;
  chartOfAccountId: number;
  paymentTypeId: number;
  description: string;
  amount: number;
}
