import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AuthService } from '../../../services/auth.service';
import { ReservationListResponse, ReservationRequest, ReservationResponse } from '../models/reservation-model';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  
  private readonly controller = this.configService.config().apiUrl + 'reservation/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private router: Router,
    private authService: AuthService) {
  }

  // GET: Get reservation list (summary view)
  getReservationList(): Observable<ReservationListResponse[]> {
    // Temporary production diagnostic: identify unexpected caller paths (e.g., during logout).
    console.warn('[TRACE] reservation/list requested', {
      route: this.router.url,
      isLoggingOut: this.authService.isLoggingOut(),
      isLoggedIn: this.authService.getIsLoggedIn()
    });
    console.trace('[TRACE] reservation/list stack');
    return this.http.get<ReservationListResponse[]>(this.controller + 'list');
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


