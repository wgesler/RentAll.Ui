import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';

@Injectable({ providedIn: 'root' })
export class DashboardNavigationService {
  private tabIndex = 0;

  setTabIndex(tabIndex: number): void {
    this.tabIndex = Number.isFinite(tabIndex) ? Math.max(0, Math.floor(tabIndex)) : 0;
  }

  getTabIndex(): number {
    return this.tabIndex;
  }

  getDashboardReturnUrl(): string {
    return `/${RouterUrl.Dashboard}?tab=${this.tabIndex}`;
  }

  resolveDashboardReturnUrl(returnUrl: string | null | undefined): string | null {
    const trimmed = (returnUrl || '').trim();
    if (!trimmed) {
      return null;
    }
    const pathOnly = trimmed.split('?')[0].replace(/^\/+/, '');
    const dashboardPath = RouterUrl.Dashboard.replace(/^\/+/, '');
    if (pathOnly !== dashboardPath) {
      return null;
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  goToProperty(router: Router, propertyId: string | null | undefined): void {
    const id = (propertyId || '').trim();
    if (!id) {
      return;
    }
    void router.navigate([RouterUrl.replaceTokens(RouterUrl.Property, [id])], {
      queryParams: { returnUrl: this.getDashboardReturnUrl() }
    });
  }

  goToReservation(
    router: Router,
    reservationId: string | null | undefined,
    propertyId?: string | null
  ): void {
    const id = (reservationId || '').trim();
    if (!id) {
      return;
    }
    const queryParams: Record<string, string> = { returnUrl: this.getDashboardReturnUrl() };
    const normalizedPropertyId = (propertyId || '').trim();
    if (normalizedPropertyId) {
      queryParams['propertyId'] = normalizedPropertyId;
    }
    void router.navigate([RouterUrl.replaceTokens(RouterUrl.Reservation, [id])], { queryParams });
  }
}
