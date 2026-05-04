import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, of, take, tap } from 'rxjs';
import { BrandingResponse } from '../authenticated/organizations/models/branding.model';
import { OrganizationService } from '../authenticated/organizations/services/organization.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class BrandingService {
  private readonly systemDefaultBranding: BrandingResponse = {
    organizationId: '99999999-9999-9999-9999-999999999999',
    primaryColor: '#3f51b5',
    accentColor: '#ae1f66',
    headerBackgroundColor: '#3f51b5',
    headerTextColor: '#ffffff',
    logoPath: 'assets/images/RentAll_TwoHouses_NoCardinal_Transparent.png',
    collapsedLogoPath: null
  };

  private branding$ = new BehaviorSubject<BrandingResponse>(this.systemDefaultBranding);
  private logoUrl$ = new BehaviorSubject<string>(this.systemDefaultBranding.logoPath ?? '');
  private collapsedLogoUrl$ = new BehaviorSubject<string>(this.systemDefaultBranding.collapsedLogoPath ?? '');

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private organizationService: OrganizationService,
    private authService: AuthService
  ) {
    this.applyBranding(this.systemDefaultBranding);
  }

  getBranding$(): Observable<BrandingResponse> {
    return this.branding$.asObservable();
  }

  getLogoUrl$(): Observable<string> {
    return this.logoUrl$.asObservable();
  }

  getCollapsedLogoUrl$(): Observable<string> {
    return this.collapsedLogoUrl$.asObservable();
  }

  loadBrandingForCurrentOrganization(): Observable<BrandingResponse> {
    if (!this.authService.getIsLoggedIn()) {
      this.clearBranding();
      return of(this.systemDefaultBranding);
    }

    return this.organizationService.getBranding().pipe(
      take(1),
      tap(branding => this.applyBranding(branding)),
      catchError(() => {
        this.applyBranding(this.systemDefaultBranding);
        return of(this.systemDefaultBranding);
      })
    );
  }

  clearBranding(): void {
    this.applyBranding(this.systemDefaultBranding);
  }

  private applyBranding(branding: BrandingResponse): void {
    const normalizedBranding: BrandingResponse = {
      ...branding,
      primaryColor: this.normalizeHexColor(branding.primaryColor, this.systemDefaultBranding.primaryColor),
      accentColor: this.normalizeHexColor(branding.accentColor, this.systemDefaultBranding.accentColor),
      headerBackgroundColor: this.normalizeHexColor(branding.headerBackgroundColor, this.systemDefaultBranding.headerBackgroundColor),
      headerTextColor: this.normalizeHexColor(branding.headerTextColor, this.systemDefaultBranding.headerTextColor),
      logoPath: branding.logoPath?.trim() || this.systemDefaultBranding.logoPath,
      collapsedLogoPath: branding.collapsedLogoPath?.trim() || this.systemDefaultBranding.collapsedLogoPath
    };

    this.document.documentElement.style.setProperty('--brand-primary-color', normalizedBranding.primaryColor);
    this.document.documentElement.style.setProperty('--brand-accent-color', normalizedBranding.accentColor);
    this.document.documentElement.style.setProperty('--brand-header-background-color', normalizedBranding.headerBackgroundColor);
    this.document.documentElement.style.setProperty('--brand-header-text-color', normalizedBranding.headerTextColor);

    this.branding$.next(normalizedBranding);
    const logoFromBytes = normalizedBranding.fileDetails?.file
      ? `data:${normalizedBranding.fileDetails.contentType || 'image/png'};base64,${normalizedBranding.fileDetails.file}`
      : null;
    const collapsedLogoFromBytes = normalizedBranding.collapsedFileDetails?.file
      ? `data:${normalizedBranding.collapsedFileDetails.contentType || 'image/png'};base64,${normalizedBranding.collapsedFileDetails.file}`
      : null;
    this.logoUrl$.next(logoFromBytes ?? normalizedBranding.logoPath ?? this.systemDefaultBranding.logoPath ?? '');
    this.collapsedLogoUrl$.next(collapsedLogoFromBytes ?? normalizedBranding.collapsedLogoPath ?? '');
  }

  private normalizeHexColor(value: string, fallback: string): string {
    if (!value) {
      return fallback;
    }

    const candidate = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(candidate)) {
      return fallback;
    }

    return candidate.toLowerCase();
  }
}
