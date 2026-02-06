import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { AreaRequest, AreaResponse } from '../models/area.model';

@Injectable({
    providedIn: 'root'
})

export class AreaService {
  
  private readonly controller = this.configService.config().apiUrl + 'area/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all areas
  getAreas(): Observable<AreaResponse[]> {
    return this.http.get<AreaResponse[]>(this.controller);
  }

  // GET: Get area by ID
  getAreaById(areaId: number): Observable<AreaResponse> {
    return this.http.get<AreaResponse>(this.controller + areaId);
  }

  // POST: Create a new area
  createArea(area: AreaRequest): Observable<AreaResponse> {
    return this.http.post<AreaResponse>(this.controller, area);
  }

  // PUT: Update entire area
  updateArea(area: AreaRequest): Observable<AreaResponse> {
    return this.http.put<AreaResponse>(this.controller, area);
  }

  // DELETE: Delete area
  deleteArea(areaId: number): Observable<void> {
    return this.http.delete<void>(this.controller + areaId);
  }
}


