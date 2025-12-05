import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { AgencyRequest, AgencyResponse } from '../models/agency.model';

@Injectable({
    providedIn: 'root'
})

export class AgencyService {
  
  private readonly controller = this.configService.config().apiUrl + 'agencies/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  getAgencyByGuid(agencyId: string): Observable<AgencyResponse> {
    return this.http.get<AgencyResponse>(this.controller + agencyId);
  }

  getAgencies(): Observable<AgencyResponse[]> {
    return this.http.get<AgencyResponse[]>(this.controller);
  }

  updateAgencyLogo(agencyId: string, agency: AgencyRequest): Observable<AgencyResponse> {
    return this.http.patch<AgencyResponse>(this.controller + agencyId, agency);
  }
}
