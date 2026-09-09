import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RouterToken } from '../app.routes';
import { canPartnerAccessMobileUrl, getMobilePartnerFallbackUrl } from '../authenticated/mobile/mobile-nav';
import { canPartnerAccessUrl, canUserAccessUrl, getAuthorizedFallbackUrl, getPartnerFallbackUrl } from '../authenticated/shared/access/role-access';
import { OrganizationType } from '../authenticated/organizations/models/organization-enum';
import { UserGroups } from '../authenticated/users/models/user-enums';
import { AuthService } from '../services/auth.service';
import { CommonService } from '../services/common.service';
import { resetViewportScroll, teardownCdkOverlayState } from '../shared/utils/cdk-overlay.util';

export const authRouteGuard: CanActivateFn = (_route, state) => {
    const authService = inject(AuthService);
    const commonService = inject(CommonService);
    const router = inject(Router);

    if (!authService.getIsLoggedIn()) {
        teardownCdkOverlayState();
        resetViewportScroll();
        return router.createUrlTree([RouterToken.Login]);
    }

    const path = state.url.split('?')[0].split('#')[0];
    const firstSegment = path.split('/').filter(Boolean)[0];
    const userGroups = authService.getUser()?.userGroups as Array<string | number> | undefined;
    const isPartnerOrg = !authService.hasRole(UserGroups.SuperAdmin)
      && Number(commonService.getOrganizationTypeId()) === OrganizationType.Partner;

    if (firstSegment === RouterToken.Mobile) {
        if (isPartnerOrg && !canPartnerAccessMobileUrl(state.url, userGroups)) {
          const hasCurrentRoute = !!router.routerState.snapshot.url && router.routerState.snapshot.url !== '/';
          if (hasCurrentRoute) {
            return false;
          }
          return router.parseUrl(getMobilePartnerFallbackUrl());
        }
        return true;
    }
    if (isPartnerOrg && !canPartnerAccessUrl(state.url, userGroups)) {
      const hasCurrentRoute = !!router.routerState.snapshot.url && router.routerState.snapshot.url !== '/';
      if (hasCurrentRoute) {
        return false;
      }
      return router.parseUrl(getPartnerFallbackUrl());
    }
    if (!canUserAccessUrl(userGroups, state.url)) {
        // If navigation is coming from an already-loaded route (user clicked in-app),
        // cancel and keep the user on the current page.
        const hasCurrentRoute = !!router.routerState.snapshot.url && router.routerState.snapshot.url !== '/';
        if (hasCurrentRoute) {
            return false;
        }

        // For direct URL entry / initial load, still redirect to a valid authorized page.
        const fallbackUrl = getAuthorizedFallbackUrl(userGroups);
        return router.parseUrl(fallbackUrl);
    }

    return true;
};
