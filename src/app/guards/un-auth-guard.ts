import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';


export const unAuthRouteGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    if (!authService.getIsLoggedIn()) return true;
    return inject(Router).parseUrl(authService.getStartupPageUrl());
}
