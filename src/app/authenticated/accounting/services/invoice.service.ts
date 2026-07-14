import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { BillingMonthlyDataRequest, BillingMonthlyDataResponse, InvoiceGetRequest, InvoiceMonthlyDataRequest, InvoiceMonthlyDataResponse, InvoicePaymentRequest, InvoicePaymentResponse, InvoiceRequest, InvoiceResponse } from '../models/invoice.model';

@Injectable({
    providedIn: 'root'
})

export class InvoiceService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);

  
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  // GET: Get invoice by ID
  getInvoiceByGuid(invoiceId: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>(this.controller + 'invoice/' + invoiceId).pipe(
      map(dto => this.mappingService.mapInvoiceResponse(dto as unknown as Record<string, unknown>))
    );
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
    return this.http.post<InvoiceResponse>(this.controller + 'invoice', normalized).pipe(
      map(dto => this.mappingService.mapInvoiceResponse(dto as unknown as Record<string, unknown>))
    );
  }

  // PUT: Update entire invoice
  updateInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    const normalized = this.normalizeInvoiceRequest(invoice);
    return this.http.put<InvoiceResponse>(this.controller + 'invoice', normalized).pipe(
      map(dto => this.mappingService.mapInvoiceResponse(dto as unknown as Record<string, unknown>))
    );
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
    return this.http.put<InvoicePaymentResponse>(this.controller + 'invoice/payment', payment).pipe(
      map(response => ({
        ...response,
        invoices: (response.invoices ?? []).map(inv =>
          this.mappingService.mapInvoiceResponse(inv as unknown as Record<string, unknown>)
        )
      }))
    );
  }


  // Helper Methods
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

    const invoiceDate =
      this.utilityService.toDateOnlyJsonString(invoice.invoiceDate) ?? invoice.invoiceDate;
    const dueDate =
      this.utilityService.toDateOnlyJsonString(invoice.dueDate) ?? invoiceDate;
    const accountingPeriod =
      this.utilityService.toDateOnlyJsonString(invoice.accountingPeriod) ??
      this.firstDayOfMonthFromCalendarDate(invoiceDate);

    return {
      ...invoice,
      invoiceDate,
      dueDate,
      accountingPeriod,
      ledgerLines: normalizedLedgerLines
    };
  }

  private firstDayOfMonthFromCalendarDate(calendarDate: string): string {
    const match = /^(\d{4})-(\d{2})/.exec(calendarDate.trim());
    if (!match) {
      return calendarDate;
    }
    return `${match[1]}-${match[2]}-01`;
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
      isActive: request.isActive ?? null,
      includeInactive: request.includeInactive,
      includePaid: request.includePaid,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    return this.http.post<InvoiceResponse[]>(`${this.controller}invoice/search`, body).pipe(
      map(invoices =>
        (invoices ?? []).map(inv => this.mappingService.mapInvoiceResponse(inv as unknown as Record<string, unknown>))
      )
    );
  }

  deactivateInvoicesByReservationId(reservationId: string): Observable<{ deactivatedCount: number }> {
    return this.http.put<{ deactivatedCount: number }>(
      this.controller + 'invoice/reservation/' + reservationId + '/deactivate',
      {}
    );
  }

  reactivateInvoicesByReservationId(reservationId: string): Observable<{ reactivatedCount: number }> {
    return this.http.put<{ reactivatedCount: number }>(
      this.controller + 'invoice/reservation/' + reservationId + '/reactivate',
      {}
    );
  }

  syncInvoicesForReservationActiveChange( reservationId: string,previousIsActive: boolean, nextIsActive: boolean): Observable<void> {
    const id = reservationId?.trim();
    const previous = !!previousIsActive;
    const next = !!nextIsActive;
    if (!id || previous === next) {
      return of(undefined);
    }

    const showSuccess = (count: number) => {
      this.toastr.success(this.formatAssociatedInvoicesSyncMessage(next, count), CommonMessage.Success);
    };
    const showFailure = () => {
      this.toastr.warning(
        next ? 'Related invoices could not be reactivated.' : 'Related invoices could not be inactivated.',
        CommonMessage.Error
      );
      return of(undefined);
    };

    if (next) {
      return this.reactivateInvoicesByReservationId(id).pipe(
        tap(result => showSuccess(result.reactivatedCount)),
        catchError(showFailure),
        map(() => undefined)
      );
    }

    return this.deactivateInvoicesByReservationId(id).pipe(
      tap(result => showSuccess(result.deactivatedCount)),
      catchError(showFailure),
      map(() => undefined)
    );
  }

  formatAssociatedInvoicesSyncMessage(reactivated: boolean, count: number): string {
    const normalizedCount = Math.max(0, Number(count) || 0);
    const invoiceNoun = normalizedCount === 1 ? 'invoice' : 'invoices';
    const verb = reactivated ? 'reactivated' : 'inactivated';
    if (normalizedCount === 0) {
      return `No related ${invoiceNoun} were ${verb}.`;
    }
    const auxiliary = normalizedCount === 1 ? 'was' : 'were';
    return `${normalizedCount} related ${invoiceNoun} ${auxiliary} also ${verb}.`;
  }
}
