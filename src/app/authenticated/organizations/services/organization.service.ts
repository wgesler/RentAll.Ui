import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config.service';
import { SUPPRESS_GLOBAL_ERROR_TOAST } from '../../../interceptor/http-context';
import { BrandingRequest, BrandingResponse } from '../models/branding.model';
import { OrganizationRequest, OrganizationResponse } from '../models/organization.model';
import { UserGuideImageUploadRequest, UserGuideImageUploadResponse, UserGuideRequest, UserGuideResponse } from '../models/user-guide.model';

@Injectable({
    providedIn: 'root'
})

export class OrganizationService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  
  private readonly controller = this.configService.config().apiUrl + 'organization/';
  private readonly imageHttpContext = new HttpContext().set(SUPPRESS_GLOBAL_ERROR_TOAST, true);

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
  updateOrganization(organization: OrganizationRequest): Observable<OrganizationResponse> {
    return this.http.put<OrganizationResponse>(this.controller, organization);
  }

  // DELETE: Delete organization
  deleteOrganization(organizationId: string): Observable<void> {
    return this.http.delete<void>(this.controller + organizationId);
  }

  getBranding(): Observable<BrandingResponse> {
    return this.http.get<BrandingResponse>(this.controller + 'branding');
  }

  updateBranding(branding: BrandingRequest): Observable<BrandingResponse> {
    return this.http.put<BrandingResponse>(this.controller + 'branding', branding);
  }

  getUserGuide(): Observable<UserGuideResponse> {
    return this.http.get<UserGuideResponse>(this.controller + 'user-guide');
  }

  updateUserGuide(userGuide: UserGuideRequest): Observable<UserGuideResponse> {
    return this.http.put<UserGuideResponse>(this.controller + 'user-guide', userGuide);
  }

  uploadUserGuideImage(request: UserGuideImageUploadRequest): Observable<UserGuideImageUploadResponse> {
    return this.http.post<UserGuideImageUploadResponse>(this.controller + 'user-guide/image', request);
  }

  getUserGuideImageBlob(path: string): Observable<Blob> {
    return this.http.get(this.controller + 'user-guide/image', {
      params: { path },
      responseType: 'blob',
      context: this.imageHttpContext
    });
  }

  deleteUserGuideImage(path: string): Observable<void> {
    return this.http.delete<void>(this.controller + 'user-guide/image', {
      params: { path },
      context: this.imageHttpContext
    });
  }
}






