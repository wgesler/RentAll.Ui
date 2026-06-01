import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailGetRequest, EmailRequest, EmailResponse } from '../models/email.model';

/** Body for POST email/search — matches API GetEmailsDto. */
interface GetEmailsApiDto {
  officeIds: number[];
  propertyId?: string | null;
  reservationId?: string | null;
  emailTypeIds?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private readonly controller = this.configService.config().apiUrl + 'email/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  searchEmails(request: EmailGetRequest): Observable<EmailResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to load emails.');
    }

    const body: GetEmailsApiDto = {
      officeIds,
      propertyId: request.propertyId ?? null,
      reservationId: request.reservationId ?? null,
      emailTypeIds: request.emailTypeIds ?? null,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    };
    return this.http.post<EmailResponse[]>(`${this.controller}search`, body);
  }

  getEmails(): Observable<EmailResponse[]> {
    return this.http.get<EmailResponse[]>(this.controller);
  }

  getEmailByGuid(emailId: string): Observable<EmailResponse> {
    return this.http.get<EmailResponse>(this.controller + emailId);
  }

  deleteEmail(emailId: string): Observable<void> {
    return this.http.delete<void>(this.controller + emailId);
  }

  sendEmail(request: EmailRequest): Observable<EmailResponse> {
    return this.http.post<EmailResponse>(this.controller, request);
  }
}
