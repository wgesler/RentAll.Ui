import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import {
  ReservationCodeResponse,
  ReservationListResponse,
  ReservationRequest,
  ReservationResponse,
  ReservationTrackerResponse,
  ReservationTrackerResponseOption,
  ReservationTrackerResponseOptionRequest,
  ReservationTrackerResponseRequest
} from '../models/reservation-model';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  
  private readonly controller = this.configService.config().apiUrl + 'reservation/';
  private readonly reservationSavedSubject = new Subject<{ reservationId: string }>();
  reservationSaved$ = this.reservationSavedSubject.asObservable();

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

  getReservationCodes(): Observable<ReservationCodeResponse[]> {
    return this.http.get<ReservationCodeResponse[]>(this.controller + 'codes');
  }


  // GET: Get reservations list for a particular property
  getReservationsByPropertyId(propertyId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'property/' + propertyId);
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

  notifyReservationSaved(reservationId: string): void {
    const normalizedReservationId = String(reservationId || '').trim();
    if (!normalizedReservationId) {
      return;
    }
    this.reservationSavedSubject.next({ reservationId: normalizedReservationId });
  }

  getReservationTrackerResponses(reservationId: string): Observable<ReservationTrackerResponse[]> {
    return this.http.get<ReservationTrackerResponse[]>(this.controller + 'tracker-response/reservation/' + reservationId);
  }

  getReservationTrackerResponseOptions(reservationId: string): Observable<ReservationTrackerResponseOption[]> {
    return this.http.get<ReservationTrackerResponseOption[]>(this.controller + 'tracker-response-option/reservation/' + reservationId);
  }

  createReservationTrackerResponse(request: ReservationTrackerResponseRequest): Observable<ReservationTrackerResponse> {
    return this.http.post<ReservationTrackerResponse>(this.controller + 'tracker-response', request);
  }

  updateReservationTrackerResponse(request: ReservationTrackerResponseRequest): Observable<ReservationTrackerResponse> {
    return this.http.put<ReservationTrackerResponse>(this.controller + 'tracker-response', request);
  }

  deleteReservationTrackerResponse(trackerResponseId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-response/' + trackerResponseId);
  }

  createReservationTrackerResponseOption(request: ReservationTrackerResponseOptionRequest): Observable<ReservationTrackerResponseOption> {
    return this.http.post<ReservationTrackerResponseOption>(this.controller + 'tracker-response-option', request);
  }

  deleteReservationTrackerResponseOption(trackerResponseId: string, trackerDefinitionOptionId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-response-option/' + trackerResponseId + '/' + trackerDefinitionOptionId);
  }
}


