import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { OwnerStatementJournalEntryLineResponse, OwnerStatementJournalEntryLineSearchRequest, OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest, OwnerStatementStartingBalanceRequest, OwnerStatementStartingBalanceResponse } from '../models/owner-statement.model';
import { JournalEntryResponse } from '../models/journal-entry.model';
import { OwnerReportsCacheService } from './owner-reports-cache.service';
import { ReportService } from './report.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private reportService = inject(ReportService);
  private mappingService = inject(MappingService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  searchOwnerStatementMonthLines(request: OwnerStatementMonthLineSearchRequest): Observable<OwnerStatementMonthLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement month lines.');
    }

    const cachedCashReport = this.ownerReportsCacheService.getCashReport();
    if (cachedCashReport) {
      return of(this.mappingService.mapOwnerCashReportToMonthLines(cachedCashReport, request));
    }

    return this.reportService.searchOwnerReports({
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(bundle => this.mappingService.mapOwnerCashReportToMonthLines(bundle.cash, request))
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

    const cachedCashReport = this.ownerReportsCacheService.getCashReport();
    if (cachedCashReport) {
      return of(this.mappingService.filterOwnerStatementPropertyActivityLines(cachedCashReport.propertyActivityLines ?? [], request));
    }

    return this.reportService.searchOwnerReports({
      officeIds,
      propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(bundle => this.mappingService.filterOwnerStatementPropertyActivityLines(bundle.cash.propertyActivityLines ?? [], request))
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

    const cachedAccrualReport = this.ownerReportsCacheService.getAccrualReport();
    if (cachedAccrualReport) {
      return of(this.mappingService.filterOwnerStatementPropertyActivityLines(cachedAccrualReport.propertyActivityLines ?? [], request));
    }

    return this.reportService.searchOwnerReports({
      officeIds,
      propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(bundle => this.mappingService.filterOwnerStatementPropertyActivityLines(bundle.accrual.propertyActivityLines ?? [], request))
    );
  }

  createOwnerStatementStartingBalance(request: OwnerStatementStartingBalanceRequest): Observable<JournalEntryResponse> {
    const ownerId = (request.ownerId || '').trim();
    const propertyId = (request.propertyId || '').trim();
    const transactionDate = (request.transactionDate || '').trim();
    if (request.officeId <= 0 || !ownerId || !propertyId || !transactionDate || Number(request.amount) === 0) {
      throw new Error('Office, owner, property, transaction date, and non-zero amount are required to create owner starting balance.');
    }

    return this.http.post<JournalEntryResponse>(`${this.controller}owner-statement/starting-balance`, {
      officeId: request.officeId,
      ownerId,
      propertyId,
      transactionDate,
      amount: Number(request.amount),
      currentPassword: (request.currentPassword || '').trim()
    });
  }

  getOwnerStatementStartingBalance(officeId: number, ownerId: string, propertyId: string): Observable<OwnerStatementStartingBalanceResponse | null> {
    const ownerIdTrimmed = (ownerId || '').trim();
    const propertyIdTrimmed = (propertyId || '').trim();
    if (officeId <= 0 || !ownerIdTrimmed || !propertyIdTrimmed) {
      throw new Error('Office, owner, and property are required to retrieve owner starting balance.');
    }

    return this.http.post<OwnerStatementStartingBalanceResponse | null>(`${this.controller}owner-statement/starting-balance/get`, {
      officeId,
      ownerId: ownerIdTrimmed,
      propertyId: propertyIdTrimmed
    });
  }
}
