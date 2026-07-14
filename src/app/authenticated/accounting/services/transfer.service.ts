import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { MappingService } from '../../../services/mapping.service';
import { TransferRequest, TransferResponse, TransferSearchRequest } from '../models/transfer.model';

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
}
