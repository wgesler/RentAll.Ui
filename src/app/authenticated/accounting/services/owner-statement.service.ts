import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { OwnerPaymentResponse, OwnerPaymentsRequest, OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerInvoiceOutstandingResponse, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest } from '../models/owner-statement.model';
import { OwnerStatementListCacheService } from './owner-statement-list-cache.service';
import { ReportService } from './report.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private reportService = inject(ReportService);
  private mappingService = inject(MappingService);
  private ownerStatementListCacheService = inject(OwnerStatementListCacheService);
  private readonly ownerPaymentUrl = this.configService.config().apiUrl + 'accounting/owner/payment';

  searchOwnerStatementMonthLines(request: OwnerStatementMonthLineSearchRequest): Observable<OwnerStatementMonthLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement month lines.');
    }

    const cachedCashReport = this.ownerStatementListCacheService.getCashReport();
    if (cachedCashReport) {
      return of(this.mappingService.mapOwnerCashReportToMonthLines(cachedCashReport, request));
    }

    return this.reportService.searchOwnerStatementList({
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(response => this.mappingService.mapOwnerCashReportToMonthLines(response.cash, request))
    );
  }

  searchOwnerStatementPropertyActivityLines(request: OwnerStatementPropertyActivityLineSearchRequest): Observable<OwnerStatementPropertyActivityLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement property activity lines.');
    }

    const propertyId = (request.propertyId || '').trim();
    if (!propertyId) {
      throw new Error('PropertyId is required to search owner statement property activity lines.');
    }

    return this.reportService.searchOwnerCashReport({
      officeIds,
      propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(report => this.mappingService.filterOwnerStatementPropertyActivityLines(report.propertyActivityLines ?? [], request))
    );
  }

  searchOwnerStatementAccrualPropertyActivityLines(request: OwnerStatementPropertyActivityLineSearchRequest): Observable<OwnerStatementPropertyActivityLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement accrual property activity lines.');
    }

    const propertyId = (request.propertyId || '').trim();
    if (!propertyId) {
      throw new Error('PropertyId is required to search owner statement accrual property activity lines.');
    }

    return this.reportService.searchOwnerAccrualReport({
      officeIds,
      propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(report => this.mappingService.filterOwnerStatementPropertyActivityLines(report.propertyActivityLines ?? [], request))
    );
  }

  searchOwnerStatementOutstandingInvoices(request: OwnerStatementPropertyActivityLineSearchRequest): Observable<OwnerInvoiceOutstandingResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement outstanding invoices.');
    }

    const propertyId = (request.propertyId || '').trim();
    if (!propertyId) {
      throw new Error('PropertyId is required to search owner statement outstanding invoices.');
    }

    const cachedOutstanding = this.ownerStatementListCacheService.getOutstandingInvoices();
    if (cachedOutstanding.length > 0) {
      return of(this.mappingService.filterOwnerStatementOutstandingInvoices(cachedOutstanding, request));
    }

    return this.reportService.searchOwnerInvoiceOutstanding({
      officeIds,
      propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => this.mappingService.filterOwnerStatementOutstandingInvoices(rows ?? [], request))
    );
  }

  applyOwnerPayments(request: OwnerPaymentsRequest): Observable<OwnerPaymentResponse> {
    return this.http.put<OwnerPaymentResponse>(this.ownerPaymentUrl, request);
  }
}
