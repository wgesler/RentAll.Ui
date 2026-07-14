import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, switchMap, take, tap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { ChartOfAccountRequest, ChartOfAccountResponse } from '../models/chart-of-accounts.model';

@Injectable({
  providedIn: 'root'
})
export class ChartOfAccountsService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/chart-of-account/';
  private allChartOfAccounts$ = new BehaviorSubject<ChartOfAccountResponse[]>([]);
  private chartOfAccountsLoaded$ = new BehaviorSubject<boolean>(false);

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

  loadAllChartOfAccounts(): Observable<ChartOfAccountResponse[]> {
    return this.getChartOfAccountsForAllOffices().pipe(
      tap((accounts) => {
        this.allChartOfAccounts$.next(accounts || []);
        this.chartOfAccountsLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Chart of Accounts Service - Error loading all accounts:', err);
        this.allChartOfAccounts$.next([]);
        this.chartOfAccountsLoaded$.next(true);
        return of([]);
      })
    );
  }

  ensureChartOfAccountsLoaded(): Observable<ChartOfAccountResponse[]> {
    if (this.chartOfAccountsLoaded$.value) {
      return this.getAllChartOfAccounts().pipe(take(1));
    }
    return this.loadAllChartOfAccounts().pipe(take(1), switchMap(() => this.getAllChartOfAccounts().pipe(take(1))));
  }

  /** @deprecated Use ensureChartOfAccountsLoaded() */
  ensureChartOfAccountsLoaded$(): Observable<ChartOfAccountResponse[]> {
    return this.ensureChartOfAccountsLoaded();
  }

  refreshChartOfAccounts(): Observable<ChartOfAccountResponse[]> {
    this.chartOfAccountsLoaded$.next(false);
    return this.loadAllChartOfAccounts().pipe(take(1), switchMap(() => this.getAllChartOfAccounts().pipe(take(1))));
  }

  /** Reload the global chart-of-accounts cache and push to all getAllChartOfAccounts() subscribers. */
  notifyChartOfAccountsChanged(): void {
    this.refreshChartOfAccounts().pipe(take(1)).subscribe();
  }

  /** @deprecated Use notifyChartOfAccountsChanged() */
  refreshAllChartOfAccounts(): void {
    this.notifyChartOfAccountsChanged();
  }

  areChartOfAccountsLoaded(): Observable<boolean> {
    return this.chartOfAccountsLoaded$.asObservable();
  }

  clearChartOfAccounts(): void {
    this.allChartOfAccounts$.next([]);
    this.chartOfAccountsLoaded$.next(false);
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
    return this.refreshChartOfAccounts().pipe(
      take(1),
      switchMap(() => of(this.getChartOfAccountsForOffice(officeId)))
    );
  }
}
