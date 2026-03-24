import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RouterToken } from '../app.routes';
import { canUserAccessUrl, getAuthorizedFallbackUrl } from '../authenticated/shared/access/role-access';
import { AuthService } from '../services/auth.service';

export const authRouteGuard: CanActivateFn = (_route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.getIsLoggedIn()) {
        return router.createUrlTree([RouterToken.Login]);
    }

    const userGroups = authService.getUser()?.userGroups as Array<string | number> | undefined;
    if (!canUserAccessUrl(userGroups, state.url)) {
        const fallbackUrl = getAuthorizedFallbackUrl(userGroups);
        return router.parseUrl(fallbackUrl);
    }

    return true;
};
