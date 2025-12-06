import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { AuthResponse } from '../public/login/models/auth-response';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BehaviorSubject, Observable, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
import { CommonMessage } from '../enums/common-message.enum';
import { ToastrService } from 'ngx-toastr';
import { LoadingBarService } from '../services/loading-bar.service';
import { PurposefulAny } from '../shared/models/amorphous';


const tokenSubject$: BehaviorSubject<PurposefulAny> = new BehaviorSubject<PurposefulAny>(null);
let isRefreshingToken: boolean = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Skip interceptor for anonymous endpoints
  if (req.url.endsWith('/refresh-token') || 
      req.url.endsWith('/login') ||
      req.url.includes('/common/daily-quote') ||
      req.url.includes('/common/state')) {
    return next(req);
  }

  inject(LoadingBarService).show();
  req = addToken(req);

  return next(req).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse) {
        switch ((error as HttpErrorResponse).status) {
          case 400:
            return handle400Error(error);
          case 401:
            return handle401Error(req, error, next);
          case 409:
            return handle409Error(error);
          default:
            return handleDefaultError(error);
        }
      } else {
        inject(LoadingBarService).hide();
        return throwError(() => error);
      }
    }),
    finalize(() => {
      inject(LoadingBarService).hide();
    })
  );
};

function handle400Error(error: HttpErrorResponse): Observable<HttpEvent<PurposefulAny>> {
  if (error?.error)
    inject(ToastrService).error(
      typeof error?.error === 'string' ? error.error : 'An unexpected error has occurred.', CommonMessage.Error);
  else if (inject(AuthService).getIsLoggedIn() && error.status === 400)
    // If we get a 400 and the error message is 'invalid_grant', the token is no longer valid so logout.
    return logoutUser();
  return throwError(() => error);
}

function handle401Error(req: HttpRequest<PurposefulAny>, err: HttpErrorResponse, next: HttpHandlerFn): Observable<HttpEvent<PurposefulAny>> {
  if (!isRefreshingToken) {
    inject(LoadingBarService).show();
    isRefreshingToken = true;

    // Reset here so that the following requests wait until the token
    // comes back from the refreshToken call.
    tokenSubject$.next(null);
    
    return inject(AuthService).refresh().pipe(
      switchMap((authResponse: AuthResponse) => {
        if (authResponse && authResponse.accessToken) {
          tokenSubject$.next(authResponse.accessToken);
          return next(addToken(req));
        }
        // If we don't get a new token, we are in trouble so throw error back to login Component
        return logoutUser();
      }),
      catchError(error =>
      {
        // logout if 401 is thrown.
        if (error instanceof HttpErrorResponse && ((error as HttpErrorResponse).status === 401)) {
          return logoutUser();
        }
        const err = error?.error?.Message ?? error?.error;
        if (err) inject(ToastrService).error(err);
        return throwError(() => error);
      }),
      finalize(() => {
        isRefreshingToken = false;
      })
    );
  } else {
    return tokenSubject$.pipe(filter(token => token !== null), take(1),
      switchMap(() => next(addToken(req))));
  }
}

function handle409Error(error: HttpErrorResponse): Observable<HttpEvent<PurposefulAny>> {
   if (error?.error) {
    inject(ToastrService).error(error.error);
  }
  return throwError(() => error);
}

function handleDefaultError(error: HttpErrorResponse): Observable<HttpEvent<PurposefulAny>> {
  if (error?.error?.Message) {
    inject(ToastrService).error(error.error.Message);
  }
  return throwError(() => error);
}

function logoutUser(): Observable<PurposefulAny> {
  return inject(AuthService).logout();
}

function addToken(req: HttpRequest<PurposefulAny>): HttpRequest<PurposefulAny> {
  const authData = inject(AuthService).getAuthData();
  const authReq = (authData) ? req.clone({setHeaders: {Authorization: 'Bearer ' + authData.accessToken}}) : req;

  return authReq;
}
