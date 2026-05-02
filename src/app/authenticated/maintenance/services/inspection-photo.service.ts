import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PhotoRequest, PhotoResponse } from '../../documents/models/photo.model';

@Injectable({
  providedIn: 'root'
})
export class InspectionPhotoService {
  private readonly controller = this.configService.config().apiUrl + 'maintenance/inspection/photo/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  getPhotoByGuid(photoId: string): Observable<PhotoResponse> {
    return this.http.get<PhotoResponse>(this.controller + photoId);
  }

  uploadPhoto(photoRequest: PhotoRequest): Observable<PhotoResponse> {
    return this.http.post<PhotoResponse>(this.controller, photoRequest);
  }

  deletePhoto(photoId: string): Observable<void> {
    return this.http.delete<void>(this.controller + photoId);
  }
}
