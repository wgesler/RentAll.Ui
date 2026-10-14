import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getMobileStartupUrl } from '../authenticated/mobile/mobile-nav';
import { isUsingMobileDevice } from '../authenticated/mobile/mobile-preference';
import { AuthService } from '../services/auth.service';
import { CommonService } from '../services/common.service';
import { StorageService } from '../services/storage.service';


export const unAuthRouteGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    if (!authService.getIsLoggedIn()) return true;
    const commonService = inject(CommonService);
    const organizationTypeId = commonService.getOrganizationTypeId();
    const startupUrl = isUsingMobileDevice(inject(StorageService))
        ? getMobileStartupUrl(authService, organizationTypeId)
        : authService.getStartupPageUrl(organizationTypeId);
    return inject(Router).parseUrl(startupUrl);
}
