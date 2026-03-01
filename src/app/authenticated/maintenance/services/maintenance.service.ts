import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/';
  }

  getMaintenanceList(): Observable<MaintenanceRequest[]> {
    return this.http.get<MaintenanceRequest[]>(this.controller + 'list');
  }

  getMaintenanceByGuid(maintenanceId: string): Observable<MaintenanceResponse> {
    return this.http.get<MaintenanceResponse>(this.controller + maintenanceId);
  }

  getByPropertyId(propertyId: string): Observable<MaintenanceResponse | null> {
    return this.http.get<MaintenanceResponse | null>(this.controller  + 'property/' + propertyId);
  }

  createMaintenance(request: MaintenanceRequest): Observable<MaintenanceResponse> {
    return this.http.post<MaintenanceResponse>(this.controller, request);
  }

  updateMaintenance(request: MaintenanceRequest): Observable<MaintenanceResponse> {
    return this.http.put<MaintenanceResponse>(this.controller, request);
  }

  deleteMaintenance(maintenanceId: string): Observable<void> {
    return this.http.delete<void>(this.controller + maintenanceId);
  }
}
