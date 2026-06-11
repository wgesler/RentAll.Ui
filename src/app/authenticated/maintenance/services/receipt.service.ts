import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
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
    configService: ConfigService,
    private mappingService: MappingService
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
    }).pipe(map(receipts => (receipts || []).map(receipt => this.mappingService.mapReceiptResponse(receipt))));
  }

  getReceipts(propertyId?: string | null, officeId?: number | null): Observable<ReceiptResponse[]> {
    const request$ = propertyId
      ? this.http.get<ReceiptResponse[]>(this.controller + 'property/' + propertyId)
      : officeId != null && Number.isFinite(officeId) && officeId > 0
        ? this.http.get<ReceiptResponse[]>(this.controller + 'office/' + officeId)
        : this.http.get<ReceiptResponse[]>(this.controller);
    return request$.pipe(map(receipts => (receipts || []).map(receipt => this.mappingService.mapReceiptResponse(receipt))));
  }

  getReceiptsByPropertyId(propertyId: string): Observable<ReceiptResponse[]> {
    return this.http.get<ReceiptResponse[]>(this.controller + 'property/' + propertyId)
      .pipe(map(receipts => (receipts || []).map(receipt => this.mappingService.mapReceiptResponse(receipt))));
  }

  getReceiptById(receiptId: number): Observable<ReceiptResponse> {
    return this.http.get<ReceiptResponse>(this.controller + receiptId)
      .pipe(map(receipt => this.mappingService.mapReceiptResponse(receipt)));
  }

  getReceipt(organizationId: string, receiptId: number): Observable<ReceiptResponse> {
    return this.http.get<ReceiptResponse>(this.controller + receiptId + '?organizationId=' + organizationId)
      .pipe(map(receipt => this.mappingService.mapReceiptResponse(receipt)));
  }

  createReceipt(request: ReceiptRequest): Observable<ReceiptResponse> {
    return this.http.post<ReceiptResponse>(this.controller, request)
      .pipe(map(receipt => this.mappingService.mapReceiptResponse(receipt)));
  }

  updateReceipt(request: ReceiptRequest): Observable<ReceiptResponse> {
    return this.http.put<ReceiptResponse>(this.controller, request)
      .pipe(map(receipt => this.mappingService.mapReceiptResponse(receipt)));
  }

  deleteReceipt(receiptId: number): Observable<void> {
    return this.http.delete<void>(this.controller + receiptId);
  }
}
