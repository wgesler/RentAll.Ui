import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, switchMap, take, tap, throwError } from 'rxjs';
import { FeatureType, getFeatureTypeCode } from '../models/organization-enum';
import { ConfigService } from '../../../services/config.service';
import { FeatureRequest, FeatureResponse } from '../models/organization-feature.model';

@Injectable({
    providedIn: 'root'
})

export class OrganizationFeatureService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);


  private readonly controller = this.configService.config().apiUrl + 'organization/feature/';
  private allFeatures$ = new BehaviorSubject<FeatureResponse[]>([]);
  private featuresLoaded$ = new BehaviorSubject<boolean>(false);
  private loadedOrganizationId: string | null = null;

  loadAllFeatures(organizationId: string): Observable<FeatureResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      this.allFeatures$.next([]);
      this.featuresLoaded$.next(true);
      this.loadedOrganizationId = null;
      return of([]);
    }
    return this.http.get<FeatureResponse[]>(this.controller + id).pipe(
      tap((features) => {
        this.allFeatures$.next((features || []).map(feature => this.normalizeFeatureResponse(feature)));
        this.featuresLoaded$.next(true);
        this.loadedOrganizationId = id;
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Organization Feature Service - Error loading all features:', err);
        this.allFeatures$.next([]);
        this.featuresLoaded$.next(true);
        this.loadedOrganizationId = id;
        return of([]);
      })
    );
  }

  ensureFeaturesLoaded(organizationId: string): Observable<FeatureResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      this.clearFeatures();
      return of([]);
    }
    if (this.featuresLoaded$.value && this.isSameOrganizationId(this.loadedOrganizationId, id)) return this.getAllFeatures().pipe(take(1));
    return this.loadAllFeatures(id).pipe(take(1), switchMap(() => this.getAllFeatures().pipe(take(1))));
  }

  refreshFeatures(organizationId: string): Observable<FeatureResponse[]> {
    this.featuresLoaded$.next(false);
    this.loadedOrganizationId = null;
    return this.loadAllFeatures(organizationId).pipe(take(1), switchMap(() => this.getAllFeatures().pipe(take(1))));
  }

  notifyFeaturesChanged(organizationId: string): void {
    const id = organizationId?.trim();
    if (!id) {
      return;
    }
    this.refreshFeatures(id).pipe(take(1)).subscribe();
  }

  areFeaturesLoaded(): Observable<boolean> {
    return this.featuresLoaded$.asObservable();
  }

  clearFeatures(): void {
    this.allFeatures$.next([]);
    this.featuresLoaded$.next(false);
    this.loadedOrganizationId = null;
  }

  seedFeaturesFromJwt(organizationId: string, enabledFeatureTypeIds: number[]): void {
    const id = organizationId?.trim();
    if (!id) {
      return;
    }

    const enabledSet = new Set(enabledFeatureTypeIds);
    const featureTypeIds = Object.values(FeatureType).filter(value => typeof value === 'number') as number[];
    const features = featureTypeIds.map(featureTypeId => ({
      featureId: 0,
      organizationId: id,
      featureTypeId,
      featureCode: getFeatureTypeCode(featureTypeId),
      featureTypeDescription: getFeatureTypeCode(featureTypeId),
      hasAccess: enabledSet.has(featureTypeId)
    }));

    this.allFeatures$.next(features);
    this.featuresLoaded$.next(true);
    this.loadedOrganizationId = id;
  }

  isFeaturesLoadedForOrganization(organizationId: string): boolean {
    return this.featuresLoaded$.value && this.isSameOrganizationId(this.loadedOrganizationId, organizationId);
  }

  getAllFeatures(): Observable<FeatureResponse[]> {
    return this.allFeatures$.asObservable();
  }

  getAllFeaturesValue(): FeatureResponse[] {
    return this.allFeatures$.value;
  }

  hasFeatureAccess(organizationId: string, featureTypeId: number, features?: FeatureResponse[]): boolean {
    const normalizedOrganizationId = organizationId?.trim().toLowerCase();
    const normalizedFeatureTypeId = Number(featureTypeId);
    const source = features ?? this.allFeatures$.value;
    const feature = source.find(item => {
      const itemOrganizationId = String(item.organizationId ?? '').trim().toLowerCase();
      if (itemOrganizationId !== normalizedOrganizationId) {
        return false;
      }
      const itemFeatureTypeId = Number(item.featureTypeId);
      if (itemFeatureTypeId === normalizedFeatureTypeId) {
        return true;
      }
      return normalizedFeatureTypeId === FeatureType.MainProgram && String(item.featureCode ?? '').trim().toUpperCase() === 'MAIN';
    });
    return this.coerceHasAccess(feature?.hasAccess);
  }

