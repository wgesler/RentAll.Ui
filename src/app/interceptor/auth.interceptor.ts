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

// Helper function declarations
function addToken(req: HttpRequest<PurposefulAny>, authService: AuthService): HttpRequest<PurposefulAny> {
  const authData = authService.getAuthData();
  const authReq = (authData) ? req.clone({setHeaders: {Authorization: 'Bearer ' + authData.accessToken}}) : req;
  return authReq;
}

function logoutUser(authService: AuthService): Observable<PurposefulAny> {
  return authService.logout();
}

function handle400Error(error: HttpErrorResponse, authService: AuthService, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  if (error?.error)
    toastrService.error(
      typeof error?.error === 'string' ? error.error : 'An unexpected error has occurred.', CommonMessage.Error);
  else if (authService.getIsLoggedIn() && error.status === 400)
    return logoutUser(authService);
  return throwError(() => error);
}

function handle401Error(req: HttpRequest<PurposefulAny>, err: HttpErrorResponse, next: HttpHandlerFn, loadingBarService: LoadingBarService, authService: AuthService, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  if (!isRefreshingToken) {
    loadingBarService.show();
    isRefreshingToken = true;
    tokenSubject$.next(null);
    
    return authService.refresh().pipe(
      switchMap((authResponse: AuthResponse) => {
        if (authResponse && authResponse.accessToken) {
          tokenSubject$.next(authResponse.accessToken);
          return next(addToken(req, authService));
        }
        return logoutUser(authService);
      }),
      catchError(error => {
        if (error instanceof HttpErrorResponse && ((error as HttpErrorResponse).status === 401)) {
          return logoutUser(authService);
        }
        const err = error?.error?.Message ?? error?.error;
        if (err) toastrService.error(err);
        return throwError(() => error);
      }),
      finalize(() => {
        isRefreshingToken = false;
      })
    );
  } else {
    return tokenSubject$.pipe(filter(token => token !== null), take(1),
      switchMap(() => next(addToken(req, authService))));
  }
}

function handle409Error(error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
   if (error?.error) {
    toastrService.error(error.error);
  }
  return throwError(() => error);
}

function handleDefaultError(error: HttpErrorResponse, toastrService: ToastrService): Observable<HttpEvent<PurposefulAny>> {
  if (error?.error?.Message) {
    toastrService.error(error.error.Message);
  }
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
