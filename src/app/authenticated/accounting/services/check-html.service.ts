import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { CheckHtmlResponse, CreateCheckHtmlRequest, UpdateCheckHtmlRequest } from '../models/check-html.model';

@Injectable({
  providedIn: 'root'
})
export class CheckHtmlService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/check-html';

  getCheckHtmlByScope(officeId?: number | null): Observable<string> {
    return this.getCheckHtmlResponseByScope(officeId).pipe(
      map(response => (response?.check || '').trim()),
      switchMap(template => this.resolveTemplate(template)),
      catchError(() => this.loadAssetCheckHtml())
    );
  }

  getCheckHtmlResponseByScope(officeId?: number | null): Observable<CheckHtmlResponse | null> {
    const params = officeId != null && officeId > 0 ? `?officeId=${officeId}` : '';
    return this.http.get<CheckHtmlResponse>(`${this.controller}${params}`).pipe(
      catchError(() => of(null))
    );
  }

  createCheckHtml(request: CreateCheckHtmlRequest): Observable<CheckHtmlResponse> {
    return this.http.post<CheckHtmlResponse>(this.controller, request);
  }

  updateCheckHtml(request: UpdateCheckHtmlRequest): Observable<CheckHtmlResponse> {
    return this.http.put<CheckHtmlResponse>(this.controller, request);
  }

  loadAssetCheckHtml(): Observable<string> {
    return this.http.get('assets/check.html', { responseType: 'text' }).pipe(
      map(html => (html || '').trim()),
      catchError(() => of(''))
    );
  }

  hasMergeTokens(template: string): boolean {
    return template.includes('{{payeeName}}') || template.includes('{{checkDate}}');
  }

  private resolveTemplate(template: string): Observable<string> {
    if (this.hasMergeTokens(template)) {
      return of(template);
    }
    return this.loadAssetCheckHtml();
  }
}
