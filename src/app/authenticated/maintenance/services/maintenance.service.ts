import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceListResponse, MaintenanceRequest, MaintenanceResponse } from '../models/maintenance.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService,
    private mappingService: MappingService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/';
  }

  getMaintenanceList(): Observable<MaintenanceListResponse[]> {
    return this.http.get<MaintenanceListResponse[]>(this.controller + 'list');
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

  async updateModifiedMaintenance(
    maintenanceId: string,
    overrides: Partial<MaintenanceRequest> | ((maintenance: MaintenanceResponse) => Partial<MaintenanceRequest>)
  ): Promise<MaintenanceResponse> {
    const maintenance = await firstValueFrom(this.getMaintenanceByGuid(maintenanceId));
    const patch = typeof overrides === 'function' ? overrides(maintenance) : overrides;
    return firstValueFrom(this.updateMaintenance(this.mappingService.mapMaintenanceResponseToRequest(maintenance, patch)));
  }

  deleteMaintenance(maintenanceId: string): Observable<void> {
    return this.http.delete<void>(this.controller + maintenanceId);
  }
}
