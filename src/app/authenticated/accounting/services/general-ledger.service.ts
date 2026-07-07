import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { JournalEntryLineSearchRequest, JournalEntryLineSearchResponse, JournalEntryRecapLineResponse, JournalEntryRecapSearchRequest, JournalEntryRequest, JournalEntryResponse, JournalEntrySyncResult, DepositRequest, DepositResponse, StartJournalEntrySyncJobResponse, JournalEntrySyncJobStatus } from '../models/journal-entry.model';

@Injectable({
  providedIn: 'root'
})
export class GeneralLedgerService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private mappingService: MappingService,
    private utilityService: UtilityService) {
  }

  searchJournalEntryRecap(request: JournalEntryRecapSearchRequest): Observable<JournalEntryRecapLineResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search journal entry recap lines.');
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

    return this.http.post<JournalEntryRecapLineResponse[]>(`${this.controller}journal-entry-recap/search`, body).pipe(
      map(lines => (lines ?? []).map(line => this.mappingService.mapJournalEntryRecapLineResponse(line as unknown as Record<string, unknown>)))
    );
  }

  searchJournalEntryLines(request: JournalEntryLineSearchRequest): Observable<JournalEntryLineSearchResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to search journal entry lines.');
    }

    const chartOfAccountId = request.chartOfAccountId != null && request.chartOfAccountId > 0
      ? request.chartOfAccountId
      : null;

    const body: Record<string, unknown> = {
      officeIds,
      sourceTypeId: request.sourceTypeId ?? null,
      sourceId: request.sourceId ?? null,
      reservationId: request.reservationId ?? null,
      propertyId: request.propertyId ?? null,
      contactId: request.contactId ?? null,
      includeVoided: request.includeVoided,
      includeUnposted: request.includeUnposted,
      startDate: request.startDate || null,
      endDate: request.endDate || null
    };

    if (chartOfAccountId != null) {
      body['chartOfAccountId'] = chartOfAccountId;
    }

    return this.http.post<JournalEntryLineSearchResponse[]>(`${this.controller}journal-entry-line/search`, body).pipe(
      map(lines => (lines ?? []).map(line => this.mappingService.mapJournalEntryLineSearchResponse(line as unknown as Record<string, unknown>)))
    );
  }

  getJournalEntryById(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.get<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}`).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  getJournalEntryByCode(journalEntryCode: string): Observable<JournalEntryResponse> {
    const code = journalEntryCode?.trim();
    if (!code) {
      throw new Error('Journal entry code is required.');
    }

    return this.http.get<JournalEntryResponse>(`${this.controller}journal-entry/code/${encodeURIComponent(code)}`).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  createJournalEntry(journalEntry: JournalEntryRequest): Observable<JournalEntryResponse> {
    return this.http.post<JournalEntryResponse>(`${this.controller}journal-entry`, this.normalizeJournalEntryRequest(journalEntry)).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  updateJournalEntry(journalEntry: JournalEntryRequest): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry`, this.normalizeJournalEntryRequest(journalEntry)).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  postJournalEntry(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/post`, {}).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  unpostJournalEntry(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/unpost`, {}).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  voidJournalEntry(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/void`, {}).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  deleteJournalEntry(journalEntryId: string): Observable<void> {
    return this.http.delete<void>(`${this.controller}journal-entry/${journalEntryId}`);
  }

  syncInvoiceJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/sync/invoices`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  clearInvoiceJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/clear/invoices`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  syncBillJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/sync/bills`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  clearBillJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/clear/bills`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  syncReceiptJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/sync/receipts`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  syncWorkOrderJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/sync/work-orders`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  startAllJournalEntrySyncJob(officeIds: number[]): Observable<StartJournalEntrySyncJobResponse> {
    return this.http.post<StartJournalEntrySyncJobResponse>(`${this.controller}journal-entry/sync/all/start`, { officeIds }).pipe(
      map(response => ({
        jobId: String(response?.jobId ?? '')
      }))
    );
  }

  getAllJournalEntrySyncJobStatus(jobId: string): Observable<JournalEntrySyncJobStatus> {
    return this.http.get<JournalEntrySyncJobStatus>(`${this.controller}journal-entry/sync/all/status/${encodeURIComponent(jobId)}`).pipe(
      map(status => ({
        jobId: String(status?.jobId ?? ''),
        isRunning: Boolean(status?.isRunning),
        isCompleted: Boolean(status?.isCompleted),
        message: status?.message ?? null,
        types: (status?.types ?? []).map(row => ({
          type: String(row?.type ?? ''),
          label: String(row?.label ?? ''),
          total: Number(row?.total ?? 0),
          processed: Number(row?.processed ?? 0),
          skipped: Number(row?.skipped ?? 0),
          errors: Number(row?.errors ?? 0),
          status: String(row?.status ?? 'Pending')
        }))
      }))
    );
  }

  clearReceiptJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/clear/receipts`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  clearAllJournalEntries(officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<JournalEntrySyncResult>(`${this.controller}journal-entry/clear/all`, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result))
    );
  }

  makeDeposit(request: DepositRequest): Observable<DepositResponse> {
    return this.http.put<DepositResponse>(`${this.controller}deposit`, {
      officeId: request.officeId,
      depositDate: request.depositDate,
      chartOfAccountId: request.chartOfAccountId,
      description: request.description?.trim() || '',
      amount: request.amount,
      journalEntryLineIds: request.journalEntryLineIds
    }).pipe(
      map(response => ({
        journalEntry: this.mappingService.mapJournalEntryResponse(response?.journalEntry as unknown as Record<string, unknown>)
      }))
    );
  }

  mapJournalEntrySyncResult(result: JournalEntrySyncResult): JournalEntrySyncResult {
    return {
      documentsProcessed: Number(result?.documentsProcessed ?? 0),
      journalEntriesCreated: Number(result?.journalEntriesCreated ?? 0),
      journalEntriesSkipped: Number(result?.journalEntriesSkipped ?? 0),
      journalEntriesDeleted: Number(result?.journalEntriesDeleted ?? 0),
      errors: result?.errors ?? []
    };
  }

  normalizeJournalEntryRequest(journalEntry: JournalEntryRequest): JournalEntryRequest {
    const transactionDate = this.utilityService.toDateOnlyJsonString(journalEntry.transactionDate) ?? journalEntry.transactionDate;
    const postingDate = this.utilityService.toDateOnlyJsonString(journalEntry.postingDate) ?? journalEntry.postingDate;
    const journalEntryLines = (journalEntry.journalEntryLines ?? []).map(line => ({
      ...line,
      chartOfAccountId: Number(line.chartOfAccountId) || 0,
      costCodeId: line.costCodeId ?? null,
      propertyId: line.propertyId || null,
      reservationId: line.reservationId || null,
      contactId: line.contactId || null,
      debit: Number(line.debit) || 0,
      credit: Number(line.credit) || 0,
      memo: line.memo?.trim() || null
    }));

    return {
      ...journalEntry,
      transactionDate,
      postingDate,
      memo: journalEntry.memo?.trim() || null,
      sourceTypeId: journalEntry.sourceTypeId ?? null,
      sourceId: journalEntry.sourceId || null,
      journalEntryLines
    };
  }
}
