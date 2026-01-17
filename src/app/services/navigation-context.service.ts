import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NavigationContextService {
  private isInSettingsContext$ = new BehaviorSubject<boolean>(false);
  private currentAgentId$ = new BehaviorSubject<string | null>(null);

  setIsInSettingsContext(value: boolean): void {
    this.isInSettingsContext$.next(value);
  }

  getIsInSettingsContext(): BehaviorSubject<boolean> {
    return this.isInSettingsContext$;
  }

  setCurrentAgentId(agentId: string | null): void {
    this.currentAgentId$.next(agentId);
  }

  getCurrentAgentId(): BehaviorSubject<string | null> {
    return this.currentAgentId$;
  }

  clearContext(): void {
    this.isInSettingsContext$.next(false);
    this.currentAgentId$.next(null);
  }
}







