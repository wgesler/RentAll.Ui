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
  
  // Temporary debug-friendly fallback so we can see what backend actually returned.
  const raw = typeof error.error === 'string'
    ? error.error
    : (error.error ? JSON.stringify(error.error) : '');
  const snippet = raw && raw.length > 280 ? `${raw.slice(0, 280)}...` : raw;
  const statusPart = error.status ? `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ''}` : CommonMessage.Unexpected;
  const composed = snippet
    ? `${statusPart}: ${snippet}`
    : statusPart;
  const finalMessage = appendTryAgain ? composed + CommonMessage.TryAgain : composed;
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

// 400 BadRequest: show API message globally when available
function handle400Error(req: HttpRequest<PurposefulAny>, error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  showErrorToast(error, toastrService, CommonMessage.Error, false);
  return throwError(() => error);
}

// 401 Unauthorized
function handle401Error(req: HttpRequest<PurposefulAny>, err: HttpErrorResponse, next: HttpHandlerFn, loadingBarService: LoadingBarService, authService: AuthService, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  // If user is logging out, do not attempt refresh/retry.
  if (authService.isLoggingOut()) {
    return EMPTY;
  }

  // If we just refreshed and still get 401, it's an unauthorized action
  if (justRefreshed) {
    justRefreshed = false;
    const errorData = err?.error;
    const hasApiMessage = errorData && typeof errorData === 'object' && 
      (('message' in errorData || 'Message' in errorData) || 
       ('controller' in errorData && 'httpMethod' in errorData));
    
    if (hasApiMessage) {
      showErrorToast(err, toastrService, CommonMessage.Unauthorized, false);
    } else {
      toastrService.error(CommonMessage.UnauthorizedAction, CommonMessage.Unauthorized);
    }
    return throwError(() => err);
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
                justRefreshed = false;
                // Show API message if available, otherwise show generic unauthorized message
                const errorData = retryError?.error;
                const hasApiMessage = errorData && typeof errorData === 'object' && 
                  (('message' in errorData || 'Message' in errorData) || 
                   ('controller' in errorData && 'httpMethod' in errorData));
                
                if (hasApiMessage) {
                  showErrorToast(retryError, toastrService, CommonMessage.Unauthorized, false);
                } else {
                  toastrService.error(CommonMessage.UnauthorizedAction, CommonMessage.Unauthorized);
                }
              }
              return throwError(() => retryError);
            })
          );
        }
        // If refresh response is invalid, logout and return to login
        return logoutUser(authService);
      }),
      catchError(error => {
        // On refresh token failure, show session timeout message
        if (error instanceof HttpErrorResponse) {
          if (error.status === 401) {
            // Refresh token expired/invalid - session timeout
            toastrService.error(CommonMessage.SessionTimeout, CommonMessage.Unauthorized);
          } else {
            // Other error during refresh
            showErrorToast(error, toastrService, CommonMessage.ServiceError, true);
          }
        }
        // Reset token subject to signal failure to waiting requests
        tokenSubject$.next(null);
        // Always logout on refresh failure to return to login screen
        return logoutUser(authService);
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
      switchMap(() => next(addToken(req, authService)))
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
      req.url.includes('/common/daily-quote') ||
      req.url.includes('/common/state') ||
      req.url.includes('/common/property-listing')) {
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
        switch ((error as HttpErrorResponse).status) {
          case 400:
            return handle400Error(req, error, toastrService);
          case 401:
            return handle401Error(req, error, next, loadingBarService, authService, toastrService);
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
