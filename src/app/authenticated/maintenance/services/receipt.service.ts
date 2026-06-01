import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { ReceiptRequest, ReceiptResponse } from '../models/receipt.model';

@Injectable({
  providedIn: 'root'
})
export class ReceiptService {
  readonly controller: string;
  http: HttpClient;
  configService: ConfigService;

  constructor(
    http: HttpClient,
    configService: ConfigService
  ) {
    this.http = http;
    this.configService = configService;
    this.controller = this.configService.config().apiUrl + 'maintenance/receipt/';
  }

  searchReceipts(request: MaintenanceListSearchRequest): Observable<ReceiptResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      return of([]);
    }

    return this.http.post<ReceiptResponse[]>(`${this.controller}search`, {
      officeIds,
      propertyId: request.propertyId || null,
      includeInactive: !!request.includeInactive,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    });
  }

  getReceipts(propertyId?: string | null, officeId?: number | null): Observable<ReceiptResponse[]> {
    if (propertyId) {
      return this.http.get<ReceiptResponse[]>(this.controller + 'property/' + propertyId);
    }
    if (officeId != null && Number.isFinite(officeId) && officeId > 0) {
      return this.http.get<ReceiptResponse[]>(this.controller + 'office/' + officeId);
    }
    return this.http.get<ReceiptResponse[]>(this.controller);
  }

  getReceiptsByPropertyId(propertyId: string): Observable<ReceiptResponse[]> {
    return this.http.get<ReceiptResponse[]>(this.controller + 'property/' + propertyId);
  }

  getReceiptById(receiptId: number): Observable<ReceiptResponse> {
    return this.http.get<ReceiptResponse>(this.controller + receiptId);
  }

  getReceipt(organizationId: string, receiptId: number): Observable<ReceiptResponse> {
    return this.http.get<ReceiptResponse>(this.controller + receiptId + '?organizationId=' + organizationId);
  }

  createReceipt(request: ReceiptRequest): Observable<ReceiptResponse> {
    return this.http.post<ReceiptResponse>(this.controller, request);
  }

  updateReceipt(request: ReceiptRequest): Observable<ReceiptResponse> {
    return this.http.put<ReceiptResponse>(this.controller, request);
  }

  deleteReceipt(receiptId: number): Observable<void> {
    return this.http.delete<void>(this.controller + receiptId);
  }
}
