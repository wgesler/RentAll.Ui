import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { catchError, filter, finalize, map, Observable, of, Subject, switchMap, take, takeUntil, tap, throwError, timeout, timer } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { GeneralLedgerService } from '../../accounting/services/general-ledger.service';
import { JournalEntrySyncJobStatus, JournalEntrySyncResult } from '../../accounting/models/journal-entry.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DocumentHealthIssue, DocumentHealthResult, FixAllOutcome, HealthCheckKey, HealthCheckRowState, HealthFixSyncType, HealthIssueDisplayRow, healthKeyToPaymentKindId, healthKeyToSyncType, resolveHealthFixDocumentIds } from '../models/health.model';
import { DocumentHealthStateService } from '../services/document-health-state.service';
import { HealthService } from '../services/health.service';

@Component({
  standalone: true,
  selector: 'app-document-health',
  templateUrl: './document-health.component.html',
  styleUrl: './document-health.component.scss',
  imports: [CommonModule, MaterialModule, DataTableComponent]
})
export class DocumentHealthComponent implements OnInit, OnDestroy {
  @ViewChild('resultsPanel') resultsPanel?: ElementRef<HTMLElement>;

  private healthService = inject(HealthService);
  private healthStateService = inject(DocumentHealthStateService);
  private generalLedgerService = inject(GeneralLedgerService);
  private officeService = inject(OfficeService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  readonly officeIds: number[] = [];
  readonly fixPollIntervalMs = 500;
  readonly fixPollMaxAttempts = 3600;

  organizationId = '';
  offices: OfficeResponse[] = [];

  rows: HealthCheckRowState[] = [
    { key: 'receipt', label: 'Receipts', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'bill', label: 'Bills', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'workOrder', label: 'Work Orders', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'invoice', label: 'Invoices', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'paymentInvoice', label: 'Payments (Invoice)', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'paymentBill', label: 'Payments (Bill)', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'paymentOwner', label: 'Payments (Owner)', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'deposit', label: 'Deposits', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'transfer', label: 'Transfers', canFix: true, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null },
    { key: 'manualJournalEntry', label: 'Manual Journal Entries', canFix: false, checking: false, fixing: false, fixProgress: null, summary: null, issues: [], errorMessage: null }
  ];

  activeRowKey: HealthCheckKey | null = null;
  issueRows: HealthIssueDisplayRow[] = [];
  isCheckingAll = false;
  isFixingAll = false;
  showIssueHint = false;
  unresolvedHint = '';

  issueColumns: ColumnSet = {
    issue: { displayAs: 'Issue', maxWidth: '24ch' },
    documentCode: { displayAs: 'Document', maxWidth: '14ch' },
    relatedCode: { displayAs: 'Related', maxWidth: '14ch' },
    officeNameDisplay: { displayAs: 'Office', maxWidth: '20ch' },
    amountDisplay: { displayAs: 'Amount', maxWidth: '12ch' },
    transactionDateDisplay: { displayAs: 'Date', maxWidth: '12ch' },
    detail: { displayAs: 'Detail', maxWidth: '40ch' }
  };

  //#region Document-Health
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.restoreSessionState();

    if (!this.organizationId) {
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices;
          this.refreshIssueRowOfficeNames();
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isRowBusy(row: HealthCheckRowState): boolean {
    return row.checking || row.fixing;
  }

  checkRow(row: HealthCheckRowState): void {
    this.patchRow(row.key, { checking: true, errorMessage: null });
    this.runCheck(row.key).pipe(take(1), finalize(() => {
      this.patchRow(row.key, { checking: false });
    })).subscribe({
      next: result => this.applyCheckSummary(row.key, result, true, row.canFix),
      error: () => {
        this.patchRow(row.key, { errorMessage: CommonMessage.ServiceError });
        this.toastr.error(CommonMessage.ServiceError, row.label);
      }
    });
  }

  fixRow(row: HealthCheckRowState): void {
    if (!row.canFix) {
      return;
    }

    this.patchRow(row.key, { fixing: true, fixProgress: 'Checking…', errorMessage: null });
    this.clearUnresolvedDisplay();

    this.runFixAndCheck(row.key, row.issues).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => this.patchRow(row.key, { fixing: false, fixProgress: null }))
    ).subscribe({
      next: ({ syncResult, checkResult }) => {
        this.applyCheckSummary(row.key, checkResult, false, row.canFix);
        this.handleFixOutcome(row.key, row.label, syncResult, checkResult);
      },
      error: () => {
        this.patchRow(row.key, { fixing: false, fixProgress: null, errorMessage: CommonMessage.ServiceError });
        this.toastr.error(CommonMessage.ServiceError, row.label);
      }
    });
  }

