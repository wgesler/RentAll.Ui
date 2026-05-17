import { HttpBackend, HttpClient } from '@angular/common/http';
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
import {
  OwnerFormShareResponse,
  PublicOwnerFormResponse,
  PublicOwnerFormSubmitRequest
} from '../models/owner-form-share.model';
import {
  OwnerInventoryInformationRequest,
  OwnerInventoryInformationResponse
} from '../models/owner-inventory-information.model';

@Injectable({
  providedIn: 'root'
})
export class LeadsService {
  readonly controller: string;
  readonly commonController: string;
  private readonly rawHttp: HttpClient;
  private readonly leadStateChangedSubject = new Subject<void>();
  leadStateChanged$ = this.leadStateChangedSubject.asObservable();

  constructor(
    private http: HttpClient,
    httpBackend: HttpBackend,
    private configService: ConfigService
  ) {
    this.controller = this.configService.config().apiUrl + 'leads/';
    this.commonController = this.configService.config().apiUrl + 'common/';
    // Bypass interceptors for anonymous public owner-form calls.
    this.rawHttp = new HttpClient(httpBackend);
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

  createOwnerFormShareLink(ownerId: number): Observable<OwnerFormShareResponse> {
    return this.http.post<OwnerFormShareResponse>(`${this.controller}owners/${ownerId}/share-link`, {});
  }

  getPublicOwnerFormByToken(token: string): Observable<PublicOwnerFormResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<PublicOwnerFormResponse>(`${this.commonController}owner-form/${normalized}`);
  }

  submitPublicOwnerFormByToken(token: string, body: PublicOwnerFormSubmitRequest): Observable<PublicOwnerFormResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.put<PublicOwnerFormResponse>(`${this.commonController}owner-form/${normalized}`, body);
  }

  getOwnerInventoryInformationByOwnerId(ownerId: number): Observable<OwnerInventoryInformationResponse> {
    return this.http.get<OwnerInventoryInformationResponse>(`${this.controller}owners/inventory-information/${ownerId}`);
  }

  updateOwnerInventoryInformation(body: OwnerInventoryInformationRequest): Observable<OwnerInventoryInformationResponse> {
    return this.http.put<OwnerInventoryInformationResponse>(`${this.controller}owners/inventory-information`, body);
  }

  getPublicOwnerFormUrl(token: string): string {
    const normalized = this.normalizeOwnerFormShareToken(String(token ?? ''));
    if (!normalized) {
      return '';
    }
    const configured = String(this.configService.config().publicListingUiOrigin ?? '').trim().replace(/\/$/, '');
    const windowOrigin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin.replace(/\/$/, '') : '';
    const origin = configured.length > 0 ? configured : windowOrigin;
    if (!origin) {
      return '';
    }
    return `${origin}/owners/${normalized}`;
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

  normalizeOwnerFormShareToken(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/\u00AD/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  }
}
