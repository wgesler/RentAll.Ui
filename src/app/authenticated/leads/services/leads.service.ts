import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import {
  LeadRentalCreateRequest,
  LeadRentalResponse,
  LeadRentalUpdateRequest
} from '../models/lead-rental.model';
import {
  LeadOwnerCreateRequest,
  LeadOwnerResponse,
  LeadOwnerUpdateRequest
} from '../models/lead-owner.model';

@Injectable({
  providedIn: 'root'
})
export class LeadsService {
  readonly controller: string;

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {
    this.controller = this.configService.config().apiUrl + 'leads/';
  }

  getRentalLeads(): Observable<LeadRentalResponse[]> {
    return this.http.get<LeadRentalResponse[]>(this.controller + 'rentals');
  }

  getRentalLeadById(rentalId: number): Observable<LeadRentalResponse> {
    return this.http.get<LeadRentalResponse>(`${this.controller}rentals/${rentalId}`);
  }

  createRentalLead(body: LeadRentalCreateRequest): Observable<LeadRentalResponse> {
    return this.http.post<LeadRentalResponse>(this.controller + 'rentals', body);
  }

  updateRentalLead(body: LeadRentalUpdateRequest): Observable<LeadRentalResponse> {
    return this.http.put<LeadRentalResponse>(this.controller + 'rentals', body);
  }

  deleteRentalLead(rentalId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}rentals/${rentalId}`);
  }

  getOwnerLeads(): Observable<LeadOwnerResponse[]> {
    return this.http.get<LeadOwnerResponse[]>(this.controller + 'owners');
  }

  getOwnerLeadById(ownerId: number): Observable<LeadOwnerResponse> {
    return this.http.get<LeadOwnerResponse>(`${this.controller}owners/${ownerId}`);
  }

  createOwnerLead(body: LeadOwnerCreateRequest): Observable<LeadOwnerResponse> {
    return this.http.post<LeadOwnerResponse>(this.controller + 'owners', body);
  }

  updateOwnerLead(body: LeadOwnerUpdateRequest): Observable<LeadOwnerResponse> {
    return this.http.put<LeadOwnerResponse>(this.controller + 'owners', body);
  }

  deleteOwnerLead(ownerId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}owners/${ownerId}`);
  }
}
