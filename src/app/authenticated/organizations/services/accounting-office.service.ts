import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, switchMap, take, tap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AccountingOfficeRequest, AccountingOfficeResponse, AccountingOfficeCheckNumberUpdateRequest, AccountingOfficeCheckNumberUpdateResponse, AccountingOfficeCheckStockUpdateRequest, AccountingOfficeCheckStockUpdateResponse, AccountingOfficeWorkOrderNoUpdateRequest, AccountingOfficeWorkOrderNoUpdateResponse } from '../models/accounting-office.model';

@Injectable({
  providedIn: 'root'
})

export class AccountingOfficeService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);


  private allAccountingOffices$ = new BehaviorSubject<AccountingOfficeResponse[]>([]);
  private accountingOfficesLoaded$ = new BehaviorSubject<boolean>(false);
  private readonly controller = this.configService.config().apiUrl + 'organization/accounting-office/';

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

  /** Reload the global accounting-office cache and push to all getAllAccountingOffices() subscribers. */
  notifyAccountingOfficesChanged(): void {
    this.refreshAccountingOffices().pipe(take(1)).subscribe();
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

  getAccountingOfficeById(officeId: number): Observable<AccountingOfficeResponse> {
    return this.http.get<AccountingOfficeResponse>(this.controller + officeId);
  }

  createAccountingOffice(office: AccountingOfficeRequest): Observable<AccountingOfficeResponse> {
    return this.http.post<AccountingOfficeResponse>(this.controller, office);
  }

  updateAccountingOffice(office: AccountingOfficeRequest): Observable<AccountingOfficeResponse> {
    return this.http.put<AccountingOfficeResponse>(this.controller, office);
  }

  updateAccountingOfficeWorkOrderNo(officeId: number, workOrderNo: number): Observable<AccountingOfficeWorkOrderNoUpdateResponse> {
    const body: AccountingOfficeWorkOrderNoUpdateRequest = { workOrderNo };
    return this.http.put<AccountingOfficeWorkOrderNoUpdateResponse>(this.controller + officeId + '/work-order-no', body);
  }

  updateAccountingOfficeCheckNumber(officeId: number, currentCheckNumber: number): Observable<AccountingOfficeCheckNumberUpdateResponse> {
    const body: AccountingOfficeCheckNumberUpdateRequest = { currentCheckNumber };
    return this.http.put<AccountingOfficeCheckNumberUpdateResponse>(this.controller + officeId + '/check-number', body);
  }

  updateAccountingOfficeCheckStock(officeId: number, body: AccountingOfficeCheckStockUpdateRequest): Observable<AccountingOfficeCheckStockUpdateResponse> {
    return this.http.put<AccountingOfficeCheckStockUpdateResponse>(this.controller + officeId + '/check-stock', body);
  }

  deleteAccountingOffice(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId);
  }

  getAccountingStartDate(office: AccountingOfficeResponse): Date {
    return new Date(office.startYear, office.startMonth - 1, 1);
  }

  getEarliestAccountingStartDate(offices: AccountingOfficeResponse[], officeIds?: number[]): Date | null {
    const scopedOffices = officeIds?.length
      ? offices.filter(office => officeIds.includes(Number(office.officeId)))
      : offices;

    if (!scopedOffices.length) {
      return null;
    }

    return scopedOffices.reduce<Date | null>((earliest, office) => {
      const start = this.getAccountingStartDate(office);
      return earliest == null || start < earliest ? start : earliest;
    }, null);
  }
}
