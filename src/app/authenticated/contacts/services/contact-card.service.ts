import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { ContactCardPanResponse, ContactCardRequest, ContactCardResponse } from '../models/contact.model';

@Injectable({ providedIn: 'root' })
export class ContactCardService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private readonly controller = this.configService.config().apiUrl + 'contact/';

  getContactCardPan(contactId: string, contactCardId: number): Observable<ContactCardPanResponse> {
    return this.http.get<ContactCardPanResponse>(this.controller + contactId + '/card/' + contactCardId + '/pan');
  }

  createContactCard(contactId: string, card: ContactCardRequest): Observable<ContactCardResponse> {
    return this.http.post<ContactCardResponse>(this.controller + contactId + '/card', card);
  }

  updateContactCard(contactId: string, contactCardId: number, card: ContactCardRequest): Observable<ContactCardResponse> {
    return this.http.put<ContactCardResponse>(this.controller + contactId + '/card/' + contactCardId, card);
  }

  deleteContactCard(contactId: string, contactCardId: number): Observable<void> {
    return this.http.delete<void>(this.controller + contactId + '/card/' + contactCardId);
  }
}
