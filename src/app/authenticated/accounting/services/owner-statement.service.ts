import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest } from '../models/owner-statement.model';
import { OwnerReportsCacheService } from './owner-reports-cache.service';
import { ReportService } from './report.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private reportService = inject(ReportService);
  private mappingService = inject(MappingService);
  private ownerReportsCacheService = inject(OwnerReportsCacheService);

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
}
