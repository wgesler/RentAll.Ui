import { HttpContextToken } from '@angular/common/http';

/** Background requests (e.g. sidebar badges) should not show global error toasts on failure. */
export const SUPPRESS_GLOBAL_ERROR_TOAST = new HttpContextToken<boolean>(() => false);
