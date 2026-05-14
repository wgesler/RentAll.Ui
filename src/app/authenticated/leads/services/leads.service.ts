import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import {
  LeadRentalRequest,
  LeadRentalResponse
} from '../models/lead-rental.model';
import {
  LeadOwnerRequest,
  LeadOwnerResponse,
  LeadOwnerUpdateRequest
} from '../models/lead-owner.model';
import {
  LeadGeneralRequest,
  LeadGeneralResponse,
  LeadGeneralUpdateRequest
} from '../models/lead-general.model';

@Injectable({
  providedIn: 'root'
})
export class LeadsService {
  readonly controller: string;
  private readonly leadStateChangedSubject = new Subject<void>();
  leadStateChanged$ = this.leadStateChangedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {
    this.controller = this.configService.config().apiUrl + 'leads/';
  }

  getRentalLeads(): Observable<LeadRentalResponse[]> {
    return this.http.get<LeadRentalResponse[]>(this.controller + 'rentals').pipe(
      map(rows => (rows || []).map(row => this.sanitizeRentalLeadResponse(row)))
    );
  }

  getRentalLeadById(rentalId: number): Observable<LeadRentalResponse> {
    return this.http.get<LeadRentalResponse>(`${this.controller}rentals/${rentalId}`).pipe(
      map(row => this.sanitizeRentalLeadResponse(row))
    );
  }

  createRentalLead(body: LeadRentalRequest): Observable<LeadRentalResponse> {
    return this.http.post<LeadRentalResponse>(this.controller + 'rentals', body);
  }

  updateRentalLead(body: LeadRentalRequest): Observable<LeadRentalResponse> {
    return this.http.put<LeadRentalResponse>(this.controller + 'rentals', body);
  }

  deleteRentalLead(rentalId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}rentals/${rentalId}`);
  }

  getOwnerLeads(): Observable<LeadOwnerResponse[]> {
    return this.http.get<LeadOwnerResponse[]>(this.controller + 'owners').pipe(
      map(rows => (rows || []).map(row => this.sanitizeOwnerLeadResponse(row)))
    );
  }

  getOwnerLeadById(ownerId: number): Observable<LeadOwnerResponse> {
    return this.http.get<LeadOwnerResponse>(`${this.controller}owners/${ownerId}`).pipe(
      map(row => this.sanitizeOwnerLeadResponse(row))
    );
  }

  createOwnerLead(body: LeadOwnerRequest): Observable<LeadOwnerResponse> {
    return this.http.post<LeadOwnerResponse>(this.controller + 'owners', body);
  }

  updateOwnerLead(body: LeadOwnerUpdateRequest): Observable<LeadOwnerResponse> {
    return this.http.put<LeadOwnerResponse>(this.controller + 'owners', body);
  }

  deleteOwnerLead(ownerId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}owners/${ownerId}`);
  }

  getGeneralLeads(): Observable<LeadGeneralResponse[]> {
    return this.http.get<LeadGeneralResponse[]>(this.controller + 'general').pipe(
      map(rows => (rows || []).map(row => this.sanitizeGeneralLeadResponse(row)))
    );
  }

  getGeneralLeadById(generalId: number): Observable<LeadGeneralResponse> {
    return this.http.get<LeadGeneralResponse>(`${this.controller}general/${generalId}`).pipe(
      map(row => this.sanitizeGeneralLeadResponse(row))
    );
  }

  createGeneralLead(body: LeadGeneralRequest): Observable<LeadGeneralResponse> {
    return this.http.post<LeadGeneralResponse>(this.controller + 'general', body);
  }

  updateGeneralLead(body: LeadGeneralUpdateRequest): Observable<LeadGeneralResponse> {
    return this.http.put<LeadGeneralResponse>(this.controller + 'general', body);
  }

  deleteGeneralLead(generalId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}general/${generalId}`);
  }

  notifyLeadStateChanged(): void {
    this.leadStateChangedSubject.next();
  }

  sanitizePhoneToDigits(phone: string | null | undefined): string | null {
    const raw = String(phone ?? '').trim();
    if (!raw) {
      return null;
    }
    const digits = raw.replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }

  sanitizeRentalLeadResponse(row: LeadRentalResponse): LeadRentalResponse {
    return {
      ...row,
      phone: this.sanitizePhoneToDigits(row?.phone),
      quotePath: String(row?.quotePath ?? '').trim() || null
    };
  }

  sanitizeOwnerLeadResponse(row: LeadOwnerResponse): LeadOwnerResponse {
    return {
      ...row,
      phone: this.sanitizePhoneToDigits(row?.phone)
    };
  }

  sanitizeGeneralLeadResponse(row: LeadGeneralResponse): LeadGeneralResponse {
    return {
      ...row,
      phone: this.sanitizePhoneToDigits(row?.phone)
    };
  }
}
