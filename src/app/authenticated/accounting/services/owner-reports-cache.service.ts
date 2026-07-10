import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { OwnerAccrualReportResponse, OwnerCashReportResponse, OwnerReportsBundleResponse } from '../models/owner-report.model';
import { ReportService } from './report.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerReportsCacheService {
  private cashReport: OwnerCashReportResponse | null = null;
  private accrualReport: OwnerAccrualReportResponse | null = null;

  constructor(
    private reportService: ReportService,
    private mappingService: MappingService
  ) {}

  load(searchRequest?: MaintenanceListSearchRequest | null): Observable<OwnerReportsBundleResponse> {
    const request = this.mappingService.mapOwnerReportSearchRequest(searchRequest);
    if (request.officeIds.length === 0) {
      this.clear();
      return new Observable(observer => {
        observer.next({ cash: { rows: [], propertyActivityLines: [] }, accrual: { rows: [], propertyActivityLines: [] } });
        observer.complete();
      });
    }

    return this.reportService.searchOwnerReports(request).pipe(
      tap(bundle => {
        this.cashReport = bundle.cash;
        this.accrualReport = bundle.accrual;
      })
    );
  }

  getCashReport(): OwnerCashReportResponse | null {
    return this.cashReport;
  }

  getAccrualReport(): OwnerAccrualReportResponse | null {
    return this.accrualReport;
  }

  clear(): void {
    this.cashReport = null;
    this.accrualReport = null;
  }
}
