import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SidebarStateService {
  private readonly expandedSubject = new BehaviorSubject<boolean>(true);
  private readonly toggleRequestSubject = new Subject<void>();

  readonly isExpanded$ = this.expandedSubject.asObservable();
  readonly toggleRequest$ = this.toggleRequestSubject.asObservable();

  get isExpanded(): boolean {
    return this.expandedSubject.value;
  }

  setExpanded(isExpanded: boolean): void {
    this.expandedSubject.next(isExpanded);
  }

  toggleExpanded(): void {
    this.expandedSubject.next(!this.expandedSubject.value);
  }

  requestToggle(): void {
    this.toggleRequestSubject.next();
  }
}
