import { InvoiceResponse } from '../../accounting/models/invoice.model';
import { ReservationHistoryRateRow } from '../../reservations/models/reservation-history-rate-row.model';
import { ReservationListDisplay } from '../../reservations/models/reservation-model';

export interface InvoiceHistoryDisplayRow {
  invoiceId: string;
  invoiceNumber: string;
  period: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  source: InvoiceResponse;
}

export interface ReservationHistoryDisplayRow extends ReservationHistoryRateRow {
  expand: string;
  expanded: boolean;
  invoices: InvoiceHistoryDisplayRow[];
  invoicesLoading: boolean;
  expandClick: (event: Event, item: ReservationHistoryDisplayRow) => void;
}
