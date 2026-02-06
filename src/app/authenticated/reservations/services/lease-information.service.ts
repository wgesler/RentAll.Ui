import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { LeaseInformationRequest, LeaseInformationResponse } from '../models/lease-information.model';

@Injectable({
    providedIn: 'root'
})
export class LeaseInformationService {
  
  private readonly controller = this.configService.config().apiUrl + 'leaseinformation/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get lease information by ID
  getLeaseInformationByGuid(leaseInformationId: string): Observable<LeaseInformationResponse> {
    return this.http.get<LeaseInformationResponse>(this.controller + leaseInformationId);
  }

  // GET: Get lease information by property ID
  getLeaseInformationByPropertyId(propertyId: string): Observable<LeaseInformationResponse> {
    return this.http.get<LeaseInformationResponse>(this.controller + 'property/' + propertyId);
  }

  // GET: Get lease information by contact ID
  getLeaseInformationByContactId(contactId: string): Observable<LeaseInformationResponse> {
    return this.http.get<LeaseInformationResponse>(this.controller + 'contact/' + contactId);
  }

  // POST: Create a new lease information
  createLeaseInformation(leaseInformation: LeaseInformationRequest): Observable<LeaseInformationResponse> {
    return this.http.post<LeaseInformationResponse>(this.controller, leaseInformation);
  }

  // PUT: Update lease information
  updateLeaseInformation(leaseInformation: LeaseInformationRequest): Observable<LeaseInformationResponse> {
    return this.http.put<LeaseInformationResponse>(this.controller, leaseInformation);
  }

  // DELETE: Delete lease information
  deleteLeaseInformation(leaseInformationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + leaseInformationId);
  }
}

