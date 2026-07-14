import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AssignCheckNumbersRequest, AssignCheckNumbersResponse } from '../../organizations/models/accounting-office.model';

@Injectable({
  providedIn: 'root'
})
export class CheckPrintApiService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/check-print/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) { }

  assignCheckNumbers(request: AssignCheckNumbersRequest): Observable<AssignCheckNumbersResponse> {
    return this.http.post<AssignCheckNumbersResponse>(`${this.controller}assign-numbers`, request);
  }
}
