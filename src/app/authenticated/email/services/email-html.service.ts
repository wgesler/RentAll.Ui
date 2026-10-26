import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, of, shareReplay, tap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { EmailHtmlResponse } from '../models/email-html.model';

@Injectable({
  providedIn: 'root'
})
export class EmailHtmlService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'email/email-html';
  private emailHtml$ = new BehaviorSubject<EmailHtmlResponse | null>(null);
  private cacheKey: string | null = null;
  private loaded = false;
  private inflightKey: string | null = null;
  private inflight$: Observable<EmailHtmlResponse | null> | null = null;

  getEmailHtml$(): Observable<EmailHtmlResponse | null> {
    return this.emailHtml$.asObservable();
  }

  isLoadedFor(organizationId: string | null, officeId: number | null): boolean {
    return this.loaded && this.cacheKey === this.scopeKey(organizationId, officeId);
  }

  getEmailHtml(officeId?: number | null, organizationId?: string | null): Observable<EmailHtmlResponse> {
    let params = new HttpParams();
    if (officeId != null && officeId > 0) {
      params = params.set('officeId', String(officeId));
    }
    if (organizationId) {
      params = params.set('organizationId', organizationId);
    }
    return this.http.get<EmailHtmlResponse>(this.controller, { params });
  }

  ensureEmailHtmlLoaded(organizationId: string | null, officeId?: number | null): Observable<EmailHtmlResponse | null> {
    const key = this.scopeKey(organizationId, officeId ?? null);
    if (!organizationId) {
      this.clearEmailHtml();
      return of(null);
    }
    if (this.loaded && this.cacheKey === key) {
      return of(this.emailHtml$.value);
    }
    if (this.inflight$ && this.inflightKey === key) {
      return this.inflight$;
    }
    this.inflightKey = key;
    this.inflight$ = this.getEmailHtml(officeId, organizationId).pipe(
      tap(emailHtml => this.remember(organizationId, officeId ?? null, emailHtml)),
      catchError(() => {
        this.cacheKey = key;
        this.loaded = true;
        this.emailHtml$.next(null);
        return of(null);
      }),
      finalize(() => {
        this.inflight$ = null;
        this.inflightKey = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.inflight$;
  }

  remember(organizationId: string | null, officeId: number | null, emailHtml: EmailHtmlResponse | null): void {
    this.cacheKey = this.scopeKey(organizationId, officeId);
    this.loaded = true;
    this.emailHtml$.next(emailHtml);
  }

  clearEmailHtml(): void {
    this.cacheKey = null;
    this.loaded = false;
    this.inflight$ = null;
    this.inflightKey = null;
    this.emailHtml$.next(null);
  }

  saveEmailHtml(emailHtml: EmailHtmlResponse): Observable<EmailHtmlResponse> {
    return this.http.put<EmailHtmlResponse>(this.controller, emailHtml);
  }

  private scopeKey(organizationId: string | null, officeId: number | null): string {
    const office = officeId != null && officeId > 0 ? String(officeId) : '';
    return `${(organizationId || '').trim().toLowerCase()}|${office}`;
  }
}
