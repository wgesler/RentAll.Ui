import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { RegionRequest, RegionResponse } from '../models/region.model';

@Injectable({
    providedIn: 'root'
})

export class RegionService {
  
  private readonly controller = this.configService.config().apiUrl + 'region/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all regions
  getRegions(): Observable<RegionResponse[]> {
    return this.http.get<RegionResponse[]>(this.controller);
  }

  // GET: Get region by ID
  getRegionById(regionId: number): Observable<RegionResponse> {
    return this.http.get<RegionResponse>(this.controller + regionId);
  }

  // POST: Create a new region
  createRegion(region: RegionRequest): Observable<RegionResponse> {
    return this.http.post<RegionResponse>(this.controller, region);
  }

  // PUT: Update entire region
  updateRegion(regionId: number, region: RegionRequest): Observable<RegionResponse> {
    return this.http.put<RegionResponse>(this.controller + regionId, region);
  }

  // DELETE: Delete region
  deleteRegion(regionId: number): Observable<void> {
    return this.http.delete<void>(this.controller + regionId);
  }
}


