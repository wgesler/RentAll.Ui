import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { FranchiseRequest, FranchiseResponse } from '../models/franchise.model';

@Injectable({
    providedIn: 'root'
})

export class FranchiseService {
  
  private readonly controller = this.configService.config().apiUrl + 'franchise/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all franchises
  getFranchises(): Observable<FranchiseResponse[]> {
    return this.http.get<FranchiseResponse[]>(this.controller);
  }

  // GET: Get franchise by ID
  getFranchiseById(franchiseId: number): Observable<FranchiseResponse> {
    return this.http.get<FranchiseResponse>(this.controller + franchiseId);
  }

  // POST: Create a new franchise
  createFranchise(franchise: FranchiseRequest): Observable<FranchiseResponse> {
    return this.http.post<FranchiseResponse>(this.controller, franchise);
  }

  // PUT: Update entire franchise
  updateFranchise(franchiseId: number, franchise: FranchiseRequest): Observable<FranchiseResponse> {
    return this.http.put<FranchiseResponse>(this.controller + franchiseId, franchise);
  }

  // DELETE: Delete franchise
  deleteFranchise(franchiseId: number): Observable<void> {
    return this.http.delete<void>(this.controller + franchiseId);
  }
}