  checkAll(): void {
    if (this.isCheckingAll) {
      return;
    }

    this.clearUnresolvedDisplay();
    this.isCheckingAll = true;
    let index = 0;

    const runNext = (): void => {
      if (index >= this.rows.length) {
        this.isCheckingAll = false;
        this.cdr.markForCheck();
        return;
      }

      const row = this.rows[index++];
      this.patchRow(row.key, { checking: true, errorMessage: null });
      this.runCheck(row.key).pipe(take(1), finalize(() => {
        this.patchRow(row.key, { checking: false });
        runNext();
      })).subscribe({
        next: result => this.applyCheckSummary(row.key, result, false, row.canFix),
        error: () => {
          this.patchRow(row.key, { errorMessage: CommonMessage.ServiceError });
          runNext();
        }
      });
    };

    runNext();
  }

  fixAll(): void {
    if (this.isBulkBusy) {
      return;
    }

    const fixableRows = this.rows.filter(row => row.canFix);
    if (fixableRows.length === 0) {
      return;
    }

    this.clearUnresolvedDisplay();
    this.isFixingAll = true;
    const fixedKeys = new Set<HealthCheckKey>();
    let index = 0;
    const outcomes: FixAllOutcome[] = [];

    const runNext = (): void => {
      if (index >= fixableRows.length) {
        this.isFixingAll = false;
        this.applyFixAllOutcome(outcomes);
        this.cdr.markForCheck();
        return;
      }

      const row = fixableRows[index++];
      const rowIsClean = row.summary?.isClean === true;
      const skipSyncBecauseDeduped = fixedKeys.has(row.key);
      const skipSync = rowIsClean || skipSyncBecauseDeduped;
      if (!skipSync) {
        fixedKeys.add(row.key);
      }

      this.patchRow(row.key, {
        fixing: !skipSync,
        fixProgress: skipSync ? null : 'Starting…',
        errorMessage: null
      });

      const pipeline = skipSync
        ? (rowIsClean
          ? of({
              syncResult: this.emptySyncResult(),
              checkResult: { summary: row.summary!, issues: row.issues ?? [] }
            })
          : this.runCheck(row.key).pipe(map(checkResult => ({
              syncResult: this.emptySyncResult(),
              checkResult
            }))))
        : this.runFixAndCheck(row.key, row.issues);

      pipeline.pipe(take(1), takeUntil(this.destroy$), finalize(() => {
        this.patchRow(row.key, { fixing: false, fixProgress: null });
        runNext();
      })).subscribe({
        next: ({ syncResult, checkResult }) => {
          this.applyCheckSummary(row.key, checkResult, false, row.canFix);
          outcomes.push({
            key: row.key,
            label: row.label,
            syncResult,
            checkResult
          });
        },
        error: () => {
          this.patchRow(row.key, { errorMessage: CommonMessage.ServiceError });
          outcomes.push({
            key: row.key,
            label: row.label,
            syncResult: { documentsProcessed: 0, journalEntriesCreated: 0, journalEntriesSkipped: 0, journalEntriesDeleted: 0, errors: [CommonMessage.ServiceError] },
            checkResult: { summary: { section: '', documentType: row.label, totalDocuments: 0, documentsWithJe: 0, documentsMissingJe: 0, duplicateOpenJes: 0, isClean: false }, issues: [] }
          });
        }
      });
    };

    runNext();
  }
  //#endregion

