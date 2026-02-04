import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { InvoiceRequest, InvoiceResponse, InvoiceMonthlyDataResponse, InvoiceMonthlyDataRequest, InvoicePaymentRequest, InvoicePaymentResponse } from '../models/invoice.model';

@Injectable({
    providedIn: 'root'
})

export class AccountingService {
  
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all invoices
  getAllInvoices(): Observable<InvoiceResponse[]> {
    return this.http.get<InvoiceResponse[]>(this.controller + 'invoice');
  }

  // GET: Get all invoice by office
  getInvoicesByOffice(officeId: number): Observable<InvoiceResponse[]> {
    return this.http.get<InvoiceResponse[]>(this.controller + 'invoice/office/' + officeId.toString());
  }

  // GET: Get invoice by ID
  getInvoiceByGuid(invoiceId: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(this.controller + 'invoice/' + invoiceId);
  }

    // GET: Get invoice by property ID
  getInvoicesByProperty(propertyId: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(this.controller + 'invoice/proprty/' + propertyId);
  }

    // GET: Get invoice by ID
  getInvoicesByReservation(reservationId: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(this.controller + 'invoice/reservation' + reservationId);
  }

  // POST: Create a new invoice
  createInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    return this.http.post<InvoiceResponse>(this.controller + 'invoice', invoice);
  }

  // PUT: Update entire invoice
  updateInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    return this.http.put<InvoiceResponse>(this.controller + 'invoice', invoice);
  }


  // DELETE: Delete invoice
  deleteInvoice(invoiceId: string): Observable<void> {
    return this.http.delete<void>(this.controller  + 'invoice/' +  invoiceId);
  }

  // POST: Get monthly ledger lines for a reservation
  getMonthlyLedgerLines(request: InvoiceMonthlyDataRequest): Observable<InvoiceMonthlyDataResponse> {
    return this.http.post<InvoiceMonthlyDataResponse>(this.controller + 'ledger-line/reservation', request);
  }

  // PUT: Apply payment to invoices
  applyPayment(payment: InvoicePaymentRequest): Observable<InvoicePaymentResponse> {
    return this.http.put<InvoicePaymentResponse>(this.controller + 'payment', payment);
  }
}
