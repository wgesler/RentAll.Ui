import { Injectable, OnDestroy } from '@angular/core';

/** Publishes live phone viewport metrics as CSS variables on html.rentall-mobile-layout. */
@Injectable({ providedIn: 'root' })
export class MobileViewportService implements OnDestroy {
  private readonly html = document.documentElement;
  private readonly sync = () => this.apply();
  private active = false;

  start(): void {
    if (this.active || typeof window === 'undefined') {
      return;
    }
    this.active = true;
    this.apply();
    window.addEventListener('resize', this.sync, { passive: true });
    window.visualViewport?.addEventListener('resize', this.sync, { passive: true });
    window.visualViewport?.addEventListener('scroll', this.sync, { passive: true });
  }

  stop(): void {
    if (!this.active || typeof window === 'undefined') {
      return;
    }
    this.active = false;
    window.removeEventListener('resize', this.sync);
    window.visualViewport?.removeEventListener('resize', this.sync);
    window.visualViewport?.removeEventListener('scroll', this.sync);
    this.clear();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private apply(): void {
    const viewport = window.visualViewport;
    const width = Math.round(viewport?.width ?? window.innerWidth);
    const height = Math.round(viewport?.height ?? window.innerHeight);
    const offsetLeft = Math.round(viewport?.offsetLeft ?? 0);
    const offsetTop = Math.round(viewport?.offsetTop ?? 0);

    this.html.style.setProperty('--mobile-viewport-width', `${width}px`);
    this.html.style.setProperty('--mobile-viewport-height', `${height}px`);
    this.html.style.setProperty('--mobile-viewport-offset-left', `${offsetLeft}px`);
    this.html.style.setProperty('--mobile-viewport-offset-top', `${offsetTop}px`);
    this.html.style.setProperty('--mobile-content-width', `${Math.max(width - offsetLeft * 2, 0)}px`);
  }

  private clear(): void {
    for (const property of [
      '--mobile-viewport-width',
      '--mobile-viewport-height',
      '--mobile-viewport-offset-left',
      '--mobile-viewport-offset-top',
      '--mobile-content-width'
    ]) {
      this.html.style.removeProperty(property);
    }
  }
}
