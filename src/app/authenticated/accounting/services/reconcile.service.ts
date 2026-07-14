import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { UtilityService } from '../../../services/utility.service';
import { ReconcileResponse } from '../models/reconcile.model';

@Injectable({
  providedIn: 'root'
})
export class ReconcileService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private utilityService: UtilityService) {}

  getReconcilesByAccountId(officeId: number, accountId: number): Observable<ReconcileResponse[]> {
    return this.http.get<ReconcileResponse[]>(`${this.controller}reconcile/office/${officeId}/account/${accountId}`).pipe(
      map(rows => (rows ?? []).map(row => this.mapReconcileResponse(row as unknown as Record<string, unknown>)))
    );
  }

  mapReconcileResponse(raw: Record<string, unknown>): ReconcileResponse {
    const base = raw as unknown as ReconcileResponse;
    return {
      reconcileId: Number(raw['reconcileId'] ?? raw['ReconcileId'] ?? base.reconcileId ?? 0),
      accountId: Number(raw['accountId'] ?? raw['AccountId'] ?? base.accountId ?? 0),
      organizationId: String(raw['organizationId'] ?? raw['OrganizationId'] ?? base.organizationId ?? ''),
      officeId: Number(raw['officeId'] ?? raw['OfficeId'] ?? base.officeId ?? 0),
      statementDate: this.utilityService.coerceCalendarDateStringFromApi(raw['statementDate'] ?? raw['StatementDate'] ?? base.statementDate) ?? null,
      endingBalance: this.toNullableNumber(raw['endingBalance'] ?? raw['EndingBalance'] ?? base.endingBalance),
      serviceChargeAmount: this.toNullableNumber(raw['serviceChargeAmount'] ?? raw['ServiceChargeAmount'] ?? base.serviceChargeAmount),
      serviceChargeDate: this.utilityService.coerceCalendarDateStringFromApi(raw['serviceChargeDate'] ?? raw['ServiceChargeDate'] ?? base.serviceChargeDate) ?? null,
      serviceChargeAccountId: this.toNullableInt(raw['serviceChargeAccountId'] ?? raw['ServiceChargeAccountId'] ?? base.serviceChargeAccountId),
      interestAmount: this.toNullableNumber(raw['interestAmount'] ?? raw['InterestAmount'] ?? base.interestAmount),
      interestDate: this.utilityService.coerceCalendarDateStringFromApi(raw['interestDate'] ?? raw['InterestDate'] ?? base.interestDate) ?? null,
      interestAccountId: this.toNullableInt(raw['interestAccountId'] ?? raw['InterestAccountId'] ?? base.interestAccountId)
    };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value == null || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNullableInt(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
