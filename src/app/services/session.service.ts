import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../enums/common-message.enum';
import { SessionDataResponse } from '../public/login/models/session-data-response';
import { ConfigService } from './config.service';
import { AuthService } from './auth.service';
import { LoginDetails } from '../public/login/models/auth';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  public sessionCalculatorId$ = new BehaviorSubject<string>(null);
  public sessionCompanyName$ = new BehaviorSubject<string>(null);
  public isPasswordDialogOpen: boolean = false;
  private sessionData$ = new BehaviorSubject<SessionDataResponse>(null);
  private readonly controller = 'session/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private toastr: ToastrService,
    private authService: AuthService) { }

  getSession(): Observable<SessionDataResponse> {
    return this.http.get<SessionDataResponse>(this.configService.config().apiUrl + this.controller).pipe(
      tap((response: SessionDataResponse) => this.setSessionData(response))
    );
  }

  setSessionData(data: SessionDataResponse): void {
    this.sessionData$.next(data);
    const loginDetail = this.sessionData$.value?.data?.find(d => d.name === 'LoginDetail')?.value as LoginDetails;
    this.sessionCompanyName$.next(loginDetail.companyName);
  }

  getSessionCompanyApps(): string[] {
    const apps = this.sessionData$.value?.data?.find(data => data.name === 'ComApps')?.value as string[];
    if (apps) {
      return apps;
    }

    this.sessionLogout();
    return null;
  }

  getSessionLoginDetails(): LoginDetails {
    const details = this.sessionData$.value?.data?.find(data => data.name === 'LoginDetail')?.value as LoginDetails;
    if (details) {
      return details;
    }

    this.sessionLogout();
    return null;
  }

  getSessionUserRoles(): string[] {
    const jwtUser = this.authService.getUser();
    if (jwtUser && jwtUser.userGroups) {
       return jwtUser.userGroups;
    }
    return [];
  }

  sessionLogout(): void {
    this.toastr.error('Session Data is Missing or Invalid.  Please log in again to continue.', CommonMessage.Error);
    this.authService.logout();
  }
}
