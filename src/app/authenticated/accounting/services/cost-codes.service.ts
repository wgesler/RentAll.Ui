import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { CostCodesRequest, CostCodesResponse } from '../models/cost-codes.model';

@Injectable({
    providedIn: 'root'
})

export class CostCodesService {
  
  private readonly controller = this.configService.config().apiUrl + 'accounting/cost-code/';
  private allCostCodes$ = new BehaviorSubject<CostCodesResponse[]>([]);
  private costCodesLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
    private http: HttpClient,
    private configService: ConfigService) {
  }

  // Transform API response: map "Code" property to "costCode"
  private transformCostCodeResponse(item: any): CostCodesResponse {
    return {
      ...item,
      costCode: item.code || item.Code || item.costCode || ''
    };
  }

  // GET: Get cost codes for all offices
  getCostCodesForAllOffices(): Observable<CostCodesResponse[]> {
    return this.http.get<any[]>(this.controller + 'office').pipe(
      map(items => (items || []).map(item => this.transformCostCodeResponse(item)))
    );
  }

  // GET: Get cost codes by office ID
  getCostCodesByOfficeId(officeId: number): Observable<CostCodesResponse[]> {
    return this.http.get<CostCodesResponse[]>(this.controller + 'office/' + officeId);
  }

  // GET: Get cost code by office ID and cost code ID
  getCostCodeById(costCodeId: string, officeId: number): Observable<CostCodesResponse> {
    return this.http.get<any>(this.controller + 'office/' + officeId + '/costcodeId/' + costCodeId).pipe(
      map(item => this.transformCostCodeResponse(item))
    );
  }

  // POST: Create a new cost code
  createCostCode(costCode: CostCodesRequest): Observable<CostCodesResponse> {
    return this.http.post<any>(this.controller, costCode).pipe(
      map(item => this.transformCostCodeResponse(item))
    );
  }

  // PUT: Update entire cost code
  updateCostCode(costCode: CostCodesRequest): Observable<CostCodesResponse> {
    return this.http.put<any>(this.controller, costCode).pipe(
      map(item => this.transformCostCodeResponse(item))
    );
  }

  // DELETE: Delete cost code by office ID and cost code ID
  deleteCostCode(officeId: number, costCodeId: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'office/' + officeId + '/costcodeid/' + costCodeId);
  }

  // Load all cost codes for all offices on startup
  loadAllCostCodes(): void {
    // Call the API endpoint that gets cost codes for all offices
    this.getCostCodesForAllOffices().subscribe({
      next: (costCodes) => {
        this.allCostCodes$.next(costCodes || []);
        this.costCodesLoaded$.next(true);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Cost Codes Service - Error loading all cost codes:', err);
        this.allCostCodes$.next([]);
        this.costCodesLoaded$.next(true); // Mark as loaded even on error
      }
    });
  }

  // Check if cost codes have been loaded
  areCostCodesLoaded(): Observable<boolean> {
    return this.costCodesLoaded$.asObservable();
  }

  // Clear all cost codes (e.g., on logout)
  clearCostCodes(): void {
    this.allCostCodes$.next([]);
    this.costCodesLoaded$.next(false);
  }

  // Get all cost codes as observable
  getAllCostCodes(): Observable<CostCodesResponse[]> {
    return this.allCostCodes$.asObservable();
  }

  // Get all cost codes value synchronously (returns current value)
  getAllCostCodesValue(): CostCodesResponse[] {
    return this.allCostCodes$.value;
  }

  // Get cost codes for a specific office
  getCostCodesForOffice(officeId: number): CostCodesResponse[] {
    return this.allCostCodes$.value.filter(c => c.officeId === officeId);
  }

  // Refresh cost codes for a specific office (useful after create/update/delete)
  refreshCostCodesForOffice(officeId: number): void {
    this.getCostCodesByOfficeId(officeId).subscribe({
      next: (costCodes) => {
        const currentCostCodes = this.allCostCodes$.value;
        // Remove old cost codes for this office
        const filteredCostCodes = currentCostCodes.filter(c => c.officeId !== officeId);
        // Add new cost codes
        const updatedCostCodes = [...filteredCostCodes, ...(costCodes || [])];
        this.allCostCodes$.next(updatedCostCodes);
      },
      error: (err: HttpErrorResponse) => {
        console.error(`Cost Codes Service - Error refreshing cost codes for office ${officeId}:`, err);
      }
    });
  }
}
