import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { DocumentRequest, DocumentResponse, GenerateDocumentFromHtmlDto } from '../models/document.model';
import { PhotoRequest, PhotoResponse } from '../models/photo.model';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  
  private readonly controller = this.configService.config().apiUrl + 'document/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {
  }
  // GET: Get photo by ID
  getPhotoByGuid(photoId: string): Observable<PhotoResponse> {
    return this.http.get<PhotoResponse>(this.controller + photoId);
  }

  // POST: Upload a photo
  uploadPhoto(photoRequest: PhotoRequest): Observable<PhotoResponse> {
    return this.http.post<PhotoResponse>(this.controller + 'photo', photoRequest);
  }
  // DELETE: Delete a photo
  deletePhoto(photoId: string): Observable<void> {
    return this.http.delete<void>(this.controller + '/photo/' + photoId);
  }
}

