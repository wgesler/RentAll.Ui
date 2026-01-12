import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LeaseReloadService {
  private reloadLease$ = new Subject<void>();

  // Observable that components can subscribe to
  get reloadLease(): Subject<void> {
    return this.reloadLease$;
  }

  // Method to trigger reload
  triggerReload(): void {
    this.reloadLease$.next();
  }
}

