import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, forkJoin, of } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { ChartOfAccountsRequest, ChartOfAccountsResponse } from '../models/chart-of-accounts.model';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { map, filter, take } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})

export class ChartOfAccountsService {
  
  private readonly controller = this.configService.config().apiUrl + 'chartofaccount/';
  private allChartOfAccounts$ = new BehaviorSubject<ChartOfAccountsResponse[]>([]);
  private chartOfAccountsLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
      private http: HttpClient,
      private configService: ConfigService,
      private officeService: OfficeService) {
  }

  // GET: Get chart of accounts by office ID
  getChartOfAccountsByOfficeId(officeId: number): Observable<ChartOfAccountsResponse[]> {
    return this.http.get<ChartOfAccountsResponse[]>(this.controller + 'office/' + officeId);
  }

  // GET: Get chart of account by office ID and chart of account ID
  getChartOfAccountById(chartOfAccountId: string, officeId: number): Observable<ChartOfAccountsResponse> {
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
  deleteChartOfAccount(officeId: number, chartOfAccountId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'office/' + officeId + '/chartOfAccountId/' + chartOfAccountId);
  }

  // Load all chart of accounts for all offices on startup
  loadAllChartOfAccounts(): void {
    // Wait for offices to be loaded first
    this.officeService.areOfficesLoaded().pipe(
      filter(loaded => loaded === true),
      take(1)
    ).subscribe({
      next: () => {
        // Get all offices
        const offices = this.officeService.getAllOfficesValue();
        
        if (!offices || offices.length === 0) {
          // No offices available, mark as loaded with empty array
          this.allChartOfAccounts$.next([]);
          this.chartOfAccountsLoaded$.next(true);
          return;
        }

        // Load chart of accounts for each office
        const loadObservables = offices.map(office =>
          this.getChartOfAccountsByOfficeId(office.officeId).pipe(
            map(accounts => accounts || [])
          )
        );

        // Wait for all chart of accounts to load
        forkJoin(loadObservables).subscribe({
          next: (results) => {
            // Flatten all results into a single array
            const allAccounts = results.flat();
            this.allChartOfAccounts$.next(allAccounts);
            this.chartOfAccountsLoaded$.next(true);
          },
          error: (err: HttpErrorResponse) => {
            console.error('Chart Of Accounts Service - Error loading all chart of accounts:', err);
            this.allChartOfAccounts$.next([]);
            this.chartOfAccountsLoaded$.next(true); // Mark as loaded even on error
          }
        });
      },
      error: () => {
        // If offices fail to load, mark chart of accounts as loaded with empty array
        this.allChartOfAccounts$.next([]);
        this.chartOfAccountsLoaded$.next(true);
      }
    });
  }

  // Check if chart of accounts have been loaded
  areChartOfAccountsLoaded(): Observable<boolean> {
    return this.chartOfAccountsLoaded$.asObservable();
  }

  // Clear all chart of accounts (e.g., on logout)
  clearChartOfAccounts(): void {
    this.allChartOfAccounts$.next([]);
    this.chartOfAccountsLoaded$.next(false);
  }

  // Get all chart of accounts as observable
  getAllChartOfAccounts(): Observable<ChartOfAccountsResponse[]> {
    return this.allChartOfAccounts$.asObservable();
  }

  // Get all chart of accounts value synchronously (returns current value)
  getAllChartOfAccountsValue(): ChartOfAccountsResponse[] {
    return this.allChartOfAccounts$.value;
  }

  // Get chart of accounts for a specific office
  getChartOfAccountsForOffice(officeId: number): ChartOfAccountsResponse[] {
    return this.allChartOfAccounts$.value.filter(coa => coa.officeId === officeId);
  }

  // Refresh chart of accounts for a specific office (useful after create/update/delete)
  refreshChartOfAccountsForOffice(officeId: number): void {
    this.getChartOfAccountsByOfficeId(officeId).subscribe({
      next: (accounts) => {
        const currentAccounts = this.allChartOfAccounts$.value;
        // Remove old accounts for this office
        const filteredAccounts = currentAccounts.filter(coa => coa.officeId !== officeId);
        // Add new accounts
        const updatedAccounts = [...filteredAccounts, ...(accounts || [])];
        this.allChartOfAccounts$.next(updatedAccounts);
      },
      error: (err: HttpErrorResponse) => {
        console.error(`Chart Of Accounts Service - Error refreshing chart of accounts for office ${officeId}:`, err);
      }
    });
  }
}
