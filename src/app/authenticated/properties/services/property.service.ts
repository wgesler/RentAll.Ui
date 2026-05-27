import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { CalendarUrlResponse } from '../models/property-calendar';
import { PropertySelectionRequest, PropertySelectionResponse } from '../models/property-selection.model';
import {
  PropertyCodeResponse,
  PropertyListResponse,
  PropertyRequest,
  PropertyResponse,
  PropertyTrackerResponse,
  PropertyTrackerResponseOption,
  PropertyTrackerResponseOptionRequest,
  PropertyTrackerResponseRequest
} from '../models/property.model';

@Injectable({
    providedIn: 'root'
})

export class PropertyService {
  
  private readonly controller = this.configService.config().apiUrl + 'property/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService,
      private mappingService: MappingService,
      private mixedMappingService: MixedMappingService) {
  }

  // GET: Get property list (summary view)
  getPropertyList(): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'list');
  }

  getActivePropertyList(): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'active-list');
  }

  getPropertyCodes(): Observable<PropertyCodeResponse[]> {
    return this.http.get<PropertyCodeResponse[]>(this.controller + 'codes');
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

  /**
   * Loads the property by id, maps response to a full update request, merges overrides, then PUTs.
   */
  async updateModifiedProperty(
    propertyId: string,
    overrides: Partial<PropertyRequest> | ((property: PropertyResponse) => Partial<PropertyRequest>)
  ): Promise<PropertyResponse> {
    const property = await firstValueFrom(this.getPropertyByGuid(propertyId));
    const patch = typeof overrides === 'function' ? overrides(property) : overrides;
    const request = this.mixedMappingService.mapPropertyResponseToRequest(property, patch);
    return firstValueFrom(this.updateProperty(request));
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

  resetPropertySelection(userId: string): Observable<PropertySelectionResponse> {
    return this.putPropertySelection(this.buildDefaultPropertySelectionRequest(userId));
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

  // GET: Get properties associated with office
  getPropertiesByOfficeId(officeId: number): Observable<PropertyListResponse[]> {
    return this.http.get<PropertyListResponse[]>(this.controller + 'office/' + officeId);
  }

  // GET: Get calendar URL/tokenized calendar response for a property
  getPropertyCalendarUrl(propertyId: string): Observable<CalendarUrlResponse> {
    return this.http.get<CalendarUrlResponse>(this.controller + propertyId + '/calendar/subscription-url');
  }

  getPropertyTrackerResponses(propertyId: string): Observable<PropertyTrackerResponse[]> {
    return this.http.get<PropertyTrackerResponse[]>(this.controller + 'tracker-response/property/' + propertyId);
  }

  getPropertyTrackerResponsesByOffices(includeInactive: boolean = false): Observable<PropertyTrackerResponse[]> {
    return this.http.get<PropertyTrackerResponse[]>(this.controller + 'tracker-response/offices?includeInactive=' + includeInactive);
  }

  getPropertyTrackerResponseOptions(propertyId: string): Observable<PropertyTrackerResponseOption[]> {
    return this.http.get<PropertyTrackerResponseOption[]>(this.controller + 'tracker-response-option/property/' + propertyId);
  }

  getPropertyTrackerResponseOptionsByOffices(includeInactive: boolean = false): Observable<PropertyTrackerResponseOption[]> {
    return this.http.get<PropertyTrackerResponseOption[]>(this.controller + 'tracker-response-option/offices?includeInactive=' + includeInactive);
  }

  createPropertyTrackerResponse(request: PropertyTrackerResponseRequest): Observable<PropertyTrackerResponse> {
    return this.http.post<PropertyTrackerResponse>(this.controller + 'tracker-response', request);
  }

  updatePropertyTrackerResponse(request: PropertyTrackerResponseRequest): Observable<PropertyTrackerResponse> {
    return this.http.put<PropertyTrackerResponse>(this.controller + 'tracker-response', request);
  }

  deletePropertyTrackerResponse(trackerResponseId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-response/' + trackerResponseId);
  }

  deletePropertyTrackerResponsesByPropertyId(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-response/property/' + propertyId);
  }

  createPropertyTrackerResponseOption(request: PropertyTrackerResponseOptionRequest): Observable<PropertyTrackerResponseOption> {
    return this.http.post<PropertyTrackerResponseOption>(this.controller + 'tracker-response-option', request);
  }

  deletePropertyTrackerResponseOption(trackerResponseId: string, trackerDefinitionOptionId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-response-option/' + trackerResponseId + '/' + trackerDefinitionOptionId);
  }

  buildDefaultPropertySelectionRequest(userId: string): PropertySelectionRequest {
    return {
      userId,
      fromUnitLevel: 0,
      toUnitLevel: 0,
      fromBeds: 0,
      toBeds: 0,
      accomodates: 0,
      maxRent: 0,
      propertyCode: null,
      propertyLeaseTypeId: 0,
      city: null,
      state: null,
      cable: false,
      streaming: false,
      pool: false,
      jacuzzi: false,
      security: false,
      parking: false,
      pets: false,
      dogsOkay: false,
      catsOkay: false,
      smoking: false,
      highSpeedInternet: false,
      propertyStatusId: 0,
      officeCode: null,
      buildingCodes: [],
      regionCodes: [],
      areaCodes: []
    };
  }
}






