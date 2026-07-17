import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
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
import { ReservationService } from '../../../reservations/services/reservation.service';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../../shared/data-table/data-table-filter-actions.directive';
import { DataTableFooterDirective } from '../../../shared/data-table/data-table-footer.directive';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { SecurityDepositReturnPaymentDialogComponent } from './security-deposit-return-payment-dialog.component';
import { SecurityDepositReturnPaymentSubmit } from './security-deposit-return-payment-dialog.model';
import { FormatterService } from '../../../../services/formatter-service';

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

  @ViewChild('tableWrap') tableWrapRef?: ElementRef<HTMLElement>;
  @ViewChild('summaryFooter') summaryFooterRef?: ElementRef<HTMLElement>;

  private reservationService = inject(ReservationService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  readonly formatter = inject(FormatterService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  readonly displayedColumns: ColumnSet = {
    reservationCode: { displayAs: 'Reservation', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    agentCode: { displayAs: 'Agent', wrap: false, maxWidth: '12ch', sortType: 'natural' },
    tenantName: { displayAs: 'Occupant', wrap: true, maxWidth: '22ch' },
    contactName: { displayAs: 'Contact', wrap: true, maxWidth: '22ch' },
    companyName: { displayAs: 'Company', wrap: true, maxWidth: '22ch' },
    arrivalDate: { displayAs: 'Arrival', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    departureDate: { displayAs: 'Departure', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    securityDepositReturnDate: { displayAs: 'Return By', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    depositDisplay: { displayAs: 'Deposit', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    depositReturned: { displayAs: 'Returned', isCheckbox: true, checkboxEditable: true, wrap: false, alignment: 'center', headerAlignment: 'center', maxWidth: '12ch' }
  };

  rowsDisplay: UnreturnedSecurityDepositDisplay[] = [];
  totalDepositsOwed = 0;
  escrowBalance = 0;
  discrepancy = 0;
  escrowAccountLabel = '';
  isPageReady = false;
  isServiceError = false;
  noDataMessage = 'No unreturned security deposits for the selected office access.';
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();
  private loadId = 0;
  private summaryScrollHost: HTMLElement | null = null;
  private summaryScrollHandler = (): void => this.scheduleSummaryAlignment();

  showPaymentForm = false;
  isSubmittingPayment = false;
  paymentOfficeId: number | null = null;
  paymentTargetReservationId: string | null = null;
  paymentInitialAmount = 0;
  paymentInitialDescription = '';

  summaryPanelWidthPx = 0;
  summaryPanelMarginLeftPx = 0;
  summaryMinWidthPx = 0;
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

    this.reservationService.getUnreturnedSecurityDeposits(this.officeId).pipe(
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
        this.totalDepositsOwed = Number(mappedResponse.totalDepositsOwed ?? 0);
        this.escrowBalance = Number(mappedResponse.escrowBalance ?? 0);
        this.discrepancy = Number(mappedResponse.discrepancy ?? 0);
        this.escrowAccountLabel = String(mappedResponse.escrowAccountLabel ?? '').trim();
        this.reservationService.setSecurityDepositsOutstanding((mappedResponse.rows || []).length > 0);
        this.markViewForCheck();
        this.scheduleSummaryAlignmentRetries();
      },
      error: (_error: HttpErrorResponse) => {
        if (loadId !== this.loadId) {
          return;
        }

        this.isServiceError = true;
        this.rowsDisplay = [];
        this.totalDepositsOwed = 0;
        this.escrowBalance = 0;
        this.discrepancy = 0;
        this.escrowAccountLabel = '';
        this.reservationService.setSecurityDepositsOutstanding(false);
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
    return this.summaryPanelWidthPx > 0 && this.summaryMinWidthPx > 0;
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

    const scrollHost = wrap.querySelector<HTMLElement>('.is-scrollable');
    if (scrollHost && scrollHost !== this.summaryScrollHost) {
      this.summaryScrollHost?.removeEventListener('scroll', this.summaryScrollHandler);
      this.summaryScrollHost = scrollHost;
      scrollHost.addEventListener('scroll', this.summaryScrollHandler, { passive: true });
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
      && tableWidth === this.summaryMinWidthPx
    ) {
      return;
    }

    this.summaryPanelWidthPx = nextPanelWidth;
    this.summaryPanelMarginLeftPx = nextPanelMarginLeft;
    this.summaryMinWidthPx = tableWidth;
    this.markViewForCheck();
  }
  //#endregion

  //#region Form Response Methods
  onPayable(row: UnreturnedSecurityDepositDisplay): void {
    this.openApplyPaymentDialog(row);
  }

  openApplyPaymentDialog(row: UnreturnedSecurityDepositDisplay): void {
    const reservationId = String(row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const rowOfficeId = Number(row?.officeId ?? 0);
    this.paymentOfficeId = this.officeId ?? (Number.isFinite(rowOfficeId) && rowOfficeId > 0 ? rowOfficeId : null);
    if (!this.paymentOfficeId) {
      this.toastr.warning('Unable to determine office for selected security deposit.');
      return;
    }

    this.paymentTargetReservationId = reservationId;
    this.paymentInitialDescription = `${row.reservationCode} Security Deposit Return`.trim();
    this.paymentInitialAmount = this.roundCurrencyValue(Number(row.deposit ?? 0));
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

    this.isSubmittingPayment = true;
    this.reservationService.applySecurityDepositReturn(payment).pipe(
      take(1),
      finalize(() => {
        this.isSubmittingPayment = false;
        this.markViewForCheck();
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success('Security deposit return recorded.', CommonMessage.Success);
        this.showPaymentForm = false;
        this.clearPaymentContext();
        this.loadRows();
        this.reservationService.refreshSecurityDepositsOutstanding();
      },
      error: () => {
        this.toastr.error('Unable to return security deposit.', CommonMessage.Error);
      }
    });
  }

  onDepositReturnedCheckboxChange(event: UnreturnedSecurityDepositDisplay): void {
    const changedCheckboxColumn = (event as any)?.__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'depositReturned') {
      return;
    }

    const previousValue = (event as any)?.__previousCheckboxValue === true;
    const nextValue = (event as any)?.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyDepositReturnedValue(event.reservationId, nextValue);

    void this.reservationService.updateModifiedReservation(event.reservationId, { depositReturned: nextValue }).then(() => {
      this.toastr.success('Reservation updated.', CommonMessage.Success);
      this.loadRows();
      this.reservationService.refreshSecurityDepositsOutstanding();
    }).catch(() => {
      this.applyDepositReturnedValue(event.reservationId, previousValue);
      this.toastr.error('Unable to update reservation.', CommonMessage.Error);
      this.markViewForCheck();
    });
  }

  applyDepositReturnedValue(reservationId: string, depositReturned: boolean): void {
    const nextValue = !!depositReturned;
    this.rowsDisplay = this.rowsDisplay.map(row =>
      row.reservationId === reservationId
        ? { ...row, depositReturned: nextValue }
        : row
    );
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

  clearPaymentContext(): void {
    this.paymentTargetReservationId = null;
    this.paymentOfficeId = null;
    this.paymentInitialAmount = 0;
    this.paymentInitialDescription = '';
  }

  roundCurrencyValue(amount: number): number {
    if (!isFinite(amount)) {
      return 0;
    }
    return Math.round(amount * 100) / 100;
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
    this.summaryScrollHost?.removeEventListener('scroll', this.summaryScrollHandler);
    this.summaryResizeObserver?.disconnect();
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'securityDeposits');
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
