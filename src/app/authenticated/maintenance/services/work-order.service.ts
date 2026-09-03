import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { WorkOrderRequest, WorkOrderResponse } from '../models/work-order.model';

@Injectable({
  providedIn: 'root'
})
export class WorkOrderService {
  readonly controller: string;
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);

  constructor() {
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
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(map(workOrders => (workOrders || []).map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder))));
  }

  getWorkOrders(propertyId?: string | null, officeId?: number | null): Observable<WorkOrderResponse[]> {
    if (propertyId) {
      return this.http.get<WorkOrderResponse[]>(this.controller + 'property/' + propertyId).pipe(
        map(workOrders => (workOrders || []).map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder)))
      );
    }
    if (officeId != null && Number.isFinite(officeId) && officeId > 0) {
      return this.http.get<WorkOrderResponse[]>(this.controller + 'office/' + officeId).pipe(
        map(workOrders => (workOrders || []).map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder)))
      );
    }
    return this.http.get<WorkOrderResponse[]>(this.controller).pipe(
      map(workOrders => (workOrders || []).map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder)))
    );
  }

  getWorkOrdersByPropertyId(propertyId: string): Observable<WorkOrderResponse[]> {
    return this.http.get<WorkOrderResponse[]>(this.controller + 'property/' + propertyId).pipe(
      map(workOrders => (workOrders || []).map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder)))
    );
  } 

  getWorkOrderById(workOrderId: string): Observable<WorkOrderResponse> {
    return this.http.get<WorkOrderResponse>(this.controller + workOrderId).pipe(
      map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder))
    );
  }

  resolveWorkOrderForLink(options: {
    workOrderId?: string | null;
    workOrderCode?: string | null;
    officeId?: number | null;
  }): Observable<WorkOrderResponse | null> {
    const workOrderId = (options.workOrderId || '').trim();
    if (workOrderId) {
      return this.getWorkOrderById(workOrderId).pipe(
        map(workOrder => workOrder ?? null),
        catchError(() => of(null))
      );
    }

    const workOrderCode = (options.workOrderCode || '').trim();
    if (!workOrderCode) {
      return of(null);
    }

    const normalizedCode = workOrderCode.toLowerCase();
    const officeIds = options.officeId != null && Number(options.officeId) > 0
      ? [Number(options.officeId)]
      : [];

    if (officeIds.length > 0) {
      return this.searchWorkOrders({
        officeIds,
        propertyId: null,
        isActive: null,
        startDate: null,
        endDate: null
      }).pipe(
        map(workOrders => (workOrders || []).find(
          workOrder => (workOrder.workOrderCode || '').trim().toLowerCase() === normalizedCode
        ) ?? null),
        catchError(() => of(null))
      );
    }

    return this.getWorkOrders(null, null).pipe(
      map(workOrders => (workOrders || []).find(
        workOrder => (workOrder.workOrderCode || '').trim().toLowerCase() === normalizedCode
      ) ?? null),
      catchError(() => of(null))
    );
  }

  createWorkOrder(request: WorkOrderRequest): Observable<WorkOrderResponse> {
    return this.http.post<WorkOrderResponse>(this.controller, request).pipe(
      map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder))
    );
  }

  updateWorkOrder(request: WorkOrderRequest): Observable<WorkOrderResponse> {
    return this.http.put<WorkOrderResponse>(this.controller, request).pipe(
      map(workOrder => this.mappingService.mapWorkOrderResponse(workOrder))
    );
  }

  deleteWorkOrder(workOrderId: string): Observable<void> {
    return this.http.delete<void>(this.controller + workOrderId);
  }
}
