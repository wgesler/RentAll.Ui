import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, EMPTY, Observable, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
import { CommonMessage } from '../enums/common-message.enum';
import { AuthResponse } from '../public/login/models/auth-response';
import { AuthService } from '../services/auth.service';
import { LoadingBarService } from '../services/loading-bar.service';
import { PurposefulAny } from '../shared/models/amorphous';
import { ErrorResponseDto } from '../shared/models/error-response';


const tokenSubject$: BehaviorSubject<PurposefulAny> = new BehaviorSubject<PurposefulAny>(null);
let isRefreshingToken: boolean = false;
let justRefreshed: boolean = false;
const refreshFailedToken = '__refresh_failed__';

// Helper function declarations
function extractApiErrorMessage(error: HttpErrorResponse): string | null {
  const errorData = error?.error;
  if (!errorData) {
    return null;
  }

  if (typeof errorData === 'string') {
    const trimmed = errorData.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof errorData === 'object') {
    const dtoMessage = (errorData as ErrorResponseDto).message;
    const message = typeof dtoMessage === 'string' && dtoMessage.trim() ? dtoMessage.trim() : null;
    if (message) {
      return message;
    }

    const altMessage = (errorData as any).Message;
    if (typeof altMessage === 'string' && altMessage.trim()) {
      return altMessage.trim();
    }

    const title = (errorData as any).title;
    if (typeof title === 'string' && title.trim()) {
      const detail = (errorData as any).detail;
      if (typeof detail === 'string' && detail.trim()) {
        return `${title.trim()}: ${detail.trim()}`;
      }
      return title.trim();
    }

    const detailOnly = (errorData as any).detail;
    if (typeof detailOnly === 'string' && detailOnly.trim()) {
      return detailOnly.trim();
    }

    const errors = (errorData as any).errors;
    if (errors && typeof errors === 'object') {
      const flattened: string[] = [];
      for (const key of Object.keys(errors)) {
        const value = errors[key];
        if (Array.isArray(value)) {
          flattened.push(...value
            .filter(item => typeof item === 'string' && item.trim())
            .map(item => `${key}: ${String(item).trim()}`));
        } else if (typeof value === 'string' && value.trim()) {
          flattened.push(`${key}: ${value.trim()}`);
        }
      }
      if (flattened.length > 0) {
        return flattened.join(' | ');
      }
    }
  }

  return null;
}

function showErrorToast(error: HttpErrorResponse, toastrService: ToastrService, title: string = CommonMessage.Error, appendTryAgain: boolean = false): void {
  const apiMessage = extractApiErrorMessage(error);
  if (apiMessage) {
    const message = appendTryAgain ? apiMessage + CommonMessage.TryAgain : apiMessage;
    toastrService.error(message, title);
    return;
  }

  // Keep fallback user-facing output generic; never leak transport objects to the UI.
  const statusPart = error.status ? `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ''}` : CommonMessage.Unexpected;
  const finalMessage = appendTryAgain ? statusPart + CommonMessage.TryAgain : statusPart;
  toastrService.error(finalMessage, title);
}

function addToken(req: HttpRequest<PurposefulAny>, authService: AuthService): HttpRequest<PurposefulAny> {
  const authData = authService.getAuthData();
  const authReq = (authData) ? req.clone({setHeaders: {Authorization: 'Bearer ' + authData.accessToken}}) : req;
  return authReq;
}

function logoutUser(authService: AuthService): Observable<PurposefulAny> {
  return authService.logout();
}

function shouldForceLogoutForTransportError(error: HttpErrorResponse): boolean {
  const payload = error?.error as PurposefulAny;
  return error.status === 0
    || payload instanceof ProgressEvent
    || (typeof payload === 'object' && payload !== null && payload.isTrusted === true);
}

function logoutAndSuppress(authService: AuthService): Observable<HttpEvent<PurposefulAny>> {
  return logoutUser(authService).pipe(
    switchMap(() => EMPTY)
  );
}

// 400 BadRequest: show API message globally when available
function handle400Error(req: HttpRequest<PurposefulAny>, error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  showErrorToast(error, toastrService, CommonMessage.Error, false);
  return throwError(() => error);
}

