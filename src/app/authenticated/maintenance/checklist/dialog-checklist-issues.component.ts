import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailService } from '../../email/services/email.service';
import { BaseDocumentComponent, DocumentConfig, EmailConfig } from '../../shared/base-document.component';

export type ChecklistIssueEntry = {
  sectionTitle: string;
  setLabel?: string;
  issueText: string;
  photoSrc?: string | null;
};

type ChecklistIssueGroup = {
  sectionTitle: string;
  setLabel?: string;
  issues: ChecklistIssueEntry[];
};

export type ChecklistIssuesDialogData = {
  issues: ChecklistIssueEntry[];
  propertyCode?: string | null;
  dateText?: string | null;
  organizationId?: string | null;
  officeId?: number | null;
  officeName?: string | null;
  propertyId?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmail?: string | null;
  toName?: string | null;
};

@Component({
  standalone: true,
  selector: 'app-dialog-checklist-issues',
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="flex flex-row flex-wrap">
      <div class="flex flex-1 justify-between items-center bg-slate-200 rounded-t-lg p-3 w-full">
        <span class="text-2xl items-center flex gap-2 ml-1 w-full">
          <mat-icon color="accent">report_problem</mat-icon>
          <span class="issue-header-title-wrap">
            <span>
              Inspection Issues:
              <span class="issue-header-property">&nbsp;&nbsp;{{ data?.propertyCode || 'N/A' }}</span>
            </span>
            <span class="issue-header-date issue-header-subtext">{{ data?.dateText || 'N/A' }}</span>
          </span>
        </span>
      </div>

      <mat-dialog-content class="flex-shrink-0 w-full pt-4 issue-list-wrap">
        @if (!data?.issues?.length) {
          <p>No issues found.</p>
        } @else {
          <div class="issue-list">
            @for (group of getGroupedIssues(); track group.sectionTitle + '-' + (group.setLabel || '') + '-' + ($index || 0)) {
              <div class="issue-group">
                <div class="issue-meta">
                  <span class="issue-section">{{ group.sectionTitle }}</span>
                  @if (group.setLabel) {
                    <span class="issue-set">{{ group.setLabel }}</span>
                  }
                </div>
                @for (issue of group.issues; track issue.issueText + '-' + ($index || 0); let issueIndex = $index) {
                  <div class="issue-row">
                    <div class="issue-text">{{ issueIndex + 1 }}. Issue: {{ issue.issueText }}</div>
                    @if (issue.photoSrc) {
                      <div class="issue-photo-wrap">
                        <img class="issue-photo-thumb" [src]="issue.photoSrc" alt="Issue photo" />
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      </mat-dialog-content>

      <mat-divider class="flex-shrink-0 w-full" />
      <div class="issue-dialog-actions">
        <div class="form-titlebar-actions-wrap uniform-gap">
          <button mat-raised-button color="accent" type="button" class="text-nowrap flex-shrink-0" (click)="printIssues()">
            <mat-icon>print</mat-icon>
            Print
          </button>
          <button mat-raised-button color="accent" type="button" class="text-nowrap flex-shrink-0" (click)="emailIssues()">
            <mat-icon>email</mat-icon>
            Email
          </button>
          <button mat-raised-button color="accent" type="button" class="text-nowrap flex-shrink-0" (click)="downloadIssues()">
            <mat-icon>download</mat-icon>
            Download
          </button>
        </div>
        <button mat-raised-button color="primary" class="text-nowrap flex-shrink-0" mat-dialog-close>
          OK
        </button>
      </div>
    </div>
  `,
  styles: [`
    .issue-list-wrap {
      max-height: 65vh;
      overflow: auto;
    }
    .issue-header-title-wrap {
      display: flex;
      align-items: baseline;
      width: 100%;
      gap: 0.75rem;
    }
    .issue-header-subtext {
      font-size: 0.95rem;
      font-weight: 500;
    }
    .issue-header-property {
      font-size: inherit;
      font-weight: inherit;
    }
    .issue-header-date {
      margin-left: auto;
      text-align: right;
    }
    .issue-list {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .issue-row {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.55rem 0.7rem;
      background: #fff;
      margin-top: 0.4rem;
    }
    .issue-group {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.6rem 0.7rem;
      background: #f8fafc;
    }
    .issue-meta {
      display: flex;
      gap: 0.5rem;
      align-items: baseline;
      margin-bottom: 0.35rem;
    }
    .issue-section {
      font-weight: 700;
      color: #0f172a;
      font-size: 0.9rem;
    }
    .issue-set {
      color: #475569;
      font-size: 0.82rem;
    }
    .issue-text {
      color: #b91c1c;
      font-weight: 600;
      font-size: 0.86rem;
      margin-top: 0.2rem;
    }
    .issue-photo-wrap {
      margin-top: 0.2rem;
    }
    .issue-photo-thumb {
      max-width: 110px;
      max-height: 80px;
      object-fit: cover;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #fff;
    }
    .issue-dialog-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.75rem;
      width: 100%;
      box-sizing: border-box;
    }
  `]
})
export class DialogChecklistIssuesComponent extends BaseDocumentComponent {
  isDownloading = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ChecklistIssuesDialogData,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    documentExportService: DocumentExportService,
    emailService: EmailService,
    toastr: ToastrService,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService,
    private dialogRef: MatDialogRef<DialogChecklistIssuesComponent>
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
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
      const issueLines = group.issues.map((issue, issueIndex) =>
        `${issueIndex + 1}. Issue: ${issue.issueText}`
      );
      return `${group.sectionTitle}${setPart}\n${issueLines.join('\n')}`;
    });
    return `${header}${lines.join('\n\n')}`;
  }

  downloadIssues(): void {
    this.onDownload({
      fileName: this.getReportFileName('pdf'),
      documentType: DocumentType.Inspection,
      noPreviewMessage: 'No preview available to download.',
      noSelectionMessage: 'Organization or Office not available',
      errorMessage: 'Error generating PDF. Please try again.'
    });
  }

  emailIssues(): void {
    const fromEmail = (this.data?.fromEmail || '').trim();
    const fromName = (this.data?.fromName || '').trim();
    const toEmail = (this.data?.toEmail || fromEmail).trim();
    const toName = (this.data?.toName || fromName || 'Recipient').trim();
    const propertyCode = this.data?.propertyCode || 'N/A';
    const emailConfig: EmailConfig = {
      subject: `Inspection Issues - ${propertyCode}`,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.Inspection,
      emailType: EmailType.Other,
      plainTextContent: this.buildIssuesReportText(),
      htmlContent: this.buildIssuesEmailHtml(),
      fileDetails: {
        fileName: this.getReportFileName('pdf'),
        contentType: 'application/pdf',
        file: ''
      },
      errorMessage: 'Error sending email. Please try again.'
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    this.dialogRef.close();
    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }

  printIssues(): void {
    this.onPrint('No preview available to print.');
  }

  getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.buildIssuesPreviewHtml(),
      previewIframeStyles: this.buildIssuesPreviewStyles(),
      organizationId: this.data?.organizationId ?? null,
      selectedOfficeId: this.data?.officeId ?? null,
      selectedOfficeName: this.data?.officeName ?? '',
      selectedReservationId: null,
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

  buildIssuesPreviewHtml(): string {
    const propertyCode = this.data?.propertyCode || 'N/A';
    const dateText = this.data?.dateText || 'N/A';
    const groupedIssues = this.getGroupedIssues();
    const issueRowsHtml = groupedIssues.length === 0
      ? '<p>No issues found.</p>'
      : groupedIssues.map(group => {
          const setPart = group.setLabel ? ` (${this.escapeHtml(group.setLabel)})` : '';
          const issuesHtml = group.issues.map((issue, issueIndex) => `
              <div class="issue-row">
                <div class="issue-text">${issueIndex + 1}. Issue: ${this.escapeHtml(issue.issueText)}</div>
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
      .issue-text { color: #b91c1c; font-weight: 600; margin-top: 6px; }
      .issue-thumb { max-width: 180px; max-height: 130px; border: 1px solid #cbd5e1; border-radius: 4px; object-fit: cover; margin-top: 4px; }
    `;
  }

  buildIssuesEmailHtml(): string {
    const propertyCode = this.data?.propertyCode || 'N/A';
    const dateText = this.data?.dateText || 'N/A';
    const groupedIssues = this.getGroupedIssues();
    const groupsHtml = groupedIssues.length === 0
      ? '<p>No issues found.</p>'
      : groupedIssues.map(group => {
          const setPart = group.setLabel ? ` (${this.escapeHtml(group.setLabel)})` : '';
          const issuesHtml = group.issues.map((issue, issueIndex) => `
            <div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-top:8px;background:#fff;">
              <div style="color:#b91c1c;font-weight:600;">${issueIndex + 1}. Issue: ${this.escapeHtml(issue.issueText)}</div>
              ${issue.photoSrc ? `<img src="${issue.photoSrc}" alt="Issue photo" style="display:block;max-width:220px;max-height:160px;border:1px solid #cbd5e1;border-radius:4px;object-fit:cover;margin-top:6px;" />` : ''}
            </div>
          `).join('');
          return `
            <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px;background:#f8fafc;">
              <div style="font-weight:700;color:#0f172a;">${this.escapeHtml(group.sectionTitle)}${setPart}</div>
              ${issuesHtml}
            </div>
          `;
        }).join('');

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <h2 style="margin:0 0 8px;">Inspection Issues</h2>
        <div style="margin-bottom:12px;color:#334155;">
          <strong>Property:</strong> ${this.escapeHtml(propertyCode)} &nbsp;&nbsp; <strong>Date:</strong> ${this.escapeHtml(dateText)}
        </div>
        ${groupsHtml}
      </div>
    `;
  }

  getGroupedIssues(): ChecklistIssueGroup[] {
    const groupedMap = new Map<string, ChecklistIssueGroup>();
    const orderedGroups: ChecklistIssueGroup[] = [];
    const issues = this.data?.issues || [];

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

  escapeHtml(value: string): string {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
