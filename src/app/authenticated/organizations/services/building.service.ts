import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { BuildingRequest, BuildingResponse } from '../models/building.model';

@Injectable({
    providedIn: 'root'
})

export class BuildingService {
  
  private readonly controller = this.configService.config().apiUrl + 'building/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all buildings
  getBuildings(): Observable<BuildingResponse[]> {
    return this.http.get<BuildingResponse[]>(this.controller);
  }

  // GET: Get building by ID
  getBuildingById(buildingId: number): Observable<BuildingResponse> {
    return this.http.get<BuildingResponse>(this.controller + buildingId);
  }

  // POST: Create a new building
  createBuilding(building: BuildingRequest): Observable<BuildingResponse> {
    return this.http.post<BuildingResponse>(this.controller, building);
  }

  // PUT: Update entire building
  updateBuilding(building: BuildingRequest): Observable<BuildingResponse> {
    return this.http.put<BuildingResponse>(this.controller, building);
  }

  // DELETE: Delete building
  deleteBuilding(buildingId: number): Observable<void> {
    return this.http.delete<void>(this.controller + buildingId);
  }
}


