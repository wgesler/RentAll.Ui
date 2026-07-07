import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { OwnerStatementJournalEntryLineResponse, OwnerStatementJournalEntryLineSearchRequest, OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest, OwnerStatementStartingBalanceRequest, OwnerStatementStartingBalanceResponse } from '../models/owner-statement.model';
import { JournalEntryResponse } from '../models/journal-entry.model';
import { ReportService } from './report.service';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private reportService: ReportService,
    private mappingService: MappingService
  ) {}

  searchOwnerStatementMonthLines(request: OwnerStatementMonthLineSearchRequest): Observable<OwnerStatementMonthLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement month lines.');
    }

    return this.reportService.searchOwnerCashReport({
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(report => this.mappingService.mapOwnerCashReportToMonthLines(report, request))
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
      map(report => (report.propertyActivityLines ?? []).filter(line => (line.propertyId || '').trim() === propertyId))
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
