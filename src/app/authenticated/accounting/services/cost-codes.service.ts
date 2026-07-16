import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, switchMap, take, tap } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { ConfigService } from '../../../services/config.service';
import { CostCodesRequest, CostCodesResponse } from '../models/cost-codes.model';

@Injectable({
    providedIn: 'root'
})

export class CostCodesService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  
  private readonly controller = this.configService.config().apiUrl + 'accounting/cost-code/';
  private allCostCodes$ = new BehaviorSubject<CostCodesResponse[]>([]);
  private costCodesLoaded$ = new BehaviorSubject<boolean>(false);
  private isCostCodesLoading = false;
  private costCodeIdByOfficeAndCode = new Map<string, number>();

  // Transform API response: map "Code" property to "costCode"
  transformCostCodeResponse(item: any): CostCodesResponse {
    const numericCostCodeId = Number(item?.costCodeId);
    return {
      ...item,
      costCodeId: Number.isInteger(numericCostCodeId) ? numericCostCodeId : 0,
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
  getCostCodeById(costCodeId: number, officeId: number): Observable<CostCodesResponse> {
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
  deleteCostCode(officeId: number, costCodeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + 'office/' + officeId + '/costcodeid/' + costCodeId);
  }

  // Load all cost codes for all offices on startup
  loadAllCostCodes(): Observable<CostCodesResponse[]> {
    return this.getCostCodesForAllOffices().pipe(
      tap((costCodes) => {
        this.setAllCostCodes(costCodes || []);
        this.costCodesLoaded$.next(true);
        this.isCostCodesLoading = false;
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Cost Codes Service - Error loading all cost codes:', err);
        this.setAllCostCodes([]);
        this.costCodesLoaded$.next(true);
        this.isCostCodesLoading = false;
        return of([]);
      })
    );
  }

  refreshAllCostCodes(): Observable<CostCodesResponse[]> {
    this.costCodesLoaded$.next(false);
    return this.loadAllCostCodes().pipe(take(1), switchMap(() => this.getAllCostCodes().pipe(take(1))));
  }

  ensureCostCodesLoaded(): Observable<CostCodesResponse[]> {
    if (this.costCodesLoaded$.value) {
      return this.getAllCostCodes().pipe(take(1));
    }
    if (this.isCostCodesLoading) {
      return this.areCostCodesLoaded().pipe(
        filter(loaded => loaded === true),
        take(1),
        switchMap(() => this.getAllCostCodes().pipe(take(1)))
      );
    }
    this.isCostCodesLoading = true;
    return this.loadAllCostCodes().pipe(take(1), switchMap(() => this.getAllCostCodes().pipe(take(1))));
  }

  // Check if cost codes have been loaded
  areCostCodesLoaded(): Observable<boolean> {
    return this.costCodesLoaded$.asObservable();
  }

  // Clear all cost codes (e.g., on logout)
  clearCostCodes(): void {
    this.setAllCostCodes([]);
    this.costCodesLoaded$.next(false);
    this.isCostCodesLoading = false;
  }

  getCostCodeIdByOfficeAndAccountNo(officeId: number, accountNo: string | null | undefined): number | null {
    const code = this.normalizeAccountCode(accountNo);
    if (!code) {
      return null;
    }
    return this.costCodeIdByOfficeAndCode.get(`${officeId}|${code}`) ?? null;
  }

setAllCostCodes(costCodes: CostCodesResponse[]): void {
    this.allCostCodes$.next(costCodes);
    this.rebuildCostCodeLookup(costCodes);
  }

rebuildCostCodeLookup(costCodes: CostCodesResponse[]): void {
    this.costCodeIdByOfficeAndCode.clear();
    for (const costCode of costCodes) {
      if (!costCode.isActive) {
        continue;
      }
      const code = this.normalizeAccountCode(costCode.costCode);
      if (code) {
        this.costCodeIdByOfficeAndCode.set(`${costCode.officeId}|${code}`, costCode.costCodeId);
      }
    }
  }

normalizeAccountCode(value: string | null | undefined): string {
    return String(value ?? '')
      .split(/\s+/)
      .filter(part => part.length > 0)
      .join(' ')
      .trim()
      .toLowerCase();
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
        this.setAllCostCodes(updatedCostCodes);
      },
      error: (err: HttpErrorResponse) => {
        console.error(`Cost Codes Service - Error refreshing cost codes for office ${officeId}:`, err);
      }
    });
  }
}
