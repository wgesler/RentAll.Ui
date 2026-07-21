import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { SUPPRESS_GLOBAL_ERROR_TOAST } from '../../../interceptor/http-context';
import { ConfigService } from '../../../services/config.service';
import { UtilityService } from '../../../services/utility.service';
import {
  ReservationDepartureResponse,
  ReservationResponse,
  SecurityDepositReturnRequest,
  UnreturnedSecurityDepositsResponse
} from '../../reservations/models/reservation-model';

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
    this.setSecurityDepositsOutstanding(this.hasDepartedUnreturnedSecurityDeposits(rows));
  }

  setSecurityDepositsOutstanding(outstanding: boolean): void {
    this.securityDepositsOutstandingSubject.next(outstanding);
  }

  clearSecurityDepositsOutstanding(): void {
    this.cancelScheduledSecurityDepositsOutstandingRefresh();
    this.securityDepositsOutstandingLoadId++;
    this.securityDepositsOutstandingSubject.next(false);
  }

  private executeSecurityDepositsOutstandingRefresh(): void {
    const loadId = ++this.securityDepositsOutstandingLoadId;

    this.getUnreturnedSecurityDepositsForBadge().pipe(take(1)).subscribe({
      next: response => {
        if (loadId !== this.securityDepositsOutstandingLoadId) {
          return;
        }

        this.setSecurityDepositsOutstanding(this.hasDepartedUnreturnedSecurityDeposits(response?.rows));
      },
      error: () => {
        if (loadId !== this.securityDepositsOutstandingLoadId) {
          return;
        }

        this.setSecurityDepositsOutstanding(false);
      }
    });
  }

  private getUnreturnedSecurityDepositsForBadge(): Observable<UnreturnedSecurityDepositsResponse> {
    return this.http.get<UnreturnedSecurityDepositsResponse>(this.controller + 'unreturned', {
      context: new HttpContext().set(SUPPRESS_GLOBAL_ERROR_TOAST, true)
    });
  }

  private cancelScheduledSecurityDepositsOutstandingRefresh(): void {
    if (this.scheduledRefreshTimer == null) {
      return;
    }

    clearTimeout(this.scheduledRefreshTimer);
    this.scheduledRefreshTimer = null;
  }

  private hasDepartedUnreturnedSecurityDeposits(rows: ReservationDepartureResponse[] | null | undefined): boolean {
    const todayOrdinal = this.utility.parseCalendarDateToOrdinal(this.utility.todayAsCalendarDateString());
    if (todayOrdinal == null) {
      return false;
    }

    return (rows || []).some(row => {
      const departureOrdinal = this.utility.parseCalendarDateToOrdinal(row.departureDate);
      return departureOrdinal != null && departureOrdinal <= todayOrdinal;
    });
  }
}
