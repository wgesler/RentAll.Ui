import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyPhotoRequest, PropertyPhotoResponse, UpdatePropertyPhotoOrderRequest } from '../models/property-photo.model';

@Injectable({
  providedIn: 'root'
})
export class PropertyPhotoService {
  private readonly controller = this.configService.config().apiUrl + 'property/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  getPropertyPhotoById(photoId: number): Observable<PropertyPhotoResponse> {
    return this.http.get<PropertyPhotoResponse>(this.controller + 'photo/' + photoId);
  }

  getPropertyPhotosByPropertyId(propertyId: string): Observable<PropertyPhotoResponse[]> {
    return this.http.get<PropertyPhotoResponse[]>(this.controller + propertyId + '/photos');
  }

  addPropertyPhoto(propertyId: string, photo: PropertyPhotoRequest): Observable<PropertyPhotoResponse> {
    return this.http.post<PropertyPhotoResponse>(this.controller + propertyId + '/photo', photo);
  }

  updatePropertyPhotoOrder(request: UpdatePropertyPhotoOrderRequest): Observable<PropertyPhotoResponse> {
    return this.http.put<PropertyPhotoResponse>(this.controller + 'photo/order', request);
  }

  deletePropertyPhotoById(photoId: number): Observable<void> {
    return this.http.delete<void>(this.controller + 'photo/' + photoId);
  }
}
