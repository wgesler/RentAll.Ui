import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, catchError, firstValueFrom, of, switchMap, take, tap } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
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
import { SecurityDepositService } from '../../accounting/services/security-deposit.service';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private authService = inject(AuthService);
  private mixedMappingService = inject(MixedMappingService);
  private securityDepositService = inject(SecurityDepositService);

  
  private readonly controller = this.configService.config().apiUrl + 'reservation/';
  private readonly reservationSavedSubject = new Subject<{ reservationId: string }>();
  reservationSaved$ = this.reservationSavedSubject.asObservable();
  private allReservationCodes$ = new BehaviorSubject<ReservationCodeResponse[]>([]);
  private reservationCodesLoaded$ = new BehaviorSubject<boolean>(false);
  private loadedOrganizationId: string | null = null;

  getOrganizationId(): string {
    return this.authService.getUser()?.organizationId?.trim() ?? '';
  }

  // GET: Get reservation list (summary view)
  getReservationList(): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'list');
  }

  getReservationActiveList(): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'active-list');
  }

  getReservationsByOwner(ownerId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'owner/' + ownerId);
  }

  getReservationCodes(): Observable<ReservationCodeResponse[]> {
    return this.http.get<ReservationCodeResponse[]>(this.controller + 'codes');
  }

  loadAllReservationCodes(): Observable<ReservationCodeResponse[]> {
    const id = this.getOrganizationId();
    if (!id) {
      this.clearReservationCodes();
      return of([]);
    }
    return this.getReservationCodes().pipe(
      tap((codes) => {
        this.allReservationCodes$.next(codes || []);
        this.reservationCodesLoaded$.next(true);
        this.loadedOrganizationId = id;
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Reservation Service - Error loading reservation codes:', err);
        this.allReservationCodes$.next([]);
        this.reservationCodesLoaded$.next(true);
        this.loadedOrganizationId = id;
        return of([]);
      })
    );
  }

  ensureReservationCodesLoaded(): Observable<ReservationCodeResponse[]> {
    const id = this.getOrganizationId();
    if (!id) {
      this.clearReservationCodes();
      return of([]);
    }
    if (this.reservationCodesLoaded$.value && this.loadedOrganizationId === id) {
      return this.getAllReservationCodes().pipe(take(1));
    }
    return this.loadAllReservationCodes().pipe(take(1), switchMap(() => this.getAllReservationCodes().pipe(take(1))));
  }

  refreshReservationCodes(): Observable<ReservationCodeResponse[]> {
    this.reservationCodesLoaded$.next(false);
    this.loadedOrganizationId = null;
    return this.loadAllReservationCodes().pipe(take(1), switchMap(() => this.getAllReservationCodes().pipe(take(1))));
  }

  /** Reload the global reservation codes cache and push to all getAllReservationCodes() subscribers. */
  notifyReservationCodesChanged(): void {
    this.refreshCachedReservationCodesAfterMutation();
  }

  refreshCachedReservationCodesAfterMutation(): void {
    const id = this.getOrganizationId() || this.loadedOrganizationId?.trim();
    if (!id) {
      return;
    }
    this.refreshReservationCodes().pipe(take(1)).subscribe();
  }

  areReservationCodesLoaded(): Observable<boolean> {
    return this.reservationCodesLoaded$.asObservable();
  }

  clearReservationCodes(): void {
    this.allReservationCodes$.next([]);
    this.reservationCodesLoaded$.next(false);
    this.loadedOrganizationId = null;
  }

  getAllReservationCodes(): Observable<ReservationCodeResponse[]> {
    return this.allReservationCodes$.asObservable();
  }

  getAllReservationCodesValue(): ReservationCodeResponse[] {
    return this.allReservationCodes$.value;
  }

  // GET: ReservationList summary rows for a property (dropdowns, overlap checks, board context)
  getReservationsByPropertyId(propertyId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'property/' + propertyId);
  }

  getActiveReservationsByPropertyId(propertyId: string): Observable<ReservationListResponse[]> {
    return this.http.get<ReservationListResponse[]>(this.controller + 'property/' + propertyId + '/active');
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

  // Loads the reservation by id, maps every field to ReservationRequest, merges overrides, then PUTs.
  // Use this for inline/partial updates (list toggles, maintenance provider fields, etc.) so nothing is lost.
  async updateModifiedReservation(
    reservationId: string,
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
    this.securityDepositService.refreshSecurityDepositsOutstanding();
    this.notifyReservationCodesChanged();
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


