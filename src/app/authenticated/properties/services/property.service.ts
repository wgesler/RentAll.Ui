import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertySelectionRequest, PropertySelectionResponse } from '../models/property-selection.model';
import { PropertyListResponse, PropertyRequest, PropertyResponse } from '../models/property.model';

@Injectable({
    providedIn: 'root'
})

export class PropertyService {
  
  private readonly controller = this.configService.config().apiUrl + 'property/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get property list (summary view)
  getPropertyList(): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'list');
  }

  // GET: Get property by ID
  getPropertyByGuid(propertyId: string): Observable<PropertyResponse> {
    return this.http.get<PropertyResponse>(this.controller + propertyId);
  }

  // POST: Create a new property
  createProperty(property: PropertyRequest): Observable<PropertyResponse> {
   return this.http.post<PropertyResponse>(this.controller, property);
  }

  // PUT: Update entire property
  updateProperty(property: PropertyRequest): Observable<PropertyResponse> {
    return this.http.put<PropertyResponse>(this.controller, property);
  }

  // DELETE: Delete property
  deleteProperty(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + propertyId);
  }

  // GET: Get property selection criteria for a user
  getPropertySelection(userId: string): Observable<PropertySelectionResponse> {
    return this.http.get<PropertySelectionResponse>(this.controller + 'selection/' + userId);
  }

  // PUT: Save property selection criteria for a user
  putPropertySelection(selection: PropertySelectionRequest): Observable<PropertySelectionResponse> {
    return this.http.put<PropertySelectionResponse>(this.controller + 'selection/', selection);
  }

  // POST: Get properties by selection criteria
  getPropertiesBySelectionCritera(userId: string): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'user/' + userId);
  }
}






