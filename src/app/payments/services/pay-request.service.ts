import { HttpBackend, HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { ConfigService } from '../../services/config.service';
import { PayRequestAchRequest, PayRequestAchResponse, PayRequestFormResponse, PayRequestResponse, PayResponseResponse } from '../models/pay-request.model';

/** Anonymous calls for the payment pages: the payer has no RentAll login, the link token identifies the request. */
@Injectable({ providedIn: 'root' })
export class PayRequestService {
  private configService = inject(ConfigService);
  // Bypass the auth interceptors: these calls are anonymous.
  private rawHttp = new HttpClient(inject(HttpBackend));
  private readonly controller = this.configService.config().apiUrl + 'reservation/external/';
  // One Number card form per payment link per page: every caller shares the same request and its result.
  private readonly cardForms = new Map<string, Observable<PayRequestFormResponse>>();

  getPayRequest(token: string): Observable<PayRequestResponse> {
    return this.rawHttp.get<PayRequestResponse>(this.controller + 'pay-request/' + encodeURIComponent(token));
  }

  createCardForm(token: string): Observable<PayRequestFormResponse> {
    let cardForm = this.cardForms.get(token);
    if (!cardForm) {
      cardForm = this.rawHttp.post<PayRequestFormResponse>(this.controller + 'pay-request/' + encodeURIComponent(token) + '/card-form', {}).pipe(shareReplay(1));
      this.cardForms.set(token, cardForm);
    }
    return cardForm;
  }

  /** Forget the shared card form so the next createCardForm asks Number for a new one (after an error or Try again). */
  clearCardForm(token: string): void {
    this.cardForms.delete(token);
  }

  saveAch(token: string, request: PayRequestAchRequest): Observable<PayRequestAchResponse> {
    return this.rawHttp.post<PayRequestAchResponse>(this.controller + 'pay-request/' + encodeURIComponent(token) + '/ach', request);
  }

  /** Passes on everything Number put on the return URL (TXID and CID are read; the rest is logged), plus the raw URL ending. */
  sendPayResponse(token: string, query: Record<string, string>, raw: string): Observable<PayResponseResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      params = params.set(key, value);
    }
    if (raw) {
      params = params.set('Raw', raw);
    }
    return this.rawHttp.get<PayResponseResponse>(this.controller + 'pay-response/' + encodeURIComponent(token), { params });
  }
}
