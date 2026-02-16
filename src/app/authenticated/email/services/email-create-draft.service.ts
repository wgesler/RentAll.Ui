import { Injectable } from '@angular/core';
import { EmailCreateDraft } from '../models/email-create.model';

@Injectable({
  providedIn: 'root'
})
export class EmailCreateDraftService {
  private draft: EmailCreateDraft | null = null;

  setDraft(draft: EmailCreateDraft): void {
    this.draft = draft;
  }

  getDraft(): EmailCreateDraft | null {
    return this.draft;
  }

  clearDraft(): void {
    this.draft = null;
  }
}
