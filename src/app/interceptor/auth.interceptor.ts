import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
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
      return title.trim();
    }

    const errors = (errorData as any).errors;
    if (errors && typeof errors === 'object') {
      for (const key of Object.keys(errors)) {
        const value = errors[key];
        if (Array.isArray(value)) {
          const first = value.find(item => typeof item === 'string' && item.trim());
          if (first) {
            return first.trim();
          }
        } else if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
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
  
  // Fallback: if no API message but we need to show something (e.g., 500 without message)
  if (appendTryAgain) {
    toastrService.error(CommonMessage.Unexpected + CommonMessage.TryAgain, title);
  }
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
  // Temporary debugging aid: inspect exact API payload shape for bad requests.
  // This helps us align global message extraction with backend responses.
  console.groupCollapsed('[HTTP 400] API Error Payload');
  console.log('URL:', req.urlWithParams || req.url);
  console.log('Method:', req.method);
  console.log('Status:', error.status);
  console.log('StatusText:', error.statusText);
  console.log('Error body:', error.error);
  if (error?.error && typeof error.error === 'object') {
    console.log('error.message:', (error.error as any).message);
    console.log('error.title:', (error.error as any).title);
    console.log('error.errors:', (error.error as any).errors);
  }
  console.groupEnd();

  showErrorToast(error, toastrService, CommonMessage.Error, false);
  return throwError(() => error);
}

// 401 Unauthorized
function handle401Error(req: HttpRequest<PurposefulAny>, err: HttpErrorResponse, next: HttpHandlerFn, loadingBarService: LoadingBarService, authService: AuthService, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
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
  // Temporary debugging aid: inspect exact API payload shape for conflicts.
  console.groupCollapsed('[HTTP 409] API Error Payload');
  console.log('URL:', req.urlWithParams || req.url);
  console.log('Method:', req.method);
  console.log('Status:', error.status);
  console.log('StatusText:', error.statusText);
  console.log('Error body:', error.error);
  if (error?.error && typeof error.error === 'object') {
    console.log('error.message:', (error.error as any).message);
    console.log('error.title:', (error.error as any).title);
    console.log('error.errors:', (error.error as any).errors);
  }
  console.groupEnd();

  showErrorToast(error, toastrService, CommonMessage.Error, false);
  return throwError(() => error);
}

// 404 NotFound: show API message globally when available
function handle404Error(error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  showErrorToast(error, toastrService, CommonMessage.Error, false);
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
      req.url.includes('/common/daily-quote') ||
      req.url.includes('/common/state')) {
    return next(req);
  }

  // Inject services at the top level (injection context)
  const loadingBarService = inject(LoadingBarService);
  const authService = inject(AuthService);
  const toastrService = inject(ToastrService);

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
            return handle404Error(error, toastrService);
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
