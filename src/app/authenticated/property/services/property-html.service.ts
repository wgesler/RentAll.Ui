import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { PropertyHtmlRequest, PropertyHtmlResponse } from '../models/property-html.model';



@Injectable({
    providedIn: 'root'
})
export class PropertyHtmlService {
  
  private readonly controller = this.configService.config().apiUrl + 'propertyhtml/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get Html letter by property ID
  getPropertyHtmlByPropertyId(propertyId: string): Observable<PropertyHtmlResponse> {
    return this.http.get<PropertyHtmlResponse>(this.controller + propertyId);
  }

  // PUT: Update property html by property ID
  upsertPropertyHtml(request: PropertyHtmlRequest): Observable<PropertyHtmlResponse> {
    return this.http.put<PropertyHtmlResponse>(this.controller , request);
  }

  // DELETE: Delete property html by property ID
  deletePropertyHtml(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + propertyId);
  }
}

