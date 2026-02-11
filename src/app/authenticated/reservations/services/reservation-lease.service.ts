import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { ReservationLeaseRequest, ReservationLeaseResponse } from '../models/lease.model';

@Injectable({
    providedIn: 'root'
})
export class ReservationLeaseService {
  
  private readonly controller = this.configService.config().apiUrl + 'reservationlease/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get lease by reservation ID
  getLeaseByReservationId(reservationId: string): Observable<ReservationLeaseResponse> {
    return this.http.get<ReservationLeaseResponse>(this.controller + reservationId);
  }

  // POST: Create a new lease
  createLease(lease: ReservationLeaseRequest): Observable<ReservationLeaseResponse> {
    return this.http.post<ReservationLeaseResponse>(this.controller, lease);
  }

  // PUT: Update lease
  updateLease(lease: ReservationLeaseRequest): Observable<ReservationLeaseResponse> {
    return this.http.put<ReservationLeaseResponse>(this.controller, lease);
  }

  // DELETE: Delete lease
  deleteLease(reservationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + reservationId);
  }
}






