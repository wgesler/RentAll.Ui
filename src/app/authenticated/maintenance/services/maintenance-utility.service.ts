import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UtilityRequest, UtilityResponse } from '../models/utility.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceUtilityService {
  readonly controller: string;

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {
    this.controller = this.configService.config().apiUrl + 'maintenance/utility/';
  }

  getUtilitiesByPropertyId(propertyId: string): Observable<UtilityResponse[]> {
    return this.http.get<UtilityResponse[]>(this.controller + propertyId);
  }

  getUtilityById(utilityId: number): Observable<UtilityResponse> {
    return this.http.get<UtilityResponse>(this.controller + utilityId);
  }

  createUtility(request: UtilityRequest): Observable<UtilityResponse> {
    return this.http.post<UtilityResponse>(this.controller, request);
  }

  updateUtility(request: UtilityRequest): Observable<UtilityResponse> {
    return this.http.put<UtilityResponse>(this.controller, request);
  }

  deleteUtility(utilityId: number): Observable<void> {
    return this.http.delete<void>(this.controller + utilityId);
  }
}
