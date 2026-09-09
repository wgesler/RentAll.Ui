import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { resolveMobileReturnUrl } from '../mobile-email-nav';
import { MobileChecklistIssuesBase } from '../mobile-checklist-issues-base';
import { MobileInspectionIssuesDraftService } from '../mobile-inspection-issues-draft.service';

@Component({
  standalone: true,
  selector: 'app-mobile-inspection-issues-page',
  imports: [CommonModule, MaterialModule],
  templateUrl: './mobile-inspection-issues-page.component.html',
  styleUrl: './mobile-inspection-issues-page.component.scss'
})
export class MobileInspectionIssuesPageComponent extends MobileChecklistIssuesBase implements OnInit {
  private draftService = inject(MobileInspectionIssuesDraftService);
  private pageRouter = inject(Router);
  isMissingDraft = false;
  returnUrl = '';

  ngOnInit(): void {
    const draft = this.draftService.getDraft();
    if (!draft) {
      this.isMissingDraft = true;
      return;
    }
    this.data = draft.data;
    this.returnUrl = draft.returnUrl;
    this.initializeIssueDisplay();
  }

  protected override onTicketCreateSuccess(): void {
    this.back();
  }

  back(): void {
    this.draftService.clearDraft();
    this.pageRouter.navigateByUrl(resolveMobileReturnUrl(this.returnUrl));
  }
}
