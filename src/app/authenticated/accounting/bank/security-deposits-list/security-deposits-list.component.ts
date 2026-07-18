import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { MaterialModule } from '../../../../material.module';
import { MappingService } from '../../../../services/mapping.service';
import { UtilityService } from '../../../../services/utility.service';
import { UnreturnedSecurityDepositDisplay } from '../../../reservations/models/reservation-model';
import { SecurityDepositService } from '../../services/security-deposit.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { DataTableFooterDirective } from '../../../shared/data-table/data-table-footer.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { SecurityDepositReturnPaymentDialogComponent } from './security-deposit-return-payment-dialog.component';
import { SecurityDepositReturnPaymentSubmit } from './security-deposit-return-payment-dialog.model';
import { FormatterService } from '../../../../services/formatter-service';
import { InvoiceSelection } from '../../models/invoice.model';
import { SecurityDepositReportSelection } from '../../models/security-deposit-report.model';

@Component({
  selector: 'app-security-deposits-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective, DataTableFooterDirective, SecurityDepositReturnPaymentDialogComponent],
  templateUrl: './security-deposits-list.component.html',
  styleUrl: './security-deposits-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecurityDepositsListComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {

  @Input() officeId: number | null = null;
  @Input() refreshTrigger = 0;
  @Output() journalEntrySelectEvent = new EventEmitter<{ journalEntryId: string }>();
  @Output() invoiceSelectEvent = new EventEmitter<InvoiceSelection>();
  @Output() securityDepositReportEvent = new EventEmitter<SecurityDepositReportSelection>();

  @ViewChild('tableWrap') tableWrapRef?: ElementRef<HTMLElement>;
  @ViewChild('summaryFooter') summaryFooterRef?: ElementRef<HTMLElement>;

  private securityDepositService = inject(SecurityDepositService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  readonly formatter = inject(FormatterService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  readonly displayedColumns: ColumnSet = {
    reservationCode: { displayAs: 'Reservation', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    invoiceCode: { displayAs: 'Invoice', wrap: false, maxWidth: '16ch', sortType: 'natural' },
    journalEntryCode: { displayAs: 'JEntry', wrap: false, maxWidth: '14ch', sortType: 'natural' },
    contactName: { displayAs: 'Contact', wrap: true, maxWidth: '22ch' },
    arrivalDate: { displayAs: 'Arrival', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    departureDate: { displayAs: 'Departure', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    securityDepositReturnDate: { displayAs: 'Return By', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    depositDisplay: { displayAs: 'Deposit', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    collectedDisplay: { displayAs: 'Collected', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    owedDisplay: { displayAs: 'Owed', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    returnedDisplay: { displayAs: 'TBR', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    paidDisplay: { displayAs: 'Paid', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    transferredDisplay: { displayAs: 'Transferred', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    depositReturned: { displayAs: 'Returned', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', headerAlignment: 'center', maxWidth: '12ch' },
    depositComplete: { displayAs: 'Complete', isCheckbox: true, checkboxEditable: false, wrap: false, alignment: 'center', headerAlignment: 'center', maxWidth: '12ch' }
  };

  rowsDisplay: UnreturnedSecurityDepositDisplay[] = [];
  escrowBalance = 0;
  escrowAccountLabel = '';
  isPageReady = false;
  isServiceError = false;
  noDataMessage = 'No security deposits for the selected office access.';
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();
  private loadId = 0;

  showPaymentForm = false;
  paymentDialogMode: 'return' | 'transfer' = 'return';
  isSubmittingPayment = false;
  paymentOfficeId: number | null = null;
  paymentTargetReservationId: string | null = null;
  paymentTargetReservationCode: string | null = null;
  paymentInitialAmount = 0;
  paymentInitialDescription = '';

  summaryPanelWidthPx = 0;
  summaryPanelMarginLeftPx = 0;
  private summaryResizeObserver?: ResizeObserver;
  private summaryAlignFrameId: number | null = null;

  //#region Security Deposits List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadRows();
  }

  ngAfterViewInit(): void {
    this.scheduleSummaryAlignmentRetries();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadRows();
      return;
    }

    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.loadRows();
      return;
    }
  }
  //#endregion

  //#region Data Load Methods
  loadRows(): void {
    const loadId = ++this.loadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'securityDeposits');

    this.securityDepositService.getUnreturnedSecurityDeposits(this.officeId).pipe(
      take(1),
      finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'securityDeposits');
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: response => {
        if (loadId !== this.loadId) {
          return;
        }

        const mappedResponse = this.mappingService.mapUnreturnedSecurityDepositsResponse(response);
        this.rowsDisplay = this.mappingService.mapUnreturnedSecurityDeposits(mappedResponse);
        this.escrowBalance = Number(mappedResponse.escrowBalance ?? 0);
        this.escrowAccountLabel = String(mappedResponse.escrowAccountLabel ?? '').trim();
        this.securityDepositService.updateSecurityDepositsOutstandingBadge(mappedResponse.rows);
        this.markViewForCheck();
        this.scheduleSummaryAlignmentRetries();
      },
      error: (_error: HttpErrorResponse) => {
        if (loadId !== this.loadId) {
          return;
        }

        this.isServiceError = true;
        this.rowsDisplay = [];
        this.escrowBalance = 0;
        this.escrowAccountLabel = '';
        this.securityDepositService.setSecurityDepositsOutstanding(false);
        this.toastr.error('Unable to load security deposits.');
        this.markViewForCheck();
      }
    });
  }

  //#endregion

  //#region Summary Methods
  get hasSummaryFooter(): boolean {
    return this.isPageReady && !this.isServiceError;
  }

  get hasSummaryColumnAlignment(): boolean {
    return this.summaryPanelWidthPx > 0;
  }

  scheduleSummaryAlignmentRetries(): void {
    this.ensureSummaryObservers();
    for (const delay of [0, 50, 150, 350]) {
      setTimeout(() => this.scheduleSummaryAlignment(), delay);
    }
  }

  scheduleSummaryAlignment(): void {
    if (this.summaryAlignFrameId != null) {
      cancelAnimationFrame(this.summaryAlignFrameId);
    }

    this.summaryAlignFrameId = requestAnimationFrame(() => {
      this.summaryAlignFrameId = requestAnimationFrame(() => {
        this.summaryAlignFrameId = null;
        this.updateSummaryAlignment();
      });
    });
  }

  ensureSummaryObservers(): void {
    const wrap = this.tableWrapRef?.nativeElement;
    if (!wrap) {
      return;
    }

    if (typeof ResizeObserver !== 'undefined' && !this.summaryResizeObserver) {
      this.summaryResizeObserver = new ResizeObserver(() => this.scheduleSummaryAlignment());
      this.summaryResizeObserver.observe(wrap);
    }

    this.scheduleSummaryAlignment();
  }

  updateSummaryAlignment(): void {
    const wrap = this.tableWrapRef?.nativeElement;
    if (!wrap) {
      return;
    }

    const returnedCell = wrap.querySelector<HTMLElement>(
      'th.mat-column-depositReturned, td.mat-column-depositReturned, th.mat-mdc-header-cell.mat-column-depositReturned, td.mat-mdc-cell.mat-column-depositReturned'
    );
    const table = wrap.querySelector<HTMLElement>('table.data-table, table.mat-table, table.mat-mdc-table');
    const summaryEl = this.summaryFooterRef?.nativeElement ?? wrap.querySelector<HTMLElement>('.security-deposits-summary');
    if (!returnedCell || !table || !summaryEl) {
      return;
    }

    const summaryRect = summaryEl.getBoundingClientRect();
    const returnedRect = returnedCell.getBoundingClientRect();
    const tableWidth = Math.max(0, Math.round(table.offsetWidth));
    const returnedRightOffset = Math.max(0, Math.round(returnedRect.right - summaryRect.left));
    const nextPanelWidth = Math.max(0, Math.round(tableWidth / 4));
    const nextPanelMarginLeft = Math.max(0, returnedRightOffset - nextPanelWidth);

    if (
      nextPanelWidth === this.summaryPanelWidthPx
      && nextPanelMarginLeft === this.summaryPanelMarginLeftPx
    ) {
      return;
    }

    this.summaryPanelWidthPx = nextPanelWidth;
    this.summaryPanelMarginLeftPx = nextPanelMarginLeft;
    this.markViewForCheck();
  }
  //#endregion

  //#region Form Response Methods
  onPayable(row: UnreturnedSecurityDepositDisplay): void {
    this.openApplyPaymentDialog(row, 'return');
  }

  onTransfer(row: UnreturnedSecurityDepositDisplay): void {
    this.openApplyPaymentDialog(row, 'transfer');
  }

  openApplyPaymentDialog(row: UnreturnedSecurityDepositDisplay, mode: 'return' | 'transfer'): void {
    const reservationId = String(row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    if (mode === 'return') {
      if (row?.payableDisabled || Number(row?.collectedAmount ?? 0) <= 0) {
        this.toastr.warning('No security deposit has been collected for this reservation.');
        return;
      }

      if (row?.depositReturned) {
        this.toastr.warning('Security deposit has already been returned.');
        return;
      }
    } else {
      if (row?.transferDisabled) {
        this.toastr.warning('No security deposit amount is available to transfer to the business bank.');
        return;
      }
    }

    const rowOfficeId = Number(row?.officeId ?? 0);
    this.paymentOfficeId = this.officeId ?? (Number.isFinite(rowOfficeId) && rowOfficeId > 0 ? rowOfficeId : null);
    if (!this.paymentOfficeId) {
      this.toastr.warning('Unable to determine office for selected security deposit.');
      return;
    }

    this.paymentDialogMode = mode;
    this.paymentTargetReservationId = reservationId;
    this.paymentTargetReservationCode = String(row?.reservationCode || '').trim() || null;
    if (mode === 'transfer') {
      this.paymentInitialDescription = `${row.reservationCode} Security Deposit Transfer`.trim();
      const owedAmount = this.roundCurrencyValue(Number(row.owedAmount ?? 0));
      const transferredAmount = this.roundCurrencyValue(Number(row.transferredAmount ?? 0));
      this.paymentInitialAmount = this.roundCurrencyValue(Math.max(0, owedAmount - transferredAmount));
    } else {
      this.paymentInitialDescription = `${row.reservationCode} Security Deposit Return`.trim();
      const tbrAmount = this.roundCurrencyValue(Number(row.returnedBalanceAmount ?? 0));
      const paidToTenant = this.roundCurrencyValue(Number(row.paidAmount ?? 0));
      this.paymentInitialAmount = this.roundCurrencyValue(Math.max(0, tbrAmount - paidToTenant));
    }
    this.showPaymentForm = true;
    this.markViewForCheck();
  }

  cancelPaymentForm(): void {
    this.showPaymentForm = false;
    this.clearPaymentContext();
    this.markViewForCheck();
  }

  onPaymentSubmit(payment: SecurityDepositReturnPaymentSubmit): void {
    if (this.isSubmittingPayment) {
      return;
    }

    const chartOfAccountId = payment.chartOfAccountId;
    if (!chartOfAccountId) {
      this.toastr.warning('Please select a bank account or credit card.');
      return;
    }

    if (!payment.paymentDate) {
      this.toastr.warning('Please select a payment date');
      return;
    }

    if (payment.amount === 0) {
      this.toastr.warning('Please enter an amount');
      return;
    }

    const reservationId = String(this.paymentTargetReservationId || '').trim();
    if (!reservationId) {
      this.toastr.warning('Unable to determine reservation for security deposit return.');
      return;
    }

    this.isSubmittingPayment = true;
    const submit$ = this.paymentDialogMode === 'transfer'
      ? this.securityDepositService.applySecurityDepositTransfer({ ...payment, reservationId })
      : this.securityDepositService.applySecurityDepositReturn({ ...payment, reservationId });

    submit$.pipe(
      take(1),
      finalize(() => {
        this.isSubmittingPayment = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success(
          this.paymentDialogMode === 'transfer'
            ? 'Security deposit transfer recorded.'
            : 'Security deposit return recorded.',
          CommonMessage.Success
        );
        this.showPaymentForm = false;
        this.clearPaymentContext();
        this.loadRows();
        this.securityDepositService.refreshSecurityDepositsOutstanding();
      },
      error: (error: HttpErrorResponse) => {
        const apiMessage = typeof error.error === 'string'
          ? error.error
          : error.error?.title || error.error?.message || error.message;
        const fallback = this.paymentDialogMode === 'transfer'
          ? 'Unable to transfer security deposit.'
          : 'Unable to return security deposit.';
        this.toastr.error(apiMessage || fallback, CommonMessage.Error);
      }
    });
  }

  openSecurityDepositReport(row: UnreturnedSecurityDepositDisplay): void {
    const reservationId = String(row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const rowOfficeId = Number(row?.officeId ?? 0);
    this.securityDepositReportEvent.emit({
      reservationId,
      reservationCode: String(row?.reservationCode || '').trim() || null,
      officeId: this.officeId ?? (Number.isFinite(rowOfficeId) && rowOfficeId > 0 ? rowOfficeId : null),
      securityDepositReturnDate: String(row?.securityDepositReturnDate || '').trim() || null
    });
  }

  openReservation(row: UnreturnedSecurityDepositDisplay): void {
    const reservationId = String(row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const returnPath = this.router.url.startsWith('/') ? this.router.url : `/${this.router.url}`;
    const queryParams: Record<string, string | number> = {
      returnTo: 'security-deposits',
      listReturnPath: returnPath,
      ...(this.officeId != null ? { officeId: this.officeId } : {})
    };

    void this.router.navigate(
      ['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])],
      { queryParams }
    );
  }

  openJournalEntry(row: UnreturnedSecurityDepositDisplay): void {
    const journalEntryId = String(row?.journalEntryId || '').trim();
    if (!journalEntryId) {
      return;
    }

    this.journalEntrySelectEvent.emit({ journalEntryId });
  }

  openInvoice(row: UnreturnedSecurityDepositDisplay): void {
    const invoiceId = String(row?.invoiceId || '').trim();
    if (!invoiceId) {
      return;
    }

    const rowOfficeId = Number(row?.officeId ?? 0);
    this.invoiceSelectEvent.emit({
      invoiceId,
      officeId: this.officeId ?? (Number.isFinite(rowOfficeId) && rowOfficeId > 0 ? rowOfficeId : null),
      reservationId: String(row?.reservationId || '').trim() || null
    });
  }

  clearPaymentContext(): void {
    this.paymentTargetReservationId = null;
    this.paymentTargetReservationCode = null;
    this.paymentOfficeId = null;
    this.paymentInitialAmount = 0;
    this.paymentInitialDescription = '';
    this.paymentDialogMode = 'return';
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
  }

  get totalCollected(): number {
    return this.sumSecurityDepositColumn('collectedAmount');
  }

  get summaryDiscrepancy(): number {
    return this.roundCurrencyValue(this.escrowBalance - this.totalCollected);
  }

  get totalsRow(): { [key: string]: string } | undefined {
    if (this.rowsDisplay.length === 0) {
      return undefined;
    }

    return {
      reservationCode: 'Total',
      depositDisplay: this.formatter.currencyUsd(this.sumSecurityDepositColumn('deposit')),
      collectedDisplay: this.formatter.currencyUsd(this.sumSecurityDepositColumn('collectedAmount')),
      owedDisplay: this.formatter.currencyUsd(this.sumSecurityDepositColumn('owedAmount')),
      returnedDisplay: this.formatter.currencyUsd(this.sumSecurityDepositColumn('returnedBalanceAmount')),
      transferredDisplay: this.formatter.currencyUsd(this.sumSecurityDepositColumn('transferredAmount')),
      paidDisplay: this.formatter.currencyUsd(this.sumSecurityDepositColumn('paidAmount'))
    };
  }

  sumSecurityDepositColumn(
    column: 'deposit' | 'collectedAmount' | 'owedAmount' | 'returnedBalanceAmount' | 'transferredAmount' | 'paidAmount'
  ): number {
    return this.roundCurrencyValue(
      this.rowsDisplay.reduce((sum, row) => sum + Number(row[column] ?? 0), 0)
    );
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.summaryAlignFrameId != null) {
      cancelAnimationFrame(this.summaryAlignFrameId);
    }
    this.summaryResizeObserver?.disconnect();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'securityDeposits');
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
