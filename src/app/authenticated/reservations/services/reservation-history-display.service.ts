import { Injectable, inject } from '@angular/core';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationPaymentResponse } from '../models/reservation-payment.model';
import { ReservationListDisplay } from '../models/reservation-model';
import { ReservationHistoryRateRow } from '../models/reservation-history-rate-row.model';

@Injectable({
  providedIn: 'root'
})
export class ReservationHistoryDisplayService {
  private formatterService = inject(FormatterService);
  private utilityService = inject(UtilityService);

  buildRateHistoryRows(
    reservations: ReservationListDisplay[],
    paymentsByReservationId: Map<string, ReservationPaymentResponse[]>
  ): ReservationHistoryRateRow[] {
    return [...(reservations || [])]
      .sort((left, right) => this.compareDepartureDateDesc(left.departureDate, right.departureDate))
      .flatMap(reservation => this.buildRateHistoryRowsForReservation(reservation, paymentsByReservationId));
  }

  buildRateHistoryRowsForReservation(
    reservation: ReservationListDisplay,
    paymentsByReservationId: Map<string, ReservationPaymentResponse[]>
  ): ReservationHistoryRateRow[] {
    const reservationId = String(reservation.reservationId || '').trim();
    const payments = [...(paymentsByReservationId.get(reservationId) ?? [])].sort(
      (left, right) => this.comparePaymentStartDateAsc(left.startDate, right.startDate)
    );

    if (payments.length === 0) {
      return [this.toRateHistoryRow(reservation, null, Number(reservation.billingRate || 0))];
    }

    return payments.map(payment =>
      this.toRateHistoryRow(reservation, payment, Number(payment.amount || 0))
    );
  }

  toRateHistoryRow(
    reservation: ReservationListDisplay,
    payment: ReservationPaymentResponse | null,
    rateAmount: number
  ): ReservationHistoryRateRow {
    const reservationId = String(reservation.reservationId || '').trim();
    const reservationPaymentId = payment?.reservationPaymentId ?? null;
    const historyRowId = reservationPaymentId != null
      ? `${reservationId}-${reservationPaymentId}`
      : `${reservationId}-billing`;

    return {
      ...reservation,
      historyRowId,
      reservationPaymentId,
      rateStart: payment?.startDate
        ? this.formatterService.formatDateString(payment.startDate)
        : String(reservation.arrivalDate || ''),
      rateEnd: payment?.endDate
        ? this.formatterService.formatDateString(payment.endDate)
        : String(reservation.departureDate || ''),
      rate: this.formatterService.currencyUsd(rateAmount)
    };
  }

  comparePaymentStartDateAsc(left: unknown, right: unknown): number {
    const leftDate = this.utilityService.parseCalendarDateInput(left as string);
    const rightDate = this.utilityService.parseCalendarDateInput(right as string);
    const leftTime = leftDate?.getTime() ?? 0;
    const rightTime = rightDate?.getTime() ?? 0;
    return leftTime - rightTime;
  }

  compareDepartureDateDesc(left: unknown, right: unknown): number {
    const leftDate = this.utilityService.parseCalendarDateInput(left as string);
    const rightDate = this.utilityService.parseCalendarDateInput(right as string);
    const leftTime = leftDate?.getTime() ?? 0;
    const rightTime = rightDate?.getTime() ?? 0;
    return rightTime - leftTime;
  }
}
