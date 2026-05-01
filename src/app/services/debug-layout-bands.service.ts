import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Matches `body.dbg-page-debug-on` in `src/styles/_debug-layout-bands.scss`. */
export const DEBUG_LAYOUT_BANDS_BODY_CLASS = 'dbg-page-debug-on';

const STORAGE_KEY = 'rentall-dbg-layout-bands';

/**
 * Toggles blue/purple/orange layout debug chrome app-wide (see `.cursor/rules/debug-layout-bands.mdc`).
 * Spacing for hooked regions stays on when chrome is off; only dashed borders and tints hide.
 */
@Injectable({ providedIn: 'root' })
export class DebugLayoutBandsService {
  private readonly enabledSubject = new BehaviorSubject<boolean>(this.readStoredOrDefault());

  readonly enabled$ = this.enabledSubject.asObservable();

  constructor() {
    this.enabledSubject.subscribe((on) => {
      if (typeof document !== 'undefined') {
        document.body.classList.toggle(DEBUG_LAYOUT_BANDS_BODY_CLASS, on);
      }
    });
  }

  isEnabled(): boolean {
    return this.enabledSubject.value;
  }

  setEnabled(on: boolean): void {
    if (typeof localStorage !== 'undefined') {
      if (on) {
        localStorage.setItem(STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    this.enabledSubject.next(on);
  }

   readStoredOrDefault(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) {
      return false;
    }
    return v === '1';
  }
}
