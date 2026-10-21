import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, shareReplay, switchMap, take, tap, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { TerminologyRequest, TerminologyResponse } from '../models/terminology.model';

@Injectable({
  providedIn: 'root'
})
export class TerminologyService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'organization/terminology/';
  private allTerminologies$ = new BehaviorSubject<TerminologyResponse[]>([]);
  private terminologiesLoaded$ = new BehaviorSubject<boolean>(false);
  private terminologiesLoad$: Observable<TerminologyResponse[]> | null = null;

  loadAllTerminologies(): Observable<TerminologyResponse[]> {
    return this.http.get<TerminologyResponse[]>(this.controller).pipe(
      tap(terminologies => {
        this.allTerminologies$.next(terminologies || []);
        this.terminologiesLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        this.allTerminologies$.next([]);
        return throwError(() => err);
      })
    );
  }

  ensureTerminologiesLoaded(): Observable<TerminologyResponse[]> {
    if (this.terminologiesLoaded$.value) return this.getAllTerminologies().pipe(take(1));
    if (!this.terminologiesLoad$) {
      this.terminologiesLoad$ = this.loadAllTerminologies().pipe(
        take(1),
        switchMap(() => this.getAllTerminologies().pipe(take(1))),
        finalize(() => this.terminologiesLoad$ = null),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.terminologiesLoad$;
  }

  refreshCacheAfterMutation<T>(source: Observable<T>): Observable<T> {
    return source.pipe(switchMap(result => this.loadAllTerminologies().pipe(map(() => result))));
  }

  getAllTerminologies(): Observable<TerminologyResponse[]> {
    return this.allTerminologies$.asObservable();
  }

  getTerminologyById(termId: number): Observable<TerminologyResponse> {
    return this.http.get<TerminologyResponse>(this.controller + termId);
  }

  getTerminologyByTerm(term: string, officeId: number): Observable<TerminologyResponse> {
    return this.http.get<TerminologyResponse>(this.controller + 'by-term', { params: { term, officeId: String(officeId) } });
  }

  createTerminology(terminology: TerminologyRequest): Observable<TerminologyResponse> {
    return this.refreshCacheAfterMutation(this.http.post<TerminologyResponse>(this.controller, terminology));
  }

  updateTerminology(terminology: TerminologyRequest): Observable<TerminologyResponse> {
    return this.refreshCacheAfterMutation(this.http.put<TerminologyResponse>(this.controller, terminology));
  }

  deleteTerminology(termId: number): Observable<void> {
    return this.refreshCacheAfterMutation(this.http.delete<void>(this.controller + termId));
  }
}