// 401 Unauthorized
function handle401Error(req: HttpRequest<PurposefulAny>, err: HttpErrorResponse, next: HttpHandlerFn, loadingBarService: LoadingBarService, authService: AuthService): Observable<HttpEvent<PurposefulAny>> {
  // If user is logging out, do not attempt refresh/retry.
  if (authService.isLoggingOut()) {
    return EMPTY;
  }

  // If we just refreshed and still get 401, it's an unauthorized action
  if (justRefreshed) {
    justRefreshed = false;
    return logoutAndSuppress(authService);
  }
  
  if (!isRefreshingToken) {
    loadingBarService.show();
    isRefreshingToken = true;
    tokenSubject$.next(null);
    
    return authService.refresh().pipe(
      switchMap((authResponse: AuthResponse) => {
        if (authResponse && authResponse.accessToken) {
          tokenSubject$.next(authResponse.accessToken);
          justRefreshed = true;
          return next(addToken(req, authService)).pipe(
            catchError(retryError => {
              // If retry after refresh still gets 401, it's unauthorized action
              if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                tokenSubject$.next(refreshFailedToken);
                justRefreshed = false;
                return logoutAndSuppress(authService);
              }
              return throwError(() => retryError);
            })
          );
        }
        // If refresh response is invalid, release waiting requests and logout.
        tokenSubject$.next(refreshFailedToken);
        return logoutUser(authService);
      }),
      catchError(error => {
        // Release waiting requests when refresh fails.
        tokenSubject$.next(refreshFailedToken);
        // Always logout on refresh failure to return to login screen
        return logoutAndSuppress(authService);
      }),
      finalize(() => {
        isRefreshingToken = false;
        justRefreshed = false;
      })
    );
  } else {
    // Wait for token refresh - if it fails, logout will navigate away and cancel this
    return tokenSubject$.pipe(
      filter(token => token !== null), 
      take(1),
      switchMap(token => token === refreshFailedToken ? EMPTY : next(addToken(req, authService)))
    );
  }
}

// 409 Conflict: show API message globally when available
function handle409Error(req: HttpRequest<PurposefulAny>, error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  showErrorToast(error, toastrService, CommonMessage.Error, false);
  return throwError(() => error);
}

// 404 NotFound: rethrow so callers can treat missing resources (e.g. optional GETs) without a global toast
function handle404Error(error: HttpErrorResponse): Observable<HttpEvent<PurposefulAny>> {
  return throwError(() => error);
}

// 500+ and other errors: show API message globally when available
function handleDefaultError(error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  showErrorToast(error, toastrService, CommonMessage.ServiceError, true);
  return throwError(() => error);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Skip interceptor for anonymous endpoints
  if (req.url.endsWith('/refresh-token') || 
      req.url.endsWith('/login') ||
      req.url.endsWith('/logout') ||
      req.url.startsWith('assets/') ||
      req.url.includes('/assets/') ||
      req.url.includes('/common/daily-quote') ||
      req.url.includes('/common/state') ||
      req.url.includes('/common/property-listing') ||
      req.url.includes('/common/owner-form')) {
    return next(req);
  }

  // Inject services at the top level (injection context)
  const loadingBarService = inject(LoadingBarService);
  const authService = inject(AuthService);
  const toastrService = inject(ToastrService);

  // During explicit logout, silently ignore protected API requests.
  if (authService.isLoggingOut()) {
    return EMPTY;
  }

  // If there's no access token for a protected endpoint, avoid sending a request that will 401.
  const authData = authService.getAuthData();
  if (!authData?.accessToken) {
    return EMPTY;
  }

  loadingBarService.show();
  req = addToken(req, authService);

  return next(req).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse) {
        if (shouldForceLogoutForTransportError(error)) {
          return logoutAndSuppress(authService);
        }
        if (req.url.includes('/organization/branding')) {
          return throwError(() => error);
        }
        switch ((error as HttpErrorResponse).status) {
          case 400:
            return handle400Error(req, error, toastrService);
          case 401:
            return handle401Error(req, error, next, loadingBarService, authService);
          case 404:
            return handle404Error(error);
          case 409:
            return handle409Error(req, error, toastrService);
          default:
            return handleDefaultError(error, toastrService);
        }
      } else {
        loadingBarService.hide();
        return throwError(() => error);
      }
    }),
    finalize(() => {
      loadingBarService.hide();
    })
  );
};
