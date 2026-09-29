import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** Lightweight reservation lifecycle events — avoids pulling ReservationService into layout/sidebar. */
@Injectable({ providedIn: 'root' })
export class ReservationEventsService {
  private readonly reservationSavedSubject = new Subject<{ reservationId: string }>();
  readonly reservationSaved$: Observable<{ reservationId: string }> = this.reservationSavedSubject.asObservable();

  notifyReservationSaved(reservationId: string): void {
    const normalizedReservationId = String(reservationId || '').trim();
    if (!normalizedReservationId) {
      return;
    }
    this.reservationSavedSubject.next({ reservationId: normalizedReservationId });
  }
}
