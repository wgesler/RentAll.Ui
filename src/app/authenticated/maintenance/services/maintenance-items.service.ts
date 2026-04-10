import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MaintenanceItemRequest, MaintenanceItemResponse } from '../models/maintenance-item.model';

@Injectable({
  providedIn: 'root'
})
export class MaintenanceItemsService {
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
    this.controller = this.configService.config().apiUrl + 'maintenance/maintenance-item/';
  }

  getMaintenanceItemsByPropertyId(propertyId: string): Observable<MaintenanceItemResponse[]> {
    return this.http.get<MaintenanceItemResponse[]>(this.controller + propertyId);
  }

  createMaintenanceItem(request: MaintenanceItemRequest): Observable<MaintenanceItemResponse> {
    return this.http.post<MaintenanceItemResponse>(this.controller, request);
  }

  updateMaintenanceItem(request: MaintenanceItemRequest): Observable<MaintenanceItemResponse> {
    return this.http.put<MaintenanceItemResponse>(this.controller, request);
  }

  deleteMaintenanceItem(maintenanceItemId: number): Observable<void> {
    return this.http.delete<void>(this.controller + maintenanceItemId);
  }
}
