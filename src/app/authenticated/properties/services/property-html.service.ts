import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyHtmlResponse } from '../models/property-html.model';



@Injectable({
    providedIn: 'root'
})
export class PropertyHtmlService {
  
  private readonly controller = this.configService.config().apiUrl + 'property/property-html/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get Html letter by property ID
  getPropertyHtmlByPropertyId(propertyId: string): Observable<PropertyHtmlResponse> {
    return this.http.get<PropertyHtmlResponse>(this.controller + propertyId);
  }
}

