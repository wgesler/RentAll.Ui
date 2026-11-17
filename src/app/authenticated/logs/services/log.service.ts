import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AccountingErrorLogResponse, AccountingLogResponse, ApplicationLogResponse, DatabaseErrorLogResponse, GeneralErrorLogResponse, PropertyUploadLogResponse } from '../models/log.model';

@Injectable({
  providedIn: 'root'
})
export class LogService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'log/';

  //#region Accounting Error Methods
  getAllAccountingError(): Observable<AccountingErrorLogResponse[]> {
    return this.http.get<AccountingErrorLogResponse[]>(this.controller + 'accounting-error');
  }

  deleteAllAccountingError(): Observable<void> {
    return this.http.delete<void>(this.controller + 'accounting-error');
  }
  //#endregion

  //#region Accounting Log Methods
  getAllAccountingLog(): Observable<AccountingLogResponse[]> {
    return this.http.get<AccountingLogResponse[]>(this.controller + 'accounting-log');
  }

  deleteAllAccountingLog(): Observable<void> {
    return this.http.delete<void>(this.controller + 'accounting-log');
  }
  //#endregion

  //#region Application Log Methods
  getAllApplicationLog(): Observable<ApplicationLogResponse[]> {
    return this.http.get<ApplicationLogResponse[]>(this.controller + 'application-log');
  }

  deleteAllApplicationLog(): Observable<void> {
    return this.http.delete<void>(this.controller + 'application-log');
  }
  //#endregion

  //#region Database Error Methods
  getAllDatabaseError(): Observable<DatabaseErrorLogResponse[]> {
    return this.http.get<DatabaseErrorLogResponse[]>(this.controller + 'database-error');
  }

  deleteAllDatabaseError(): Observable<void> {
    return this.http.delete<void>(this.controller + 'database-error');
  }
  //#endregion

  //#region General Error Methods
  getAllGeneralError(): Observable<GeneralErrorLogResponse[]> {
    return this.http.get<GeneralErrorLogResponse[]>(this.controller + 'general-error');
  }

  deleteAllGeneralError(): Observable<void> {
    return this.http.delete<void>(this.controller + 'general-error');
  }
  //#endregion

  //#region Property Upload Log Methods
  getAllPropertyUploadLog(): Observable<PropertyUploadLogResponse[]> {
    return this.http.get<PropertyUploadLogResponse[]>(this.controller + 'property-upload');
  }

  deleteAllPropertyUploadLog(): Observable<void> {
    return this.http.delete<void>(this.controller + 'property-upload');
  }
  //#endregion
}
