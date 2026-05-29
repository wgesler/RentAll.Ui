import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, switchMap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
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
import { PropertyInformationResponse } from '../../properties/models/property-information.model';
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
    private configService: ConfigService,
    private mappingService: MappingService
  ) {
    this.controller = this.configService.config().apiUrl + 'leads/';
    this.commonController = this.configService.config().apiUrl + 'common/';
    // Bypass interceptors for anonymous public owner-form calls.
    this.rawHttp = new HttpClient(httpBackend);
  }

  //#region Internal: GET
  getRentalLeads(): Observable<LeadRentalResponse[]> {
    return this.http.get<LeadRentalResponse[]>(this.controller + 'rentals');
  }

  getRentalLeadById(rentalId: number): Observable<LeadRentalResponse> {
    return this.http.get<LeadRentalResponse>(`${this.controller}rentals/${rentalId}`);
  }

  getOwnerLeads(): Observable<LeadOwnerResponse[]> {
    return this.http.get<LeadOwnerResponse[]>(this.controller + 'owners');
  }

  getOwnerLeadById(ownerId: number): Observable<LeadOwnerResponse> {
    return this.http.get<LeadOwnerResponse>(`${this.controller}owners/${ownerId}`);
  }

  getOwnerHtmlByPropertyId(propertyId: string): Observable<OwnerHtmlResponse> {
    return this.http.get<OwnerHtmlResponse>(`${this.controller}owners/html/${propertyId}`);
  }

  getOwnerInventoryInformationByOwnerId(ownerId: number): Observable<OwnerInventoryInformationResponse> {
    return this.http.get<OwnerInventoryInformationResponse>(`${this.controller}owners/inventory-information/${ownerId}`);
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

  getGeneralLeads(): Observable<LeadGeneralResponse[]> {
    return this.http.get<LeadGeneralResponse[]>(this.controller + 'general');
  }

  getGeneralLeadById(generalId: number): Observable<LeadGeneralResponse> {
    return this.http.get<LeadGeneralResponse>(`${this.controller}general/${generalId}`);
  }
  //#endregion

  //#region Internal: POST
  createRentalLead(body: LeadRentalRequest): Observable<LeadRentalResponse> {
    return this.http.post<LeadRentalResponse>(this.controller + 'rentals', body);
  }

  createOwnerLead(body: LeadOwnerRequest): Observable<LeadOwnerResponse> {
    return this.http.post<LeadOwnerResponse>(this.controller + 'owners', body);
  }

  createOwnerFormShareLink(ownerId: number): Observable<OwnerFormShareResponse> {
    return this.http.post<OwnerFormShareResponse>(`${this.controller}owners/${ownerId}/share-link`, {});
  }

  createOwnerAgreementInformation(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse> {
    return this.http.post<OwnerAgreementInformationResponse>(`${this.configService.config().apiUrl}leads/owners/agreement-information`, body);
  }

  createGeneralLead(body: LeadGeneralRequest): Observable<LeadGeneralResponse> {
    return this.http.post<LeadGeneralResponse>(this.controller + 'general', body);
  }
  //#endregion

  //#region Internal: PUT
  updateRentalLead(body: LeadRentalRequest): Observable<LeadRentalResponse> {
    return this.http.put<LeadRentalResponse>(this.controller + 'rentals', body);
  }

  updateOwnerLead(body: LeadOwnerUpdateRequest): Observable<LeadOwnerResponse> {
    return this.http.put<LeadOwnerResponse>(this.controller + 'owners', body);
  }

  // Inline-edit safe update: fetch the latest owner lead, map it to a full update
  // request, mutate only the caller's field via applyPatch, then save the whole body.
  patchOwnerLead(ownerId: number, applyPatch: (body: LeadOwnerUpdateRequest) => void): Observable<LeadOwnerResponse> {
    return this.getOwnerLeadById(ownerId).pipe(
      switchMap(owner => {
        const body = this.mappingService.mapLeadOwnerResponseToUpdateRequest(owner);
        applyPatch(body);
        return this.updateOwnerLead(body);
      })
    );
  }

  updateOwnerInventoryInformation(body: OwnerInventoryInformationRequest): Observable<OwnerInventoryInformationResponse> {
    return this.http.put<OwnerInventoryInformationResponse>(`${this.controller}owners/inventory-information`, body);
  }

  updateOwnerAgreementInformation(body: OwnerAgreementInformationRequest): Observable<OwnerAgreementInformationResponse> {
    return this.http.put<OwnerAgreementInformationResponse>(`${this.configService.config().apiUrl}leads/owners/agreement-information`, body);
  }

  updateGeneralLead(body: LeadGeneralUpdateRequest): Observable<LeadGeneralResponse> {
    return this.http.put<LeadGeneralResponse>(this.controller + 'general', body);
  }
  //#endregion

  //#region Internal: DELETE
  deleteRentalLead(rentalId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}rentals/${rentalId}`);
  }

  deleteOwnerLead(ownerId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}owners/${ownerId}`);
  }

  deleteGeneralLead(generalId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}general/${generalId}`);
  }
  //#endregion

  //#region External (Public Token): GET
  getPublicOwnerFormByToken(token: string): Observable<PublicOwnerFormResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<PublicOwnerFormResponse>(`${this.commonController}owner-form/${normalized}`);
  }

  getPublicOwnerFormStateFormsByToken(token: string, stateCode?: string | null, organizationId?: string | null): Observable<StateFormResponse[]> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    const normalizedStateCode = String(stateCode || '').trim().toUpperCase();
    const normalizedOrganizationId = String(organizationId || '').trim();
    const queryParams: string[] = [];
    if (normalizedOrganizationId) {
      queryParams.push(`organizationId=${encodeURIComponent(normalizedOrganizationId)}`);
    }
    const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    const endpoint = normalizedStateCode.length === 2
      ? `${this.commonController}owner-form/${normalized}/stateforms/${encodeURIComponent(normalizedStateCode)}${query}`
      : `${this.commonController}owner-form/${normalized}/stateforms${query}`;
    return this.rawHttp.get<StateFormResponse[]>(endpoint);
  }

  getPublicOwnerLeadByToken(token: string): Observable<LeadOwnerResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<LeadOwnerResponse>(`${this.commonController}owner-form/${normalized}/lead-owner`);
  }

  getPublicOwnerOrganizationByToken(token: string): Observable<OrganizationResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OrganizationResponse>(`${this.commonController}owner-form/${normalized}/organization`);
  }

  getPublicOwnerOfficeByToken(token: string): Observable<OfficeResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OfficeResponse>(`${this.commonController}owner-form/${normalized}/office`);
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

  getPublicOwnerPropertyInformationByToken(token: string): Observable<PropertyInformationResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<PropertyInformationResponse>(`${this.commonController}owner-form/${normalized}/property-information`);
  }

  getPublicOwnerAgreementInformationByToken(token: string): Observable<OwnerAgreementInformationResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OwnerAgreementInformationResponse>(`${this.commonController}owner-form/${normalized}/agreement-information`);
  }

  getPublicOwnerTemplatesByToken(token: string): Observable<OwnerHtmlResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<OwnerHtmlResponse>(`${this.commonController}owner-form/${normalized}/templates`);
  }

  getPublicOwnerContactByToken(token: string): Observable<ContactResponse | null> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.get<ContactResponse>(`${this.commonController}owner-form/${normalized}/contact`);
  }
  //#endregion

  //#region External (Public Token): POST
  generatePublicOwnerDocumentDownloadByToken(token: string, body: { htmlContent: string; fileName?: string | null }): Observable<Blob> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.post(`${this.commonController}owner-form/${normalized}/generate-download`, body, { responseType: 'blob' });
  }
  //#endregion

  //#region External (Public Token): PUT
  submitPublicOwnerFormByToken(token: string, body: PublicOwnerFormSubmitRequest): Observable<PublicOwnerFormResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.put<PublicOwnerFormResponse>(`${this.commonController}owner-form/${normalized}`, body);
  }

  upsertPublicOwnerContactByToken(token: string, body: PublicOwnerContactUpsertRequest): Observable<ContactResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.put<ContactResponse>(`${this.commonController}owner-form/${normalized}/contact`, body || {});
  }

  upsertPublicOwnerPropertyByToken(token: string, body: PropertyRequest): Observable<PropertyResponse> {
    const normalized = this.normalizeOwnerFormShareToken(token);
    return this.rawHttp.put<PropertyResponse>(`${this.commonController}owner-form/${normalized}/property`, body || ({} as PropertyRequest));
  }
  //#endregion

  //#region External (Public Token): Helpers
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
  //#endregion

  //#region Helpers
  notifyLeadStateChanged(): void {
    this.leadStateChangedSubject.next();
  }

  normalizeOwnerFormShareToken(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/\u00AD/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  }
  //#endregion
}
