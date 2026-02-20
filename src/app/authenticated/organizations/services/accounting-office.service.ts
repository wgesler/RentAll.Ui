import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../models/accounting-office.model';

@Injectable({
    providedIn: 'root'
})

export class AccountingOfficeService {
  
  private readonly controller = this.configService.config().apiUrl + 'organization/accounting-office/';
  private allAccountingOffices$ = new BehaviorSubject<AccountingOfficeResponse[]>([]);
  private accountingOfficesLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // Load all accounting offices on startup
  loadAllAccountingOffices(): void {
    const url = this.controller;
    
    this.http.get<AccountingOfficeResponse[]>(url).subscribe({
      next: (accountingOffices) => {
        this.allAccountingOffices$.next(accountingOffices || []);
        this.accountingOfficesLoaded$.next(true);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Accounting Office Service - Error loading all accounting offices:', err);
        this.allAccountingOffices$.next([]);
        this.accountingOfficesLoaded$.next(true); // Mark as loaded even on error
      }
    });
  }

  // Check if accounting offices have been loaded
  areAccountingOfficesLoaded(): Observable<boolean> {
    return this.accountingOfficesLoaded$.asObservable();
  }

  // Clear all accounting offices (e.g., on logout)
  clearAccountingOffices(): void {
    this.allAccountingOffices$.next([]);
    this.accountingOfficesLoaded$.next(false);
  }

  // Get all accounting offices as observable (returns BehaviorSubject - components should filter for non-empty)
  getAllAccountingOffices(): Observable<AccountingOfficeResponse[]> {
    return this.allAccountingOffices$.asObservable();
  }

  // Get all accounting offices value synchronously (returns current value)
  getAllAccountingOfficesValue(): AccountingOfficeResponse[] {
    return this.allAccountingOffices$.value;
  }

  // GET: Get all offices
  getAccountingOffices(): Observable<AccountingOfficeResponse[]> {
     return this.http.get<AccountingOfficeResponse[]>(this.controller);
  }

  // GET: Get office by ID
  getAccountingOfficeById(officeId: number): Observable<AccountingOfficeResponse> {
    return this.http.get<AccountingOfficeResponse>(this.controller + officeId);
  }

  // POST: Create a new office
  createAccountingOffice(office: AccountingOfficeRequest): Observable<AccountingOfficeResponse> {
    return this.http.post<AccountingOfficeResponse>(this.controller, office);
  }

  // PUT: Update entire office
  updateAccountingOffice(office: AccountingOfficeRequest): Observable<AccountingOfficeResponse> {
    return this.http.put<AccountingOfficeResponse>(this.controller, office);
  }

  // DELETE: Delete office
  deleteAccountingOffice(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId);
  }
}
