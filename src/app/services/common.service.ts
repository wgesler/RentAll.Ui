import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { EmailRequest, EmailResponse } from '../authenticated/email/models/email.model';
import { OrganizationResponse } from '../authenticated/organizations/models/organization.model';
import { OrganizationService } from '../authenticated/organizations/services/organization.service';
import { DailyQuote } from '../shared/models/daily-quote';
import { StateResponse } from '../shared/models/state-response';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class CommonService {
  private dailyQuote$ = new BehaviorSubject<DailyQuote>(null);
  private states$ = new BehaviorSubject<StateResponse[]>([]);
  private validStates$ = new BehaviorSubject<string[]>([]);
  private organization$ = new BehaviorSubject<OrganizationResponse>(null);
  private readonly controller = this.configService.config().apiUrl + 'common/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private authService: AuthService,
    private organizationService: OrganizationService) {
  }

  // Daily Quote Methods
  getDailyQuote(): Observable<DailyQuote> {
    return this.dailyQuote$;
  }

  loadDailyQuote(): void {
    this.http.get<DailyQuote>(this.controller + 'daily-quote').pipe(take(1)).subscribe({
      next: (response) => {
        this.dailyQuote$.next(response);
      },
      error: () => {}
    });
  }

  
  // State Methods
  getStates(): Observable<string[]> {
    return this.validStates$;
  }

  getStatesValue(): string[] {
    return this.validStates$.value;
  }

  getStatesFull(): Observable<StateResponse[]> {
    return this.states$;
  }

  getStatesFullValue(): StateResponse[] {
    return this.states$.value;
  }

  getValidStates(): Observable<string[]> {
    return this.validStates$;
  }

  getValidStatesValue(): string[] {
    return this.validStates$.value;
  }

  loadStates(): void {
    this.http.get<StateResponse[]>(this.controller + 'state').pipe(take(1)).subscribe({
      next: (response) => {
        const states = response || [];
        // Save the entire structure
        this.states$.next(states);
        // Cache just the code values as string[]
        const stateCodes = states.map(state => state.code).filter(code => code && code !== '');
        this.validStates$.next(stateCodes);
      },
      error: () => {}
    });
  }

  // Organization Methods
  getOrganization(): Observable<OrganizationResponse> {
    return this.organization$;
  }

  getOrganizationValue(): OrganizationResponse {
    return this.organization$.value;
  }

  loadOrganization(): void {
    if (!this.authService.getIsLoggedIn()) {
      return;
    }

    const user = this.authService.getUser();
    if (!user || !user.organizationId) {
      return;
    }

    this.organizationService.getOrganizationByGuid(user.organizationId).pipe(take(1)).subscribe({
      next: (response) => {
        this.organization$.next(response);
      },
      error: () => {}
    });
  }

  sendEmail(request: EmailRequest): Observable<EmailResponse> {
    return this.http.post<EmailResponse>(this.controller + 'send-email', request);
  }
}
