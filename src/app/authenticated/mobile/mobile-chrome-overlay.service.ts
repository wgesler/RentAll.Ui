import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MobileChromeOverlayService {
  private readonly primaryChromeHiddenSubject = new BehaviorSubject<boolean>(false);
  readonly primaryChromeHidden$ = this.primaryChromeHiddenSubject.asObservable();

  setPrimaryChromeHidden(hidden: boolean): void {
    this.primaryChromeHiddenSubject.next(hidden);
  }

  get isPrimaryChromeHidden(): boolean {
    return this.primaryChromeHiddenSubject.value;
  }
}
