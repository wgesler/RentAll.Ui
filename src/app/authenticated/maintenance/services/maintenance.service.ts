import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MaintenanceListResponse, MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor() {
    const http = inject(HttpClient);
    const configService = inject(ConfigService);

    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/';
  }

  getMaintenanceList(): Observable<MaintenanceListResponse[]> {
    return this.http.get<MaintenanceListResponse[]>(this.controller + 'list');
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
}
