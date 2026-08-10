import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DepartureLetterReloadService {
  private reloadDepartureLetter$ = new Subject<void>();

  // Observable that components can subscribe to
  get reloadDepartureLetter(): Subject<void> {
    return this.reloadDepartureLetter$;
  }

  // Method to trigger reload
  triggerReload(): void {
    this.reloadDepartureLetter$.next();
  }
}



