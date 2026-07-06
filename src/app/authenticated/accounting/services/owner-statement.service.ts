import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { OwnerStatementJournalEntryLineResponse, OwnerStatementJournalEntryLineSearchRequest, OwnerStatementMonthLineResponse, OwnerStatementMonthLineSearchRequest, OwnerStatementPropertyActivityLineResponse, OwnerStatementPropertyActivityLineSearchRequest, OwnerStatementResponse, OwnerStatementSearchRequest, OwnerStatementSearchResponse, OwnerStatementStartingBalanceRequest, OwnerStatementStartingBalanceResponse } from '../models/owner-statement.model';
import { JournalEntryResponse } from '../models/journal-entry.model';

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(private http: HttpClient, private configService: ConfigService) {}

  searchOwnerStatements(request: OwnerStatementSearchRequest): Observable<OwnerStatementSearchResponse> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statements.');
    }

    return this.http.post<OwnerStatementSearchResponse>(`${this.controller}owner-statement/search`, {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(response => ({
        summaries: response?.summaries ?? [],
        propertyActivityLines: response?.propertyActivityLines ?? []
      }))
    );
  }

  searchOwnerStatementMonthLines(request: OwnerStatementMonthLineSearchRequest): Observable<OwnerStatementMonthLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search owner statement month lines.');
    }

    return this.http.post<OwnerStatementMonthLineResponse[]>(`${this.controller}owner-statement/month-line/search`, {
      officeIds,
      propertyId: request.propertyId ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
      map(rows => rows ?? []),
      catchError(() =>
        this.searchOwnerStatements(request).pipe(
          map(response => this.mapOwnerStatementsToMonthLines(response.summaries, request))
        )
      )
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
      propertyId: request.propertyId ?? null,
      metric: request.metric,
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

  private mapOwnerStatementsToMonthLines(rows: OwnerStatementResponse[], request: OwnerStatementMonthLineSearchRequest): OwnerStatementMonthLineResponse[] {
    const monthDate = request.endDate ?? request.startDate ?? '';
    return (rows || []).map(row => {
      const ownerId = (row.ownerId || '').trim();
      const propertyId = (row.propertyId || '').trim();
      const ownerStatementLineId = [row.officeId, ownerId, propertyId, monthDate].join('|');
      return {
        ownerStatementLineId,
        officeId: row.officeId,
        officeName: row.officeName,
        ownerId,
        ownerName: row.ownerName,
        propertyId,
        propertyCode: row.propertyCode,
        monthDate,
        expected: row.expected,
        prePaid: row.prePaid,
        paidIncome: row.paidIncome,
        outstanding: row.outstanding,
        startingBalance: row.startingBalance,
        income: row.income,
        expenses: row.expenses,
        balance: row.balance,
        ownerPayment: row.ownerPayment,
        endingBalance: row.endingBalance,
        workingCapital: row.workingCapital,
        workingCapitalBalanceDue: row.workingCapitalBalanceDue
      };
    });
  }
}
