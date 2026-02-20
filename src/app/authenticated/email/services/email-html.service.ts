import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailHtmlRequest, EmailHtmlResponse } from '../models/email-html.model';

@Injectable({
  providedIn: 'root'
})
export class EmailHtmlService {
  private readonly controller = this.configService.config().apiUrl + 'email/email-html/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  getEmailHtml(): Observable<EmailHtmlResponse> {
    return this.http.get<EmailHtmlResponse>(this.controller);
  }

  createEmailHtml(request: EmailHtmlRequest): Observable<EmailHtmlResponse> {
    return this.http.post<EmailHtmlResponse>(this.controller, request);
  }

  updateEmailHtml(request: EmailHtmlRequest): Observable<EmailHtmlResponse> {
    return this.http.put<EmailHtmlResponse>(this.controller, request);
  }

  deleteEmailHtml(emailHtmlId: string): Observable<void> {
    return this.http.delete<void>(this.controller + emailHtmlId);
  }
}
