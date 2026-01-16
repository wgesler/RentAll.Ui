import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { ReservationRequest, ReservationResponse, ReservationListResponse } from '../models/reservation-model';

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
  getReservationList(): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'list');
  }

  // GET: Get all reservations (full detail)
  getReservations(): Observable<ReservationResponse[]> {
    return this.http.get<ReservationResponse[]>(this.controller);
  }

  // GET: Get all reservations for a particular property
  getReservationsByPropertyId(propertyId: string): Observable<ReservationResponse[]> {
    return this.http.get<ReservationResponse[]>(this.controller + 'property/' + propertyId);
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
  updateReservation(reservationId: string, reservation: ReservationRequest): Observable<ReservationResponse> {
    return this.http.put<ReservationResponse>(this.controller + reservationId, reservation);
  }

  // DELETE: Delete reservation
  deleteReservation(reservationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + reservationId);
  }
}


