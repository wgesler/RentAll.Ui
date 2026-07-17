import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OfficeService } from '../../../organizations/services/office.service';
import { AuthService } from '../../../../services/auth.service';
import { EscrowReportResult } from '../../models/escrow-report.model';
import { ReportService } from '../../services/report.service';

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
  @Input() asOfStart: string | null = null;
  @Input() propertyId: string | null = null;
  @Input() refreshTrigger = 0;
  @Output() transferNavigate = new EventEmitter<void>();

  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private reportService = inject(ReportService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  isPageReady = false;
  isServiceError = false;
  organizationId = '';
  offices: OfficeResponse[] = [];
  reportResult: EscrowReportResult | null = null;
  cushionInput = 0;
  noDataMessage = 'No escrow activity for the selected office, property, and as-of date.';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'escrowReport']));
  destroy$ = new Subject<void>();
  private reportLoadId = 0;

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadReport();
      return;
    }

    if (!this.itemsToLoad$.value.has('offices') && this.hasFilterInputChange(changes)) {
      this.loadReport();
    }
  }

  hasFilterInputChange(changes: SimpleChanges): boolean {
    return ['officeId', 'asOfDate', 'asOfStart', 'propertyId'].some(key => {
      const change = changes[key];
      return !!change && !change.firstChange;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.offices = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.loadReport();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(take(1), takeUntil(this.destroy$)).subscribe({
          next: offices => {
            this.offices = (offices || []).filter(office => office.organizationId === this.organizationId && office.isActive);
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.loadReport();
            this.markViewForCheck();
          },
          error: () => {
            this.offices = [];
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
            this.loadReport();
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.loadReport();
        this.markViewForCheck();
      }
    });
  }

  loadReport(): void {
    if (this.itemsToLoad$.value.has('offices')) {
      return;
    }

    const officeIds = this.resolveOfficeIds();
    const endDate = this.asOfDate || this.utilityService.formatDateOnlyForApi(new Date());
    if (officeIds.length === 0) {
      this.reportResult = null;
      this.isServiceError = false;
      this.noDataMessage = 'Select an office to view the Escrow report.';
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'escrowReport');
      this.markViewForCheck();
      return;
    }

    const loadId = ++this.reportLoadId;
    if (!this.itemsToLoad$.value.has('escrowReport')) {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'escrowReport');
    }

    this.reportService.searchEscrowReport({
      officeIds,
      propertyId: this.propertyId,
      startDate: this.asOfStart,
      endDate,
      cushion: this.cushionInput
    }).pipe(
      take(1),
      finalize(() => {
        if (this.reportLoadId === loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'escrowReport');
        }
        this.markViewForCheck();
      })
    ).subscribe({
      next: report => {
        if (this.reportLoadId !== loadId) {
          return;
        }

        this.isServiceError = false;
        this.reportResult = report;
        this.cushionInput = report.cushion;
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (this.reportLoadId !== loadId) {
          return;
        }

        this.reportResult = null;
        this.isServiceError = true;
        const message = typeof error?.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message || 'Unable to load Escrow report.';
        this.toastr.error(message, 'Escrow');
        this.markViewForCheck();
      }
    });
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

    return (this.offices || []).map(office => office.officeId).filter(id => id > 0);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  openTransferReports(): void {
    this.transferNavigate.emit();
  }
}
