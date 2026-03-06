import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { OfficeRequest, OfficeResponse } from '../models/office.model';

@Injectable({
    providedIn: 'root'
})

export class OfficeService {
  
  private readonly controller = this.configService.config().apiUrl + 'organization/office/';
  private allOffices$ = new BehaviorSubject<OfficeResponse[]>([]);
  private officesLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  /** Load offices for the given organization. Requires a non-empty organizationId. */
  loadAllOffices(organizationId: string): void {
    const id = organizationId?.trim();
    if (!id) {
      this.allOffices$.next([]);
      this.officesLoaded$.next(true);
      return;
    }
    this.http.get<OfficeResponse[]>(this.controller + id).subscribe({
      next: (offices) => {
        this.allOffices$.next(offices || []);
        this.officesLoaded$.next(true);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Office Service - Error loading all offices:', err);
        this.allOffices$.next([]);
        this.officesLoaded$.next(true); // Mark as loaded even on error
      }
    });
  }

  // Check if offices have been loaded
  areOfficesLoaded(): Observable<boolean> {
    return this.officesLoaded$.asObservable();
  }

  // Clear all offices (e.g., on logout)
  clearOffices(): void {
    this.allOffices$.next([]);
    this.officesLoaded$.next(false);
  }

  // Get all offices as observable (returns BehaviorSubject - components should filter for non-empty)
  getAllOffices(): Observable<OfficeResponse[]> {
    return this.allOffices$.asObservable();
  }

  // Get all offices value synchronously (returns current value)
  getAllOfficesValue(): OfficeResponse[] {
    return this.allOffices$.value;
  }

  /** GET offices for an organization. organizationId is required; empty string will throw to avoid silent 400s. */
  getOffices(organizationId: string): Observable<OfficeResponse[]> {
    const id = organizationId?.trim();
    if (!id) {
      return throwError(() => new Error('organizationId is required to load offices'));
    }
    return this.http.get<OfficeResponse[]>(this.controller + id);
  }

  /** GET offices by organization (alias for getOffices for clarity at call sites). */
  getOfficesByOrganization(organizationId: string): Observable<OfficeResponse[]> {
    return this.getOffices(organizationId);
  }

  // GET: Get office by ID
  getOfficeById(officeId: number): Observable<OfficeResponse> {
    return this.http.get<OfficeResponse>(this.controller + officeId);
  }

  // POST: Create a new office
  createOffice(office: OfficeRequest): Observable<OfficeResponse> {
    return this.http.post<OfficeResponse>(this.controller, office);
  }

  // PUT: Update entire office
  updateOffice(office: OfficeRequest): Observable<OfficeResponse> {
    return this.http.put<OfficeResponse>(this.controller, office);
  }

  // DELETE: Delete office
  deleteOffice(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId);
  }
}




