import { Injectable } from '@angular/core';
import { ChecklistIssuesDialogData } from '../maintenance/inspection/dialog-checklist-issues.component';

export interface MobileInspectionIssuesDraft {
  data: ChecklistIssuesDialogData;
  returnUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class MobileInspectionIssuesDraftService {
  private draft: MobileInspectionIssuesDraft | null = null;

  setDraft(draft: MobileInspectionIssuesDraft): void {
    this.draft = draft;
  }

  getDraft(): MobileInspectionIssuesDraft | null {
    return this.draft;
  }

  clearDraft(): void {
    this.draft = null;
  }
}
