import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { JournalEntryRecapSearchRequest, RecapReportResponse, TransferReportResponse, TransferReportSearchRequest } from '../models/journal-entry.model';
import { OwnerAccrualReportResponse, OwnerAccrualReportSearchRequest, OwnerCashReportResponse, OwnerCashReportSearchRequest, OwnerReportJournalEntryLineResponse, OwnerReportJournalEntryLineSearchRequest, OwnerReportsBundleResponse } from '../models/owner-report.model';
import { EscrowReportResult, EscrowReportSearchRequest, EscrowReportJournalEntryLineSearchRequest } from '../models/escrow-report.model';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);

  private readonly controller = this.configService.config().apiUrl + 'report/';

  searchJournalEntryRecap(request: JournalEntryRecapSearchRequest): Observable<RecapReportResponse> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search journal entry recap.');
    }

    const body: Record<string, unknown> = {
      officeIds,
      propertyId: request.propertyId ?? null,
      reservationId: request.reservationId ?? null,
      includeVoided: request.includeVoided,
      includeUnposted: request.includeUnposted,
      startDate: request.startDate || null,
      endDate: request.endDate || null,
      recapCategory: (request.recapCategory ?? '').trim() || ''
    };

    return this.http.post<RecapReportResponse>(`${this.controller}journal-entry-recap/search`, body).pipe(
      map(report => this.mappingService.mapRecapReportResponse(report as unknown as Record<string, unknown>))
    );
  }

  searchTransferReport(request: TransferReportSearchRequest): Observable<TransferReportResponse> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search transfer report.');
    }

    const body: Record<string, unknown> = {
      officeIds,
      propertyId: request.propertyId ?? null,
      reservationId: request.reservationId ?? null,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    return this.http.post<TransferReportResponse>(`${this.controller}transfer/search`, body).pipe(
      map(report => this.mappingService.mapTransferReportResponse(report as unknown as Record<string, unknown>))
    );
  }

  searchOwnerCashReport(request: OwnerCashReportSearchRequest): Observable<OwnerCashReportResponse> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner cash report.');
    }

    const body: Record<string, unknown> = {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    return this.http.post<OwnerCashReportResponse>(`${this.controller}owner-cash/search`, body).pipe(
      map(report => this.mappingService.mapOwnerCashReportResponse(report as unknown as Record<string, unknown>))
    );
  }

  searchOwnerAccrualReport(request: OwnerAccrualReportSearchRequest): Observable<OwnerAccrualReportResponse> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner accrual report.');
    }

    const body: Record<string, unknown> = {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    return this.http.post<OwnerAccrualReportResponse>(`${this.controller}owner-accrual/search`, body).pipe(
      map(report => this.mappingService.mapOwnerAccrualReportResponse(report as unknown as Record<string, unknown>))
    );
  }

  searchOwnerReports(request: OwnerCashReportSearchRequest): Observable<OwnerReportsBundleResponse> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner reports.');
    }

    const body: Record<string, unknown> = {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    return this.http.post<OwnerReportsBundleResponse>(`${this.controller}owner-reports/search`, body).pipe(
      map(bundle => this.mappingService.mapOwnerReportsBundleResponse(bundle as unknown as Record<string, unknown>))
    );
  }

  searchEscrowReport(request: EscrowReportSearchRequest): Observable<EscrowReportResult> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search the escrow report.');
    }

    const endDate = (request.endDate || '').trim();
    if (!endDate) {
      throw new Error('As-of date is required to search the escrow report.');
    }

    const propertyId = (request.propertyId || '').trim();
    const body: Record<string, unknown> = {
      officeIds,
      propertyId: propertyId || null,
      startDate: request.startDate || null,
      endDate,
      cushion: request.cushion ?? 0
    };

    return this.http.post<EscrowReportResult>(`${this.controller}escrow/search`, body).pipe(
      map(report => this.mappingService.mapEscrowReportResponse(report as unknown as Record<string, unknown>))
    );
  }

  searchEscrowReportJournalEntryLines(request: EscrowReportJournalEntryLineSearchRequest): Observable<OwnerReportJournalEntryLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search escrow report journal entry lines.');
    }

    const endDate = (request.endDate || '').trim();
    if (!endDate) {
      throw new Error('As-of date is required to search escrow report journal entry lines.');
    }

    return this.http.post<OwnerReportJournalEntryLineResponse[]>(`${this.controller}escrow/journal-entry-line/search`, {
      officeIds,
      propertyId: request.propertyId ?? null,
      metric: request.metric,
      endDate,
      includeUnposted: true
    }).pipe(
      map(rows => rows ?? [])
    );
  }

  searchOwnerReportJournalEntryLines(request: OwnerReportJournalEntryLineSearchRequest): Observable<OwnerReportJournalEntryLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner report journal entry lines.');
    }

    const ownerId = (request.ownerId || '').trim();
    if (!ownerId) {
      throw new Error('OwnerId is required to search owner report journal entry lines.');
    }

    return this.http.post<OwnerReportJournalEntryLineResponse[]>(`${this.controller}owner-report/journal-entry-line/search`, {
      officeIds,
      ownerId,
      propertyId: request.propertyId ?? null,
      metric: request.metric,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => rows ?? [])
    );
  }
}
