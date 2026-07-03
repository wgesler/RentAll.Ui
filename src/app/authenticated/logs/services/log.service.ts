import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AccountingErrorLogResponse, AccountingLogResponse, ApplicationLogResponse, DatabaseErrorLogResponse, GeneralErrorLogResponse } from '../models/log.model';

@Injectable({
  providedIn: 'root'
})
export class LogService {
  private readonly controller = this.configService.config().apiUrl + 'log/';

  constructor(private http: HttpClient, private configService: ConfigService) {}

  //#region Accounting Error Methods
  getAllAccountingError(): Observable<AccountingErrorLogResponse[]> {
    return this.http.get<AccountingErrorLogResponse[]>(this.controller + 'accounting-error');
  }

  getAccountingErrorById(accountingErrorId: string): Observable<AccountingErrorLogResponse> {
    return this.http.get<AccountingErrorLogResponse>(this.controller + 'accounting-error/' + accountingErrorId);
  }

  deleteAllAccountingError(): Observable<void> {
    return this.http.delete<void>(this.controller + 'accounting-error');
  }
  //#endregion

  //#region Accounting Log Methods
  getAllAccountingLog(): Observable<AccountingLogResponse[]> {
    return this.http.get<AccountingLogResponse[]>(this.controller + 'accounting-log');
  }

  getAccountingLogById(id: number): Observable<AccountingLogResponse> {
    return this.http.get<AccountingLogResponse>(this.controller + 'accounting-log/' + id);
  }

  deleteAllAccountingLog(): Observable<void> {
    return this.http.delete<void>(this.controller + 'accounting-log');
  }
  //#endregion

  //#region Application Log Methods
  getAllApplicationLog(): Observable<ApplicationLogResponse[]> {
    return this.http.get<ApplicationLogResponse[]>(this.controller + 'application-log');
  }

  getApplicationLogById(id: number): Observable<ApplicationLogResponse> {
    return this.http.get<ApplicationLogResponse>(this.controller + 'application-log/' + id);
  }

  deleteAllApplicationLog(): Observable<void> {
    return this.http.delete<void>(this.controller + 'application-log');
  }
  //#endregion

  //#region Database Error Methods
  getAllDatabaseError(): Observable<DatabaseErrorLogResponse[]> {
    return this.http.get<DatabaseErrorLogResponse[]>(this.controller + 'database-error');
  }

  getDatabaseErrorById(id: number): Observable<DatabaseErrorLogResponse> {
    return this.http.get<DatabaseErrorLogResponse>(this.controller + 'database-error/' + id);
  }

  deleteAllDatabaseError(): Observable<void> {
    return this.http.delete<void>(this.controller + 'database-error');
  }
  //#endregion

  //#region General Error Methods
  getAllGeneralError(): Observable<GeneralErrorLogResponse[]> {
    return this.http.get<GeneralErrorLogResponse[]>(this.controller + 'general-error');
  }

  getGeneralErrorById(id: number): Observable<GeneralErrorLogResponse> {
    return this.http.get<GeneralErrorLogResponse>(this.controller + 'general-error/' + id);
  }

  deleteAllGeneralError(): Observable<void> {
    return this.http.delete<void>(this.controller + 'general-error');
  }
  //#endregion
}
