import { HttpContextToken } from '@angular/common/http';

/** Background requests (e.g. sidebar badges) should not show global error toasts on failure. */
export const SUPPRESS_GLOBAL_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** Upload requests (e.g. property photos) should not force logout on transport/auth errors. */
export const SUPPRESS_AUTH_LOGOUT_ON_ERROR = new HttpContextToken<boolean>(() => false);
