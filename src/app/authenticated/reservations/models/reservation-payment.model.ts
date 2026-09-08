import type { CalendarDateString } from '../../../services/utility.service';

export interface ReservationPaymentResponse {
  reservationPaymentId: number;
  organizationId: string;
  reservationId: string;
  amount: number;
  startDate: CalendarDateString;
  endDate: CalendarDateString;
  createdOn?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  modifiedOn?: string | null;
  modifiedBy?: string | null;
  modifiedByName?: string | null;
}

export interface ReservationPaymentRequest {
  reservationPaymentId?: number | null;
  reservationId: string;
  amount: number;
  startDate: CalendarDateString;
  endDate: CalendarDateString;
}

export interface ApplyReservationRentChangeRequest {
  reservationId: string;
  newAmount: number;
  effectiveDate: CalendarDateString;
}

export interface ReservationPaymentDisplay {
  reservationPaymentId: number | null;
  reservationId: string;
  amount: number;
  startDate: Date | null;
  endDate: Date | null;
  modifiedOn?: string | null;
  modifiedByName?: string | null;
  startDateDraft?: string | null;
  endDateDraft?: string | null;
  amountDraft?: string | null;
  isSaving?: boolean;
  isDeleting?: boolean;
  startDateHasOverlap?: boolean;
  endDateHasOverlap?: boolean;
}
