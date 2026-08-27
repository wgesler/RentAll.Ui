import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, take, throwError } from 'rxjs';
import { SUPPRESS_GLOBAL_ERROR_TOAST } from '../../../interceptor/http-context';
import { ConfigService } from '../../../services/config.service';
import { UtilityService } from '../../../services/utility.service';
import { ReservationDepartureResponse, ReservationResponse, SecurityDepositReturnRequest, UnreturnedSecurityDepositsResponse} from '../../reservations/models/reservation-model';
import { ReservationType } from '../../reservations/models/reservation-enum';

export interface SecurityDepositsOutstandingRefreshOptions {
  /** Wait before calling the API (used after login to avoid startup connection storms). */
  delayMs?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SecurityDepositService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private utility = inject(UtilityService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/security-deposit/';
  private readonly loginBadgeRefreshDelayMs = 3000;
  private readonly securityDepositsOutstandingSubject = new BehaviorSubject<boolean>(false);
  securityDepositsOutstanding$ = this.securityDepositsOutstandingSubject.asObservable();
  private securityDepositsOutstandingLoadId = 0;
  private scheduledRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  getUnreturnedSecurityDeposits(officeId?: number | null): Observable<UnreturnedSecurityDepositsResponse> {
    const params: Record<string, string | number> = {};
    if (officeId != null && officeId > 0) {
      params['officeId'] = officeId;
    }

    return this.http.get<UnreturnedSecurityDepositsResponse>(this.controller + 'unreturned', { params });
  }

  /**
   * Same Bank → Security Deposits list query. Blocks inactivation only when the reservation
   * appears on that list and still has outstanding TBR (balance minus paid).
   * Owner-type reservations skip the API call — they never carry billable security deposits.
   */
  shouldBlockReservationInactivation(
    reservationId: string,
    reservationTypeId?: number | null
  ): Observable<boolean> {
    if (this.isOwnerReservationType(reservationTypeId)) {
      return of(false);
    }

    const normalizedReservationId = this.utility.normalizeId(reservationId);
    if (!normalizedReservationId) {
      return of(false);
    }

    return this.http.get<UnreturnedSecurityDepositsResponse>(this.controller + 'unreturned', {
      context: new HttpContext().set(SUPPRESS_GLOBAL_ERROR_TOAST, true)
    }).pipe(
      map(response => this.shouldBlockReservationInactivationFromRows(response?.rows, normalizedReservationId)),
      catchError(error => throwError(() => error))
    );
  }

  isOwnerReservationType(reservationTypeId?: number | null): boolean {
    return Number(reservationTypeId) === ReservationType.Owner;
  }

  findUnreturnedSecurityDepositRow(
    rows: ReservationDepartureResponse[] | null | undefined,
    reservationId: string
  ): ReservationDepartureResponse | undefined {
    const normalizedReservationId = this.utility.normalizeId(reservationId);
    if (!normalizedReservationId) {
      return undefined;
    }

    return (rows || []).find(row => this.utility.normalizeId(row.reservationId) === normalizedReservationId);
  }

  /** Balance shown in Bank → Security Deposits TBR column. */
  getTbrBalanceAmount(row: ReservationDepartureResponse): number {
    const collectedAmount = Number(row.collectedAmount ?? 0);
    const owedAmount = Number(row.owedAmount ?? 0);
    const balanceAmount = Number.isFinite(Number(row.balanceAmount))
      ? Number(row.balanceAmount)
      : Math.max(0, collectedAmount - owedAmount);
    return Math.max(0, balanceAmount);
  }

  /** Remaining tenant return after the Paid column. */
  getRemainingTbrAmount(row: ReservationDepartureResponse): number {
    const paidAmount = Number(row.returnedAmount ?? 0);
    return Math.max(0, this.getTbrBalanceAmount(row) - paidAmount);
  }

  shouldBlockReservationInactivationFromRows(
    rows: ReservationDepartureResponse[] | null | undefined,
    reservationId: string
  ): boolean {
    const row = this.findUnreturnedSecurityDepositRow(rows, reservationId);
    if (!row) {
      return false;
    }

    return this.getRemainingTbrAmount(row) > 0.005;
  }

  applySecurityDepositReturn(request: SecurityDepositReturnRequest): Observable<ReservationResponse> {
    return this.http.put<ReservationResponse>(this.controller + 'return', request);
  }

  applySecurityDepositTransfer(request: SecurityDepositReturnRequest): Observable<ReservationResponse> {
    return this.http.put<ReservationResponse>(this.controller + 'transfer', request);
  }

  getSecurityDepositDetail(reservationId: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(this.controller + reservationId + '/detail');
  }

  refreshSecurityDepositsOutstanding(options?: SecurityDepositsOutstandingRefreshOptions): void {
    const delayMs = Math.max(0, options?.delayMs ?? 0);

    if (this.scheduledRefreshTimer != null) {
      return;
    }

    if (delayMs > 0) {
      this.scheduledRefreshTimer = setTimeout(() => {
        this.scheduledRefreshTimer = null;
        this.executeSecurityDepositsOutstandingRefresh();
      }, delayMs);
      return;
    }

    this.executeSecurityDepositsOutstandingRefresh();
  }

  scheduleSecurityDepositsOutstandingRefreshAfterLogin(): void {
    this.refreshSecurityDepositsOutstanding({ delayMs: this.loginBadgeRefreshDelayMs });
  }

  updateSecurityDepositsOutstandingBadge(rows: ReservationDepartureResponse[] | null | undefined): void {
    this.setSecurityDepositsOutstanding(this.hasSecurityDepositsNeedingAttention(rows));
  }

  setSecurityDepositsOutstanding(outstanding: boolean): void {
    this.securityDepositsOutstandingSubject.next(outstanding);
  }

  clearSecurityDepositsOutstanding(): void {
    this.cancelScheduledSecurityDepositsOutstandingRefresh();
    this.securityDepositsOutstandingLoadId++;
    this.securityDepositsOutstandingSubject.next(false);
  }

  executeSecurityDepositsOutstandingRefresh(): void {
    const loadId = ++this.securityDepositsOutstandingLoadId;

    this.getUnreturnedSecurityDepositsForBadge().pipe(take(1)).subscribe({
      next: response => {
        if (loadId !== this.securityDepositsOutstandingLoadId) {
          return;
        }

        this.setSecurityDepositsOutstanding(this.hasSecurityDepositsNeedingAttention(response?.rows));
      },
      error: () => {
        if (loadId !== this.securityDepositsOutstandingLoadId) {
          return;
        }

        this.setSecurityDepositsOutstanding(false);
      }
    });
  }

  getUnreturnedSecurityDepositsForBadge(): Observable<UnreturnedSecurityDepositsResponse> {
    // Same endpoint as the list, all offices in access (no officeId) — used for sidebar/login badge.
    return this.http.get<UnreturnedSecurityDepositsResponse>(this.controller + 'unreturned', {
      context: new HttpContext().set(SUPPRESS_GLOBAL_ERROR_TOAST, true)
    });
  }

  cancelScheduledSecurityDepositsOutstandingRefresh(): void {
    if (this.scheduledRefreshTimer == null) {
      return;
    }

    clearTimeout(this.scheduledRefreshTimer);
    this.scheduledRefreshTimer = null;
  }

  isDepartedSecurityDeposit(departureDate: string | null | undefined): boolean {
    const todayOrdinal = this.utility.parseCalendarDateToOrdinal(this.utility.todayAsCalendarDateString());
    if (todayOrdinal == null) {
      return false;
    }

    const departureOrdinal = this.utility.parseCalendarDateToOrdinal(departureDate);
    return departureOrdinal != null && departureOrdinal <= todayOrdinal;
  }

  /**
   * Needs attention: departed, not marked returned, and still has money to return and/or transfer.
   * Used by login/sidebar badge and list row dots so they stay aligned.
   */
  isSecurityDepositNeedingAttention(row: ReservationDepartureResponse | null | undefined): boolean {
    if (!row || row.depositReturned) {
      return false;
    }
    if (!this.isDepartedSecurityDeposit(row.departureDate)) {
      return false;
    }

    const collected = Number(row.collectedAmount ?? 0);
    const owed = Number(row.owedAmount ?? 0);
    const paid = Number(row.returnedAmount ?? 0);
    const transferred = Number(row.transferredAmount ?? 0);
    const balance = Number.isFinite(Number(row.balanceAmount))
      ? Number(row.balanceAmount)
      : Math.max(0, collected - owed);
    const remainingReturn = Math.max(0, balance - paid);
    const remainingTransfer = Math.max(0, owed - transferred);
    return remainingReturn > 0.005 || remainingTransfer > 0.005;
  }

  hasSecurityDepositsNeedingAttention(rows: ReservationDepartureResponse[] | null | undefined): boolean {
    return (rows || []).some(row => this.isSecurityDepositNeedingAttention(row));
  }
}
