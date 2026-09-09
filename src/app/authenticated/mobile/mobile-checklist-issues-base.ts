import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { RouterUrl } from '../../app.routes';
import { DocumentType } from '../documents/models/document.enum';
import { EmailType } from '../email/models/email.enum';
import { EmailCreateDraftService } from '../email/services/email-create-draft.service';
import { inlineIssuePhotoSources } from '../email/utils/inline-email-issue-photos';
import { ChecklistIssueEntry, ChecklistIssuesDialogData } from '../maintenance/inspection/dialog-checklist-issues.component';
import { BaseDocumentComponent, DocumentConfig, EmailConfig } from '../shared/base-document.component';
import { TicketStateType } from '../tickets/models/ticket-enum';
import { TicketRequest } from '../tickets/models/ticket-models';
import { TicketService } from '../tickets/services/ticket.service';

type ChecklistIssueEntryView = ChecklistIssueEntry & { _rid: number };

type ChecklistIssueGroup = {
  sectionTitle: string;
  setLabel?: string;
  issues: ChecklistIssueEntryView[];
};

export abstract class MobileChecklistIssuesBase extends BaseDocumentComponent {
  data: ChecklistIssuesDialogData | null = null;
  protected ticketService = inject(TicketService);
  protected router = inject(Router);
  private emailCreateDraftService = inject(EmailCreateDraftService);

  isDownloading = false;
  isPreparingEmail = false;
  isCreatingTicket = false;
  displayIssues: ChecklistIssueEntryView[] = [];
  protected initialDisplayIssues: ChecklistIssueEntryView[] = [];
  private nextIssueRid = 0;

  get hasRemovedIssues(): boolean {
    return this.displayIssues.length < this.initialDisplayIssues.length;
  }

  protected initializeIssueDisplay(): void {
    this.nextIssueRid = 0;
    this.displayIssues = (this.data?.issues || []).map(issue => ({
      ...issue,
      _rid: this.nextIssueRid++
    }));
    this.initialDisplayIssues = this.displayIssues.map(issue => ({ ...issue }));
  }

  protected onTicketCreateSuccess(): void {
    // Mobile pages override to navigate back.
  }

  groupTrackId(group: ChecklistIssueGroup, index: number): string {
    const first = group.issues[0]?._rid ?? index;
    return `${group.sectionTitle}|${group.setLabel || ''}|${first}`;
  }

  removeIssue(issue: ChecklistIssueEntryView): void {
    this.displayIssues = this.displayIssues.filter(i => i._rid !== issue._rid);
  }

  restoreRemovedIssues(): void {
    this.displayIssues = this.initialDisplayIssues.map(issue => ({ ...issue }));
  }

  buildIssuesReportText(): string {
    const propertyCode = this.data?.propertyCode || 'N/A';
    const dateText = this.data?.dateText || 'N/A';
    const groupedIssues = this.getGroupedIssues();
    const header = `Inspection Issues\nProperty: ${propertyCode}\nDate: ${dateText}\n\n`;
    if (groupedIssues.length === 0) {
      return `${header}No issues found.`;
    }

    const lines = groupedIssues.map(group => {
      const setPart = group.setLabel ? ` (${group.setLabel})` : '';
      const issueLines = group.issues.map((issue, issueIndex) => {
        const lineText = (issue.lineText || '').trim() || 'No line text provided';
        const issueText = (issue.issueText || '').trim() || 'No issue text provided';
        return `${issueIndex + 1}. ${lineText}\n   Issue: ${issueText}`;
      });
      return `${group.sectionTitle}${setPart}\n${issueLines.join('\n')}`;
    });
    return `${header}${lines.join('\n\n')}`;
  }

