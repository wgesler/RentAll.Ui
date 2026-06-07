import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { SendDocumentForSignatureRequest, SendDocumentForSignatureResponse } from '../models/docusign.model';

@Injectable({
  providedIn: 'root'
})
export class DocuSignService {
  private readonly controller = this.configService.config().apiUrl + 'esignature/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  sendForSignature(request: SendDocumentForSignatureRequest): Observable<SendDocumentForSignatureResponse> {
    return this.http.post<SendDocumentForSignatureResponse>(`${this.controller}send-for-signature`, request);
  }
}
