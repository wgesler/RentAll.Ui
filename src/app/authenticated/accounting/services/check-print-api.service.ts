import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AssignCheckNumbersRequest, AssignCheckNumbersResponse } from '../../organizations/models/accounting-office.model';

@Injectable({
  providedIn: 'root'
})
export class CheckPrintApiService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/check-print/';

  assignCheckNumbers(request: AssignCheckNumbersRequest): Observable<AssignCheckNumbersResponse> {
    return this.http.post<AssignCheckNumbersResponse>(`${this.controller}assign-numbers`, request);
  }
}
