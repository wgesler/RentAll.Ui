import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { CheckHtmlResponse } from '../models/check-html.model';

@Injectable({
  providedIn: 'root'
})
export class CheckHtmlService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'accounting/check-html';

  getCheckHtmlByScope(officeId?: number | null): Observable<string> {
    const params = officeId != null && officeId > 0 ? `?officeId=${officeId}` : '';
    return this.http.get<CheckHtmlResponse>(`${this.controller}${params}`).pipe(
      map(response => (response?.check || '').trim()),
      switchMap(template => this.resolveTemplate(template)),
      catchError(() => this.loadAssetCheckHtml())
    );
  }

  loadAssetCheckHtml(): Observable<string> {
    return this.http.get('assets/check.html', { responseType: 'text' }).pipe(
      map(html => (html || '').trim()),
      catchError(() => of(''))
    );
  }

  private resolveTemplate(template: string): Observable<string> {
    if (template.includes('{{payeeName}}') || template.includes('{{checkDate}}')) {
      return of(template);
    }
    return this.loadAssetCheckHtml();
  }
}
