import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import {
  OwnerStatementJournalEntryLineResponse,
  OwnerStatementJournalEntryLineSearchRequest,
  OwnerStatementPropertyActivityLineResponse,
  OwnerStatementPropertyActivityLineSearchRequest,
  OwnerStatementResponse,
  OwnerStatementSearchRequest
} from '../models/owner-statement.model';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(private http: HttpClient, private configService: ConfigService) {}

  searchOwnerStatements(request: OwnerStatementSearchRequest): Observable<OwnerStatementResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statements.');
    }

    return this.http.post<OwnerStatementResponse[]>(`${this.controller}owner-statement/search`, {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => rows ?? [])
    );
  }

  searchOwnerStatementJournalEntryLines(request: OwnerStatementJournalEntryLineSearchRequest): Observable<OwnerStatementJournalEntryLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement journal entry lines.');
    }

    const ownerId = (request.ownerId || '').trim();
    if (!ownerId) {
      throw new Error('OwnerId is required to search owner statement journal entry lines.');
    }

    return this.http.post<OwnerStatementJournalEntryLineResponse[]>(`${this.controller}owner-statement/line/search`, {
      officeIds,
      ownerId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => rows ?? [])
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

    return this.http.post<OwnerStatementPropertyActivityLineResponse[]>(`${this.controller}owner-statement/property-line/search`, {
      officeIds,
      propertyId,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => rows ?? [])
    );
  }
}
