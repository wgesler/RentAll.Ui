import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { InventoryResponse } from '../models/inventory.model';

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/inventory/';
  }

  getInventoriesByPropertyId(propertyId: string): Observable<InventoryResponse[]> {
    return this.http.get<InventoryResponse[]>(this.controller + 'property/' + propertyId);
  }

  getInventoryByPropertyId(propertyId: string): Observable<InventoryResponse[]> {
    return this.http.get<InventoryResponse[]>(this.controller + 'property/' + propertyId);
  }

  getInventoryByProperty(propertyId: string): Observable<InventoryResponse[]> {
    return this.http.get<InventoryResponse[]>(this.controller + 'property/' + propertyId);
  }

  getInventoryById(inventoryId: number): Observable<InventoryResponse> {
    return this.http.get<InventoryResponse>(this.controller + inventoryId);
  }

  getInventory(organizationId: string, inventoryId: number): Observable<InventoryResponse> {
    return this.http.get<InventoryResponse>(this.controller + inventoryId + '?organizationId=' + organizationId);
  }

  createInventory(request: InventoryResponse): Observable<InventoryResponse> {
    return this.http.post<InventoryResponse>(this.controller, request);
  }

  updateInventory(request: InventoryResponse): Observable<InventoryResponse> {
    return this.http.put<InventoryResponse>(this.controller, request);
  }

  deleteInventory(inventoryId: number): Observable<void> {
    return this.http.delete<void>(this.controller + inventoryId);
  }
}
