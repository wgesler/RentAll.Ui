import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
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
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { SecurityDepositReturnPaymentDialogComponent } from './security-deposit-return-payment-dialog.component';
import { SecurityDepositReturnPaymentSubmit } from './security-deposit-return-payment-dialog.model';

@Component({
  selector: 'app-security-deposits-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective, SecurityDepositReturnPaymentDialogComponent],
  templateUrl: './security-deposits-list.component.html',
  styleUrl: './security-deposits-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecurityDepositsListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() refreshTrigger = 0;

  private reservationService = inject(ReservationService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
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
  allRowsDisplay: UnreturnedSecurityDepositDisplay[] = [];
  isPageReady = false;
  isServiceError = false;
  noDataMessage = 'No unreturned security deposits for the selected office access.';
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['securityDeposits']));
  destroy$ = new Subject<void>();
  private loadId = 0;

  showPaymentForm = false;
  isSubmittingPayment = false;
  paymentOfficeId: number | null = null;
  paymentTargetReservationId: string | null = null;
  paymentInitialAmount = 0;
  paymentInitialDescription = '';

  //#region Security Deposits List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadRows();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadRows();
      return;
    }

    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyOfficeFilter();
      this.markViewForCheck();
    }
  }
  //#endregion

  //#region Data Load Methods
  loadRows(): void {
    const loadId = ++this.loadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'securityDeposits');

    this.reservationService.getUnreturnedSecurityDeposits().pipe(
      take(1),
      finalize(() => {
        if (loadId === this.loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'securityDeposits');
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: rows => {
        if (loadId !== this.loadId) {
          return;
        }

        this.allRowsDisplay = this.mappingService.mapUnreturnedSecurityDeposits(rows || []);
        this.applyOfficeFilter();
        this.reservationService.setSecurityDepositsOutstanding((rows || []).length > 0);
        this.markViewForCheck();
      },
      error: (_error: HttpErrorResponse) => {
        if (loadId !== this.loadId) {
          return;
        }

        this.isServiceError = true;
        this.allRowsDisplay = [];
        this.rowsDisplay = [];
        this.reservationService.setSecurityDepositsOutstanding(false);
        this.toastr.error('Unable to load security deposits.');
        this.markViewForCheck();
      }
    });
  }

  applyOfficeFilter(): void {
    if (this.officeId != null) {
      this.rowsDisplay = this.allRowsDisplay.filter(row => row.officeId === this.officeId);
    } else {
      this.rowsDisplay = [...this.allRowsDisplay];
    }
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
        this.removeReturnedRow(payment.reservationId);
        this.showPaymentForm = false;
        this.clearPaymentContext();
        this.applyOfficeFilter();
        this.reservationService.refreshSecurityDepositsOutstanding();
        this.markViewForCheck();
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
      if (nextValue) {
        this.removeReturnedRow(event.reservationId);
      }
      this.reservationService.refreshSecurityDepositsOutstanding();
    }).catch(() => {
      this.applyDepositReturnedValue(event.reservationId, previousValue);
      this.toastr.error('Unable to update reservation.', CommonMessage.Error);
      this.markViewForCheck();
    }).finally(() => {
      this.applyOfficeFilter();
      this.markViewForCheck();
    });
  }

  applyDepositReturnedValue(reservationId: string, depositReturned: boolean): void {
    const nextValue = !!depositReturned;
    this.allRowsDisplay = this.allRowsDisplay.map(row =>
      row.reservationId === reservationId
        ? { ...row, depositReturned: nextValue }
        : row
    );
    this.rowsDisplay = this.rowsDisplay.map(row =>
      row.reservationId === reservationId
        ? { ...row, depositReturned: nextValue }
        : row
    );
  }

  removeReturnedRow(reservationId: string): void {
    this.allRowsDisplay = this.allRowsDisplay.filter(row => row.reservationId !== reservationId);
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
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
