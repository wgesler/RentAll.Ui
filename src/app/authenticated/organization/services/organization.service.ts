import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../../services/config.service';
import { OrganizationRequest, OrganizationResponse } from '../models/organization.model';

@Injectable({
    providedIn: 'root'
})

export class OrganizationService {
  
  private readonly controller = this.configService.config().apiUrl + 'organization/';

  constructor(
      private http: HttpClient,
      private configService: ConfigService) {
  }

  // GET: Get all organizations
  getOrganizations(): Observable<OrganizationResponse[]> {
    return this.http.get<OrganizationResponse[]>(this.controller);
  }

  // GET: Get organization by ID
  getOrganizationByGuid(organizationId: string): Observable<OrganizationResponse> {
    return this.http.get<OrganizationResponse>(this.controller + organizationId);
  }

  // POST: Create a new organization
  createOrganization(organization: OrganizationRequest): Observable<OrganizationResponse> {
    return this.http.post<OrganizationResponse>(this.controller, organization);
  }

  // PUT: Update entire organization
  updateOrganization(organizationId: string, organization: OrganizationRequest): Observable<OrganizationResponse> {
    return this.http.put<OrganizationResponse>(this.controller + organizationId, organization);
  }

  // PATCH: Partially update organization
  updateOrganizationPartial(organizationId: string, organization: Partial<OrganizationRequest>): Observable<OrganizationResponse> {
    return this.http.patch<OrganizationResponse>(this.controller + organizationId, organization);
  }

  // DELETE: Delete organization
  deleteOrganization(organizationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + organizationId);
  }
}





