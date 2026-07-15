import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, finalize, firstValueFrom, forkJoin, Subject, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { CommonService } from '../../../../services/common.service';
import { DocumentExportService } from '../../../../services/document-export.service';
import { DocumentHtmlService } from '../../../../services/document-html.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { DocumentService } from '../../../documents/services/document.service';
import { EmailService } from '../../../email/services/email.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig } from '../../../shared/base-document.component';
import { ChartOfAccountResponse } from '../../models/chart-of-accounts.model';
import { JournalEntryLineSearchResponse } from '../../models/journal-entry.model';
import {
  ReconcileAccountReportContext,
  ReconcileAccountReportResult,
  ReconcileAccountReportRow,
  ReconcileAccountReportView
} from '../../models/reconcile-account-report.model';
import { ChartOfAccountsService } from '../../services/chart-of-accounts.service';
import { GeneralLedgerService } from '../../services/general-ledger.service';
import { ReportHtmlBuilderService } from '../../services/report-html-builder.service';

@Component({
  selector: 'app-reconcile-account-report',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './reconcile-account-report.component.html',
  styleUrls: [
    '../financial-report/financial-report.component.scss',
    './reconcile-account-report.component.scss'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReconcileAccountReportComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {

  @Input() reportView: ReconcileAccountReportView = 'summary';
  @Input() officeId: number | null = null;
  @Input() chartOfAccountId: number | null = null;
  @Input() statementDate: string | null = null;
  @Input() reportContext: ReconcileAccountReportContext | null = null;
  @Input() refreshTrigger = 0;
  @Output() viewChange = new EventEmitter<ReconcileAccountReportView>();
  formatter = inject(FormatterService);
  private generalLedgerService = inject(GeneralLedgerService);
  private mappingService = inject(MappingService);
  private officeService = inject(OfficeService);
  private chartOfAccountsService = inject(ChartOfAccountsService);
  private commonService = inject(CommonService);
  private utilityService = inject(UtilityService);
  private reportHtmlBuilder = inject(ReportHtmlBuilderService);
  private documentReloadService = inject(DocumentReloadService);
  private cdr = inject(ChangeDetectorRef);
  override toastr: ToastrService;

  reportResult: ReconcileAccountReportResult | null = null;
  previewIframeHtml = '';
  previewIframeStyles = '';
  isServiceError = false;
  isDownloading = false;
  isSubmitting = false;
  noActivityMessage = 'Select a bank account and statement date to view the reconciliation report.';
  companyName = '';
  officeName = '';
  organizationId = '';
  offices: OfficeResponse[] = [];
  chartOfAccounts: ChartOfAccountResponse[] = [];
  allLines: JournalEntryLineSearchResponse[] = [];
  beginningBalance = 0;

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'chartOfAccounts']));
  destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      const wasReady = this.isPageReady;
      this.isPageReady = items.size === 0;
      if (!wasReady && this.isPageReady) {
        this.loadReportData();
      }
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOrganization();
    this.loadOffices();
    this.loadChartOfAccounts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const shouldReload =
      (changes['officeId'] && !changes['officeId'].firstChange)
      || (changes['chartOfAccountId'] && !changes['chartOfAccountId'].firstChange)
      || (changes['statementDate'] && !changes['statementDate'].firstChange)
      || (changes['reportContext'] && !changes['reportContext'].firstChange)
      || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)
      || (changes['reportView'] && !changes['reportView'].firstChange);

    if (shouldReload) {
      this.loadReportData();
      return;
    }

    if (changes['reportView'] && this.allLines.length > 0) {
      this.applyReportDisplay();
      this.markViewForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDetailToggleChange(checked: boolean): void {
    this.onViewToggle(checked ? 'detail' : 'summary');
  }

  onViewToggle(view: ReconcileAccountReportView): void {
    if (view === this.reportView) {
      return;
    }
    this.viewChange.emit(view);
  }

  get isDetailView(): boolean {
    return this.reportView === 'detail';
  }

  /** Panel max-width grows for detail columns and caps at the viewport. */
  get panelMaxWidthCss(): string {
    if (this.isDetailView) {
      return '100%';
    }
    return '48rem';
  }

  get canUseReportDocuments(): boolean {
    return true;
  }

  get shellReportTitle(): string {
    return this.reportResult?.reportTitle || (this.isDetailView ? 'Reconciliation Detail' : 'Reconciliation Summary');
  }

  get shellReportEntityLine(): string {
    return this.reportResult?.entityLine?.trim() || this.companyName;
  }

  get shellReportPeriodLine(): string {
    return this.reportResult?.periodLine?.trim() || '';
  }

  formatAmount(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) {
      return '';
    }
    return this.formatter.currencyUsd(value);
  }

  formatSummaryAmount(row: ReconcileAccountReportRow): string {
    if (row.amount != null && Number.isFinite(row.amount)) {
      return this.formatAmount(row.amount);
    }
    if (row.balance != null && Number.isFinite(row.balance)) {
      return this.formatAmount(row.balance);
    }
    return '';
  }

  isSectionRow(row: ReconcileAccountReportRow): boolean {
    return row.rowKind === 'section' || row.rowKind === 'subsection';
  }

  isTotalRow(row: ReconcileAccountReportRow): boolean {
    return row.rowKind === 'total' || row.rowKind === 'summary' || row.rowKind === 'ending' || row.rowKind === 'beginning';
  }

  override onPrint(): void {
    super.onPrint('No reconciliation report is available to print.');
  }

  override async onDownload(): Promise<void> {
    const downloadConfig: DownloadConfig = {
      fileName: this.buildReportFileName(),
      documentType: this.resolveReportDocumentType(),
      noPreviewMessage: 'No reconciliation report is available to download.',
      noSelectionMessage: 'Organization or office is not available.'
    };
    await super.onDownload(downloadConfig);
  }

  exportReportToExcel(): void {
    if (!this.canUseReportDocuments || !this.reportResult) {
      this.toastr.warning('No reconciliation report is available to export.', 'No Preview');
      return;
    }

    const printableDocument = this.mappingService.mapReconcileAccountReportToPrintableDocument(this.reportResult);
    this.documentExportService.exportExcelTableDocument(printableDocument, this.buildReportFileName());
  }

  async saveReportDocument(): Promise<void> {
    if (!this.canUseReportDocuments) {
      this.toastr.warning('No reconciliation report is available to save.', 'No Preview');
      return;
    }

    this.isSubmitting = true;
    this.markViewForCheck();
    try {
      const config = this.getDocumentConfig();
      if (!config.organizationId || !config.selectedOfficeId) {
        this.toastr.warning('Organization or office is not available.', 'Missing Data');
        return;
      }

      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        config.previewIframeHtml,
        config.previewIframeStyles
      );

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: config.organizationId,
        officeId: config.selectedOfficeId,
        officeName: config.selectedOfficeName || '',
        propertyId: null,
        reservationId: null,
        documentTypeId: Number(this.resolveReportDocumentType()),
        fileName: this.buildReportFileName(),
        generatePdf: true
      };

      await firstValueFrom(this.documentService.generate(generateDto).pipe(take(1)));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
    } catch (error) {
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(
        detail ? `Document generation failed. ${detail}` : 'Document generation failed. Please try again.',
        'Error'
      );
    } finally {
      this.isSubmitting = false;
      this.markViewForCheck();
    }
  }

  protected getDocumentConfig(): DocumentConfig {
    const account = this.resolveSelectedAccount();
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organizationId || null,
      selectedOfficeId: this.resolveOfficeId(account),
      selectedOfficeName: this.officeName,
      propertyId: null,
      selectedReservationId: null,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
    this.markViewForCheck();
  }

  private buildReportFileName(): string {
    const account = this.resolveSelectedAccount();
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.officeName || 'Office');
    const accountNo = this.utilityService.sanitizeFileNameSegment(account?.accountNo || 'Account');
    const accountName = this.utilityService.sanitizeFileNameSegment(account?.name || '');
    const viewLabel = this.isDetailView ? 'Detail' : 'Summary';
    const dateStamp = this.utilityService.sanitizeFileNameSegment(String(this.statementDate || this.utilityService.todayAsCalendarDateString()));
    const accountSegment = accountName ? `${accountNo}_${accountName}` : accountNo;
    return `${officeSegment}_${accountSegment}_${viewLabel}_${dateStamp}.pdf`;
  }

  private resolveReportDocumentType(): DocumentType {
    return this.isDetailView
      ? DocumentType.ReconcileAccountDetail
      : DocumentType.ReconcileAccountSummary;
  }

  private loadOrganization(): void {
    const cachedOrganization = this.commonService.getOrganizationValue();
    if (cachedOrganization?.name) {
      this.companyName = cachedOrganization.name.trim();
    }

    this.commonService.getOrganization().pipe(takeUntil(this.destroy$)).subscribe(organization => {
      this.companyName = organization?.name?.trim() || '';
      this.applyReportDisplay();
      this.markViewForCheck();
    });
  }

  private loadOffices(): void {
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))
    ).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
          this.syncOfficeName();
          this.applyReportDisplay();
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.syncOfficeName();
        this.markViewForCheck();
      }
    });
  }

  private loadChartOfAccounts(): void {
    this.chartOfAccountsService.ensureChartOfAccountsLoaded().pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'chartOfAccounts'))
    ).subscribe(() => {
      this.chartOfAccountsService.getAllChartOfAccounts().pipe(takeUntil(this.destroy$)).subscribe(accounts => {
        this.chartOfAccounts = accounts || [];
        this.applyReportDisplay();
        this.markViewForCheck();
      });
    });
  }

  private loadReportData(): void {
    if (!this.isPageReady) {
      return;
    }

    const account = this.resolveSelectedAccount();
    const officeId = this.resolveOfficeId(account);
    const statementDate = String(this.statementDate || '').trim();

    if (!account || officeId == null || !statementDate) {
      this.allLines = [];
      this.beginningBalance = 0;
      this.isServiceError = false;
      this.reportResult = null;
      this.clearPrintableHtml();
      this.noActivityMessage = 'Select a bank account and statement date to view the reconciliation report.';
      this.markViewForCheck();
      return;
    }

    this.isServiceError = false;
    this.syncOfficeName();

    forkJoin({
      beginningBalance: this.generalLedgerService.getReconcileBeginningBalance(officeId, account.accountId, statementDate),
      lines: this.generalLedgerService.searchJournalEntryLines({
        officeIds: [officeId],
        chartOfAccountId: account.accountId,
        includeVoided: false,
        includeUnposted: true,
        endDate: statementDate
      })
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ beginningBalance, lines }) => {
        this.beginningBalance = Number(beginningBalance || 0);
        this.allLines = lines || [];
        this.applyReportDisplay();
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        console.error('Reconcile Account Report - error loading data:', error);
        this.isServiceError = true;
        this.allLines = [];
        this.reportResult = null;
        this.clearPrintableHtml();
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        this.noActivityMessage = apiMessage
          ? `Unable to load reconciliation report data: ${apiMessage}`
          : 'Unable to load reconciliation report data.';
        this.markViewForCheck();
      }
    });
  }

  private applyReportDisplay(): void {
    const account = this.resolveSelectedAccount();
    const statementDate = String(this.statementDate || '').trim();
    if (!account || !statementDate) {
      this.reportResult = null;
      this.clearPrintableHtml();
      return;
    }

    const endingBalance = this.reportContext?.endingBalance ?? account.endingBalance ?? this.beginningBalance;
    this.reportResult = this.mappingService.buildReconcileAccountReport({
      view: this.reportView,
      account,
      companyName: this.companyName,
      officeName: this.officeName,
      statementDate,
      beginningBalance: this.beginningBalance,
      endingBalance: Number(endingBalance || 0),
      lines: this.allLines
    });
    this.refreshPrintableHtml();
  }

  private refreshPrintableHtml(): void {
    if (!this.reportResult) {
      this.clearPrintableHtml();
      return;
    }

    const printableDocument = this.mappingService.mapReconcileAccountReportToPrintableDocument(this.reportResult);
    const preview = this.reportHtmlBuilder.buildPreviewContent(printableDocument);
    this.previewIframeHtml = preview.previewIframeHtml;
    this.previewIframeStyles = preview.previewIframeStyles;
  }

  private clearPrintableHtml(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
  }

  private resolveSelectedAccount(): ChartOfAccountResponse | null {
    if (this.chartOfAccountId == null) {
      return null;
    }

    return this.chartOfAccounts.find(account => account.accountId === this.chartOfAccountId) ?? null;
  }

  private resolveOfficeId(account: ChartOfAccountResponse | null): number | null {
    if (this.officeId != null) {
      return this.officeId;
    }
    return account?.officeId ?? null;
  }

  private syncOfficeName(): void {
    const officeId = this.resolveOfficeId(this.resolveSelectedAccount());
    if (officeId == null) {
      this.officeName = '';
      return;
    }

    this.officeName = this.offices.find(office => office.officeId === officeId)?.name?.trim() || '';
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }
}
