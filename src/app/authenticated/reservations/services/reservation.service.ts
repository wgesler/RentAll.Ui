import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { ReservationListResponse, ReservationRequest, ReservationResponse } from '../models/reservation-model';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  
  private readonly controller = this.configService.config().apiUrl + 'reservation/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private mixedMappingService: MixedMappingService
  ) {
  }

  // GET: Get reservation list (summary view)
  getReservationList(): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'list');
  }

  getActiveReservationList(): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'active-list');
  }


  // GET: Get reservations list for a particular property
  getReservationsByPropertyId(propertyId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'property/' + propertyId);
  }

  getActiveReservationsByPropertyId(propertyId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'property/' + propertyId + '/active');
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

  // Loads the reservation by id, maps it to a full ReservationRequest, merges overrides, then PUTs.
  async updateModifiedReservation( reservationId: string,
    overrides: Partial<ReservationRequest> | ((reservation: ReservationResponse) => Partial<ReservationRequest>)
  ): Promise<ReservationResponse> {
    const reservation = await firstValueFrom(this.getReservationByGuid(reservationId));
    const patch = typeof overrides === 'function' ? overrides(reservation) : overrides;
    const request = this.mixedMappingService.mapReservationResponseToRequest(reservation, patch);
    return firstValueFrom(this.updateReservation(request));
  }

  // DELETE: Delete reservation
  deleteReservation(reservationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + reservationId);
  }
}


