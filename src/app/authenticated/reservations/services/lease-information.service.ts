import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { LeaseInformationRequest, LeaseInformationResponse } from '../models/lease-information.model';

@Injectable({
    providedIn: 'root'
})
export class LeaseInformationService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  
  private readonly controller = this.configService.config().apiUrl + 'reservation/lease-information/';

  // GET: Get lease information by scope with fallback
  getLeaseInformationByScope(officeId: number | null = null, propertyId: string | null = null): Observable<LeaseInformationResponse> {
    const query: string[] = [];
    if (officeId !== null && officeId !== undefined) {
      query.push(`officeId=${officeId}`);
    }
    if (propertyId) {
      query.push(`propertyId=${encodeURIComponent(propertyId)}`);
    }
    const queryString = query.length > 0 ? `?${query.join('&')}` : '';
    return this.http.get<LeaseInformationResponse>(this.controller + 'scope' + queryString);
  }

  // POST: Create a new lease information
  createLeaseInformation(leaseInformation: LeaseInformationRequest): Observable<LeaseInformationResponse> {
    return this.http.post<LeaseInformationResponse>(this.controller, leaseInformation);
  }

  // PUT: Update lease information
  updateLeaseInformation(leaseInformation: LeaseInformationRequest): Observable<LeaseInformationResponse> {
    return this.http.put<LeaseInformationResponse>(this.controller, leaseInformation);
  }
}