  //#region Data Loading Methods
  runCheck(key: HealthCheckKey): Observable<DocumentHealthResult> {
    const officeIds = this.officeIds;
    switch (key) {
      case 'receipt':
        return this.healthService.checkReceipts(officeIds);
      case 'bill':
        return this.healthService.checkBills(officeIds);
      case 'workOrder':
        return this.healthService.checkWorkOrders(officeIds);
      case 'invoice':
        return this.healthService.checkInvoices(officeIds);
      case 'paymentInvoice':
        return this.healthService.checkInvoicePayments(officeIds);
      case 'paymentBill':
        return this.healthService.checkBillPayments(officeIds);
      case 'paymentOwner':
        return this.healthService.checkOwnerPayments(officeIds);
      case 'deposit':
        return this.healthService.checkDeposits(officeIds);
      case 'transfer':
        return this.healthService.checkTransfers(officeIds);
      case 'manualJournalEntry':
        return this.healthService.checkManualJournalEntries(officeIds);
      default:
        throw new Error(`Unknown health check key: ${key}`);
    }
  }

  runFix(key: HealthCheckKey, documentIds: string[]): Observable<JournalEntrySyncResult> {
    const syncType = healthKeyToSyncType(key);
    if (!syncType) {
      return throwError(() => new Error(`Fix is not available for: ${key}`));
    }

    if (documentIds.length === 0) {
      return of(this.emptySyncResult());
    }

    const officeIds = this.officeIds;
    const paymentKindId = healthKeyToPaymentKindId(key);
    return this.generalLedgerService.startDocumentTypeJournalEntrySyncJob(
      officeIds,
      syncType,
      documentIds,
      paymentKindId,
      true
    ).pipe(
      switchMap(start => {
        if (!start.jobId) {
          return throwError(() => new Error('Sync job did not return an ID.'));
        }

        return this.pollDocumentTypeSyncJob(start.jobId, syncType, key);
      })
    );
  }

  pollDocumentTypeSyncJob(jobId: string, syncType: HealthFixSyncType, rowKey: HealthCheckKey): Observable<JournalEntrySyncResult> {
    return timer(0, this.fixPollIntervalMs).pipe(
      take(this.fixPollMaxAttempts),
      switchMap(() => this.generalLedgerService.getAllJournalEntrySyncJobStatus(jobId)),
      tap(status => this.updateFixProgress(rowKey, status, syncType)),
      filter(status => status.isCompleted),
      take(1),
      map(status => this.mapJobStatusToSyncResult(status, syncType)),
      timeout(this.fixPollIntervalMs * this.fixPollMaxAttempts + 5000),
      catchError(() => throwError(() => new Error('Fix timed out while waiting for sync to finish.')))
    );
  }

  updateFixProgress(rowKey: HealthCheckKey, status: JournalEntrySyncJobStatus, syncType: HealthFixSyncType): void {
    const typeStatus = status.types.find(row => row.type === syncType) ?? status.types[0];
    if (!typeStatus) {
      this.patchRow(rowKey, { fixProgress: status.message ?? 'Fixing…' });
      return;
    }

    const total = typeStatus.total ?? 0;
    const processed = typeStatus.processed ?? 0;
    const label = typeStatus.status || 'Running';
    const progress = total > 0
      ? `${label} ${processed}/${total}`
      : (status.message ?? label);

    this.patchRow(rowKey, { fixProgress: progress });
  }

