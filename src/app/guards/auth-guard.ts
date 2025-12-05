import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { RouterToken } from '../app.routes';


export const authRouteGuard: CanActivateFn = () => {
    if (inject(AuthService).getIsLoggedIn()) return true;
    inject(Router).navigate([RouterToken.Login]);
    return false;
}
