import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { PropertyWelcomeRequest, PropertyWelcomeResponse } from '../models/property-welcome.model';


@Injectable({
    providedIn: 'root'
})
export class PropertyWelcomeService {
  
  private readonly controller = this.configService.config().apiUrl + 'propertywelcome/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get welcome letter by property ID
  getPropertyWelcomeByPropertyId(propertyId: string): Observable<PropertyWelcomeResponse> {
    return this.http.get<PropertyWelcomeResponse>(this.controller + propertyId);
  }

  // POST: Create a new welcome letter
  createPropertyWelcome(welcomeLetter: PropertyWelcomeRequest): Observable<PropertyWelcomeResponse> {
    return this.http.post<PropertyWelcomeResponse>(this.controller, welcomeLetter);
  }

  // PUT: Update welcome letter by property ID
  updatePropertyWelcome(welcomeLetter: PropertyWelcomeRequest): Observable<PropertyWelcomeResponse> {
    return this.http.put<PropertyWelcomeResponse>(this.controller , welcomeLetter);
  }

  // DELETE: Delete welcome letter by property ID
  deletePropertyWelcome(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + propertyId);
  }
}

