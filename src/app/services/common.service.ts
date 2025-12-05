import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../enums/common-message.enum';
import { ConfigService } from './config.service';
import { DailyQuote } from '../shared/models/daily-quote';

@Injectable({
  providedIn: 'root'
})
export class CommonService {
  private dailyQuote$ = new BehaviorSubject<DailyQuote>(null);
  private readonly controller = this.configService.config().apiUrl + 'common/';

  constructor(
    private http: HttpClient,
    private configService: ConfigService,
    private toastrService: ToastrService) {
    this.getQuote();
  }

  getDailyQuote(): Observable<DailyQuote> {
    return this.dailyQuote$;
  }

  getQuote(): void {
    this.http.get<DailyQuote>(this.controller + 'daily-quote').pipe(take(1)).subscribe({
      next: (response) => {
        this.dailyQuote$.next(response);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastrService.error('Unable to load Daily Quote', CommonMessage.ServiceError);
        }
      }
    });
  }
}
