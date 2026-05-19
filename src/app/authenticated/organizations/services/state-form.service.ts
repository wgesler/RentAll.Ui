import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { StateFormRequest, StateFormResponse } from '../models/state-form.model';

@Injectable({
    providedIn: 'root'
})
export class StateFormService {
  private readonly controller = this.configService.config().apiUrl + 'organization/stateform';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  getStateForms(stateCode: string): Observable<StateFormResponse[]> {
    const params = new HttpParams().set('stateCode', stateCode);
    return this.http.get<StateFormResponse[]>(this.controller, { params });
  }

  getStateFormById(stateFormId: number): Observable<StateFormResponse> {
    return this.http.get<StateFormResponse>(`${this.controller}/${stateFormId}`);
  }

  createStateForm(stateForm: StateFormRequest): Observable<StateFormResponse> {
    return this.http.post<StateFormResponse>(this.controller, stateForm);
  }

  updateStateForm(stateForm: StateFormRequest): Observable<StateFormResponse> {
    return this.http.put<StateFormResponse>(this.controller, stateForm);
  }

  deleteStateForm(stateFormId: number): Observable<void> {
    return this.http.delete<void>(`${this.controller}/${stateFormId}`);
  }
}
