
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { EmailResponse } from '../models/email.model';
import { OutstandingCheckEmailRequest, OutstandingCheckEmailResponse, OutstandingCheckListResponse, OutstandingCheckPreviewRequest, OutstandingCheckResponse, OutstandingCheckUpdateRequest } from '../models/outstanding-check.model';
import { NoteRequest, NoteResponse } from '../models/note.model';
import { OutstandingCheckPreviewResponse } from '../models/preview.model';

@Injectable({
  providedIn: 'root'
})

export class OutstandingCheckService {

  private readonly controller = this.configService.config().apiUrl + 'outstandingChecks/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService) {
  }


  // Get
  getOutstandingChecks(): Observable<OutstandingCheckListResponse> {
    return this.http.get<OutstandingCheckListResponse>(this.controller);
  }

  getOutstandingCheckByGuid(outstandingCheckId: string): Observable<OutstandingCheckResponse> {
    return this.http.get<OutstandingCheckResponse>(this.controller + outstandingCheckId);
  }

  getEmailPreview(outstandingCheckId: string, request: OutstandingCheckPreviewRequest): Observable<OutstandingCheckPreviewResponse> {
    return this.http.patch<OutstandingCheckPreviewResponse>(this.controller + outstandingCheckId + '/preview', request);
  }

  getEmailsByOutstandingCheckId(outstandingCheckId: string): Observable<EmailResponse[]> {
    return this.http.get<EmailResponse[]>(this.controller + outstandingCheckId + '/emails');
  }

  getNotesByOutstandingCheckId(outstandingCheckId: string): Observable<NoteResponse[]> {
    return this.http.get<NoteResponse[]>(this.controller + outstandingCheckId + '/notes');
  }

  syncWithRamquest(): Observable<boolean> {
    return this.http.get<boolean>(this.controller + 'ramquest');
  }

  // Patch
  updateOustandingCheck(outstandingCheckGuid: string, request: OutstandingCheckUpdateRequest): Observable<OutstandingCheckResponse> {
    return this.http.patch<OutstandingCheckResponse>(this.controller + outstandingCheckGuid, request);
  }
  
  sendEmails(request: OutstandingCheckEmailRequest): Observable<OutstandingCheckEmailResponse> {
    return this.http.patch<OutstandingCheckEmailResponse>(this.controller + 'emails', request);
  }

  // Post
  addNote(outstandingCheckGuid: string, request: NoteRequest): Observable<NoteResponse> {
    return this.http.post<NoteResponse>(this.controller + outstandingCheckGuid + '/note', request);
  }
}

