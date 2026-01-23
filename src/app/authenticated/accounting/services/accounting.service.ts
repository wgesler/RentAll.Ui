import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { InvoiceRequest, InvoiceResponse, InvoiceMonthlyDataResponse } from '../models/accounting.model';

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
  getInvoices(): Observable<InvoiceResponse[]> {
    return this.http.get<InvoiceResponse[]>(this.controller);
  }

  // GET: Get invoice by ID
  getInvoiceByGuid(invoiceId: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(this.controller + invoiceId);
  }

  // POST: Create a new invoice
  createInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    return this.http.post<InvoiceResponse>(this.controller, invoice);
  }

  // PUT: Update entire invoice
  updateInvoice(invoiceId: string, invoice: InvoiceRequest): Observable<InvoiceResponse> {
    return this.http.put<InvoiceResponse>(this.controller + invoiceId, invoice);
  }

  // PATCH: Partially update invoice
  updateInvoicePartial(invoiceId: string, invoice: Partial<InvoiceRequest>): Observable<InvoiceResponse> {
    return this.http.patch<InvoiceResponse>(this.controller + invoiceId, invoice);
  }

  // DELETE: Delete invoice
  deleteInvoice(invoiceId: string): Observable<void> {
    return this.http.delete<void>(this.controller + invoiceId);
  }

  // GET: Get monthly ledger lines for a reservation
  getMonthlyLedgerLines(reservationId: string): Observable<InvoiceMonthlyDataResponse> {
    return this.http.get<InvoiceMonthlyDataResponse>(this.controller + 'ledgerline/reservation/' + reservationId);
  }
}