  mapJobStatusToSyncResult(status: JournalEntrySyncJobStatus, syncType: HealthFixSyncType): JournalEntrySyncResult {
    const typeStatus = status.types.find(row => row.type === syncType) ?? status.types[0];
    const processed = typeStatus?.processed ?? 0;
    const skipped = typeStatus?.skipped ?? 0;
    const errorMessages = (typeStatus?.errorMessages ?? []).map(message => message.trim()).filter(message => message.length > 0);
    const syncErrors: string[] = [...errorMessages];

    if (syncErrors.length === 0 && (typeStatus?.errors ?? 0) > 0) {
      syncErrors.push(`${typeStatus?.errors} document(s) had sync errors.`);
    }

    if ((status.message ?? '').toLowerCase().includes('failed')) {
      syncErrors.push(status.message ?? 'Sync failed.');
    }

    return {
      documentsProcessed: processed,
      journalEntriesCreated: Math.max(0, processed - skipped),
      journalEntriesSkipped: skipped,
      journalEntriesDeleted: 0,
      errors: syncErrors
    };
  }

  emptySyncResult(): JournalEntrySyncResult {
    return {
      documentsProcessed: 0,
      journalEntriesCreated: 0,
      journalEntriesSkipped: 0,
      journalEntriesDeleted: 0,
      errors: []
    };
  }

  runFixAndCheck(
    key: HealthCheckKey,
    fallbackIssues?: DocumentHealthIssue[] | null
  ): Observable<{ syncResult: JournalEntrySyncResult; checkResult: DocumentHealthResult }> {
    return this.runCheck(key).pipe(
      take(1),
      tap(checkResult => {
        const fixCount = resolveHealthFixDocumentIds(checkResult, fallbackIssues).length;
        if (fixCount > 0) {
          this.patchRow(key, { fixProgress: `Fixing 0/${fixCount}…` });
        }
      }),
      switchMap(checkResult => {
        const documentIds = resolveHealthFixDocumentIds(checkResult, fallbackIssues);
        const expectedIssues =
          (checkResult.summary?.documentsMissingJe ?? 0) +
          (checkResult.summary?.duplicateOpenJes ?? 0);

        if (documentIds.length === 0) {
          if (expectedIssues > 0) {
            return throwError(() => new Error('Check found issues but no document IDs to fix. Run Check again, then Fix.'));
          }

          return of({ syncResult: this.emptySyncResult(), checkResult });
        }

        return this.runFix(key, documentIds).pipe(
          take(1),
          switchMap(syncResult => this.runCheck(key).pipe(
            take(1),
            map(recheckResult => ({ syncResult, checkResult: recheckResult }))
          ))
        );
      })
    );
  }
  //#endregion

  //#region Get Methods
  get isBulkBusy(): boolean {
    return this.isCheckingAll || this.isFixingAll;
  }

  activeRowLabel(): string {
    const row = this.rows.find(item => item.key === this.activeRowKey);
    return row?.label ?? '';
  }
  //#endregion

  //#region Utility Methods
  patchRow(key: HealthCheckKey, patch: Partial<HealthCheckRowState>): void {
    this.rows = this.rows.map(row => row.key === key ? { ...row, ...patch } : row);
    this.persistSessionState();
    this.cdr.markForCheck();
  }

  clearUnresolvedDisplay(): void {
    this.issueRows = [];
    this.showIssueHint = false;
    this.unresolvedHint = '';
    this.activeRowKey = null;
    this.persistSessionState();
    this.cdr.markForCheck();
  }

  applyCheckSummary(key: HealthCheckKey, result: DocumentHealthResult, showToast: boolean, canFix: boolean): void {
    const issues = result.issues ?? [];
    this.patchRow(key, { summary: result.summary, issues, errorMessage: null });
    this.clearUnresolvedDisplay();

    const label = this.rows.find(row => row.key === key)?.label ?? 'Health check';

    if (!canFix && !result.summary.isClean && issues.length > 0) {
      this.showUnresolvedIssues(key, result, ['Fix is not available for manual journal entries — correct in General Ledger.']);
      if (showToast) {
        this.toastr.warning(`${issues.length} issue(s) require manual correction.`, label);
      }
      return;
    }

    if (showToast) {
      if (result.summary.isClean) {
        this.toastr.success('No JE link issues found.', label);
      } else {
        this.toastr.warning(`${issues.length} issue(s) found — click Fix to repair.`, label);
      }
    }
  }

