import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RouterToken } from '../app.routes';


export const unAuthRouteGuard: CanActivateFn = () => {
    if (!inject(AuthService).getIsLoggedIn()) return true;
    inject(Router).navigate([RouterToken.Auth]);
    return false;
}
