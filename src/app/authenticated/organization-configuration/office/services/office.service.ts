import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ConfigService } from '../../../../services/config.service';
import { OfficeRequest, OfficeResponse } from '../models/office.model';

@Injectable({
    providedIn: 'root'
})

export class OfficeService {
  
  private readonly controller = this.configService.config().apiUrl + 'office/';
  private allOffices$ = new BehaviorSubject<OfficeResponse[]>([]);
  private officesLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // Load all offices on startup
  loadAllOffices(): void {
    const url = this.controller;
    
    this.http.get<OfficeResponse[]>(url).subscribe({
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

  // GET: Get all offices
  getOffices(): Observable<OfficeResponse[]> {
    return this.http.get<OfficeResponse[]>(this.controller);
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
  updateOffice(officeId: number, office: OfficeRequest): Observable<OfficeResponse> {
    return this.http.put<OfficeResponse>(this.controller + officeId, office);
  }

  // DELETE: Delete office
  deleteOffice(officeId: number): Observable<void> {
    return this.http.delete<void>(this.controller + officeId);
  }
}




