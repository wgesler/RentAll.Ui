import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { EmailCreateDraft } from '../models/email-create.model';

@Injectable({
  providedIn: 'root'
})
export class EmailCreateDraftService {
  private draft: EmailCreateDraft | null = null;
  private closeWaiter: Subject<void> | null = null;

  setDraft(draft: EmailCreateDraft): void {
    this.draft = draft;
  }

  getDraft(): EmailCreateDraft | null {
    return this.draft;
  }

  clearDraft(): void {
    this.draft = null;
  }

  hasPendingWait(): boolean {
    return this.closeWaiter != null;
  }

  beginWaitForClose(): Observable<void> {
    this.finishWait();
    const waiter = new Subject<void>();
    this.closeWaiter = waiter;
    return waiter.asObservable();
  }

  finishWait(): void {
    const waiter = this.closeWaiter;
    this.closeWaiter = null;
    if (!waiter) {
      return;
    }

    waiter.next();
    waiter.complete();
  }
}
