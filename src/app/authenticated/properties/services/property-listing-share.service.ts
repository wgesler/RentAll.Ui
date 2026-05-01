import { HttpClient } from '@angular/common/http';
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

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  createPropertyShareLink(propertyId: string): Observable<PropertyListingShareResponse> {
    return this.http.post<PropertyListingShareResponse>(this.propertyController + propertyId + '/share-link', {});
  }

  revokePropertyShareLink(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.propertyController + propertyId + '/share-link');
  }

  getPublicPropertyListingByToken(token: string): Observable<PublicPropertyListingResponse> {
    return this.http.get<PublicPropertyListingResponse>(this.commonController + 'property-listing/' + token);
  }
}
