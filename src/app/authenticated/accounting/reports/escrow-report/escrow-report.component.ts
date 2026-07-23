import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { EscrowReportResult } from '../../models/escrow-report.model';
import { EscrowReportCacheService } from '../../services/owner-reports-cache.service';

@Component({
  selector: 'app-escrow-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './escrow-report.component.html',
  styleUrls: ['./escrow-report.component.scss', '../../reports/financial-report/financial-report.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EscrowReportComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() asOfDate: string | null = null;
  @Input() propertyId: string | null = null;
  @Input() refreshTrigger = 0;
  @Input() isLoading = false;
  @Output() transferNavigate = new EventEmitter<void>();

  private escrowReportCacheService = inject(EscrowReportCacheService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  reportResult: EscrowReportResult | null = null;
  cushionInput = 0;
  noDataMessage = 'Press Go to run the report.';
  private readonly emptyResultMessage = 'No escrow activity for the selected office, property, and as-of date.';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  ngOnInit(): void {
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

    if (this.isLoading) {
      this.reportResult = null;
      this.noDataMessage = 'Press Go to run the report.';
      this.markViewForCheck();
      return;
    }

    const request = this.buildEscrowSearchRequest();
    if (request.officeIds.length === 0) {
      this.reportResult = null;
      this.noDataMessage = 'Select an office, then press Go to run the report.';
      this.markViewForCheck();
      return;
    }

    const cachedReport = this.escrowReportCacheService.getReport();
    if (!cachedReport || !this.escrowReportCacheService.matchesSearchRequest(request)) {
      this.reportResult = null;
      this.noDataMessage = 'Press Go to run the report.';
      this.markViewForCheck();
      return;
    }

    this.reportResult = cachedReport;
    this.cushionInput = cachedReport.cushion;
    this.noDataMessage = this.emptyResultMessage;
    this.markViewForCheck();
  }

  buildEscrowSearchRequest() {
    return {
      officeIds: this.resolveOfficeIds(),
      propertyId: this.propertyId ?? null,
      endDate: this.asOfDate
    };
  }

  onCushionChange(value: number | string | null): void {
    if (!this.reportResult) {
      return;
    }

    const parsed = Number(value);
    this.cushionInput = Number.isFinite(parsed)
      ? this.mappingService.roundFinancialReportAmount(parsed)
      : 0;
    this.reportResult = this.mappingService.recalculateEscrowTransfer(this.reportResult, this.cushionInput);
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
}
