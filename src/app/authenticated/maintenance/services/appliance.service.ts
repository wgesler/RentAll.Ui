import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { ApplianceRequest, ApplianceResponse } from '../models/appliance.model';

@Injectable({
  providedIn: 'root'
})
export class ApplianceService {
  readonly controller: string;
  readonly maintenanceController: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/appliance/';
    this.maintenanceController = this.configService.config().apiUrl + 'maintenance/';
  }

  getAppliancesByPropertyId(propertyId: string): Observable<ApplianceResponse[]> {
    return this.http.get<ApplianceResponse[]>(this.maintenanceController + 'appliances/' + propertyId);
  }

  getAppliancesByMaintenanceId(maintenanceId: string): Observable<ApplianceResponse[]> {
    return this.http.get<ApplianceResponse[]>(this.controller + 'maintenance/' + maintenanceId);
  }

  getApplianceById(applianceId: number): Observable<ApplianceResponse> {
    return this.http.get<ApplianceResponse>(this.controller + applianceId);
  }

  createAppliance(request: ApplianceRequest): Observable<ApplianceResponse> {
    return this.http.post<ApplianceResponse>(this.controller, request);
  }

  updateAppliance(request: ApplianceRequest): Observable<ApplianceResponse> {
    return this.http.put<ApplianceResponse>(this.controller, request);
  }

  deleteAppliance(applianceId: number): Observable<void> {
    return this.http.delete<void>(this.controller + applianceId);
  }
}
