import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface LeaseReloadScope {
  officeId: number | null;
  propertyId: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class LeaseReloadService {
  private reloadLease$ = new Subject<LeaseReloadScope | null>();

  // Observable that components can subscribe to
  get reloadLease(): Subject<LeaseReloadScope | null> {
    return this.reloadLease$;
  }

  // Method to trigger reload
  triggerReload(scope: LeaseReloadScope | null = null): void {
    this.reloadLease$.next(scope);
  }
}




