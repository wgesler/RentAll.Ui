import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, finalize, map, of, shareReplay, switchMap, take, tap, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { BuildingRequest, BuildingResponse } from '../models/building.model';

@Injectable({
    providedIn: 'root'
})

export class BuildingService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly controller = this.configService.config().apiUrl + 'organization/building/';
  private allBuildings$ = new BehaviorSubject<BuildingResponse[]>([]);
  private buildingsLoaded$ = new BehaviorSubject<boolean>(false);
  private buildingsLoad$: Observable<BuildingResponse[]> | null = null;

  loadAllBuildings(): Observable<BuildingResponse[]> {
    return this.http.get<BuildingResponse[]>(this.controller).pipe(
      tap(buildings => {
        this.allBuildings$.next(buildings || []);
        this.buildingsLoaded$.next(true);
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Building Service - Error loading all buildings:', err);
        this.allBuildings$.next([]);
        this.buildingsLoaded$.next(true);
        return of([]);
      })
    );
  }

  ensureBuildingsLoaded(): Observable<BuildingResponse[]> {
    if (this.buildingsLoaded$.value) return this.getAllBuildings().pipe(take(1));
    if (!this.buildingsLoad$) {
      this.buildingsLoad$ = this.loadAllBuildings().pipe(
        take(1),
        switchMap(() => this.getAllBuildings().pipe(take(1))),
        finalize(() => this.buildingsLoad$ = null),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.buildingsLoad$;
  }

  refreshCacheAfterMutation<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      switchMap(result =>
        this.loadAllBuildings().pipe(
          map(() => result),
          catchError((err: HttpErrorResponse) => {
            console.error('Building Service - Error refreshing buildings after mutation:', err);
            return throwError(() => err);
          })
        )
      )
    );
  }

  clearBuildings(): void {
    this.buildingsLoad$ = null;
    this.allBuildings$.next([]);
    this.buildingsLoaded$.next(false);
  }

  getAllBuildings(): Observable<BuildingResponse[]> {
    return this.allBuildings$.asObservable();
  }

  getAllBuildingsValue(): BuildingResponse[] {
    return this.allBuildings$.value;
  }

  getBuildings(): Observable<BuildingResponse[]> {
    return this.http.get<BuildingResponse[]>(this.controller);
  }

  getBuildingById(buildingId: number): Observable<BuildingResponse> {
    return this.http.get<BuildingResponse>(this.controller + buildingId);
  }

  createBuilding(building: BuildingRequest): Observable<BuildingResponse> {
    return this.refreshCacheAfterMutation(this.http.post<BuildingResponse>(this.controller, building));
  }

  updateBuilding(building: BuildingRequest): Observable<BuildingResponse> {
    return this.refreshCacheAfterMutation(this.http.put<BuildingResponse>(this.controller, building));
  }

  deleteBuilding(buildingId: number): Observable<void> {
    return this.refreshCacheAfterMutation(this.http.delete<void>(this.controller + buildingId));
  }
}
