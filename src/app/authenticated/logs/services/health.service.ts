import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { DocumentHealthIssue, DocumentHealthResult, DocumentHealthSummary } from '../models/health.model';

@Injectable({
  providedIn: 'root'
})
export class HealthService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'health/';

  //#region Receipt Methods
  checkReceipts(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('receipt/check', officeIds);
  }
  //#endregion

  //#region Bill Methods
  checkBills(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('bill/check', officeIds);
  }
  //#endregion

  //#region Work Order Methods
  checkWorkOrders(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('work-order/check', officeIds);
  }
  //#endregion

  //#region Invoice Methods
  checkInvoices(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('invoice/check', officeIds);
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

  checkBillPayments(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('payment-bill/check', officeIds);
  }

  checkOwnerPayments(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('payment-owner/check', officeIds);
  }
  //#endregion

  //#region Deposit Methods
  checkDeposits(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('deposit/check', officeIds);
  }
  //#endregion

  //#region Transfer Methods
  checkTransfers(officeIds: number[] = []): Observable<DocumentHealthResult> {
    return this.postCheck('transfer/check', officeIds);
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
      map(result => this.mapDocumentHealthResult(result))
    );
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
        : null
    }));

    return { summary, issues };
  }
  //#endregion
}
