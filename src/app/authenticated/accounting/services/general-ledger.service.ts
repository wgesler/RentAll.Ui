import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { JournalEntryLineSearchRequest, JournalEntryLineSearchResponse, JournalEntryRequest, JournalEntryResponse, JournalEntrySyncRequest, JournalEntrySyncResult, StartJournalEntrySyncJobResponse, JournalEntrySyncJobStatus, CloseAccountingPeriodRequest, CloseAccountingPeriodResult } from '../models/journal-entry.model';
import { CompleteReconcileRequest, SaveReconcileMarksRequest } from '../models/reconcile.model';
import { ChartOfAccountResponse } from '../models/chart-of-accounts.model';

@Injectable({
  providedIn: 'root'
})
export class GeneralLedgerService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/';

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

    if (request.unclearedOnly) {
      body['unclearedOnly'] = true;
    }

    if (request.includeCashOnly) {
      body['includeCashOnly'] = true;
    }

    if (request.excludeBeforeOwnerStartingBalance) {
      body['excludeBeforeOwnerStartingBalance'] = true;
    }

    return this.http.post<JournalEntryLineSearchResponse[]>(`${this.controller}journal-entry-line/search`, body).pipe(
      map(lines => (lines ?? []).map(line => this.mappingService.mapJournalEntryLineSearchResponse(line as unknown as Record<string, unknown>)))
    );
  }

  searchReconcileJournalEntryLines(officeId: number, chartOfAccountId: number, statementDate?: string | null): Observable<JournalEntryLineSearchResponse[]> {
    // IsCleared = 0 and IsCleared = 1 both return. Only ClearedOn excludes a line from this list.
    return this.http.post<JournalEntryLineSearchResponse[]>(`${this.controller}journal-entry-line/reconcile/lines`, {
      officeId,
      chartOfAccountId,
      statementDate: statementDate || null
    }).pipe(
      map(lines => (lines ?? []).map(line => this.mappingService.mapJournalEntryLineSearchResponse(line as unknown as Record<string, unknown>)))
    );
  }

  getReconcileBeginningBalance(officeId: number, chartOfAccountId: number, statementDate?: string | null): Observable<number> {
    return this.http.post<{ beginningBalance?: number; BeginningBalance?: number }>(
      `${this.controller}journal-entry-line/reconcile/beginning-balance`,
      {
        officeId,
        chartOfAccountId,
        statementDate: statementDate || null
      }
    ).pipe(
      map(response => Number(response?.beginningBalance ?? response?.BeginningBalance ?? 0))
    );
  }

  saveReconcileMarks(request: SaveReconcileMarksRequest): Observable<void> {
    return this.http.put<void>(`${this.controller}journal-entry-line/reconcile/marks`, request);
  }

  completeReconcile(request: CompleteReconcileRequest): Observable<ChartOfAccountResponse> {
    return this.http.put<ChartOfAccountResponse>(`${this.controller}journal-entry-line/reconcile/complete`, request);
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

  postJournalEntry(journalEntryId: string, accountingPeriod?: string | null): Observable<JournalEntryResponse> {
    const body = accountingPeriod?.trim() ? { accountingPeriod: accountingPeriod.trim() } : {};
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/post`, body).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  unpostJournalEntry(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/unpost`, {}).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  softCloseJournalEntry(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/soft-close`, {}).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  hardCloseJournalEntry(journalEntryId: string): Observable<JournalEntryResponse> {
    return this.http.put<JournalEntryResponse>(`${this.controller}journal-entry/${journalEntryId}/hard-close`, {}).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
  }

  closeAccountingPeriod(request: CloseAccountingPeriodRequest): Observable<CloseAccountingPeriodResult> {
    return this.http.post<CloseAccountingPeriodResult>(`${this.controller}journal-entry/close-period`, {
      officeId: Number(request.officeId) || 0,
      startDate: this.utilityService.toDateOnlyJsonString(request.startDate) ?? request.startDate,
      endDate: this.utilityService.toDateOnlyJsonString(request.endDate) ?? request.endDate,
      postingStatusId: Number(request.postingStatusId) || 0,
      journalEntryIds: (request.journalEntryIds ?? []).filter(id => (id || '').trim().length > 0)
    }).pipe(
      map(result => this.mapCloseAccountingPeriodResult(result))
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

  previewRetainedEarningsJournalEntry(officeId: number, fiscalYearEndYear = 2024): Observable<JournalEntryResponse> {
    return this.http.post<JournalEntryResponse>(`${this.controller}retained-earnings/journal-entry/preview`, {
      officeId: Number(officeId) || 0,
      fiscalYearEndYear: Number(fiscalYearEndYear) || 2024
    }).pipe(
      map(dto => this.mappingService.mapJournalEntryResponse(dto as unknown as Record<string, unknown>))
    );
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

  startAllJournalEntrySyncJob(request: JournalEntrySyncRequest): Observable<StartJournalEntrySyncJobResponse> {
    return this.http.post<StartJournalEntrySyncJobResponse>(`${this.controller}journal-entry/sync/all/start`, {
      officeIds: request.officeIds ?? [],
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(
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

  mapJournalEntrySyncResult(result: JournalEntrySyncResult): JournalEntrySyncResult {
    return {
      documentsProcessed: Number(result?.documentsProcessed ?? 0),
      journalEntriesCreated: Number(result?.journalEntriesCreated ?? 0),
      journalEntriesSkipped: Number(result?.journalEntriesSkipped ?? 0),
      journalEntriesDeleted: Number(result?.journalEntriesDeleted ?? 0),
      errors: result?.errors ?? []
    };
  }

  mapCloseAccountingPeriodResult(result: CloseAccountingPeriodResult | Record<string, unknown>): CloseAccountingPeriodResult {
    return {
      successCount: Number(result['successCount'] ?? result['SuccessCount'] ?? 0),
      failedCount: Number(result['failedCount'] ?? result['FailedCount'] ?? 0),
      closedDateId: result['closedDateId'] ?? result['ClosedDateId'] ?? null,
      errors: (result['errors'] ?? result['Errors'] ?? []) as string[]
    };
  }

  normalizeJournalEntryRequest(journalEntry: JournalEntryRequest): JournalEntryRequest {
    const transactionDate = this.utilityService.toDateOnlyJsonString(journalEntry.transactionDate) ?? journalEntry.transactionDate;
    const accountingPeriod = this.utilityService.toDateOnlyJsonString(journalEntry.accountingPeriod) ?? journalEntry.accountingPeriod;
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
      accountingPeriod,
      memo: journalEntry.memo?.trim() || null,
      sourceTypeId: journalEntry.sourceTypeId ?? null,
      sourceId: journalEntry.sourceId || null,
      postingStatusId: Number(journalEntry.postingStatusId ?? 0),
      isCashOnly: journalEntry.isCashOnly === true,
      journalEntryLines
    };
  }
}
