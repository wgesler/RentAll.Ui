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
        if (this.authData$.value?.refreshToken) {
            const request: RefreshTokenRequest = { refreshToken: this.authData$.value.refreshToken };
            this.http.post<boolean>(this.controller + 'logout', request).pipe(take(1)).subscribe({});
        }

        this.clearSensitiveData();
        this.dialog.closeAll();
        this.router.navigateByUrl(RouterToken.Login, { replaceUrl: true });

        this.isLoggedIn$.next(false);
        return of(true);
    }

    refresh(): Observable<AuthResponse> {
        if (!this.authData$.value) return of(new AuthResponse());
        const request: RefreshTokenRequest = { refreshToken: this.authData$.value.refreshToken! };

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
        try {
            if (!response) {
                console.error('Response is null or undefined');
                return;
            }

            this.authData$.next(response);
            this.storageService.addItem(StorageKey.AccessEvent, 'true');

            const authorizationDataStorage = JSON.stringify(this.storageService.getItem(StorageKey.AuthData));
            if (authorizationDataStorage) { this.storageService.removeItem(StorageKey.AuthData); }

            // Use the response parameter directly - API returns camelCase
            const accessToken = response?.accessToken;
            if (!accessToken) {
                console.error('No accessToken found in response. Response object:', response);
                return;
            }

            const tokenEnc = this.jwtHelperService.decodeToken(accessToken);
            if (!tokenEnc) {
                console.error('Failed to decode JWT token');
                return;
            }

            const token = tokenEnc as any;
            
            // Check if token has the expected structure
            if (!token.sub) {
                console.error('JWT token does not contain sub property. Token structure:', token);
                return;
            }

            // The user property might be in different formats
            let jwtUserObj: any = null;
            
            if (token.user) {
                // If user is a base64-encoded string, decode it
                try {
                    jwtUserObj = JSON.parse(atob(token.user));
                } catch (e) {
                    // If it's not base64, try parsing directly
                    jwtUserObj = typeof token.user === 'string' ? JSON.parse(token.user) : token.user;
                }
            } else if (token.UserGuid || token.userGuid) {
                // If user properties are directly on the token
                jwtUserObj = token;
            } else {
                console.error('JWT token does not contain user property or user data. Token structure:', token);
                return;
            }

            if (!jwtUserObj) {
                console.error('Failed to parse user object from JWT');
                return;
            }

            const jwtContainer = new JwtContainer(token.sub || '', token.exp || 0, jwtUserObj);

            this.storageService.addItem(StorageKey.AuthData, JSON.stringify(response));
            this.jwtContainer$.next(jwtContainer);
            this.isLoggedIn$.next(this.getIsLoggedIn());
        } catch (error) {
            console.error('Error in setAuthData:', error);
            // Clear any partial state
            this.jwtContainer$.next(undefined);
            this.isLoggedIn$.next(false);
        }
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


  private buildRefreshAuthData(response: AuthResponse): void {
        this.setAuthData(response);
  }
}
