import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { OrganizationResponse } from '../models/organization.model';

@Injectable({
  providedIn: 'root'
})
export class OrganizationListService {
  private organizations$ = new BehaviorSubject<OrganizationResponse[]>([]);

  constructor() { }

  /**
   * Get the observable of organizations list
   */
  getOrganizations(): Observable<OrganizationResponse[]> {
    return this.organizations$.asObservable();
  }

  /**
   * Set the organizations list
   */
  setOrganizations(organizations: OrganizationResponse[]): void {
    this.organizations$.next(organizations);
  }

  /**
   * Clear the organizations list
   */
  clearOrganizations(): void {
    this.organizations$.next([]);
  }
}





