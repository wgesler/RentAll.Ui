import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UtilityService } from '../../../services/utility.service';
import { BillingMonthlyDataRequest, BillingMonthlyDataResponse, InvoiceGetRequest, InvoiceMonthlyDataRequest, InvoiceMonthlyDataResponse, InvoicePaymentRequest, InvoicePaymentResponse, InvoiceRequest, InvoiceResponse } from '../models/invoice.model';

@Injectable({
    providedIn: 'root'
})

export class InvoiceService {
  
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService,
      private utilityService: UtilityService) {
  }

   normalizeInvoiceRequest(invoice: InvoiceRequest): InvoiceRequest {
    const normalizedLedgerLines = (invoice.ledgerLines ?? []).map(line => {
      const numericCostCodeId = Number(line.costCodeId);
      const numericLineNumber = Number(line.lineNumber);
      const numericTransactionTypeId = Number(line.transactionTypeId);
      const numericAmount = Number(line.amount);
      const lineDate = line.ledgerLineDate || invoice.invoiceDate || this.utilityService.todayAsCalendarDateString();

      return {
        ...line,
        lineNumber: Number.isFinite(numericLineNumber) ? numericLineNumber : 0,
        transactionTypeId: Number.isFinite(numericTransactionTypeId) ? numericTransactionTypeId : 0,
        amount: Number.isFinite(numericAmount) ? numericAmount : 0,
        ledgerLineDate: lineDate,
        costCodeId: Number.isInteger(numericCostCodeId) ? numericCostCodeId : 0
      };
    });

    return {
      ...invoice,
      ledgerLines: normalizedLedgerLines
    };
  }

  searchInvoices(request: InvoiceGetRequest): Observable<InvoiceResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to load invoices.');
    }

    const body = {
      officeIds,
      reservationId: request.reservationId || null,
      propertyId: request.propertyId || null,
      invoiceCode: request.invoiceCode || null,
      includeInactive: request.includeInactive,
      includePaid: request.includePaid,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    return this.http.post<InvoiceResponse[]>(`${this.controller}invoice/search`, body);
  }

  // GET: Get invoice by ID
  getInvoiceByGuid(invoiceId: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(this.controller + 'invoice/' + invoiceId);
  }

  // POST search: Find invoice by code within office scope.
  getInvoiceByCode(invoiceCode: string, officeIds: number[]): Observable<InvoiceResponse | null> {
    if (!invoiceCode?.trim()) {
      return new Observable(observer => {
        observer.next(null);
        observer.complete();
      });
    }

    return this.searchInvoices({
      officeIds,
      invoiceCode: invoiceCode.trim(),
      includeInactive: true,
      includePaid: true
    }).pipe(
      map(invoices => invoices?.[0] ?? null)
    );
  }

  // POST: Create a new invoice
  createInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    const normalized = this.normalizeInvoiceRequest(invoice);
    return this.http.post<InvoiceResponse>(this.controller + 'invoice', normalized);
  }

  // PUT: Update entire invoice
  updateInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    const normalized = this.normalizeInvoiceRequest(invoice);
    return this.http.put<InvoiceResponse>(this.controller + 'invoice', normalized);
  }


  // DELETE: Delete invoice
  deleteInvoice(invoiceId: string): Observable<void> {
    return this.http.delete<void>(this.controller  + 'invoice/' +  invoiceId);
  }

  // POST: Get monthly ledger lines for a reservation
  getMonthlyLedgerLines(request: InvoiceMonthlyDataRequest): Observable<InvoiceMonthlyDataResponse> {
    return this.http.post<InvoiceMonthlyDataResponse>(this.controller + 'invoice/ledger-line/reservation', request);
  }

  // POST: Get monthly ledger lines for an organization (billing)
  getBillingMonthlyLedgerLines(request: BillingMonthlyDataRequest): Observable<BillingMonthlyDataResponse> {
    return this.http.post<BillingMonthlyDataResponse>(this.controller + 'invoice/ledger-line/organization', request);
  }

  // PUT: Apply payment to invoices
  applyPayment(payment: InvoicePaymentRequest): Observable<InvoicePaymentResponse> {
    return this.http.put<InvoicePaymentResponse>(this.controller + 'invoice/payment', payment);
  }
}
