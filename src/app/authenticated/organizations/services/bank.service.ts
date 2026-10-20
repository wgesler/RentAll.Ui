import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { BankAccountRequest, BankAccountResponse } from '../models/bank.model';

@Injectable({
  providedIn: 'root'
})
export class BankService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private accountingOfficeController = this.configService.config().apiUrl + 'organization/accounting-office/';

  createBank(officeId: number, bank: BankAccountRequest): Observable<BankAccountResponse> {
    return this.http.post<BankAccountResponse>(this.accountingOfficeController + officeId + '/bank', bank);
  }

  updateBank(officeId: number, bankId: number, bank: BankAccountRequest): Observable<BankAccountResponse> {
    return this.http.put<BankAccountResponse>(this.accountingOfficeController + officeId + '/bank/' + bankId, bank);
  }

  deleteBank(officeId: number, bankId: number): Observable<void> {
    return this.http.delete<void>(this.accountingOfficeController + officeId + '/bank/' + bankId);
  }
}