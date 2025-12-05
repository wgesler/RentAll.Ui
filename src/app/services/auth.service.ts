import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject, tap, take } from 'rxjs';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { MatDialog } from '@angular/material/dialog';
import { StorageService } from './storage.service';
import { StorageKey } from '../enums/storage-keys.enum';
import { LoginRequest } from '../public/login/models/login-request';
import { AuthResponse } from '../public/login/models/auth-response';
import { JwtContainer, JwtUser } from '../public/login/models/jwt';
import { ConfigService } from './config.service';
import { JwtTempContainer } from '../public/login/models/jwt-temp';
import { RefreshTokenRequest } from '../public/login/models/refresh-token-request';
import { RouterToken } from '../app.routes';

@Injectable({
    providedIn: 'root'
})

export class AuthService {
    public jwtChanged$ = new BehaviorSubject<boolean>(false);
    private authData$ = new BehaviorSubject<AuthResponse>(new AuthResponse());
    private jwtContainer$ = new BehaviorSubject<JwtContainer | undefined>(undefined);
    private jwtHelperService = new JwtHelperService();
    private isLoggedIn$ = new BehaviorSubject<boolean>(false);

    private readonly controller = this.configService.config().apiUrl + 'auth/';

    constructor(
        private http: HttpClient,
        private router: Router,
        private dialog: MatDialog,
        private storageService: StorageService,
        private configService: ConfigService)
    {
        const authData = this.storageService.getItem(StorageKey.AuthData);
        const storageAuthData = authData !== null ? JSON.parse(authData) as AuthResponse : null;
        if (storageAuthData) { this.setAuthData(storageAuthData); }

        this.jwtContainer$.subscribe(() => { this.jwtChanged$.next(!this.jwtChanged$); });
    }

    login(request: LoginRequest): Observable<AuthResponse> {
        this.clearSensitiveData();
        return this.http.post<AuthResponse>(this.controller + 'login', request).pipe(
            tap((response: AuthResponse) => this.setAuthData(response))
        );
    }

    logout(): Observable<boolean> {
        const sessionId = this.getSessionId();
        if (sessionId) {
            const logoutRequest = {sessionGuid: sessionId};
            this.http.post<boolean>(this.controller + 'logout', logoutRequest).pipe(take(1)).subscribe({});
        }

        this.clearDefaultSearchItems();
        this.clearSensitiveData();
        this.dialog.closeAll();
        this.router.navigateByUrl(RouterToken.Login, { replaceUrl: true });

        this.isLoggedIn$.next(false);
        return of(true);
    }

    refresh(): Observable<AuthResponse> {
        if (!this.authData$.value) return of(new AuthResponse());
        const request: RefreshTokenRequest = { refreshToken: this.authData$.value.RefreshToken! };

        return this.http.post<AuthResponse>(this.controller + 'refresh-token', request).pipe(
            tap((response: AuthResponse) => this.buildRefreshAuthData(response)));
    }

    getAuthData(): AuthResponse | null {
        return JSON.parse(this.storageService.getItem(StorageKey.AuthData) || null);
    }

    getIsAuth(): boolean {
        return !!this.jwtContainer$.value;
    }

    getUser(): JwtUser | null {
        return this.jwtContainer$.value?.user;
    }

    getSessionId(): string | null {
        return this.jwtContainer$?.value?.sub;
    }

    setAuthData(response: AuthResponse): void {
        this.authData$.next(response);
        this.storageService.addItem(StorageKey.AccessEvent, 'true');

        const authorizationDataStorage = JSON.stringify(this.storageService.getItem(StorageKey.AuthData));
        if (authorizationDataStorage) { this.storageService.removeItem(StorageKey.AuthData); }

        const tokenEnc = this.jwtHelperService.decodeToken(this.authData$.value?.AccessToken);
        const token = tokenEnc as JwtTempContainer;
        const jwtUserObj = JSON.parse(atob(token.user));
        const jwtContainer = new JwtContainer(token.sub, token.exp, jwtUserObj);

        this.storageService.addItem(StorageKey.AuthData, JSON.stringify(response));
        this.jwtContainer$.next(jwtContainer);
        this.isLoggedIn$.next(this.getIsLoggedIn());
    }

    getIsLoggedIn(): boolean {
        return this.getAuthData() && this.getIsAuth();
    }

    getIsLoggedIn$(): Observable<boolean> {
        return this.isLoggedIn$;
    }

    private clearSensitiveData(): void {
        this.authData$.next(new AuthResponse());
        this.jwtContainer$.next(undefined);
        this.storageService.removeItem(StorageKey.AuthData);
        this.storageService.removeItem(StorageKey.AccessEvent);
    }

    private clearDefaultSearchItems(): void {
        this.storageService.removeItem(StorageKey.OutstandingSearchItems);
    }

  private buildRefreshAuthData(response: AuthResponse): void {
        this.setAuthData(response);
  }
}
