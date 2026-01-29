import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../../services/config.service';
import { AccountingOfficeRequest, AccountingOfficeResponse } from '../models/accounting-office.model';

@Injectable({
    providedIn: 'root'
})

export class AccountingOfficeService {
  
  private readonly controller = this.configService.config().apiUrl + 'accounting-office/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
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
