import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailTemplateNameResponse, EmailTemplateResponse, EmailTemplateRequest } from '../models/sendgrid-template.model';

@Injectable({
  providedIn: 'root'
})
export class SendGridTemplateService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'email/email-template';

  getNames(): Observable<EmailTemplateNameResponse[]> {
    return this.http.get<EmailTemplateNameResponse[]>(this.controller + '/names');
  }

  getTemplates(organizationId: string): Observable<EmailTemplateResponse[]> {
    const params = new HttpParams().set('organizationId', organizationId);
    return this.http.get<EmailTemplateResponse[]>(this.controller, { params });
  }

  saveTemplate(request: EmailTemplateRequest): Observable<EmailTemplateResponse> {
    return this.http.put<EmailTemplateResponse>(this.controller, request);
  }

  deleteTemplate(emailTemplateId: number, organizationId: string): Observable<void> {
    const params = new HttpParams().set('organizationId', organizationId);
    return this.http.delete<void>(`${this.controller}/${emailTemplateId}`, { params });
  }
}
