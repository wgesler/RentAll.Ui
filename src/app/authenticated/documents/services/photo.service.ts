import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PhotoRequest, PhotoResponse } from '../models/photo.model';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  
  private readonly controller = this.configService.config().apiUrl + 'document/photo/';

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
    return this.http.post<PhotoResponse>(this.controller, photoRequest);
  }

  // DELETE: Delete a photo
  deletePhoto(photoId: string): Observable<void> {
    return this.http.delete<void>(this.controller + photoId);
  }
}