import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { SUPPRESS_AUTH_LOGOUT_ON_ERROR, SUPPRESS_GLOBAL_ERROR_TOAST } from '../../../interceptor/http-context';
import { PhotoRequest, PhotoResponse } from '../../documents/models/photo.model';

@Injectable({
  providedIn: 'root'
})
export class InspectionPhotoService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'maintenance/inspection/photo/';
  private readonly uploadHttpContext = new HttpContext()
    .set(SUPPRESS_AUTH_LOGOUT_ON_ERROR, true)
    .set(SUPPRESS_GLOBAL_ERROR_TOAST, true);

  getPhotoByGuid(photoId: string): Observable<PhotoResponse> {
    return this.http.get<PhotoResponse>(this.controller + photoId);
  }

  uploadPhoto(photoRequest: PhotoRequest): Observable<PhotoResponse> {
    return this.http.post<PhotoResponse>(this.controller, photoRequest, { context: this.uploadHttpContext });
  }

  deletePhoto(photoId: string): Observable<void> {
    return this.http.delete<void>(this.controller + photoId);
  }
}
