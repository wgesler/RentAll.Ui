import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { TrackerConfigurationResponse, TrackerDefinitionOptionRequest, TrackerDefinitionOptionResponse, TrackerDefinitionRequest, TrackerDefinitionResponse } from '../models/tracker.model';

@Injectable({
    providedIn: 'root'
})
export class TrackerService {
  private readonly controller = this.configService.config().apiUrl + 'organization/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  getTrackerConfiguration(includeInactive: boolean = false): Observable<TrackerConfigurationResponse> {
    let params = new HttpParams().set('includeInactive', includeInactive);
    return this.http.get<TrackerConfigurationResponse>(this.controller + 'tracker-configuration', { params });
  }

  createTrackerDefinition(trackerDefinition: TrackerDefinitionRequest): Observable<TrackerDefinitionResponse> {
    return this.http.post<TrackerDefinitionResponse>(this.controller + 'tracker-definition', trackerDefinition);
  }

  updateTrackerDefinition(trackerDefinition: TrackerDefinitionRequest): Observable<TrackerDefinitionResponse> {
    return this.http.put<TrackerDefinitionResponse>(this.controller + 'tracker-definition', trackerDefinition);
  }

  deleteTrackerDefinition(trackerDefinitionId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-definition/' + trackerDefinitionId);
  }

  createTrackerDefinitionOption(option: TrackerDefinitionOptionRequest): Observable<TrackerDefinitionOptionResponse> {
    return this.http.post<TrackerDefinitionOptionResponse>(this.controller + 'tracker-definition-option', option);
  }

  updateTrackerDefinitionOption(option: TrackerDefinitionOptionRequest): Observable<TrackerDefinitionOptionResponse> {
    return this.http.put<TrackerDefinitionOptionResponse>(this.controller + 'tracker-definition-option', option);
  }

  deleteTrackerDefinitionOption(trackerDefinitionOptionId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'tracker-definition-option/' + trackerDefinitionOptionId);
  }
}
