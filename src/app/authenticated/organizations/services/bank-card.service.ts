import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { BankCardRequest, BankCardResponse } from '../models/bank.model';

@Injectable({
  providedIn: 'root'
})
export class BankCardService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);


  private accountingOfficeController = this.configService.config().apiUrl + 'organization/accounting-office/';

  createBankCard(officeId: number, card: BankCardRequest): Observable<BankCardResponse> {
    return this.http.post<BankCardResponse>(this.accountingOfficeController + officeId + '/bank-card', card);
  }

  updateBankCard(officeId: number, bankCardId: number, card: BankCardRequest): Observable<BankCardResponse> {
    return this.http.put<BankCardResponse>(this.accountingOfficeController + officeId + '/bank-card/' + bankCardId, card);
  }

  deleteBankCard(officeId: number, bankCardId: number): Observable<void> {
    return this.http.delete<void>(this.accountingOfficeController + officeId + '/bank-card/' + bankCardId);
  }
}
