import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { CalendarUrlRequest, CalendarUrlResponse } from '../models/property-calendar';
import { PropertySelectionRequest, PropertySelectionResponse } from '../models/property-selection.model';
import { PropertyListResponse, PropertyRequest, PropertyResponse } from '../models/property.model';

@Injectable({
    providedIn: 'root'
})

export class PropertyService {
  
  private readonly controller = this.configService.config().apiUrl + 'property/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService,
      private mappingService: MappingService) {
  }

  // GET: Get property list (summary view)
  getPropertyList(): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'list');
  }

  getActivePropertyList(): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'active-list');
  }

  // GET: Get property by ID
  getPropertyByGuid(propertyId: string): Observable<PropertyResponse> {
    return this.http.get<PropertyResponse>(this.controller + propertyId).pipe(
      map((dto) => this.mappingService.mapPropertyResponse(dto as unknown as Record<string, unknown>))
    );
  }

  // POST: Create a new property
  createProperty(property: PropertyRequest): Observable<PropertyResponse> {
    return this.http.post<PropertyResponse>(this.controller, property).pipe(
      map((dto) => this.mappingService.mapPropertyResponse(dto as unknown as Record<string, unknown>))
    );
  }

  // PUT: Update entire property
  updateProperty(property: PropertyRequest): Observable<PropertyResponse> {
    return this.http.put<PropertyResponse>(this.controller, property).pipe(
      map((dto) => this.mappingService.mapPropertyResponse(dto as unknown as Record<string, unknown>))
    );
  }

  // DELETE: Delete property
  deleteProperty(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + propertyId);
  }

  // GET: Get property selection criteria for a user
  getPropertySelection(userId: string): Observable<PropertySelectionResponse> {
    return this.http.get<PropertySelectionResponse>(this.controller + 'selection/' + userId);
  }

  getActivePropertySelection(userId: string): Observable<PropertySelectionResponse> {
    return this.http.get<PropertySelectionResponse>(this.controller + 'selection/' + userId + '/active');
  }

  // PUT: Save property selection criteria for a user
  putPropertySelection(selection: PropertySelectionRequest): Observable<PropertySelectionResponse> {
    return this.http.put<PropertySelectionResponse>(this.controller + 'selection/', selection);
  }

  // POST: Get properties by selection criteria
  getPropertiesBySelectionCriteria(userId: string): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'user/' + userId);
  }

  getActivePropertiesBySelectionCriteria(userId: string): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'user/' + userId + '/active');
  }

  // GET: Get properties associated with owner
  getPropertiesByOwner(ownerId: string): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'owner/' + ownerId);
  }

  getActivePropertiesByOwner(ownerId: string): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'owner/' + ownerId + '/active');
  }

  // GET: Get calendar URL/tokenized calendar response for a property
  getPropertyCalendarUrl(propertyId: string): Observable<CalendarUrlResponse> {
    return this.http.get<CalendarUrlResponse>(this.controller + propertyId + '/calendar/subscription-url');
  }
}






