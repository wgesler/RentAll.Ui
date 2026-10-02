import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, of, shareReplay, switchMap, take, tap, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { RegionRequest, RegionResponse } from '../models/region.model';

@Injectable({
    providedIn: 'root'
})

export class RegionService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'organization/region/';
  private allRegions$ = new BehaviorSubject<RegionResponse[]>([]);
  private regionsLoaded$ = new BehaviorSubject<boolean>(false);
  private regionsLoad$: Observable<RegionResponse[]> | null = null;

  loadAllRegions(): Observable<RegionResponse[]> {
    return this.http.get<RegionResponse[]>(this.controller).pipe(
      tap(regions => {
        this.allRegions$.next(regions || []);
        this.regionsLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Region Service - Error loading all regions:', err);
        this.allRegions$.next([]);
        this.regionsLoaded$.next(true);
        return of([]);
      })
    );
  }

  ensureRegionsLoaded(): Observable<RegionResponse[]> {
    if (this.regionsLoaded$.value) return this.getAllRegions().pipe(take(1));
    if (!this.regionsLoad$) {
      this.regionsLoad$ = this.loadAllRegions().pipe(
        take(1),
        switchMap(() => this.getAllRegions().pipe(take(1))),
        finalize(() => this.regionsLoad$ = null),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.regionsLoad$;
  }

  refreshCacheAfterMutation<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      switchMap(result =>
        this.loadAllRegions().pipe(
          map(() => result),
          catchError((err: HttpErrorResponse) => {
            console.error('Region Service - Error refreshing regions after mutation:', err);
            return throwError(() => err);
          })
        )
      )
    );
  }

  clearRegions(): void {
    this.regionsLoad$ = null;
    this.allRegions$.next([]);
    this.regionsLoaded$.next(false);
  }

  getAllRegions(): Observable<RegionResponse[]> {
    return this.allRegions$.asObservable();
  }

  getAllRegionsValue(): RegionResponse[] {
    return this.allRegions$.value;
  }

  getRegions(): Observable<RegionResponse[]> {
    return this.http.get<RegionResponse[]>(this.controller);
  }

  getRegionById(regionId: number): Observable<RegionResponse> {
    return this.http.get<RegionResponse>(this.controller + regionId);
  }

  createRegion(region: RegionRequest): Observable<RegionResponse> {
    return this.refreshCacheAfterMutation(this.http.post<RegionResponse>(this.controller, region));
  }

  updateRegion(region: RegionRequest): Observable<RegionResponse> {
    return this.refreshCacheAfterMutation(this.http.put<RegionResponse>(this.controller, region));
  }

  deleteRegion(regionId: number): Observable<void> {
    return this.refreshCacheAfterMutation(this.http.delete<void>(this.controller + regionId));
  }
}
