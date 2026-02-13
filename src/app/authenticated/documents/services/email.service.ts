import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailRequest, EmailResponse } from '../models/email.model';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private readonly controller = this.configService.config().apiUrl + 'email/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  sendEmail(request: EmailRequest): Observable<EmailResponse> {
    return this.http.post<EmailResponse>(this.controller, request);
  }
}
