import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailHtmlResponse } from '../models/email-html.model';

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
}
