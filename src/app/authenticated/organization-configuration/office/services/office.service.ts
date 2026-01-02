import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../../services/config.service';
import { OfficeRequest, OfficeResponse } from '../models/office.model';

@Injectable({
    providedIn: 'root'
})

export class OfficeService {
  
  private readonly controller = this.configService.config().apiUrl + 'office/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all offices
  getOffices(): Observable<OfficeResponse[]> {
    return this.http.get<OfficeResponse[]>(this.controller);
  }

  // GET: Get office by ID
  getOfficeById(officeId: number): Observable<OfficeResponse> {
    return this.http.get<OfficeResponse>(this.controller + officeId);
  }

  // POST: Create a new office
  createOffice(office: OfficeRequest): Observable<OfficeResponse> {
    return this.http.post<OfficeResponse>(this.controller, office);
  }

  // PUT: Update entire office
  updateOffice(officeId: number, office: OfficeRequest): Observable<OfficeResponse> {
    return this.http.put<OfficeResponse>(this.controller + officeId, office);
  }

  // DELETE: Delete office
  deleteOffice(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId);
  }
}




