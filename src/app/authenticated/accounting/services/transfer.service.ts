import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { TransferDepositAllocationRequest, TransferDepositAllocationResponse, TransferReportLineAllocationResponse, TransferRequest, TransferResponse, TransferSearchRequest } from '../models/transfer.model';

@Injectable({
  providedIn: 'root'
})
export class TransferService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private mappingService = inject(MappingService);

  readonly controller: string;

  constructor() {
    this.controller = this.configService.config().apiUrl + 'accounting/transfer/';
  }

  searchTransfers(request: TransferSearchRequest): Observable<TransferResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      return of([]);
    }

    return this.http.post<TransferResponse[]>(`${this.controller}search`, {
      officeIds,
      propertyId: request.propertyId || null,
      isActive: request.isActive ?? null,
      includeInactive: !!request.includeInactive,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    }).pipe(map(response => {
      const transfers = Array.isArray(response) ? response : [];
      return transfers.map(transfer => this.mappingService.mapTransferResponse(transfer));
    }));
  }

  getTransfers(propertyId?: string | null, officeId?: number | null): Observable<TransferResponse[]> {
    const request$ = propertyId
      ? this.http.get<TransferResponse[]>(this.controller + 'property/' + propertyId)
      : officeId != null && Number.isFinite(officeId) && officeId > 0
        ? this.http.get<TransferResponse[]>(this.controller + 'office/' + officeId)
        : this.http.get<TransferResponse[]>(this.controller);

    return request$.pipe(map(transfers => (transfers || []).map(transfer => this.mappingService.mapTransferResponse(transfer))));
  }

  getTransferById(transferId: string): Observable<TransferResponse> {
    return this.http.get<TransferResponse>(this.controller + transferId)
      .pipe(map(transfer => this.mappingService.mapTransferResponse(transfer)));
  }

  createTransfer(request: TransferRequest): Observable<TransferResponse> {
    return this.http.post<TransferResponse>(this.controller, request)
      .pipe(map(transfer => this.mappingService.mapTransferResponse(transfer)));
  }

  updateTransfer(request: TransferRequest): Observable<TransferResponse> {
    return this.http.put<TransferResponse>(this.controller, request)
      .pipe(map(transfer => this.mappingService.mapTransferResponse(transfer)));
  }

  deleteTransfer(transferId: string): Observable<void> {
    return this.http.delete<void>(this.controller + transferId);
  }

  postTransferReport(transferId: string): Observable<TransferResponse> {
    return this.http.post<TransferResponse>(`${this.controller}${transferId}/post-report`, {})
      .pipe(map(transfer => this.mappingService.mapTransferResponse(transfer)));
  }

  resolveTransferDepositAllocations(request: TransferDepositAllocationRequest): Observable<TransferDepositAllocationResponse[]> {
    return this.http.post<TransferDepositAllocationResponse[]>(`${this.controller}deposit-allocation`, {
      officeId: request.officeId,
      items: (request.items || []).map(item => ({
        depositId: item.depositId,
        journalEntryLineId: (item.journalEntryLineId || '').trim() || null,
        escrowAmount: Number(item.escrowAmount)
      }))
    }).pipe(map(response => (Array.isArray(response) ? response : []).map(item => ({
      depositId: String(item.depositId ?? (item as Record<string, unknown>)['DepositId'] ?? ''),
      journalEntryLineId: String(item.journalEntryLineId ?? (item as Record<string, unknown>)['JournalEntryLineId'] ?? '').trim() || null,
      ownerEscrow: Number(item.ownerEscrow ?? (item as Record<string, unknown>)['OwnerEscrow'] ?? 0) || 0,
      secDep: Number(item.secDep ?? (item as Record<string, unknown>)['SecDep'] ?? 0) || 0,
      sdw: Number(item.sdw ?? (item as Record<string, unknown>)['Sdw'] ?? 0) || 0,
      business: Number(item.business ?? (item as Record<string, unknown>)['Business'] ?? 0) || 0,
      propertyId: (item.propertyId ?? (item as Record<string, unknown>)['PropertyId'] ?? null) as string | null,
      reservationId: (item.reservationId ?? (item as Record<string, unknown>)['ReservationId'] ?? null) as string | null,
      contactId: (item.contactId ?? (item as Record<string, unknown>)['ContactId'] ?? null) as string | null,
      description: String(item.description ?? (item as Record<string, unknown>)['Description'] ?? '').trim()
    }))));
  }

  getTransferReportLineAllocations(transferId: string): Observable<TransferReportLineAllocationResponse[]> {
    return this.http.get<TransferReportLineAllocationResponse[]>(`${this.controller}${transferId}/report-line-allocations`)
      .pipe(map(response => (Array.isArray(response) ? response : []).map(item =>
        this.mappingService.mapTransferReportLineAllocationFromApi(item as unknown as Record<string, unknown>)
      )));
  }
}
