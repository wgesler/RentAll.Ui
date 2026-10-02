import { HttpClient } from '@angular/common/http';
import { Injectable, Injector, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { catchError, map, Observable, of, switchMap, take, tap } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { BillingMonthlyDataRequest, BillingMonthlyDataResponse, InvoiceGetRequest, InvoiceMonthlyDataRequest, InvoiceMonthlyDataResponse, InvoiceRequest, InvoiceResponse, MissingInvoiceSearchRequest, PreBillingInvoiceSearchRequest, ReservationInvoicePreviewSearchRequest } from '../models/invoice.model';
import { ContactService } from '../../contacts/services/contact.service';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { InvoiceDocumentService } from './invoice-document.service';

@Injectable({
    providedIn: 'root'
})

export class InvoiceService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private dialog = inject(MatDialog);
  private injector = inject(Injector);

  
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

  formatDeletedInvoiceMessage(referralBillDeleted: boolean): string {
    return referralBillDeleted
      ? 'Invoice and referral bill deleted successfully.'
      : 'Invoice deleted successfully.';
  }

  formatCreatedDocumentsMessage(invoiceCount: number, billCount: number): string {
    const invoices = `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`;
    if (billCount <= 0) {
      return `Created ${invoices}.`;
    }
    const bills = `${billCount} bill${billCount === 1 ? '' : 's'}`;
    return `Created ${invoices} and ${bills}.`;
  }

  promptReferralVendorCreated(): void {
    this.injector.get(ContactService).refreshContacts().pipe(take(1)).subscribe({ error: () => undefined });
    const dialogData: GenericModalData = {
      title: 'Vendor Not Found',
      message: 'A corresponding vendor for this bill was not found. One was created automatically and should be confirmed for accuracy.',
      icon: 'warning',
      iconColor: 'warn',
      no: '',
      yes: 'OK',
      callback: (dialogRef) => dialogRef.close(),
      useHTML: false
    };
    this.dialog.open(GenericModalComponent, { data: dialogData, width: '35rem' });
  }

  // POST: Create a new invoice
  createInvoice(invoice: InvoiceRequest): Observable<InvoiceResponse> {
    const normalized = this.normalizeInvoiceRequest(invoice);
    return this.http.post<InvoiceResponse>(this.controller + 'invoice', normalized).pipe(
      map(dto => this.mappingService.mapInvoiceResponse(dto as unknown as Record<string, unknown>)),
      switchMap(savedInvoice => this.injector.get(InvoiceDocumentService).applyReservationInvoiceMethodAfterCreate(savedInvoice))
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
  deleteInvoice(invoiceId: string): Observable<{ referralBillDeleted: boolean }> {
    return this.http.delete<Record<string, unknown>>(this.controller + 'invoice/' + invoiceId).pipe(
      map(body => ({
        referralBillDeleted: body?.['referralBillDeleted'] === true || body?.['ReferralBillDeleted'] === true
      }))
    );
  }

  // POST: Get monthly ledger lines for a reservation
  getMonthlyLedgerLines(request: InvoiceMonthlyDataRequest): Observable<InvoiceMonthlyDataResponse> {
    return this.http.post<InvoiceMonthlyDataResponse>(this.controller + 'invoice/ledger-line/reservation', request);
  }

  // POST: Get monthly ledger lines for an organization (billing)
  getBillingMonthlyLedgerLines(request: BillingMonthlyDataRequest): Observable<BillingMonthlyDataResponse> {
    return this.http.post<BillingMonthlyDataResponse>(this.controller + 'invoice/ledger-line/organization', request);
  }

  // Helper Methods
  normalizeInvoiceRequest(invoice: InvoiceRequest): InvoiceRequest {
    const normalizedLedgerLines = (invoice.ledgerLines ?? []).map(line => {
      const numericCostCodeId = Number(line.costCodeId);
      const numericLineNumber = Number(line.lineNumber);
      const numericAmount = Number(line.amount);
      const lineDate = line.ledgerLineDate || invoice.invoiceDate || this.utilityService.todayAsCalendarDateString();

      return {
        ...line,
        lineNumber: Number.isFinite(numericLineNumber) ? numericLineNumber : 0,
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

firstDayOfMonthFromCalendarDate(calendarDate: string): string {
    const match = /^(\d{4})-(\d{2})/.exec(calendarDate.trim());
    if (!match) {
      return calendarDate;
    }
    return `${match[1]}-${match[2]}-01`;
  }

  searchPreBillingInvoices(request: PreBillingInvoiceSearchRequest): Observable<InvoiceResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to load the pre-billing report.');
    }

    const billingMonth = (request.billingMonth || '').trim();
    if (!billingMonth) {
      throw new Error('Billing month is required to load the pre-billing report.');
    }

    return this.http.post<InvoiceResponse[]>(`${this.controller}invoice/pre-billing/search`, {
      officeIds,
      billingMonth
    }).pipe(
      map(invoices =>
        (invoices ?? []).map(inv => this.mappingService.mapInvoiceResponse(inv as unknown as Record<string, unknown>))
      )
    );
  }

  searchMissingInvoices(request: MissingInvoiceSearchRequest): Observable<InvoiceResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to load the missing invoice report.');
    }

    return this.http.post<InvoiceResponse[]>(`${this.controller}invoice/missing/search`, {
      officeIds
    }).pipe(
      map(invoices =>
        (invoices ?? []).map(inv => this.mappingService.mapInvoiceResponse(inv as unknown as Record<string, unknown>))
      )
    );
  }

  searchReservationInvoicePreviews(request: ReservationInvoicePreviewSearchRequest): Observable<InvoiceResponse[]> {
    const reservationId = (request.reservationId || '').trim();
    if (!reservationId) {
      throw new Error('Reservation ID is required to preview invoices.');
    }

    return this.http.post<InvoiceResponse[]>(`${this.controller}invoice/reservation/preview-all/search`, {
      reservationId
    }).pipe(
      map(invoices =>
        (invoices ?? []).map(inv => this.mappingService.mapInvoiceResponse(inv as unknown as Record<string, unknown>))
      )
    );
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

  getInvoicesByReservationId(reservationId: string, officeIds: number[]): Observable<InvoiceResponse[]> {
    return this.searchInvoices({
      officeIds,
      reservationId,
      includeInactive: true,
      includePaid: true
    });
  }

  getUnpaidInvoicesByReservationId(reservationId: string, officeIds: number[]): Observable<InvoiceResponse[]> {
    return this.searchInvoices({
      officeIds,
      reservationId,
      includeInactive: true,
      includePaid: false
    });
  }

  hasUnpaidInvoicesForReservation(reservationId: string, officeIds: number[]): Observable<boolean> {
    return this.getUnpaidInvoicesByReservationId(reservationId, officeIds).pipe(
      map(invoices => (invoices?.length ?? 0) > 0)
    );
  }

  deactivateInvoice(invoiceId: string): Observable<void> {
    return this.http.put<void>(`${this.controller}invoice/${invoiceId}/deactivate`, {});
  }

  activateInvoice(invoiceId: string): Observable<void> {
    return this.http.put<void>(`${this.controller}invoice/${invoiceId}/activate`, {});
  }

  formatAssociatedInvoicesActiveChangeMessage(nextIsActive: boolean, invoicesAffected: number): string {
    const action = nextIsActive ? 'reactivated' : 'deactivated';
    const label = invoicesAffected === 1 ? 'invoice' : 'invoices';
    return `${invoicesAffected} ${label} ${action}.`;
  }

  shouldShowAssociatedInvoicesActiveChangeMessage(nextIsActive: boolean, invoicesAffected: number): boolean {
    return invoicesAffected > 0 || !nextIsActive;
  }
}