  async emailIssues(): Promise<void> {
    const fromEmail = (this.data?.fromEmail || '').trim();
    const fromName = (this.data?.fromName || '').trim();
    const toEmail = (this.data?.toEmail || fromEmail).trim();
    const toName = (this.data?.toName || fromName || 'Recipient').trim();
    const propertyCode = this.data?.propertyCode || 'N/A';

    this.isPreparingEmail = true;
    let issuesForEmail = this.displayIssues;
    try {
      issuesForEmail = await inlineIssuePhotoSources(this.displayIssues);
    } finally {
      this.isPreparingEmail = false;
    }

    const baseDoc = this.getDocumentConfig();
    const emailConfig: EmailConfig = {
      subject: `Inspection Issues - ${propertyCode}`,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.Inspection,
      emailType: EmailType.InspectionIssues,
      plainTextContent: this.buildIssuesReportText(),
      htmlContent: this.buildIssuesEmailHtml(issuesForEmail),
      fileDetails: {
        fileName: this.getReportFileName('pdf'),
        contentType: 'application/pdf',
        file: ''
      },
      errorMessage: 'Error sending email. Please try again.'
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: {
        ...baseDoc,
        previewIframeHtml: this.buildIssuesPreviewHtml(issuesForEmail)
      },
      returnUrl: this.router.url
    });
    this.router.navigateByUrl(this.getEmailCreateUrl());
  }

  protected getEmailCreateUrl(): string {
    return RouterUrl.MobileEmailCreate;
  }

  onTicketCreate(): void {
    if (this.isCreatingTicket) {
      return;
    }
    const officeId = this.data?.officeId ?? null;
    if (officeId == null) {
      this.toastr.error('Office is required to create a ticket.');
      return;
    }
    const organizationId = (this.data?.organizationId || this.authService.getUser()?.organizationId || '').trim();
    if (!organizationId) {
      this.toastr.error('Organization is required to create a ticket.');
      return;
    }

    const propertyCode = this.data?.propertyCode || 'N/A';
    const request: TicketRequest = {
      ticketId: null,
      organizationId,
      officeId,
      propertyId: this.data?.propertyId ?? null,
      reservationId: this.data?.reservationId ?? null,
      assigneeId: null,
      agentId: null,
      ticketCode: null,
      title: `Inspection Issues: ${propertyCode}`,
      description: this.buildIssuesDescriptionText(),
      stepsToReproduce: null,
      ticketStateTypeId: TicketStateType.caseCreated,
      needPermissionToEnter: false,
      permissionGranted: false,
      ownerContacted: false,
      confirmedWithTenant: false,
      followedUpWithOwner: false,
      workOrderCompleted: false,
      isForRentAll: false,
      notes: null,
      isActive: true
    };

    this.isCreatingTicket = true;
    this.ticketService.createTicket(request).subscribe({
      next: () => {
        this.toastr.success('Ticket created successfully');
        this.onTicketCreateSuccess();
      },
      error: () => {
        this.toastr.error('Unable to create ticket.');
        this.isCreatingTicket = false;
      },
      complete: () => {
        this.isCreatingTicket = false;
      }
    });
  }

  getDocumentConfig(): DocumentConfig {
    const reservationId = (this.data?.reservationId || '').trim();
    return {
      previewIframeHtml: this.buildIssuesPreviewHtml(),
      previewIframeStyles: this.buildIssuesPreviewStyles(),
      organizationId: this.data?.organizationId ?? null,
      selectedOfficeId: this.data?.officeId ?? null,
      selectedOfficeName: this.data?.officeName ?? '',
      selectedReservationId: reservationId.length > 0 ? reservationId : null,
      propertyId: this.data?.propertyId ?? null,
      contacts: [],
      isDownloading: this.isDownloading
    };
  }

  setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  getReportFileName(extension: 'pdf' | 'txt'): string {
    const propertyCodeSafe = String(this.data?.propertyCode || 'property').replace(/[^a-z0-9_-]/gi, '-');
    const dateSafe = String(this.data?.dateText || 'date').replace(/[^a-z0-9_-]/gi, '-');
    return `inspection-issues-${propertyCodeSafe}-${dateSafe}.${extension}`;
  }

  buildIssuesPreviewHtml(issues: ChecklistIssueEntryView[] = this.displayIssues): string {
    const propertyCode = this.data?.propertyCode || 'N/A';
    const dateText = this.data?.dateText || 'N/A';
    const groupedIssues = this.getGroupedIssues(issues);
    const issueRowsHtml = groupedIssues.length === 0
      ? '<p>No issues found.</p>'
      : groupedIssues.map(group => {
          const setPart = group.setLabel ? ` (${this.escapeHtml(group.setLabel)})` : '';
          const issuesHtml = group.issues.map((issue, issueIndex) => `
              <div class="issue-row">
                <div class="issue-line-head">
                  <span class="issue-line-index">${issueIndex + 1}.</span>
                  <span class="issue-line-text">${this.escapeHtml(issue.lineText)}</span>
                </div>
                <div class="issue-text">${this.escapeHtml(issue.issueText)}</div>
                ${issue.photoSrc ? `<img class="issue-thumb" src="${issue.photoSrc}" alt="Issue photo" />` : ''}
              </div>
            `).join('');
          return `
            <div class="issue-group">
              <div class="issue-title">${this.escapeHtml(group.sectionTitle)}${setPart}</div>
              ${issuesHtml}
            </div>
          `;
        }).join('');

    return `
      <html>
        <body>
          <h1>Inspection Issues</h1>
          <div class="meta"><strong>Property:</strong> ${this.escapeHtml(propertyCode)} &nbsp;&nbsp; <strong>Date:</strong> ${this.escapeHtml(dateText)}</div>
          ${issueRowsHtml}
        </body>
      </html>
    `;
  }

  buildIssuesPreviewStyles(): string {
    return `
      body { font-family: Arial, sans-serif; margin: 18px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      .meta { margin-bottom: 14px; color: #334155; }
      .issue-group { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 10px; background: #f8fafc; }
      .issue-row { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; margin-top: 8px; background: #fff; }
      .issue-title { font-weight: 700; margin-bottom: 4px; color: #0f172a; }
      .issue-line-head { display: flex; gap: 0.35rem; align-items: baseline; margin-top: 4px; color: #0f172a; font-weight: 600; }
      .issue-line-index { min-width: 1.2rem; text-align: right; }
      .issue-line-text { color: #0f172a; }
      .issue-text { color: #e91e63; font-weight: 600; margin-top: 4px; margin-left: 1.55rem; }
      .issue-thumb { max-width: 180px; max-height: 130px; border: 1px solid #cbd5e1; border-radius: 4px; object-fit: cover; margin-top: 4px; }
    `;
  }

  buildIssuesEmailHtml(issues: ChecklistIssueEntryView[] = this.displayIssues): string {
    const propertyCode = this.escapeHtml(this.data?.propertyCode || 'N/A');
    const dateText = this.escapeHtml(this.data?.dateText || 'N/A');
    const groupedIssues = this.getGroupedIssues(issues);
    const groupsHtml =
      groupedIssues.length === 0
        ? '<p class="ra-email-empty" style="margin:0;color:#475569;">No issues found.</p>'
        : groupedIssues
            .map(group => {
              const setLabelHtml = group.setLabel
                ? `<span class="ra-email-set" style="color:#475569;font-size:0.82rem;">${this.escapeHtml(group.setLabel)}</span>`
                : '';
              const issuesHtml = group.issues
                .map((issue, issueIndex) => {
                  const imgHtml = issue.photoSrc
                    ? `<div class="ra-email-photo-wrap" style="margin-top:4px;"><img class="ra-email-photo-thumb" src="${issue.photoSrc}" alt="" style="display:block;max-width:110px;max-height:80px;width:auto;height:auto;object-fit:cover;border:1px solid #cbd5e1;border-radius:4px;background:#fff;" /></div>`
                    : '';
                  return `<div class="ra-email-row" style="border:1px solid #e2e8f0;border-radius:6px;padding:9px 10px;background:#fff;margin-top:6px;box-sizing:border-box;">
              <div class="ra-email-issue-line-head" style="display:flex;gap:0.35rem;align-items:baseline;color:#0f172a;font-weight:600;font-size:0.9rem;line-height:1.35;">
                <span class="ra-email-issue-line-index" style="min-width:1.2rem;text-align:right;">${issueIndex + 1}.</span>
                <span class="ra-email-issue-line-text">${this.escapeHtml(issue.lineText)}</span>
              </div>
              <div class="ra-email-issue-text" style="color:#e91e63;font-weight:600;font-size:0.86rem;margin-top:4px;margin-left:1.55rem;line-height:1.35;">${this.escapeHtml(issue.issueText)}</div>
              ${imgHtml}
            </div>`;
                })
                .join('');
              return `<div class="ra-email-group" style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 11px;background:#f8fafc;box-sizing:border-box;">
          <div class="ra-email-group-meta" style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:6px;">
            <span class="ra-email-section" style="font-weight:700;color:#0f172a;font-size:0.9rem;">${this.escapeHtml(group.sectionTitle)}</span>
            ${setLabelHtml}
          </div>
          ${issuesHtml}
        </div>`;
            })
            .join('');

    return `
<div class="ra-email-issues" style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:100%;box-sizing:border-box;">
  <div class="ra-email-issues-header" style="display:flex;align-items:baseline;flex-wrap:wrap;gap:10px;width:100%;padding:12px 14px;background:#e2e8f0;border-radius:8px;box-sizing:border-box;">
    <span class="ra-email-header-icon" style="font-size:22px;line-height:1;color:#e11d48;" aria-hidden="true">&#9888;</span>
    <span style="display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;flex:1;min-width:0;font-size:1.25rem;font-weight:600;color:#0f172a;">
      <span>Inspection Issues:</span>
      <span>${propertyCode}</span>
    </span>
    <span class="ra-email-header-date" style="margin-left:auto;font-size:0.95rem;font-weight:500;color:#334155;text-align:right;white-space:nowrap;">${dateText}</span>
  </div>
  <div class="ra-email-issues-list" style="display:flex;flex-direction:column;gap:10px;margin-top:12px;box-sizing:border-box;">
    ${groupsHtml}
  </div>
</div>`.trim();
  }

  getGroupedIssues(issues: ChecklistIssueEntryView[] = this.displayIssues): ChecklistIssueGroup[] {
    const groupedMap = new Map<string, ChecklistIssueGroup>();
    const orderedGroups: ChecklistIssueGroup[] = [];

    issues.forEach(issue => {
      const sectionTitle = issue.sectionTitle || 'General';
      const setLabel = issue.setLabel || '';
      const key = `${sectionTitle}|||${setLabel}`;
      let group = groupedMap.get(key);
      if (!group) {
        group = {
          sectionTitle,
          setLabel: setLabel || undefined,
          issues: []
        };
        groupedMap.set(key, group);
        orderedGroups.push(group);
      }
      group.issues.push(issue);
    });

    return orderedGroups;
  }

  buildIssuesDescriptionText(): string {
    const groupedIssues = this.getGroupedIssues();
    if (groupedIssues.length === 0) {
      return 'No issues found.';
    }
    return groupedIssues.map(group => {
      const setPart = group.setLabel ? ` (${group.setLabel})` : '';
      const issueLines = group.issues.map((issue, issueIndex) => {
        const lineText = (issue.lineText || '').trim() || 'No line text provided';
        const issueText = (issue.issueText || '').trim() || 'No issue text provided';
        return `${issueIndex + 1}. ${lineText}\n   Issue: ${issueText}`;
      });
      return `${group.sectionTitle}${setPart}\n${issueLines.join('\n')}`;
    }).join('\n\n');
  }

  escapeHtml(value: string): string {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
