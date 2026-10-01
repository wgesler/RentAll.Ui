import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { Subscription, filter, firstValueFrom, fromEvent, interval } from 'rxjs';
import { environment } from '../../environments/environment';

interface BuildVersionResponse {
  build?: string;
}

const STORAGE_KEY = 'rentall.buildVersion';
const RELOAD_ONCE_KEY = 'rentall.deployAutoReloadOnce';

@Injectable({ providedIn: 'root' })
export class AppDeployVersionService {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);

  private readonly versionUrl = 'assets/build-version.json';
  private readonly pollIntervalMs = 5 * 60 * 1000;
  private subscriptions = new Subscription();
  private started = false;

  start(): void {
    if (this.started || !environment.production) {
      return;
    }
    this.started = true;
    sessionStorage.removeItem(RELOAD_ONCE_KEY);

    void this.checkForNewDeploy();

    this.subscriptions.add(
      interval(this.pollIntervalMs).subscribe(() => {
        void this.checkForNewDeploy();
      })
    );

    this.subscriptions.add(
      fromEvent(window, 'focus').subscribe(() => {
        void this.checkForNewDeploy();
      })
    );

    this.subscriptions.add(
      fromEvent(document, 'visibilitychange').subscribe(() => {
        if (document.visibilityState === 'visible') {
          void this.checkForNewDeploy();
        }
      })
    );

    this.subscriptions.add(
      this.router.events.pipe(filter(event => event instanceof NavigationError)).subscribe(event => {
        const navigationError = event as NavigationError;
        if (this.isChunkLoadFailure(navigationError.error)) {
          this.reloadForDeploy();
        }
      })
    );

    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('unhandledrejection', this.onUnhandledRejection);
    });
  }

  stop(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
    this.started = false;
  }

  private readonly onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    if (!this.isChunkLoadFailure(event.reason)) {
      return;
    }
    event.preventDefault();
    this.ngZone.run(() => {
      this.reloadForDeploy();
    });
  };

  private async checkForNewDeploy(): Promise<void> {
    try {
      const remote = await this.fetchBuildVersion();
      const remoteBuild = String(remote?.build || '').trim();
      if (!remoteBuild) {
        return;
      }

      const storedBuild = sessionStorage.getItem(STORAGE_KEY);
      if (!storedBuild) {
        sessionStorage.setItem(STORAGE_KEY, remoteBuild);
        return;
      }

      if (storedBuild === remoteBuild) {
        return;
      }

      sessionStorage.setItem(STORAGE_KEY, remoteBuild);
      this.reloadForDeploy();
    } catch {
      // Ignore — next poll or focus will retry.
    }
  }

  private async fetchBuildVersion(): Promise<BuildVersionResponse> {
    const cacheBust = Date.now();
    const value = await firstValueFrom(
      this.http.get<BuildVersionResponse>(`${this.versionUrl}?v=${cacheBust}`, {
        headers: { 'Cache-Control': 'no-cache' }
      })
    );
    return value ?? {};
  }

  private reloadForDeploy(): void {
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') {
      return;
    }
    sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
    window.location.reload();
  }

  private isChunkLoadFailure(error: unknown): boolean {
    const message = this.errorMessage(error).toLowerCase();
    if (!message) {
      return false;
    }
    return message.includes('loading chunk')
      || message.includes('failed to fetch dynamically imported module')
      || message.includes('importing a module script failed')
      || message.includes('error loading dynamically imported module');
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message || String(error);
    }
    return String(error ?? '');
  }
}
