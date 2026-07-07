import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { JournalEntryRecapSearchRequest, RecapReportResponse } from '../models/journal-entry.model';
import { OwnerAccrualReportResponse, OwnerAccrualReportSearchRequest, OwnerCashReportResponse, OwnerCashReportSearchRequest, OwnerReportJournalEntryLineResponse, OwnerReportJournalEntryLineSearchRequest } from '../models/owner-report.model';

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly controller = this.configService.config().apiUrl + 'report/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private mappingService: MappingService
  ) {}

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
