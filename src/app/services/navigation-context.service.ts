import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OwnerAuthorization } from '../authenticated/owners/models/owner-enums';

@Injectable({
  providedIn: 'root'
})
export class NavigationContextService {
  private isInSettingsContext$ = new BehaviorSubject<boolean>(false);
  private isInOwnerMode$ = new BehaviorSubject<boolean>(false);
  private ownerAuthorization$ = new BehaviorSubject<OwnerAuthorization>(OwnerAuthorization.UnauthorizedOwner);

  setIsInSettingsContext(value: boolean): void {
    this.isInSettingsContext$.next(value);
  }

  setIsInOwnerMode(value: boolean): void {
    this.isInOwnerMode$.next(value);
  }

  getIsInOwnerMode(): BehaviorSubject<boolean> {
    return this.isInOwnerMode$;
  }

  setOwnerAuthorization(value: OwnerAuthorization): void {
    this.ownerAuthorization$.next(value);
  }

  clearContext(): void {
    this.isInSettingsContext$.next(false);
    this.isInOwnerMode$.next(false);
    this.ownerAuthorization$.next(OwnerAuthorization.UnauthorizedOwner);
  }
}
