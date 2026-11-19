import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { SendGridTemplateNameResponse, SendGridTemplateResponse, SendGridTemplateSaveRequest } from '../models/sendgrid-template.model';

@Injectable({
  providedIn: 'root'
})
export class SendGridTemplateService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'email/email-template';

  getNames(): Observable<SendGridTemplateNameResponse[]> {
    return this.http.get<SendGridTemplateNameResponse[]>(this.controller + '/names');
  }

  getTemplates(organizationId: string): Observable<SendGridTemplateResponse[]> {
    const params = new HttpParams().set('organizationId', organizationId);
    return this.http.get<SendGridTemplateResponse[]>(this.controller, { params });
  }

  saveTemplate(request: SendGridTemplateSaveRequest): Observable<SendGridTemplateResponse> {
    return this.http.put<SendGridTemplateResponse>(this.controller, request);
  }

  deleteTemplate(emailTemplateId: number, organizationId: string): Observable<void> {
    const params = new HttpParams().set('organizationId', organizationId);
    return this.http.delete<void>(`${this.controller}/${emailTemplateId}`, { params });
  }
}
