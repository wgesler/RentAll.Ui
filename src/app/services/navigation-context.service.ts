import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OwnerAuthorization } from '../authenticated/owners/models/owner-authorization.model';

@Injectable({
  providedIn: 'root'
})
export class NavigationContextService {
  private isInSettingsContext$ = new BehaviorSubject<boolean>(false);
  private isInOwnerMode$ = new BehaviorSubject<boolean>(false);
  private ownerAuthorization$ = new BehaviorSubject<OwnerAuthorization>(OwnerAuthorization.UnauthorizedOwner);
  private currentAgentId$ = new BehaviorSubject<string | null>(null);

  setIsInSettingsContext(value: boolean): void {
    this.isInSettingsContext$.next(value);
  }

  getIsInSettingsContext(): BehaviorSubject<boolean> {
    return this.isInSettingsContext$;
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

  getOwnerAuthorization(): BehaviorSubject<OwnerAuthorization> {
    return this.ownerAuthorization$;
  }

  getOwnerAuthorizationValue(): OwnerAuthorization {
    return this.ownerAuthorization$.value;
  }

  setCurrentAgentId(agentId: string | null): void {
    this.currentAgentId$.next(agentId);
  }

  getCurrentAgentId(): BehaviorSubject<string | null> {
    return this.currentAgentId$;
  }

  clearContext(): void {
    this.isInSettingsContext$.next(false);
    this.isInOwnerMode$.next(false);
    this.ownerAuthorization$.next(OwnerAuthorization.UnauthorizedOwner);
    this.currentAgentId$.next(null);
  }
}







