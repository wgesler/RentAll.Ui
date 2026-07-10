import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { MaintenanceListSearchRequest } from '../models/maintenance-search.model';
import { DepositRequest, DepositResponse } from '../models/deposit.model';

@Injectable({
  providedIn: 'root'
})
export class DepositService {
  readonly controller: string;

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private mappingService: MappingService
  ) {
    this.controller = this.configService.config().apiUrl + 'accounting/bank-deposit/';
  }

  searchDeposits(request: MaintenanceListSearchRequest): Observable<DepositResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      return of([]);
    }

    return this.http.post<DepositResponse[]>(`${this.controller}search`, {
      officeIds,
      propertyId: request.propertyId || null,
      isActive: request.isActive ?? null,
      includeInactive: !!request.includeInactive,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(map(deposits => (deposits || []).map(deposit => this.mappingService.mapDepositResponse(deposit))));
  }

  getDeposits(propertyId?: string | null, officeId?: number | null): Observable<DepositResponse[]> {
    const request$ = propertyId
      ? this.http.get<DepositResponse[]>(this.controller + 'property/' + propertyId)
      : officeId != null && Number.isFinite(officeId) && officeId > 0
        ? this.http.get<DepositResponse[]>(this.controller + 'office/' + officeId)
        : this.http.get<DepositResponse[]>(this.controller);

    return request$.pipe(map(deposits => (deposits || []).map(deposit => this.mappingService.mapDepositResponse(deposit))));
  }

  getDepositById(depositId: string): Observable<DepositResponse> {
    return this.http.get<DepositResponse>(this.controller + depositId)
      .pipe(map(deposit => this.mappingService.mapDepositResponse(deposit)));
  }

  createDeposit(request: DepositRequest): Observable<DepositResponse> {
    return this.http.post<DepositResponse>(this.controller, request)
      .pipe(map(deposit => this.mappingService.mapDepositResponse(deposit)));
  }

  updateDeposit(request: DepositRequest): Observable<DepositResponse> {
    return this.http.put<DepositResponse>(this.controller, request)
      .pipe(map(deposit => this.mappingService.mapDepositResponse(deposit)));
  }

  deleteDeposit(depositId: string): Observable<void> {
    return this.http.delete<void>(this.controller + depositId);
  }
}
