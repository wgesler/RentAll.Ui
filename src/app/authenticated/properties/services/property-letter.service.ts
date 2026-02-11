import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { PropertyLetterRequest, PropertyLetterResponse } from '../models/property-letter.model';

@Injectable({
    providedIn: 'root'
})

export class PropertyLetterService {
  
  private readonly controller = this.configService.config().apiUrl + 'propertyletter/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }


  // GET: Get property information by ID
  getPropertyInformationByGuid(propertyId: string): Observable<PropertyLetterResponse> {
    return this.http.get<PropertyLetterResponse>(this.controller + propertyId);
  }

  // POST: Create a new property letter
  createPropertyLetter(letter: PropertyLetterRequest): Observable<PropertyLetterResponse> {
   return this.http.post<PropertyLetterResponse>(this.controller, letter);
  }

  // PUT: Update property letter
  updatePropertyLetter(letter: PropertyLetterRequest): Observable<PropertyLetterResponse> {
    return this.http.put<PropertyLetterResponse>(this.controller, letter);
  }

  // DELETE: Delete property
  deletePropertyLetter(propertyId: string): Observable<void> {
    return this.http.delete<void>(this.controller + propertyId);
  }
}






