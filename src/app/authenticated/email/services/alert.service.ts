import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AlertRequest, AlertResponse } from '../models/alert.model';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private readonly controller = this.configService.config().apiUrl + 'email/alert/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

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
