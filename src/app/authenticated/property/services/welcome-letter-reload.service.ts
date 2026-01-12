import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WelcomeLetterReloadService {
  private reloadWelcomeLetter$ = new Subject<void>();

  // Observable that components can subscribe to
  get reloadWelcomeLetter(): Subject<void> {
    return this.reloadWelcomeLetter$;
  }

  // Method to trigger reload
  triggerReload(): void {
    this.reloadWelcomeLetter$.next();
  }
}

