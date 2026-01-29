import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
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

  // GET: Get all documents
  getDocuments(): Observable<DocumentResponse[]> {
    return this.http.get<DocumentResponse[]>(this.controller);
  }

  // GET: Get document by ID
  getDocumentByGuid(documentId: string): Observable<DocumentResponse> {
    return this.http.get<DocumentResponse>(this.controller + documentId);
  }

  // GET: Get documents by office ID
  getDocumentsByOffice(officeId: number): Observable<DocumentResponse[]> {
    return this.http.get<DocumentResponse[]>(this.controller + 'office/' + officeId);
  }

  // GET: Get documents by property ID and type
  getByPropertyType(propertyId: string, id: number): Observable<DocumentResponse[]> {
    return this.http.get<DocumentResponse[]>(this.controller + 'property/' + propertyId + '/type/' + id);
  }

  // POST: Create a new document
  createDocument(document: DocumentRequest): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(this.controller, document);
  }

  // PUT: Update entire document
  updateDocument(document: DocumentRequest): Observable<DocumentResponse> {
    return this.http.put<DocumentResponse>(this.controller, document);
  }

  // DELETE: Delete document
  deleteDocument(documentId: string): Observable<void> {
    return this.http.delete<void>(this.controller + documentId);
  }

  // POST: Upload document file
  uploadDocument(formData: FormData): Observable<DocumentResponse> {
    return this.http.post<DocumentResponse>(this.controller + 'upload', formData);
  }

  // GET: Download document file
  downloadDocument(documentId: string): Observable<Blob> {
    return this.http.get(this.controller + documentId + '/download', { responseType: 'blob' });
  }

  // POST: Generate and download PDF from HTML (server-side) - returns Blob for download
  generateDownload(dto: GenerateDocumentFromHtmlDto): Observable<Blob> {
    // Convert DocumentType enum to DocumentTypeId (number) for API
    const requestBody = {
      htmlContent: dto.htmlContent,
      organizationId: dto.organizationId,
      officeId: dto.officeId,
      officeName: dto.officeName,
      propertyId: dto.propertyId || null,
      reservationId: dto.reservationId || null,
      documentTypeId: Number(dto.documentType), // Explicitly convert enum to number
      fileName: dto.fileName
    };
    return this.http.post(this.controller + 'generate-download', requestBody, { responseType: 'blob' });
  }

  // POST: Generate document from HTML and save to server (server-side) - returns DocumentResponse
  generate(dto: GenerateDocumentFromHtmlDto): Observable<DocumentResponse> {
    // Convert DocumentType enum to DocumentTypeId (number) for API
    const requestBody = {
      htmlContent: dto.htmlContent,
      organizationId: dto.organizationId,
      officeId: dto.officeId,
      officeName: dto.officeName,
      propertyId: dto.propertyId || null,
      reservationId: dto.reservationId || null,
      documentTypeId: Number(dto.documentType), // Explicitly convert enum to number
      fileName: dto.fileName
    };
    return this.http.post<DocumentResponse>(this.controller + 'generate', requestBody);
  }

}

