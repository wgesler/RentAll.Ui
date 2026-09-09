import { Router } from '@angular/router';
import { RouterUrl } from '../../../app.routes';

export async function withMobileEmailCreateRoute(router: Router, action: () => Promise<void>): Promise<void> {
  const navigateByUrl = router.navigateByUrl.bind(router);
  router.navigateByUrl = (url: string, extras?: Parameters<Router['navigateByUrl']>[1]) => {
    if (url === RouterUrl.EmailCreate) {
      return navigateByUrl(RouterUrl.MobileEmailCreate, extras);
    }
    return navigateByUrl(url, extras);
  };
  try {
    await action();
  } finally {
    router.navigateByUrl = navigateByUrl;
  }
}
