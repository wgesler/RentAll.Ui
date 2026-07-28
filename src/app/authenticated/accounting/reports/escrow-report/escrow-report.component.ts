import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, firstValueFrom, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../../material.module';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig } from '../../../shared/base-document.component';
import { EscrowReportResult, EscrowReportAmountDrillDownSelection, EscrowReportDrillDownMetric } from '../../models/escrow-report.model';
import { ReportHtmlBuilderService } from '../../services/report-html-builder.service';
import { EscrowReportCacheService } from '../../services/owner-reports-cache.service';

@Component({
  selector: 'app-escrow-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './escrow-report.component.html',
  styleUrls: ['./escrow-report.component.scss', '../../reports/financial-report/financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EscrowReportComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() asOfDate: string | null = null;
  @Input() propertyId: string | null = null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;
  @Output() transferNavigate = new EventEmitter<void>();
  @Output() amountDrillDownSelect = new EventEmitter<EscrowReportAmountDrillDownSelection>();

  private escrowReportCacheService = inject(EscrowReportCacheService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private reportHtmlBuilder = inject(ReportHtmlBuilderService);
  private documentReloadService = inject(DocumentReloadService);
  private cdr = inject(ChangeDetectorRef);
  override toastr: ToastrService;

  isPageReady = false;
  reportResult: EscrowReportResult | null = null;
  cushionInput = 0;
  noDataMessage = 'Press Go to run the report.';
  previewIframeHtml = '';
  previewIframeStyles = '';
  isDownloading = false;
  isSubmitting = false;
  organizationId = '';
  private readonly emptyResultMessage = 'No escrow activity for the selected office, property, and as-of date.';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadReport();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading'] || (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange)) {
      this.loadReport();
      return;
    }

    if (this.hasFilterInputChange(changes)) {
      this.loadReport();
    }
  }

  hasFilterInputChange(changes: SimpleChanges): boolean {
    return ['officeId', 'asOfDate', 'propertyId'].some(key => {
      const change = changes[key];
      return !!change && !change.firstChange;
    });
  }

  ngOnDestroy(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'escrowReport');
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  loadReport(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'escrowReport');

    const request = this.buildEscrowSearchRequest();
    if (request.officeIds.length === 0) {
      this.reportResult = null;
      this.noDataMessage = 'Select an office, then press Go to run the report.';
      this.clearPrintableHtml();
      this.markViewForCheck();
      return;
    }

    const cachedReport = this.escrowReportCacheService.getReport();
    if (!cachedReport || !this.escrowReportCacheService.matchesSearchRequest(request)) {
      this.reportResult = null;
      this.noDataMessage = 'Press Go to run the report.';
      this.clearPrintableHtml();
      this.markViewForCheck();
      return;
    }

    this.reportResult = this.mappingService.filterEscrowReportByProperty(cachedReport, this.propertyId);
    this.cushionInput = cachedReport.cushion;
    this.reportResult = this.mappingService.recalculateEscrowTransfer(this.reportResult, this.cushionInput);
    this.noDataMessage = this.emptyResultMessage;
    this.refreshPrintableHtml();
    this.markViewForCheck();
  }

  buildEscrowSearchRequest() {
    return {
      officeIds: this.resolveOfficeIds(),
      endDate: this.asOfDate
    };
  }

  onCushionChange(value: number | string | null): void {
    if (!this.reportResult) {
      return;
    }

    const parsed = Number(value);
    this.cushionInput = Number.isFinite(parsed)
      ? this.mappingService.normalizeEscrowOwnerEscrowAmount(parsed)
      : 0;
    this.reportResult = this.mappingService.recalculateEscrowTransfer(this.reportResult, this.cushionInput);
    this.refreshPrintableHtml();
    this.markViewForCheck();
  }

  formatAmount(value: number): string {
    return this.formatter.currencyUsd(value);
  }

  resolveOfficeIds(): number[] {
    if (this.officeId != null && this.officeId > 0) {
      return [this.officeId];
    }

    return [];
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  openTransferReports(): void {
    this.transferNavigate.emit();
  }

  onAmountCellClick(
    metric: EscrowReportDrillDownMetric,
    amount: number,
    propertyId?: string | null
  ): void {
    if (!this.canDrillDownAmount(metric, amount)) {
      return;
    }

    this.amountDrillDownSelect.emit({
      officeIds: this.resolveOfficeIds(),
      propertyId: propertyId ?? null,
      metric
    });
  }

  canDrillDownAmount(metric: EscrowReportDrillDownMetric, amount: number): boolean {
    return Math.abs(Number(amount) || 0) > 0.005;
  }

  hasEscrowReportContent(result: EscrowReportResult | null): boolean {
    if (!result) {
      return false;
    }

    if ((result.rows || []).length > 0) {
      return true;
    }

    return Math.abs(result.escrowBankBalance) > 0.005
      || Math.abs(result.transfer) > 0.005
      || Math.abs(result.cushion) > 0.005;
  }

  get canUseReportDocuments(): boolean {
    return this.hasEscrowReportContent(this.reportResult);
  }

  override onPrint(): void {
    super.onPrint('No escrow report is available to print.');
  }

  override async onDownload(): Promise<void> {
    const downloadConfig: DownloadConfig = {
      fileName: this.buildReportFileName(),
      documentType: DocumentType.Escrow,
      noPreviewMessage: 'No escrow report is available to download.',
      noSelectionMessage: 'Organization or office is not available.'
    };
    await super.onDownload(downloadConfig);
  }

  exportReportToExcel(): void {
    if (!this.canUseReportDocuments || !this.reportResult) {
      this.toastr.warning('No escrow report is available to export.', 'No Preview');
      return;
    }

    const printableDocument = this.mappingService.mapEscrowReportToPrintableDocument(this.reportResult);
    this.documentExportService.exportExcelTableDocument(printableDocument, this.buildReportFileName());
  }

  async saveReportDocument(): Promise<void> {
    if (!this.canUseReportDocuments) {
      this.toastr.warning('No escrow report is available to save.', 'No Preview');
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
        documentTypeId: Number(DocumentType.Escrow),
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
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organizationId || null,
      selectedOfficeId: this.resolveDocumentOfficeId(),
      selectedOfficeName: this.displayOfficeName,
      propertyId: null,
      selectedReservationId: null,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
    this.markViewForCheck();
  }

  buildReportFileName(): string {
    const officeSegment = this.utilityService.sanitizeFileNameSegment(this.displayOfficeName || 'Office');
    const dateStamp = this.utilityService.sanitizeFileNameSegment(
      this.asOfDate || this.utilityService.todayAsCalendarDateString()
    );
    return `${officeSegment}_Escrow_${dateStamp}.pdf`;
  }

  get displayOfficeName(): string {
    return this.reportResult?.entityLineLabel?.trim() || '';
  }

  resolveDocumentOfficeId(): number | null {
    if (this.officeId != null && this.officeId > 0) {
      return this.officeId;
    }
    return null;
  }

  refreshPrintableHtml(): void {
    if (!this.hasEscrowReportContent(this.reportResult) || !this.reportResult) {
      this.clearPrintableHtml();
      return;
    }

    const printableDocument = this.mappingService.mapEscrowReportToPrintableDocument(this.reportResult);
    const preview = this.reportHtmlBuilder.buildPreviewContent(printableDocument);
    this.previewIframeHtml = preview.previewIframeHtml;
    this.previewIframeStyles = preview.previewIframeStyles;
  }

  clearPrintableHtml(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
  }
}
