import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { ReservationListResponse, ReservationRequest, ReservationResponse } from '../models/reservation-model';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  
  private readonly controller = this.configService.config().apiUrl + 'reservation/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService) {
  }

  // GET: Get reservation list (summary view)
  getReservationList(includeInactive: boolean = false): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'list', {
      params: {
        includeInactive: String(includeInactive)
      }
    }).pipe(
      // Keep behavior safe until API-side filtering lands.
      map((reservations) => includeInactive
        ? (reservations || [])
        : (reservations || []).filter(r => r?.isActive === true))
    );
  }

  // GET: Get reservations list for a particular property
  getReservationsByPropertyId(propertyId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'property/' + propertyId);
  }

  // GET: Get all reservations (full detail)
  getReservations(): Observable<ReservationResponse[]> {
    return this.http.get<ReservationResponse[]>(this.controller);
  }

  // GET: Get reservation by ID
  getReservationByGuid(reservationId: string): Observable<ReservationResponse> {
    return this.http.get<ReservationResponse>(this.controller + reservationId);
  }

  // POST: Create a new reservation
  createReservation(reservation: ReservationRequest): Observable<ReservationResponse> {
    return this.http.post<ReservationResponse>(this.controller, reservation);
  }

  // PUT: Update entire reservation
  updateReservation(reservation: ReservationRequest): Observable<ReservationResponse> {
    return this.http.put<ReservationResponse>(this.controller, reservation);
  }

  // DELETE: Delete reservation
  deleteReservation(reservationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + reservationId);
  }
}