coerceHasAccess(value: boolean | string | number | null | undefined): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }
    return value === 1;
  }

  getFeaturesByOrganization(organizationId: string): Observable<FeatureResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      return throwError(() => new Error('organizationId is required to load features'));
    }
    return this.http.get<FeatureResponse[]>(this.controller + id);
  }

  getFeatureById(featureId: number): Observable<FeatureResponse> {
    return this.http.get<FeatureResponse>(this.controller + featureId);
  }

  createFeature(feature: FeatureRequest): Observable<FeatureResponse> {
    return this.http.post<FeatureResponse>(this.controller, feature).pipe(
      tap((response) => this.upsertFeatureInCache(response))
    );
  }

  updateFeature(feature: FeatureRequest): Observable<FeatureResponse> {
    return this.http.put<FeatureResponse>(this.controller, feature).pipe(
      tap((response) => this.upsertFeatureInCache(response))
    );
  }

  deleteFeature(featureId: number, organizationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + featureId).pipe(
      tap(() => this.removeFeatureFromCache(featureId, organizationId))
    );
  }

upsertFeatureInCache(feature: FeatureResponse): void {
    const organizationId = feature?.organizationId?.trim();
    if (!organizationId) {
      return;
    }

    if (!this.isSameOrganizationId(this.loadedOrganizationId, organizationId)) {
      this.loadAllFeatures(organizationId).pipe(take(1)).subscribe();
      return;
    }

    const normalizedFeature = this.normalizeFeatureResponse(feature);
    const features = [...this.allFeatures$.value];
    const index = features.findIndex(item => item.featureId === normalizedFeature.featureId);
    if (index >= 0) {
      features[index] = normalizedFeature;
    } else {
      features.push(normalizedFeature);
    }
    this.allFeatures$.next(features);
  }

removeFeatureFromCache(featureId: number, organizationId: string): void {
    const id = organizationId?.trim();
    if (!id || !this.isSameOrganizationId(this.loadedOrganizationId, id)) {
      return;
    }
    this.allFeatures$.next(this.allFeatures$.value.filter(feature => feature.featureId !== featureId));
  }

normalizeFeatureResponse(feature: FeatureResponse): FeatureResponse {
    const raw = feature as FeatureResponse & Record<string, unknown>;
    return {
      featureId: Number(feature.featureId ?? raw['featureId'] ?? raw['FeatureId'] ?? 0),
      organizationId: String(feature.organizationId ?? raw['organizationId'] ?? raw['OrganizationId'] ?? '').trim(),
      featureTypeId: Number(feature.featureTypeId ?? raw['featureTypeId'] ?? raw['FeatureTypeId']),
      featureCode: String(feature.featureCode ?? raw['featureCode'] ?? raw['FeatureCode'] ?? ''),
      featureTypeDescription: String(feature.featureTypeDescription ?? raw['featureTypeDescription'] ?? raw['FeatureTypeDescription'] ?? ''),
      hasAccess: this.coerceHasAccess((feature.hasAccess ?? raw['hasAccess'] ?? raw['HasAccess']) as boolean | string | number | null | undefined)
    };
  }

isSameOrganizationId(left: string | null | undefined, right: string | null | undefined): boolean {
    return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
  }
}
