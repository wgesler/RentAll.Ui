import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../enums/common-message.enum';
import { ConfigService } from './config.service';
import { DailyQuote } from '../shared/models/daily-quote';
import { StateResponse } from '../shared/models/state-response';

@Injectable({
  providedIn: 'root'
})
export class CommonService {
  private dailyQuote$ = new BehaviorSubject<DailyQuote>(null);
  private states$ = new BehaviorSubject<StateResponse[]>([]);
  private validStates$ = new BehaviorSubject<string[]>([]);
  private readonly controller = this.configService.config().apiUrl + 'common/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private toastrService: ToastrService) {
  }

  getDailyQuote(): Observable<DailyQuote> {
    return this.dailyQuote$;
  }

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

  loadDailyQuote(): void {
    this.http.get<DailyQuote>(this.controller + 'daily-quote').pipe(take(1)).subscribe({
      next: (response) => {
        console.log('Daily Quote Response:', response);
        this.dailyQuote$.next(response);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Daily Quote Error:', err);
        if (err.status !== 400) {
          this.toastrService.error('Unable to load Daily Quote', CommonMessage.ServiceError);
        }
      }
    });
  }

  loadStates(): void {
    this.http.get<StateResponse[]>(this.controller + 'state').pipe(take(1)).subscribe({
      next: (response) => {
        console.log('States Response:', response);
        const states = response || [];
        // Save the entire structure
        this.states$.next(states);
        // Cache just the code values as string[]
        const stateCodes = states.map(state => state.code).filter(code => code && code !== '');
        console.log('State codes extracted:', stateCodes);
        this.validStates$.next(stateCodes);
      },
      error: (err: HttpErrorResponse) => {
        console.error('States Error:', err);
        if (err.status !== 400) {
          this.toastrService.error('Unable to load States', CommonMessage.ServiceError);
        }
      }
    });
  }
}
