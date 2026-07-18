import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, take } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UtilityService } from '../../../services/utility.service';
import {
  ReservationDepartureResponse,
  ReservationResponse,
  SecurityDepositReturnRequest,
  UnreturnedSecurityDepositsResponse
} from '../../reservations/models/reservation-model';

@Injectable({
  providedIn: 'root'
})
export class SecurityDepositService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private utility = inject(UtilityService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/security-deposit/';
  private readonly securityDepositsOutstandingSubject = new BehaviorSubject<boolean>(false);
  securityDepositsOutstanding$ = this.securityDepositsOutstandingSubject.asObservable();
  private securityDepositsOutstandingLoadId = 0;

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

  refreshSecurityDepositsOutstanding(): void {
    const loadId = ++this.securityDepositsOutstandingLoadId;

    this.getUnreturnedSecurityDeposits().pipe(take(1)).subscribe({
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

  updateSecurityDepositsOutstandingBadge(rows: ReservationDepartureResponse[] | null | undefined): void {
    this.setSecurityDepositsOutstanding(this.hasDepartedUnreturnedSecurityDeposits(rows));
  }

  setSecurityDepositsOutstanding(outstanding: boolean): void {
    this.securityDepositsOutstandingSubject.next(outstanding);
  }

  clearSecurityDepositsOutstanding(): void {
    this.securityDepositsOutstandingLoadId++;
    this.securityDepositsOutstandingSubject.next(false);
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
