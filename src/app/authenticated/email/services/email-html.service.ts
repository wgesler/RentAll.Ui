import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailHtmlResponse } from '../models/email-html.model';

@Injectable({
  providedIn: 'root'
})
export class EmailHtmlService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'email/email-html';

  getEmailHtml(officeId?: number | null, organizationId?: string | null): Observable<EmailHtmlResponse> {
    let params = new HttpParams();
    if (officeId != null && officeId > 0) {
      params = params.set('officeId', String(officeId));
    }
    if (organizationId) {
      params = params.set('organizationId', organizationId);
    }
    return this.http.get<EmailHtmlResponse>(this.controller, { params });
  }

  saveEmailHtml(emailHtml: EmailHtmlResponse): Observable<EmailHtmlResponse> {
    return this.http.put<EmailHtmlResponse>(this.controller, emailHtml);
  }
}
