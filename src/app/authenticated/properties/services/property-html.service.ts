import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyHtmlResponse } from '../models/property-html.model';



@Injectable({
    providedIn: 'root'
})
export class PropertyHtmlService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  
  private readonly controller = this.configService.config().apiUrl + 'property/property-html/';

  // GET: Get Html letter by property ID
  getPropertyHtmlByPropertyId(propertyId: string): Observable<PropertyHtmlResponse> {
    return this.http.get<PropertyHtmlResponse>(this.controller + propertyId);
  }
}

