import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { PaymentKind } from '../models/accounting-enum';
import { PaymentResponse, CreatePaymentWithInvoiceAllocationsRequest, UpdatePaymentWithInvoiceAllocationsRequest, ApplyInvoicePaymentRequest, CreatePaymentWithBillAllocationsRequest, CreatePaymentWithOwnerAllocationsRequest, UpdatePaymentWithBillAllocationsRequest, UpdatePaymentInvoiceRequest, UpdatePaymentBillRequest } from '../models/payment.model';

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

  getPayments(officeId?: number | null, kind: PaymentKind = PaymentKind.Invoice): Observable<PaymentResponse[]> {
    const kindSegment = kind === PaymentKind.Bill ? 'bill' : kind === PaymentKind.Owner ? 'owner' : 'invoice';
    const request$ = officeId != null && Number.isFinite(officeId) && officeId > 0
      ? this.http.get<PaymentResponse[]>(this.controller + kindSegment + '/office/' + officeId)
      : this.http.get<PaymentResponse[]>(this.controller + kindSegment);

    return request$.pipe(map(payments => (payments || []).map(payment => this.mappingService.mapPaymentResponse(payment))));
  }

  getPaymentById(paymentId: string): Observable<PaymentResponse> {
    return this.http.get<PaymentResponse>(this.controller + paymentId)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  createPaymentWithInvoiceAllocations(request: CreatePaymentWithInvoiceAllocationsRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller + 'invoice-allocations', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  createPaymentWithBillAllocations(request: CreatePaymentWithBillAllocationsRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller + 'bill-allocations', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  createPaymentWithOwnerAllocations(request: CreatePaymentWithOwnerAllocationsRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller + 'owner-allocations', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  updatePaymentWithBillAllocations(request: UpdatePaymentWithBillAllocationsRequest): Observable<PaymentResponse> {
    return this.http.put<PaymentResponse>(this.controller + 'bill-allocations', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  applyPaymentToInvoices(request: ApplyInvoicePaymentRequest): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(this.controller + 'apply-invoices', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  updatePaymentInvoice(request: UpdatePaymentInvoiceRequest): Observable<PaymentResponse> {
    return this.http.put<PaymentResponse>(this.controller + 'invoice', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  updatePaymentBill(request: UpdatePaymentBillRequest): Observable<PaymentResponse> {
    return this.http.put<PaymentResponse>(this.controller + 'bill', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  updatePaymentWithInvoiceAllocations(request: UpdatePaymentWithInvoiceAllocationsRequest): Observable<PaymentResponse> {
    return this.http.put<PaymentResponse>(this.controller + 'invoice-allocations', request)
      .pipe(map(payment => this.mappingService.mapPaymentResponse(payment)));
  }

  deletePayment(paymentId: string): Observable<void> {
    return this.http.delete<void>(this.controller + paymentId);
  }
}
