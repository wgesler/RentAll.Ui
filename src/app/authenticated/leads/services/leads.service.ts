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
  PublicOwnerContactUpsertRequest,
  PublicOwnerFormResponse,
  PublicOwnerFormSubmitRequest
} from '../models/owner-form-share.model';
import { ContactResponse } from '../../contacts/models/contact.model';
import { StateFormResponse } from '../../organizations/models/state-form.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { PropertyRequest, PropertyResponse } from '../../properties/models/property.model';
import { PropertyAgreementResponse } from '../../properties/models/property-agreement.model';
import {
  OwnerInventoryInformationRequest,
  OwnerInventoryInformationResponse
} from '../models/owner-inventory-information.model';
import {
  OwnerAgreementInformationRequest,
  OwnerAgreementInformationResponse
} from '../../owners/models/owner-agreement-information.model';
import { OwnerHtmlResponse } from '../../owners/models/owner-html.model';

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

  getPublicOwnerFormStateFormsByToken(token: string): Observable<StateFormResponse[]> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<StateFormResponse[]>(`${this.commonController}owner-form/${normalized}/stateforms`);
  }

  getPublicOwnerLeadByToken(token: string): Observable<LeadOwnerResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<LeadOwnerResponse>(`${this.commonController}owner-form/${normalized}/lead-owner`).pipe(
      map(row => this.sanitizeOwnerLeadResponse(row))
    );
  }

  getPublicOwnerOrganizationByToken(token: string): Observable<OrganizationResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OrganizationResponse>(`${this.commonController}owner-form/${normalized}/organization`);
  }

  getPublicOwnerOfficeByToken(token: string): Observable<OfficeResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OfficeResponse>(`${this.commonController}owner-form/${normalized}/office`);
  }

  getPublicOwnerOfficesByToken(token: string): Observable<OfficeResponse[]> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OfficeResponse[]>(`${this.commonController}owner-form/${normalized}/offices`);
  }

  getPublicOwnerAccountingOfficeByToken(token: string): Observable<AccountingOfficeResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<AccountingOfficeResponse>(`${this.commonController}owner-form/${normalized}/accounting-office`);
  }

  getPublicOwnerPropertyByToken(token: string): Observable<PropertyResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<PropertyResponse>(`${this.commonController}owner-form/${normalized}/property`);
  }

  getPublicOwnerPropertyAgreementByToken(token: string): Observable<PropertyAgreementResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<PropertyAgreementResponse>(`${this.commonController}owner-form/${normalized}/property-agreement`);
  }

  getPublicOwnerAgreementInformationByToken(token: string): Observable<OwnerAgreementInformationResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OwnerAgreementInformationResponse>(`${this.commonController}owner-form/${normalized}/agreement-information`);
  }

  getPublicOwnerTemplatesByToken(token: string): Observable<OwnerHtmlResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    const requestUrl = `${this.commonController}owner-form/${normalized}/templates`;
    return this.rawHttp.get<OwnerHtmlResponse>(requestUrl);
  }

  getOwnerHtmlByPropertyId(propertyId: string): Observable<OwnerHtmlResponse> {
    const requestUrl = `${this.controller}owners/html/${propertyId}`;
    return this.http.get<OwnerHtmlResponse>(requestUrl);
  }

  getOwnerInventoryInformationByOwnerId(ownerId: number): Observable<OwnerInventoryInformationResponse> {
    return this.http.get<OwnerInventoryInformationResponse>(`${this.controller}owners/inventory-information/${ownerId}`);
  }

  updateOwnerInventoryInformation(body: OwnerInventoryInformationRequest): Observable<OwnerInventoryInformationResponse> {
    return this.http.put<OwnerInventoryInformationResponse>(`${this.controller}owners/inventory-information`, body);
  }

  getAgreementInformation(officeId: number | null = null, propertyId: string | null = null): Observable<OwnerAgreementInformationResponse> {
    return this.getOwnerAgreementInformationByScope(officeId, propertyId);
  }

  getOwnerAgreementInformationByScope(officeId: number | null = null, propertyId: string | null = null): Observable<OwnerAgreementInformationResponse> {
    const queryParams: string[] = [];
    if (officeId != null) {
      queryParams.push(`officeId=${officeId}`);
    }
    if (propertyId) {
      queryParams.push(`propertyId=${propertyId}`);
    }
    const queryString = queryParams.length ? `?${queryParams.join('&')}` : '';
    return this.http.get<OwnerAgreementInformationResponse>(`${this.configService.config().apiUrl}leads/owners/agreement-information/scope${queryString}`);
  }

  createOwnerAgreementInformation(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse> {
    return this.http.post<OwnerAgreementInformationResponse>(`${this.configService.config().apiUrl}leads/owners/agreement-information`, body);
  }

  updateOwnerAgreementInformation(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse> {
    return this.http.put<OwnerAgreementInformationResponse>(`${this.configService.config().apiUrl}leads/owners/agreement-information`, body);
  }

  getPublicOwnerContactByToken(token: string): Observable<ContactResponse | null> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<ContactResponse>(`${this.commonController}owner-form/${normalized}/contact`);
  }

  getPublicOwnerContactsByToken(token: string): Observable<ContactResponse[]> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<ContactResponse[]>(`${this.commonController}owner-form/${normalized}/contacts`);
  }

  upsertPublicOwnerContactByToken(token: string, body: PublicOwnerContactUpsertRequest): Observable<ContactResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.put<ContactResponse>(`${this.commonController}owner-form/${normalized}/contact`, body || {});
  }

  upsertPublicOwnerPropertyByToken(token: string, body: PropertyRequest): Observable<PropertyResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.put<PropertyResponse>(`${this.commonController}owner-form/${normalized}/property`, body || ({} as PropertyRequest));
  }

  getPublicOwnerFormUrl(
    token: string,
    context?: { officeId?: number | null; propertyCode?: string | null; propertyOffice?: string | null }
  ): string {
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
    const queryParts: string[] = [];
    const officeId = Number(context?.officeId);
    if (Number.isFinite(officeId) && officeId > 0) {
      queryParts.push(`officeId=${officeId}`);
    }
    const propertyCode = String(context?.propertyCode || '').trim();
    if (propertyCode) {
      queryParts.push(`propertyCode=${encodeURIComponent(propertyCode)}`);
    }
    const propertyOffice = String(context?.propertyOffice || '').trim();
    if (propertyOffice) {
      queryParts.push(`propertyOffice=${encodeURIComponent(propertyOffice)}`);
    }
    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return `${origin}/owners/${normalized}${query}`;
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
      officeId: Number(row.officeId),
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
