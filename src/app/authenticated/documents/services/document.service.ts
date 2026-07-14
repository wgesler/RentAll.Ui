import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { DocumentGetRequest, DocumentRequest, DocumentResponse, GenerateDocumentFromHtmlDto } from '../models/document.model';

/** Body for POST document/search — matches API GetDocumentsDto. */
interface GetDocumentsApiDto {
  officeIds: number[];
  propertyId?: string | null;
  documentTypeIds?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  
  private readonly controller = this.configService.config().apiUrl + 'document/';

  getDocuments(request: DocumentGetRequest): Observable<DocumentResponse[]> {
    const officeIds = (request.officeIds ?? []).filter(id => id > 0);
    if (officeIds.length === 0) {
      throw new Error('At least one office ID is required to load documents.');
    }

    const body = this.toGetDocumentsApiDto(request, officeIds);
    return this.http.post<DocumentResponse[]>(`${this.controller}search`, body);
  }

  private toGetDocumentsApiDto(request: DocumentGetRequest, officeIds: number[]): GetDocumentsApiDto {
    let documentTypeIds: string | null = null;
    if (request.documentTypeIds != null && request.documentTypeIds !== undefined) {
      documentTypeIds = Array.isArray(request.documentTypeIds)
        ? request.documentTypeIds.join(',')
        : String(request.documentTypeIds);
      if (!documentTypeIds) {
        documentTypeIds = null;
      }
    }

    return {
      officeIds,
      propertyId: request.propertyId ?? null,
      documentTypeIds,
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null
    };
  }

  getDocumentByGuid(documentId: string): Observable<DocumentResponse> {
    return this.http.get<DocumentResponse>(this.controller + documentId);
  }

  createDocument(document: DocumentRequest): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(this.controller, document);
  }

  updateDocument(document: DocumentRequest): Observable<DocumentResponse> {
    return this.http.put<DocumentResponse>(this.controller, document);
  }

  deleteDocument(documentId: string): Observable<void> {
    return this.http.delete<void>(this.controller + documentId);
  }

  downloadDocument(documentId: string): Observable<Blob> {
    return this.http.get(this.controller + documentId + '/download', { responseType: 'blob' });
  }

  generateDownload(dto: GenerateDocumentFromHtmlDto): Observable<Blob> {
    return this.http.post(this.controller + 'generate-download', dto, { responseType: 'blob' });
  }

  generate(dto: GenerateDocumentFromHtmlDto): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(this.controller + 'generate', dto);
  }
}
