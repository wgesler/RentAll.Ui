import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, switchMap, take, takeWhile, throwError, timer } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { GeneralLedgerService } from '../../accounting/services/general-ledger.service';
import { JournalEntrySyncJobStatus, JournalEntrySyncResult } from '../../accounting/models/journal-entry.model';
import { ConfigService } from '../../../services/config.service';
import { DocumentHealthIssue, DocumentHealthResult, DocumentHealthSummary, HealthCheckKey, TransactionChainExport, healthKeyToPaymentKindId, healthKeyToSyncType } from '../models/health.model';

@Injectable({
  providedIn: 'root'
})
export class HealthService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private generalLedgerService = inject(GeneralLedgerService);

  private readonly controller = this.configService.config().apiUrl + 'health/';

  exportTransactionChain(
    officeIds: number[] = [],
    startDate: string | null = null,
    endDate: string | null = null
  ): Observable<TransactionChainExport> {
    return this.http.post<unknown>(this.controller + 'transaction-chain/export', {
      officeIds,
      startDate,
      endDate
    }).pipe(
      map(result => this.mapTransactionChainExport(result))
    );
  }

  //#region Receipt Methods
  checkReceipts(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('receipt/check', officeIds);
  }

  fixReceipts(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('receipt/fix', officeIds);
  }
  //#endregion

  //#region Bill Methods
  checkBills(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('bill/check', officeIds);
  }

  fixBills(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('bill/fix', officeIds);
  }
  //#endregion

  //#region Work Order Methods
  checkWorkOrders(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('work-order/check', officeIds);
  }

  fixWorkOrders(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('work-order/fix', officeIds);
  }
  //#endregion

  //#region Invoice Methods
  checkInvoices(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('invoice/check', officeIds);
  }

  fixInvoices(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('invoice/fix', officeIds);
  }
  //#endregion

  //#region Payment Methods
  checkPayments(officeIds: number[] = [], paymentKindId?: number | null): Observable<DocumentHealthResult> {
    return this.http.post<unknown>(this.controller + 'payment/check', { officeIds, paymentKindId: paymentKindId ?? null }).pipe(
      map(result => this.mapDocumentHealthResult(result))
    );
  }

  checkInvoicePayments(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('payment-invoice/check', officeIds);
  }

  fixInvoicePayments(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('payment-invoice/fix', officeIds);
  }

  checkBillPayments(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('payment-bill/check', officeIds);
  }

  fixBillPayments(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('payment-bill/fix', officeIds);
  }

  checkOwnerPayments(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('payment-owner/check', officeIds);
  }

  fixOwnerPayments(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('payment-owner/fix', officeIds);
  }
  //#endregion

  //#region Deposit Methods
  checkDeposits(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('deposit/check', officeIds);
  }

  fixDeposits(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('deposit/fix', officeIds);
  }
  //#endregion

  //#region Transfer Methods
  checkTransfers(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('transfer/check', officeIds);
  }

  fixTransfers(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.postFix('transfer/fix', officeIds);
  }
  //#endregion

  //#region Document Link Methods
  checkDocumentLinks(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('document-links/check', officeIds);
  }

  repairDocumentLinks(officeIds: number[] = []): Observable<JournalEntrySyncResult> {
    return this.http.post<unknown>(this.controller + 'document-links/fix', { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result)),
      catchError(error => throwError(() => new Error(this.mapHttpError(error))))
    );
  }
  //#endregion

  //#region Manual Journal Entry Methods
  checkManualJournalEntries(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('manual-journal-entry/check', officeIds);
  }
  //#endregion

  //#region Utility Methods
  postCheck(path: string, officeIds: number[]): Observable<DocumentHealthResult> {
    return this.http.post<unknown>(this.controller + path, { officeIds }).pipe(
      map(result => this.mapDocumentHealthResult(result)),
      catchError(error => throwError(() => new Error(this.mapHttpError(error))))
    );
  }

  postFix(path: string, officeIds: number[]): Observable<JournalEntrySyncResult> {
    return this.http.post<unknown>(this.controller + path, { officeIds }).pipe(
      map(result => this.mapJournalEntrySyncResult(result)),
      catchError(error => throwError(() => new Error(this.mapHttpError(error))))
    );
  }

  startHealthFixJob(key: HealthCheckKey, officeIds: number[]): Observable<{ jobId: string }> {
    if (key === 'documentLinks') {
      return this.generalLedgerService.startDocumentLinksRepairJob(officeIds);
    }

    const syncType = healthKeyToSyncType(key);
    if (!syncType) {
      return throwError(() => new Error(`Fix is not available for: ${key}`));
    }

    return this.generalLedgerService.startDocumentTypeJournalEntrySyncJob(officeIds, syncType, [], healthKeyToPaymentKindId(key), true);
  }

  watchHealthFixJob(jobId: string): Observable<JournalEntrySyncJobStatus> {
    return timer(0, 500).pipe(
      take(1800),
      switchMap(() => this.generalLedgerService.getAllJournalEntrySyncJobStatus(jobId)),
      takeWhile(status => !status.isCompleted, true)
    );
  }

  mapHttpError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (typeof body === 'string' && body.trim().length > 0) {
        return body.trim();
      }

      if (body && typeof body === 'object') {
        const payload = body as Record<string, unknown>;
        const message = payload['message'] ?? payload['Message'] ?? payload['title'] ?? payload['detail'];
        if (message != null && String(message).trim().length > 0) {
          return String(message).trim();
        }
      }

      if (error.message.trim().length > 0) {
        return error.message.trim();
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return CommonMessage.ServiceError;
  }

  mapTransactionChainExport(raw: unknown): TransactionChainExport {
    const payload = (raw ?? {}) as Record<string, unknown>;
    const summaryRaw = payload['summary'] ?? payload['Summary'];

    return {
      chain: this.mapExportRows(payload['chain'] ?? payload['Chain']),
      invoices: this.mapExportRows(payload['invoices'] ?? payload['Invoices']),
      invoiceLines: this.mapExportRows(payload['invoiceLines'] ?? payload['InvoiceLines']),
      payments: this.mapExportRows(payload['payments'] ?? payload['Payments']),
      deposits: this.mapExportRows(payload['deposits'] ?? payload['Deposits']),
      transfers: this.mapExportRows(payload['transfers'] ?? payload['Transfers']),
      summary: summaryRaw ? this.mapExportRow(summaryRaw) : null
    };
  }

  private mapExportRows(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.map(row => this.mapExportRow(row));
  }

  private mapExportRow(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') {
      return {};
    }

    return { ...(raw as Record<string, unknown>) };
  }

  mapDocumentHealthResult(raw: unknown): DocumentHealthResult {
    const payload = (raw ?? {}) as Record<string, unknown>;
    const summaryRaw = (payload['summary'] ?? payload['Summary'] ?? {}) as Record<string, unknown>;
    const issuesRaw = (payload['issues'] ?? payload['Issues'] ?? []) as Record<string, unknown>[];

    const summary: DocumentHealthSummary = {
      section: String(summaryRaw['section'] ?? summaryRaw['Section'] ?? ''),
      documentType: String(summaryRaw['documentType'] ?? summaryRaw['DocumentType'] ?? ''),
      totalDocuments: Number(summaryRaw['totalDocuments'] ?? summaryRaw['TotalDocuments'] ?? 0),
      documentsWithJe: Number(summaryRaw['documentsWithJe'] ?? summaryRaw['DocumentsWithJe'] ?? 0),
      documentsMissingJe: Number(summaryRaw['documentsMissingJe'] ?? summaryRaw['DocumentsMissingJe'] ?? 0),
      duplicateOpenJes: Number(summaryRaw['duplicateOpenJes'] ?? summaryRaw['DuplicateOpenJes'] ?? 0),
      isClean: Boolean(summaryRaw['isClean'] ?? summaryRaw['IsClean'])
    };

    const issues: DocumentHealthIssue[] = issuesRaw.map(issue => ({
      issue: String(issue['issue'] ?? issue['Issue'] ?? ''),
      organizationId: String(issue['organizationId'] ?? issue['OrganizationId'] ?? ''),
      officeId: Number(issue['officeId'] ?? issue['OfficeId'] ?? 0),
      documentCode: String(issue['documentCode'] ?? issue['DocumentCode'] ?? ''),
      documentId: String(issue['documentId'] ?? issue['DocumentId'] ?? ''),
      relatedCode: issue['relatedCode'] != null || issue['RelatedCode'] != null
        ? String(issue['relatedCode'] ?? issue['RelatedCode'])
        : null,
      relatedId: issue['relatedId'] != null || issue['RelatedId'] != null
        ? String(issue['relatedId'] ?? issue['RelatedId'])
        : null,
      amount: issue['amount'] != null || issue['Amount'] != null
        ? Number(issue['amount'] ?? issue['Amount'])
        : null,
      transactionDate: issue['transactionDate'] != null || issue['TransactionDate'] != null
        ? String(issue['transactionDate'] ?? issue['TransactionDate'])
        : null,
      detail: issue['detail'] != null || issue['Detail'] != null
        ? String(issue['detail'] ?? issue['Detail'])
        : null,
      hasPostedJournalEntry: Boolean(issue['hasPostedJournalEntry'] ?? issue['HasPostedJournalEntry'])
    }));

    return { summary, issues };
  }

  rebuildJournalEntries(documentType: string, documentId: string, officeId: number, relatedId: string | null): Observable<JournalEntrySyncResult> {
    return this.http.post<unknown>(this.controller + 'rebuild', {
      officeId,
      documentType,
      documentId,
      relatedId
    }).pipe(
      map(result => this.mapJournalEntrySyncResult(result)),
      catchError(error => throwError(() => new Error(this.mapHttpError(error))))
    );
  }

  mapJournalEntrySyncResult(raw: unknown): JournalEntrySyncResult {
    const payload = (raw ?? {}) as Record<string, unknown>;
    const errorsRaw = (payload['errors'] ?? payload['Errors'] ?? []) as string[];
    return {
      documentsProcessed: Number(payload['documentsProcessed'] ?? payload['DocumentsProcessed'] ?? 0),
      journalEntriesCreated: Number(payload['journalEntriesCreated'] ?? payload['JournalEntriesCreated'] ?? 0),
      journalEntriesSkipped: Number(payload['journalEntriesSkipped'] ?? payload['JournalEntriesSkipped'] ?? 0),
      journalEntriesDeleted: Number(payload['journalEntriesDeleted'] ?? payload['JournalEntriesDeleted'] ?? 0),
      errors: errorsRaw.map(error => String(error))
    };
  }
  //#endregion
}
