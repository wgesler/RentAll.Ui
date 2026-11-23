import { HttpBackend, HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../services/config.service';
import { PayRequestAchRequest, PayRequestAchResponse, PayRequestFormResponse, PayRequestResponse, PayResponseResponse } from '../models/pay-request.model';

/** Anonymous calls for the payment pages: the payer has no RentAll login, the link token identifies the request. */
@Injectable({ providedIn: 'root' })
export class PayRequestService {
  private configService = inject(ConfigService);
  // Bypass the auth interceptors: these calls are anonymous.
  private rawHttp = new HttpClient(inject(HttpBackend));
  private readonly controller = this.configService.config().apiUrl + 'reservation/external/';

  getPayRequest(token: string): Observable<PayRequestResponse> {
    return this.rawHttp.get<PayRequestResponse>(this.controller + 'pay-request/' + encodeURIComponent(token));
  }

  createCardForm(token: string): Observable<PayRequestFormResponse> {
    return this.rawHttp.post<PayRequestFormResponse>(this.controller + 'pay-request/' + encodeURIComponent(token) + '/card-form', {});
  }

  saveAch(token: string, request: PayRequestAchRequest): Observable<PayRequestAchResponse> {
    return this.rawHttp.post<PayRequestAchResponse>(this.controller + 'pay-request/' + encodeURIComponent(token) + '/ach', request);
  }

  sendPayResponse(token: string, txId: string | null, consentId: string | null): Observable<PayResponseResponse> {
    let params = new HttpParams();
    if (txId) {
      params = params.set('TXID', txId);
    }
    if (consentId) {
      params = params.set('CID', consentId);
    }
    return this.rawHttp.get<PayResponseResponse>(this.controller + 'pay-response/' + encodeURIComponent(token), { params });
  }
}
