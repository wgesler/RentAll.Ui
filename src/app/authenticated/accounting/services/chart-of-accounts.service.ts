import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { ChartOfAccountsRequest, ChartOfAccountsResponse } from '../models/chart-of-accounts.model';

@Injectable({
    providedIn: 'root'
})

export class ChartOfAccountsService {
  
  private readonly controller = this.configService.config().apiUrl + 'chartofaccount/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get chart of accounts by office ID
  getChartOfAccountsByOfficeId(officeId: number): Observable<ChartOfAccountsResponse[]> {
    return this.http.get<ChartOfAccountsResponse[]>(this.controller + 'office/' + officeId);
  }

  // GET: Get chart of account by office ID and chart of account ID
  getChartOfAccountById(chartOfAccountId: number, officeId: number): Observable<ChartOfAccountsResponse> {
    return this.http.get<ChartOfAccountsResponse>(this.controller + 'office/' + officeId + '/chartOfAccountId/' + chartOfAccountId);
  }

  // GET: Get chart of account by office ID and account number
  getChartOfAccountByAccountId(accountId: number, officeId: number): Observable<ChartOfAccountsResponse> {
    return this.http.get<ChartOfAccountsResponse>(this.controller + 'office/' + officeId + '/accountNumber/' + accountId);
  }

  // POST: Create a new chart of account
  createChartOfAccount(chartOfAccount: ChartOfAccountsRequest): Observable<ChartOfAccountsResponse> {
    return this.http.post<ChartOfAccountsResponse>(this.controller, chartOfAccount);
  }

  // PUT: Update entire chart of account
  updateChartOfAccount(chartOfAccount: ChartOfAccountsRequest): Observable<ChartOfAccountsResponse> {
    return this.http.put<ChartOfAccountsResponse>(this.controller, chartOfAccount);
  }

  // DELETE: Delete chart of account by office ID and chart of account ID
  deleteChartOfAccount(officeId: number, chartOfAccountId: number): Observable<void> {
    return this.http.delete<void>(this.controller + 'office/' + officeId + '/chartOfAccountId/' + chartOfAccountId);
  }
}
