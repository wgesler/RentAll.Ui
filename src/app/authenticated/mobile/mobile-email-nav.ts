import { RouterUrl } from '../../app.routes';

export function resolveMobileReturnUrl(url?: string | null): string {
  const raw = (url || '').trim();
  if (raw.startsWith('/mobile')) {
    return raw;
  }
  return RouterUrl.MobileHome;
}
