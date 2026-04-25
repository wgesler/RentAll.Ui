import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
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

  getAllReceipts(): Observable<ReceiptResponse[]> {
    return this.http.get<ReceiptResponse[]>(this.controller);
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

  getReceiptsByOfficeId(officeId: number): Observable<ReceiptResponse[]> {
    return this.http.get<ReceiptResponse[]>(this.controller + 'office/' + officeId);
  }

  getReceiptByPropertyId(propertyId: string): Observable<ReceiptResponse[]> {
    return this.getReceiptsByPropertyId(propertyId);
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
