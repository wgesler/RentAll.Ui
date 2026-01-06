import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../../services/config.service';
import { OfficeConfigurationRequest, OfficeConfigurationResponse } from '../models/office-configuration.model';

@Injectable({
    providedIn: 'root'
})
export class OfficeConfigurationService {
  
  private readonly controller = this.configService.config().apiUrl + 'office/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get office configuration by office ID
  getOfficeConfigurationByOfficeId(officeId: number): Observable<OfficeConfigurationResponse> {
    return this.http.get<OfficeConfigurationResponse>(this.controller + officeId + '/configuration' );
  }

  // POST: Create a new office configuration
  createOfficeConfiguration(officeId: number, config: OfficeConfigurationRequest): Observable<OfficeConfigurationResponse> {
    return this.http.post<OfficeConfigurationResponse>(this.controller + officeId + '/configuration', config);
  }

  // PUT: Update entire office configuration
  updateOfficeConfiguration(officeId: number, config: OfficeConfigurationRequest): Observable<OfficeConfigurationResponse> {
    return this.http.put<OfficeConfigurationResponse>(this.controller + officeId + '/configuration', config);
  }

  // DELETE: Delete office configuration
  deleteOfficeConfiguration(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId + '/configuration');
  }
}

