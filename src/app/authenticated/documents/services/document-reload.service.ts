import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DocumentReloadService {
  private reloadDocuments$ = new Subject<void>();

  // Observable that components can subscribe to
  get reloadDocuments(): Subject<void> {
    return this.reloadDocuments$;
  }

  // Method to trigger reload
  triggerReload(): void {
    this.reloadDocuments$.next();
  }
}

