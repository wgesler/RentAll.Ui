import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AlertGetRequest, AlertRequest, AlertResponse } from '../models/alert.model';

/** Body for POST email/alert/search — matches API GetAlertDto. */
interface GetAlertsApiDto {
  officeIds: number[];
  propertyId?: string | null;
  reservationId?: string | null;
  isActive?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'email/alert/';

  searchAlerts(request: AlertGetRequest): Observable<AlertResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to load alerts.');
    }

    const body: GetAlertsApiDto = {
      officeIds,
      propertyId: request.propertyId ?? null,
      reservationId: request.reservationId ?? null,
      isActive: request.isActive ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    };
    return this.http.post<AlertResponse[]>(`${this.controller}search`, body);
  }

  getAlerts(): Observable<AlertResponse[]> {
    return this.http.get<AlertResponse[]>(this.controller);
  }

  getAlertByGuid(alertId: string): Observable<AlertResponse> {
    return this.http.get<AlertResponse>(this.controller + alertId);
  }

  createAlert(request: AlertRequest): Observable<AlertResponse> {
    return this.http.post<AlertResponse>(this.controller, request);
  }

  updateAlert(request: AlertRequest): Observable<AlertResponse> {
    return this.http.put<AlertResponse>(this.controller, request);
  }

  deleteAlert(alertId: string): Observable<void> {
    return this.http.delete<void>(this.controller + alertId);
  }
}
