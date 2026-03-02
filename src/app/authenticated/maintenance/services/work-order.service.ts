import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
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

  getWorkOrdersByPropertyId(propertyId: string): Observable<WorkOrderResponse[]> {
    return this.http.get<WorkOrderResponse[]>(this.controller + 'property/' + propertyId);
  }

  getWorkOrderByPropertyId(propertyId: string): Observable<WorkOrderResponse[]> {
    return this.getWorkOrdersByPropertyId(propertyId);
  }

  getWorkOrderById(workOrderId: number): Observable<WorkOrderResponse> {
    return this.http.get<WorkOrderResponse>(this.controller + workOrderId);
  }

  getWorkOrder(organizationId: string, workOrderId: number): Observable<WorkOrderResponse> {
    return this.http.get<WorkOrderResponse>(this.controller + workOrderId + '?organizationId=' + organizationId);
  }

  createWorkOrder(request: WorkOrderRequest): Observable<WorkOrderResponse> {
    return this.http.post<WorkOrderResponse>(this.controller, request);
  }

  updateWorkOrder(request: WorkOrderRequest): Observable<WorkOrderResponse> {
    return this.http.put<WorkOrderResponse>(this.controller, request);
  }

  deleteWorkOrder(workOrderId: number): Observable<void> {
    return this.http.delete<void>(this.controller + workOrderId);
  }
}
