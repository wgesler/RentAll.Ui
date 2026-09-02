import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { OwnerCashReportResponse } from '../models/owner-report.model';
import { OwnerInvoiceOutstandingResponse } from '../models/owner-statement.model';
import { ReportService } from './report.service';

interface OwnerStatementListCacheCriteria {
  officeIds: number[];
  propertyId: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface OwnerStatementListCacheResponse {
  cash: OwnerCashReportResponse;
  outstandingInvoices: OwnerInvoiceOutstandingResponse[];
}

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementListCacheService {
  private reportService = inject(ReportService);
  private mappingService = inject(MappingService);

  private cashReport: OwnerCashReportResponse | null = null;
  private outstandingInvoices: OwnerInvoiceOutstandingResponse[] = [];
  private cacheCriteria: OwnerStatementListCacheCriteria | null = null;

  load(searchRequest?: MaintenanceListSearchRequest | null): Observable<OwnerStatementListCacheResponse> {
    const request = this.mappingService.mapOwnerReportSearchRequest(searchRequest);
    if (request.officeIds.length === 0) {
      this.clear();
      return new Observable(observer => {
        observer.next({
          cash: { rows: [], propertyActivityLines: [] },
          outstandingInvoices: []
        });
        observer.complete();
      });
    }

    return this.reportService.searchOwnerStatementList({
      officeIds: request.officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      tap(response => {
        this.cashReport = response.cash;
        this.outstandingInvoices = [];
        this.cacheCriteria = {
          officeIds: [...request.officeIds].sort((left, right) => left - right),
          propertyId: request.propertyId ?? null,
          startDate: request.startDate || null,
          endDate: request.endDate || null
        };
      })
    );
  }

  getCashReport(): OwnerCashReportResponse | null {
    return this.cashReport;
  }

  getOutstandingInvoices(): OwnerInvoiceOutstandingResponse[] {
    return this.outstandingInvoices;
  }

  isLoaded(): boolean {
    return this.cacheCriteria != null && this.cashReport != null;
  }

  matchesSearchRequest(searchRequest?: MaintenanceListSearchRequest | null): boolean {
    if (!this.cacheCriteria) {
      return false;
    }

    const request = this.mappingService.mapOwnerReportSearchRequest(searchRequest);
    const officeIds = [...(request.officeIds || [])].filter(id => id > 0).sort((left, right) => left - right);
    if (officeIds.length === 0
      || officeIds.length !== this.cacheCriteria.officeIds.length
      || !officeIds.every((id, index) => id === this.cacheCriteria!.officeIds[index])) {
      return false;
    }

    return (request.startDate || null) === this.cacheCriteria.startDate
      && (request.endDate || null) === this.cacheCriteria.endDate;
  }

  clear(): void {
    this.cashReport = null;
    this.outstandingInvoices = [];
    this.cacheCriteria = null;
  }
}
