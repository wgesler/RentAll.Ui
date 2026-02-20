import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { DocumentRequest, DocumentResponse, GenerateDocumentFromHtmlDto } from '../models/document.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  
  private readonly controller = this.configService.config().apiUrl + 'document/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {
  }

  // POST: Generate and download PDF from HTML (server-side) - returns Blob for download
  generateDownload(dto: GenerateDocumentFromHtmlDto): Observable<Blob> {
    return this.http.post(this.controller + 'generate-download', dto, { responseType: 'blob' });
  }

  // POST: Generate document from HTML and save to server (server-side) - returns DocumentResponse
  generate(dto: GenerateDocumentFromHtmlDto): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(this.controller + 'generate', dto);
  }
}

