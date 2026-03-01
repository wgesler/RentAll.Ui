import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { InspectionResponse } from '../models/inspection.model';

@Injectable({
  providedIn: 'root'
})
export class InspectionService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/inspection/';
  }

  getInspectionsByPropertyId(propertyId: string): Observable<InspectionResponse[]> {
    return this.http.get<InspectionResponse[]>(this.controller + 'property/' + propertyId);
  }

  getInspectionByPropertyId(propertyId: string): Observable<InspectionResponse[]> {
    return this.http.get<InspectionResponse[]>(this.controller + 'property/' + propertyId);
  }

  getInspectionById(inspectionId: number): Observable<InspectionResponse> {
    return this.http.get<InspectionResponse>(this.controller + inspectionId);
  }

  getInspection(organizationId: string, inspectionId: number): Observable<InspectionResponse> {
    return this.http.get<InspectionResponse>(this.controller + inspectionId + '?organizationId=' + organizationId);
  }

  createInspection(request: InspectionResponse): Observable<InspectionResponse> {
    return this.http.post<InspectionResponse>(this.controller, request);
  }

  updateInspection(request: InspectionResponse): Observable<InspectionResponse> {
    return this.http.put<InspectionResponse>(this.controller, request);
  }

  deleteInspection(inspectionId: number): Observable<void> {
    return this.http.delete<void>(this.controller + inspectionId);
  }
}
