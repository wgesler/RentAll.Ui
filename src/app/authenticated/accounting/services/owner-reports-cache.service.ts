import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceListSearchRequest } from '../../maintenance/models/maintenance-search.model';
import { EscrowReportResult } from '../models/escrow-report.model';
import { JournalEntryRecapSearchRequest, RecapReportResponse } from '../models/journal-entry.model';
import { OwnerAccrualReportResponse, OwnerCashReportResponse, OwnerReportSearchRequest, OwnerReportsBundleResponse } from '../models/owner-report.model';
import { ReportService } from './report.service';

interface OwnerReportsCacheCriteria {
  officeIds: number[];
  propertyId: string | null;
  startDate: string | null;
  endDate: string | null;
}

const emptyEscrowReport = (): EscrowReportResult => ({
  reportTitle: 'Escrow Report',
  periodLabel: '',
  entityLineLabel: null,
  rows: [],
  totals: {
    arBalance: 0,
    prepaids: 0,
    notCollected: 0,
    total: 0,
    e2: 0
  },
  cushion: 0,
  escrowBankBalance: 0,
  escrowBankAccountLabel: 'Escrow Owners',
  transfer: 0
});

@Injectable({
  providedIn: 'root'
})
export class OwnerReportsCacheService {
  private reportService = inject(ReportService);
  private mappingService = inject(MappingService);

  private cashReport: OwnerCashReportResponse | null = null;
  private accrualReport: OwnerAccrualReportResponse | null = null;
  private recapReport: RecapReportResponse | null = null;
  private escrowReport: EscrowReportResult | null = null;
  private cacheCriteria: OwnerReportsCacheCriteria | null = null;

  load(searchRequest?: MaintenanceListSearchRequest | null): Observable<OwnerReportsBundleResponse> {
    const request = this.mappingService.mapOwnerReportSearchRequest(searchRequest);
    if (request.officeIds.length === 0) {
      this.clear();
      return new Observable(observer => {
        observer.next({
          cash: { rows: [], propertyActivityLines: [] },
          accrual: { rows: [], propertyActivityLines: [] },
          recap: { rows: [] },
          escrow: emptyEscrowReport()
        });
        observer.complete();
      });
    }

    return this.reportService.searchOwnerReports(request).pipe(
      tap(bundle => {
        this.cashReport = bundle.cash;
        this.accrualReport = bundle.accrual;
        this.recapReport = bundle.recap;
        this.escrowReport = bundle.escrow;
        this.cacheCriteria = {
          officeIds: [...request.officeIds].sort((left, right) => left - right),
          propertyId: (request.propertyId || '').trim() || null,
          startDate: request.startDate || null,
          endDate: request.endDate || null
        };
      })
    );
  }

  getCashReport(): OwnerCashReportResponse | null {
    return this.cashReport;
  }

  getAccrualReport(): OwnerAccrualReportResponse | null {
    return this.accrualReport;
  }

  getRecapReport(): RecapReportResponse | null {
    return this.recapReport;
  }

  getEscrowReport(): EscrowReportResult | null {
    return this.escrowReport;
  }

  isBundleLoaded(): boolean {
    return this.cacheCriteria != null
      && (this.cashReport != null
        || this.accrualReport != null
        || this.recapReport != null
        || this.escrowReport != null);
  }

  getBundleSearchRequest(): OwnerReportSearchRequest | null {
    if (!this.cacheCriteria) {
      return null;
    }

    return {
      officeIds: [...this.cacheCriteria.officeIds],
      propertyId: this.cacheCriteria.propertyId,
      startDate: this.cacheCriteria.startDate,
      endDate: this.cacheCriteria.endDate
    };
  }

  matchesOwnerReportSearchRequest(request: OwnerReportSearchRequest): boolean {
    if (!this.cacheCriteria) {
      return false;
    }

    const officeIds = [...(request.officeIds || [])].filter(id => id > 0).sort((left, right) => left - right);
    if (officeIds.length === 0) {
      return false;
    }

    if (officeIds.length !== this.cacheCriteria.officeIds.length
      || !officeIds.every((id, index) => id === this.cacheCriteria!.officeIds[index])) {
      return false;
    }

    const propertyId = (request.propertyId || '').trim() || null;
    if (propertyId !== this.cacheCriteria.propertyId) {
      return false;
    }

    const startDate = request.startDate || null;
    const endDate = request.endDate || null;
    return startDate === this.cacheCriteria.startDate && endDate === this.cacheCriteria.endDate;
  }

  matchesRecapSearchRequest(request: JournalEntryRecapSearchRequest): boolean {
    if (!this.cacheCriteria || !this.recapReport) {
      return false;
    }

    if ((request.recapCategory || '').trim()) {
      return false;
    }

    if (request.includeVoided) {
      return false;
    }

    if (!request.includeUnposted) {
      return false;
    }

    const officeIds = [...(request.officeIds || [])].filter(id => id > 0).sort((left, right) => left - right);
    if (officeIds.length === 0) {
      return false;
    }

    if (!officeIds.every(id => this.cacheCriteria!.officeIds.includes(id))) {
      return false;
    }

    const propertyId = (request.propertyId || '').trim() || null;
    if (propertyId !== this.cacheCriteria.propertyId) {
      return false;
    }

    const startDate = request.startDate || null;
    const endDate = request.endDate || null;
    return startDate === this.cacheCriteria.startDate && endDate === this.cacheCriteria.endDate;
  }

  clear(): void {
    this.cashReport = null;
    this.accrualReport = null;
    this.recapReport = null;
    this.escrowReport = null;
    this.cacheCriteria = null;
  }
}
