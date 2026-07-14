import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { SendDocumentForSignatureRequest, SendDocumentForSignatureResponse } from '../models/docusign.model';

@Injectable({
  providedIn: 'root'
})
export class DocuSignService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'esignature/';

  sendForSignature(request: SendDocumentForSignatureRequest): Observable<SendDocumentForSignatureResponse> {
    return this.http.post<SendDocumentForSignatureResponse>(`${this.controller}send-for-signature`, request);
  }
}
