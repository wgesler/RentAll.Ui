import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyInformationRequest, PropertyInformationResponse } from '../models/property-information.model';

@Injectable({
    providedIn: 'root'
})
export class PropertyInformationService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'property/property-information/';

  getPropertyInformationByGuid(propertyId: string): Observable<PropertyInformationResponse> {
    return this.http.get<PropertyInformationResponse>(this.controller + propertyId);
  }

  createPropertyInformation(propertyInformation: PropertyInformationRequest): Observable<PropertyInformationResponse> {
   return this.http.post<PropertyInformationResponse>(this.controller, propertyInformation);
  }

  updatePropertyInformation(propertyInformation: PropertyInformationRequest): Observable<PropertyInformationResponse> {
    return this.http.put<PropertyInformationResponse>(this.controller, propertyInformation);
  }
}
