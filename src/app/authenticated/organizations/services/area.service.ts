import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, of, shareReplay, switchMap, take, tap, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { AreaRequest, AreaResponse } from '../models/area.model';

@Injectable({
    providedIn: 'root'
})

export class AreaService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'organization/area/';
  private allAreas$ = new BehaviorSubject<AreaResponse[]>([]);
  private areasLoaded$ = new BehaviorSubject<boolean>(false);
  private areasLoad$: Observable<AreaResponse[]> | null = null;

  loadAllAreas(): Observable<AreaResponse[]> {
    return this.http.get<AreaResponse[]>(this.controller).pipe(
      tap(areas => {
        this.allAreas$.next(areas || []);
        this.areasLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Area Service - Error loading all areas:', err);
        this.allAreas$.next([]);
        this.areasLoaded$.next(true);
        return of([]);
      })
    );
  }

  ensureAreasLoaded(): Observable<AreaResponse[]> {
    if (this.areasLoaded$.value) return this.getAllAreas().pipe(take(1));
    if (!this.areasLoad$) {
      this.areasLoad$ = this.loadAllAreas().pipe(
        take(1),
        switchMap(() => this.getAllAreas().pipe(take(1))),
        finalize(() => this.areasLoad$ = null),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.areasLoad$;
  }

  refreshCacheAfterMutation<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      switchMap(result =>
        this.loadAllAreas().pipe(
          map(() => result),
          catchError((err: HttpErrorResponse) => {
            console.error('Area Service - Error refreshing areas after mutation:', err);
            return throwError(() => err);
          })
        )
      )
    );
  }

  clearAreas(): void {
    this.areasLoad$ = null;
    this.allAreas$.next([]);
    this.areasLoaded$.next(false);
  }

  getAllAreas(): Observable<AreaResponse[]> {
    return this.allAreas$.asObservable();
  }

  getAllAreasValue(): AreaResponse[] {
    return this.allAreas$.value;
  }

  getAreas(): Observable<AreaResponse[]> {
    return this.http.get<AreaResponse[]>(this.controller);
  }

  getAreaById(areaId: number): Observable<AreaResponse> {
    return this.http.get<AreaResponse>(this.controller + areaId);
  }

  createArea(area: AreaRequest): Observable<AreaResponse> {
    return this.refreshCacheAfterMutation(this.http.post<AreaResponse>(this.controller, area));
  }

  updateArea(area: AreaRequest): Observable<AreaResponse> {
    return this.refreshCacheAfterMutation(this.http.put<AreaResponse>(this.controller, area));
  }

  deleteArea(areaId: number): Observable<void> {
    return this.refreshCacheAfterMutation(this.http.delete<void>(this.controller + areaId));
  }
}