  handleFixOutcome(
    key: HealthCheckKey,
    label: string,
    syncResult: JournalEntrySyncResult,
    checkResult: DocumentHealthResult
  ): void {
    const syncErrors = syncResult.errors ?? [];
    const remainingIssues = checkResult.issues ?? [];
    const isClean = checkResult.summary.isClean && syncErrors.length === 0;

    if (isClean) {
      this.clearUnresolvedDisplay();
      this.toastr.success(
        `Fix complete. Created ${syncResult.journalEntriesCreated}, skipped ${syncResult.journalEntriesSkipped}.`,
        label
      );
      return;
    }

    this.showUnresolvedIssues(key, checkResult, syncErrors);
    const detailParts = [
      `${remainingIssues.length} issue(s) remain after Fix.`,
      syncErrors.length > 0 ? `${syncErrors.length} sync error(s).` : ''
    ].filter(part => part.length > 0);
    this.toastr.error(detailParts.join(' '), label);
  }

  showUnresolvedIssues(key: HealthCheckKey, result: DocumentHealthResult, syncErrors: string[]): void {
    const issues = result.issues ?? [];
    this.activeRowKey = key;
    this.issueRows = this.applySyncErrorsToIssueRows(
      issues.map(issue => this.mapIssueToDisplayRow(issue)),
      syncErrors
    );

    this.showIssueHint = true;
    this.unresolvedHint = syncErrors.length > 0
      ? 'Fix ran but could not resolve everything. Review each row — document issues and sync errors are listed below.'
      : 'Fix ran but could not resolve all document issues. Review each row below for document, office, and detail.';

    this.persistSessionState();
    this.cdr.markForCheck();
    setTimeout(() => this.resultsPanel?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  applyFixAllOutcome(outcomes: FixAllOutcome[]): void {
    const unresolvedOutcomes = outcomes.filter(outcome =>
      !outcome.checkResult.summary.isClean || (outcome.syncResult.errors?.length ?? 0) > 0);

    const totalCreated = outcomes.reduce((sum, outcome) => sum + (outcome.syncResult.journalEntriesCreated ?? 0), 0);
    const totalSkipped = outcomes.reduce((sum, outcome) => sum + (outcome.syncResult.journalEntriesSkipped ?? 0), 0);

    if (unresolvedOutcomes.length === 0) {
      this.clearUnresolvedDisplay();
      this.toastr.success(`Fix All complete. Created ${totalCreated}, skipped ${totalSkipped}.`);
      return;
    }

    const combinedIssues: HealthIssueDisplayRow[] = [];

    unresolvedOutcomes.forEach(outcome => {
      const issues = outcome.checkResult.issues ?? [];
      const syncErrors = outcome.syncResult.errors ?? [];
      const displayRows = issues.map(issue => this.mapIssueToDisplayRow({
        ...issue,
        issue: `[${outcome.label}] ${issue.issue}`,
        detail: issue.detail ?? ''
      }));
      combinedIssues.push(...this.applySyncErrorsToIssueRows(displayRows, syncErrors));
    });

    this.activeRowKey = null;
    this.issueRows = combinedIssues;
    this.showIssueHint = true;
    this.unresolvedHint = `Fix All finished with unresolved issues in ${unresolvedOutcomes.length} document type(s). Details are listed below.`;
    this.toastr.error(`Fix All finished — ${unresolvedOutcomes.length} type(s) still have issues. Created ${totalCreated}, skipped ${totalSkipped}.`);
    this.persistSessionState();
    this.cdr.markForCheck();
    setTimeout(() => this.resultsPanel?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  mapIssueToDisplayRow(issue: DocumentHealthIssue): HealthIssueDisplayRow {
    return {
      ...issue,
      transactionDateDisplay: issue.transactionDate ?? '',
      amountDisplay: issue.amount == null ? '' : Number(issue.amount).toFixed(2),
      officeNameDisplay: this.getOfficeNameForOfficeId(issue.officeId),
      detail: issue.detail ?? ''
    };
  }

  getOfficeNameForOfficeId(officeId: number): string {
    if (!officeId) {
      return '';
    }

    const office = this.offices.find(row => row.officeId === officeId);
    const name = (office?.name || office?.officeCode || '').trim();
    return name || String(officeId);
  }

  refreshIssueRowOfficeNames(): void {
    if (this.issueRows.length === 0) {
      return;
    }

    this.issueRows = this.issueRows.map(row => ({
      ...row,
      officeNameDisplay: row.officeId ? this.getOfficeNameForOfficeId(row.officeId) : row.officeNameDisplay
    }));
    this.cdr.markForCheck();
  }

  applySyncErrorsToIssueRows(rows: HealthIssueDisplayRow[], syncErrors: string[]): HealthIssueDisplayRow[] {
    if (syncErrors.length === 0) {
      return rows;
    }

    const errorsByDocumentCode = new Map<string, string>();
    const unmatchedErrors: string[] = [];

    for (const message of syncErrors) {
      const trimmed = message.trim();
      if (!trimmed) {
        continue;
      }

      const match = /^([^:]+):\s*(.+)$/s.exec(trimmed);
      if (match) {
        errorsByDocumentCode.set(match[1].trim(), match[2].trim());
      } else {
        unmatchedErrors.push(trimmed);
      }
    }

    const updatedRows = rows.map(row => {
      const syncDetail = errorsByDocumentCode.get(row.documentCode);
      if (!syncDetail) {
        return row;
      }

      errorsByDocumentCode.delete(row.documentCode);
      return {
        ...row,
        detail: row.detail ? `${row.detail} ${syncDetail}` : syncDetail
      };
    });

    const leftoverRows = Array.from(errorsByDocumentCode.entries()).map(([documentCode, detail], index) =>
      this.mapIssueToDisplayRow({
        issue: 'Sync error',
        organizationId: '',
        officeId: 0,
        documentCode,
        documentId: `sync-error-${documentCode}-${index}`,
        relatedCode: null,
        relatedId: null,
        amount: null,
        transactionDate: null,
        detail
      })
    );

    const unmatchedRows = unmatchedErrors.map((detail, index) => this.mapIssueToDisplayRow({
      issue: 'Sync error',
      organizationId: '',
      officeId: 0,
      documentCode: '',
      documentId: `sync-error-${index}`,
      relatedCode: null,
      relatedId: null,
      amount: null,
      transactionDate: null,
      detail
    }));

    return [...updatedRows, ...leftoverRows, ...unmatchedRows];
  }

  restoreSessionState(): void {
    const saved = this.healthStateService.load(this.organizationId);
    if (!saved) {
      return;
    }

    this.rows = saved.rows;
    this.activeRowKey = saved.activeRowKey;
    this.issueRows = saved.issueRows;
    this.showIssueHint = saved.showIssueHint;
    this.unresolvedHint = saved.unresolvedHint;
    this.cdr.markForCheck();
  }

  persistSessionState(): void {
    if (!this.organizationId) {
      return;
    }

    this.healthStateService.save({
      organizationId: this.organizationId,
      rows: this.rows,
      activeRowKey: this.activeRowKey,
      issueRows: this.issueRows,
      showIssueHint: this.showIssueHint,
      unresolvedHint: this.unresolvedHint
    });
  }
  //#endregion
}
