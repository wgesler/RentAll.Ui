import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingBarService {

  public isLoading$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  constructor() { }

  hide(): void {
    this.isLoading$.next(false);
  }

  show(): void {
    this.isLoading$.next(true);
  }
}
