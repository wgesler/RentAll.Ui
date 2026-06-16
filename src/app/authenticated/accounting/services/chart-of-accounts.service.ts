import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { ChartOfAccountRequest, ChartOfAccountResponse } from '../models/chart-of-accounts.model';

@Injectable({
  providedIn: 'root'
})
export class ChartOfAccountsService {
  private readonly controller = this.configService.config().apiUrl + 'accounting/chart-of-account/';
  private allChartOfAccounts$ = new BehaviorSubject<ChartOfAccountResponse[]>([]);
  private chartOfAccountsLoaded$ = new BehaviorSubject<boolean>(false);
  private isChartOfAccountsLoading = false;

  constructor(
    private http: HttpClient,
    private configService: ConfigService) {
  }

  getChartOfAccountsForAllOffices(): Observable<ChartOfAccountResponse[]> {
    return this.http.get<ChartOfAccountResponse[]>(this.controller + 'office');
  }

  getChartOfAccountsByOfficeId(officeId: number): Observable<ChartOfAccountResponse[]> {
    return this.http.get<ChartOfAccountResponse[]>(this.controller + 'office/' + officeId);
  }

  getChartOfAccountById(officeId: number, accountId: number): Observable<ChartOfAccountResponse> {
    return this.http.get<ChartOfAccountResponse>(this.controller + 'office/' + officeId + '/accountId/' + accountId);
  }

  createChartOfAccount(body: ChartOfAccountRequest): Observable<ChartOfAccountResponse> {
    return this.http.post<ChartOfAccountResponse>(this.controller, body);
  }

  updateChartOfAccount(body: ChartOfAccountRequest): Observable<ChartOfAccountResponse> {
    return this.http.put<ChartOfAccountResponse>(this.controller, body);
  }

  deleteChartOfAccount(officeId: number, accountId: number): Observable<void> {
    return this.http.delete<void>(this.controller + 'office/' + officeId + '/accountId/' + accountId);
  }

  loadAllChartOfAccounts(): void {
    if (this.chartOfAccountsLoaded$.value || this.isChartOfAccountsLoading) {
      return;
    }
    this.fetchAllChartOfAccounts();
  }

  refreshAllChartOfAccounts(): void {
    if (this.isChartOfAccountsLoading) {
      return;
    }
    this.fetchAllChartOfAccounts();
  }

  fetchAllChartOfAccounts(): void {
    this.isChartOfAccountsLoading = true;
    this.getChartOfAccountsForAllOffices().subscribe({
      next: accounts => {
        this.allChartOfAccounts$.next(accounts || []);
        this.chartOfAccountsLoaded$.next(true);
        this.isChartOfAccountsLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        console.error('Chart of Accounts Service - Error loading all accounts:', err);
        this.allChartOfAccounts$.next([]);
        this.chartOfAccountsLoaded$.next(true);
        this.isChartOfAccountsLoading = false;
      }
    });
  }

  ensureChartOfAccountsLoaded(): void {
    if (this.chartOfAccountsLoaded$.value || this.isChartOfAccountsLoading) {
      return;
    }
    this.loadAllChartOfAccounts();
  }

  areChartOfAccountsLoaded(): Observable<boolean> {
    return this.chartOfAccountsLoaded$.asObservable();
  }

  clearChartOfAccounts(): void {
    this.allChartOfAccounts$.next([]);
    this.chartOfAccountsLoaded$.next(false);
    this.isChartOfAccountsLoading = false;
  }

  getAllChartOfAccounts(): Observable<ChartOfAccountResponse[]> {
    return this.allChartOfAccounts$.asObservable();
  }

  getAllChartOfAccountsValue(): ChartOfAccountResponse[] {
    return this.allChartOfAccounts$.value;
  }

  getChartOfAccountsForOffice(officeId: number): ChartOfAccountResponse[] {
    return this.allChartOfAccounts$.value.filter(account => account.officeId === officeId);
  }

  refreshChartOfAccountsForOffice(officeId: number): Observable<ChartOfAccountResponse[]> {
    return this.getChartOfAccountsByOfficeId(officeId).pipe(
      tap(accounts => {
        const filtered = this.allChartOfAccounts$.value.filter(account => account.officeId !== officeId);
        this.allChartOfAccounts$.next([...filtered, ...(accounts || [])]);
      })
    );
  }
}
