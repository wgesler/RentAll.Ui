import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { AuthResponse } from '../public/login/models/auth-response';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BehaviorSubject, Observable, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
import { CommonMessage } from '../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { LoadingBarService } from '../services/loading-bar.service';
import { PurposefulAny } from '../shared/models/amorphous';
import { ErrorResponseDto } from '../shared/models/error-response';


const tokenSubject$: BehaviorSubject<PurposefulAny> = new BehaviorSubject<PurposefulAny>(null);
let isRefreshingToken: boolean = false;
let justRefreshed: boolean = false;

// Helper function declarations
function showErrorToast(error: HttpErrorResponse, toastrService: ToastrService, title: string = CommonMessage.Error, appendTryAgain: boolean = false): void {
  // Check if error.error matches ErrorResponseDto structure
  const errorData = error?.error;
  
  if (errorData && typeof errorData === 'object') {
    // Check if it has the ErrorResponseDto structure
    if ('message' in errorData || 'Message' in errorData || 
        ('controller' in errorData && 'httpMethod' in errorData)) {
      
      const errorDto = errorData as ErrorResponseDto;
      let message = errorDto.message || (errorData as any).Message || '';
      
      // Append TryAgain suffix for server errors if requested
      if (appendTryAgain && message) {
        message = message + CommonMessage.TryAgain;
      }
      
      // Create a formatted toast message with error details
      if (message) {
        toastrService.error(message, title);
      } 
      return;
    }
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

// 400 BadRequest: Let components handle error messages (they're more specific)
function handle400Error(error: HttpErrorResponse, authService: AuthService, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  if (authService.getIsLoggedIn() && error.status === 400) {
    return logoutUser(authService);
  }
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

// 409 Conflict: Let components handle error messages (they're more specific)
function handle409Error(error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
   return throwError(() => error);
}

// 404 NotFound: Let components handle error messages (they're more specific)
function handle404Error(error: HttpErrorResponse): Observable<HttpEvent<PurposefulAny>> {
   return throwError(() => error);
}

// 500+ ServerError: Let components handle error messages (they're more specific)
function handleDefaultError(error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {  // Don't show generic error - let components show specific error messages
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
            return handle400Error(error, authService, toastrService);
          case 401:
            return handle401Error(req, error, next, loadingBarService, authService, toastrService);
          case 404:
            return handle404Error(error);
          case 409:
            return handle409Error(error, toastrService);
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
