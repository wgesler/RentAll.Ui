import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, switchMap, take, tap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../models/accounting-office.model';

@Injectable({
  providedIn: 'root'
})

export class AccountingOfficeService {

  private allAccountingOffices$ = new BehaviorSubject<AccountingOfficeResponse[]>([]);
  private accountingOfficesLoaded$ = new BehaviorSubject<boolean>(false);
  private readonly controller = this.configService.config().apiUrl + 'organization/accounting-office/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  /** GET api/organization/accounting-office; API scope is user/org aware server-side. */
  loadAllAccountingOffices(): Observable<AccountingOfficeResponse[]> {
    return this.http.get<AccountingOfficeResponse[]>(this.controller).pipe(
      tap((rows) => {
        this.allAccountingOffices$.next(rows || []);
        this.accountingOfficesLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Accounting Office Service - Error loading all accounting offices:', err);
        this.allAccountingOffices$.next([]);
        this.accountingOfficesLoaded$.next(true);
        return of([]);
      })
    );
  }

  ensureAccountingOfficesLoaded(): Observable<AccountingOfficeResponse[]> {
    if (this.accountingOfficesLoaded$.value) {
      return this.getAllAccountingOffices().pipe(take(1));
    }
    return this.loadAllAccountingOffices().pipe(take(1), switchMap(() => this.getAllAccountingOffices().pipe(take(1))));
  }

  refreshAccountingOffices(): Observable<AccountingOfficeResponse[]> {
    this.accountingOfficesLoaded$.next(false);
    return this.loadAllAccountingOffices().pipe(take(1), switchMap(() => this.getAllAccountingOffices().pipe(take(1))));
  }

  areAccountingOfficesLoaded(): Observable<boolean> {
    return this.accountingOfficesLoaded$.asObservable();
  }

  clearAccountingOffices(): void {
    this.allAccountingOffices$.next([]);
    this.accountingOfficesLoaded$.next(false);
  }

  getAllAccountingOffices(): Observable<AccountingOfficeResponse[]> {
    return this.allAccountingOffices$.asObservable();
  }

  getAllAccountingOfficesValue(): AccountingOfficeResponse[] {
    return this.allAccountingOffices$.value;
  }

  /** GET accounting offices (one-shot HTTP; API filters by logged-in organization). */
  getAccountingOffices(): Observable<AccountingOfficeResponse[]> {
    return this.http.get<AccountingOfficeResponse[]>(this.controller);
  }

  getAccountingOfficeById(officeId: number): Observable<AccountingOfficeResponse> {
    return this.http.get<AccountingOfficeResponse>(this.controller + officeId);
  }

  createAccountingOffice(office: AccountingOfficeRequest): Observable<AccountingOfficeResponse> {
    return this.http.post<AccountingOfficeResponse>(this.controller, office);
  }

  updateAccountingOffice(office: AccountingOfficeRequest): Observable<AccountingOfficeResponse> {
    return this.http.put<AccountingOfficeResponse>(this.controller, office);
  }

  deleteAccountingOffice(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId);
  }
}
