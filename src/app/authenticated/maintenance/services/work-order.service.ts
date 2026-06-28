import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { WorkOrderRequest, WorkOrderResponse } from '../models/work-order.model';

@Injectable({
  providedIn: 'root'
})
export class WorkOrderService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/work-order/';
  }


  searchWorkOrders(request: MaintenanceListSearchRequest): Observable<WorkOrderResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      return of([]);
    }

    return this.http.post<WorkOrderResponse[]>(`${this.controller}search`, {
      officeIds,
      propertyId: request.propertyId || null,
      isActive: request.isActive ?? null,
      includeInactive: !!request.includeInactive,
      inactiveOnly: !!request.inactiveOnly,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    });
  }

  getWorkOrders(propertyId?: string | null, officeId?: number | null): Observable<WorkOrderResponse[]> {
    if (propertyId) {
      return this.http.get<WorkOrderResponse[]>(this.controller + 'property/' + propertyId);
    }
    if (officeId != null && Number.isFinite(officeId) && officeId > 0) {
      return this.http.get<WorkOrderResponse[]>(this.controller + 'office/' + officeId);
    }
    return this.http.get<WorkOrderResponse[]>(this.controller);
  }

  getWorkOrdersByPropertyId(propertyId: string): Observable<WorkOrderResponse[]> {
    return this.http.get<WorkOrderResponse[]>(this.controller + 'property/' + propertyId);
  } 

  getWorkOrderById(workOrderId: string): Observable<WorkOrderResponse> {
    return this.http.get<WorkOrderResponse>(this.controller + workOrderId);
  }

  createWorkOrder(request: WorkOrderRequest): Observable<WorkOrderResponse> {
    return this.http.post<WorkOrderResponse>(this.controller, request);
  }

  updateWorkOrder(request: WorkOrderRequest): Observable<WorkOrderResponse> {
    return this.http.put<WorkOrderResponse>(this.controller, request);
  }

  deleteWorkOrder(workOrderId: string): Observable<void> {
    return this.http.delete<void>(this.controller + workOrderId);
  }
}
