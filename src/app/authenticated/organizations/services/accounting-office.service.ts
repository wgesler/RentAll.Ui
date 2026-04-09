import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, take, tap, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../models/accounting-office.model';

@Injectable({
  providedIn: 'root'
})

export class AccountingOfficeService {

  /** Matches OrganizationController: [Route("api/organization")] + [HttpGet("accounting-office")] (no org id in path). */
  private readonly controller = this.configService.config().apiUrl + 'organization/accounting-office/';
  private allAccountingOffices$ = new BehaviorSubject<AccountingOfficeResponse[]>([]);
  private accountingOfficesLoaded$ = new BehaviorSubject<boolean>(false);
  private loadedOrganizationId: string | null = null;

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  /** GET api/organization/accounting-office; organizationId only drives client cache scope. */
  loadAllAccountingOffices(organizationId: string): Observable<AccountingOfficeResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      this.allAccountingOffices$.next([]);
      this.accountingOfficesLoaded$.next(true);
      this.loadedOrganizationId = null;
      return of([]);
    }
    return this.http.get<AccountingOfficeResponse[]>(this.controller).pipe(
      tap((rows) => {
        const list = rows || [];
        const hasOrgIds = list.some(o => (o.organizationId || '').trim().length > 0);
        const scoped = hasOrgIds ? list.filter(o => (o.organizationId || '').trim() === id) : list;
        this.allAccountingOffices$.next(scoped);
        this.accountingOfficesLoaded$.next(true);
        this.loadedOrganizationId = id;
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Accounting Office Service - Error loading all accounting offices:', err);
        this.allAccountingOffices$.next([]);
        this.accountingOfficesLoaded$.next(true);
        this.loadedOrganizationId = id;
        return of([]);
      })
    );
  }

  ensureAccountingOfficesLoaded(organizationId: string): Observable<AccountingOfficeResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      this.clearAccountingOffices();
      return of([]);
    }
    if (this.accountingOfficesLoaded$.value && this.loadedOrganizationId === id) {
      return this.getAllAccountingOffices().pipe(take(1));
    }
    return this.loadAllAccountingOffices(id).pipe(take(1), switchMap(() => this.getAllAccountingOffices().pipe(take(1))));
  }

  refreshAccountingOffices(organizationId: string): Observable<AccountingOfficeResponse[]> {
    this.accountingOfficesLoaded$.next(false);
    this.loadedOrganizationId = null;
    return this.loadAllAccountingOffices(organizationId).pipe(take(1), switchMap(() => this.getAllAccountingOffices().pipe(take(1))));
  }

  areAccountingOfficesLoaded(): Observable<boolean> {
    return this.accountingOfficesLoaded$.asObservable();
  }

  clearAccountingOffices(): void {
    this.allAccountingOffices$.next([]);
    this.accountingOfficesLoaded$.next(false);
    this.loadedOrganizationId = null;
  }

  getAllAccountingOffices(): Observable<AccountingOfficeResponse[]> {
    return this.allAccountingOffices$.asObservable();
  }

  getAllAccountingOfficesValue(): AccountingOfficeResponse[] {
    return this.allAccountingOffices$.value;
  }

  /** GET accounting offices for an organization (one-shot HTTP; prefer ensureAccountingOfficesLoaded for cache). */
  getAccountingOffices(organizationId: string): Observable<AccountingOfficeResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      return throwError(() => new Error('organizationId is required to load accounting offices'));
    }
    return this.http.get<AccountingOfficeResponse[]>(this.controller).pipe(
      map(list => {
        const rows = list || [];
        const hasOrgIds = rows.some(o => (o.organizationId || '').trim().length > 0);
        return hasOrgIds ? rows.filter(o => (o.organizationId || '').trim() === id) : rows;
      })
    );
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
