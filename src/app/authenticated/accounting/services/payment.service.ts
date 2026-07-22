import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { PaymentRequest, PaymentResponse, CreatePaymentWithAllocationsRequest, ApplyInvoicePaymentRequest } from '../models/payment.model';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);

  readonly controller: string;

  constructor() {
    this.controller = this.configService.config().apiUrl + 'accounting/payment/';
  }

  getPayments(officeId?: number | null): Observable<PaymentResponse[]> {
    const request$ = officeId != null && Number.isFinite(officeId) && officeId > 0
      ? this.http.get<PaymentResponse[]>(this.controller + 'office/' + officeId)
      : this.http.get<PaymentResponse[]>(this.controller);

    return request$.pipe(map(payments => (payments || []).map(payment => this.mappingService.mapPaymentResponse(payment))));
  }

  getPaymentById(paymentId: string): Observable<PaymentResponse> {
    return this.http.get<PaymentResponse>(this.controller + paymentId)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  createPayment(request: PaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller, request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  createPaymentWithAllocations(request: CreatePaymentWithAllocationsRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller + 'allocations', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  applyPaymentToInvoices(request: ApplyInvoicePaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller + 'apply-invoices', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  updatePayment(request: PaymentRequest): Observable<PaymentResponse> {
    return this.http.put<PaymentResponse>(this.controller, request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  deletePayment(paymentId: string): Observable<void> {
    return this.http.delete<void>(this.controller + paymentId);
  }
}
