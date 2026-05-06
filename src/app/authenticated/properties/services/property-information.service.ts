import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyInformationRequest, PropertyInformationResponse } from '../models/property-information.model';

@Injectable({
    providedIn: 'root'
})
export class PropertyInformationService {
  private readonly controller = this.configService.config().apiUrl + 'property/property-information/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  getPropertyInformationByGuid(propertyId: string): Observable<PropertyInformationResponse> {
    return this.http.get<PropertyInformationResponse>(this.controller + propertyId);
  }

  createPropertyInformation(propertyInformation: PropertyInformationRequest): Observable<PropertyInformationResponse> {
   return this.http.post<PropertyInformationResponse>(this.controller, propertyInformation);
  }

  updatePropertyInformation(propertyInformation: PropertyInformationRequest): Observable<PropertyInformationResponse> {
    return this.http.put<PropertyInformationResponse>(this.controller, propertyInformation);
  }

  deletePropertyInformation(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + propertyId);
  }
}
