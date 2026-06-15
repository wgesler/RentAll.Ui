import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyListingShareResponse, PublicPropertyListingResponse } from '../models/property-listing-share.model';

@Injectable({
  providedIn: 'root'
})
export class PropertyListingShareService {
  private readonly propertyController = this.configService.config().apiUrl + 'property/';
  private readonly commonController = this.configService.config().apiUrl + 'common/';
  private readonly rawHttp: HttpClient;

  constructor(
    private http: HttpClient,
    httpBackend: HttpBackend,
    private configService: ConfigService
  ) {
    // Bypass interceptors for anonymous public listing calls.
    this.rawHttp = new HttpClient(httpBackend);
  }

  createPropertyShareLink(propertyId: string): Observable<PropertyListingShareResponse> {
    return this.http.post<PropertyListingShareResponse>(this.propertyController + propertyId + '/share-link', {});
  }

  /**
   * Public listing URL (anonymous route `listing/:token`).
   * Uses same token normalization as lookup so href matches API hashing after PDF/viewer quirks.
   */
  getPublicListingUrl(token: string): string {
    const normalized = this.normalizeListingShareToken(String(token ?? ''));
    if (!normalized) {
      return '';
    }
    const configured = String(this.configService.config().propertyListingUiOrigin ?? '').trim().replace(/\/$/, '');
    const windowOrigin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin.replace(/\/$/, '') : '';
    const origin = configured.length > 0 ? configured : windowOrigin;
    // Relative `/listing/...` breaks emailed PDFs and external recipients; require a real origin.
    if (!origin) {
      return '';
    }
    return `${origin}/listing/${normalized}`;
  }

  getPublicPropertyListingByToken(token: string): Observable<PublicPropertyListingResponse> {
    const normalized = this.normalizeListingShareToken(token);
    return this.rawHttp.get<PublicPropertyListingResponse>(this.commonController + 'property-listing/' + normalized);
  }

  /** Matches API — strip PDF hyphenation/zero-width characters before URL segment / lookup. */
  private normalizeListingShareToken(raw: string): string {
    return String(raw ?? '')
      .trim()
      .replace(/\u00AD/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  }
}
