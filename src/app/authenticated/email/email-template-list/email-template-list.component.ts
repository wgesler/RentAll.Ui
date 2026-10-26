import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { EmailTemplateDialogComponent, EmailTemplateDialogResult } from '../email-template-dialog/email-template-dialog.component';
import { EmailHtmlResponse } from '../models/email-html.model';
import { EmailHtmlService } from '../services/email-html.service';

interface EmailTemplateRow {
  key: string;
  name: string;
  subjectField: keyof EmailHtmlResponse | null;
  bodyField: keyof EmailHtmlResponse;
  subject: string;
  content: string;
}

const EMAIL_TEMPLATES: Array<Pick<EmailTemplateRow, 'key' | 'name' | 'subjectField' | 'bodyField'>> = [
  { key: 'welcome', name: 'Welcome Letter', subjectField: 'letterSubject', bodyField: 'welcomeLetter' },
  { key: 'corporateLetter', name: 'Corporate Letter', subjectField: 'letterSubject', bodyField: 'corporateLetter' },
  { key: 'departure', name: 'Departure Letter', subjectField: 'departureSubject', bodyField: 'departureLetter' },
  { key: 'lease', name: 'Lease', subjectField: 'leaseSubject', bodyField: 'lease' },
  { key: 'corporateLease', name: 'Corporate Lease', subjectField: 'leaseSubject', bodyField: 'corporateLease' },
  { key: 'invoice', name: 'Invoice', subjectField: 'invoiceSubject', bodyField: 'invoice' },
  { key: 'corporateInvoice', name: 'Corporate Invoice', subjectField: 'invoiceSubject', bodyField: 'corporateInvoice' },
  { key: 'ownerStatement', name: 'Owner Statement', subjectField: 'ownerStatementSubject', bodyField: 'ownerStatement' },
  { key: 'schedules', name: 'Schedules', subjectField: 'scheduleSubject', bodyField: 'schedules' },
  { key: 'missingReceipts', name: 'Missing Receipts', subjectField: 'missingReceiptsSubject', bodyField: 'missingReceipts' },
  { key: 'billReport', name: 'Bill Report', subjectField: 'billReportSubject', bodyField: 'billReport' },
  { key: 'billing', name: 'Billing', subjectField: null, bodyField: 'billing' }
];

const SYSTEM_ORGANIZATION_ID = '99999999-9999-9999-9999-999999999999';

@Component({
  standalone: true,
  selector: 'app-email-template-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './email-template-list.component.html',
  styleUrl: './email-template-list.component.scss'
})
export class EmailTemplateListComponent implements OnChanges, OnDestroy {
  @Input() organizationId: string | null = null;
  @Input() officeId: number | null = null;

  private emailHtmlService = inject(EmailHtmlService);
  private mappingService = inject(MappingService);
  private dialog = inject(MatDialog);
  private toastr = inject(ToastrService);

  columns: ColumnSet = {
    name: { displayAs: 'Email', maxWidth: '28ch' },
    subject: { displayAs: 'Subject', maxWidth: '40ch' },
    content: { displayAs: 'Content', maxWidth: '70ch' }
  };

  rows: EmailTemplateRow[] = [];
  template: EmailHtmlResponse | null = null;
  resolvedOrganizationId = '';
  resolvedOfficeId: number | null = null;
  isPageReady = false;
  isSaving = false;
  sourceLabel = '';
  private destroy$ = new Subject<void>();

  ngOnChanges(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openTemplate(row: EmailTemplateRow): void {
    if (!this.template || !this.organizationId || this.isSaving) {
      return;
    }
    const dialogRef = this.dialog.open(EmailTemplateDialogComponent, {
      width: '760px',
      maxWidth: '95vw',
      data: {
        name: row.name,
        subject: row.subjectField ? String(this.template[row.subjectField] || '') : '',
        body: String(this.template[row.bodyField] || ''),
        hasSubject: !!row.subjectField,
        canSaveForOffice: this.officeId != null && this.officeId > 0
      }
    });
    dialogRef.afterClosed().pipe(take(1), takeUntil(this.destroy$)).subscribe((result: EmailTemplateDialogResult | undefined) => {
      if (!result) {
        return;
      }
      this.save(row, result);
    });
  }

  private load(): void {
    if (!this.organizationId) {
      this.rows = [];
      this.template = null;
      this.isPageReady = true;
      return;
    }
    this.isPageReady = false;
    this.emailHtmlService.getEmailHtml(this.officeId, this.organizationId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.template = this.mappingService.mapEmailHtml(response);
        this.resolvedOrganizationId = this.template.organizationId || '';
        this.resolvedOfficeId = this.template.officeId ?? null;
        this.sourceLabel = this.resolveSourceLabel();
        this.rows = EMAIL_TEMPLATES.map(item => ({
          ...item,
          subject: item.subjectField ? String(this.template?.[item.subjectField] || '') : '',
          content: this.preview(String(this.template?.[item.bodyField] || ''))
        }));
        this.isPageReady = true;
      },
      error: () => {
        this.template = null;
        this.rows = [];
        this.sourceLabel = '';
        this.isPageReady = true;
        this.toastr.error('Email templates could not be loaded.');
      }
    });
  }

  private save(row: EmailTemplateRow, result: EmailTemplateDialogResult): void {
    if (!this.template || !this.organizationId) {
      return;
    }
    const payload: EmailHtmlResponse = {
      ...this.template,
      organizationId: this.organizationId,
      officeId: result.scope === 'office' ? this.officeId : null
    };
    if (row.subjectField) {
      (payload[row.subjectField] as string) = result.subject;
    }
    (payload[row.bodyField] as string) = result.body;
    this.isSaving = true;
    this.emailHtmlService.saveEmailHtml(payload).pipe(take(1), finalize(() => { this.isSaving = false; }), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success(result.scope === 'office' ? 'Saved for this office.' : 'Saved for the organization.');
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        const message = err?.error?.message || 'Email template could not be saved.';
        this.toastr.error(message);
      }
    });
  }

  private resolveSourceLabel(): string {
    const resolvedOrg = (this.resolvedOrganizationId || '').toLowerCase();
    const requestedOrg = (this.organizationId || '').toLowerCase();
    if (resolvedOrg === SYSTEM_ORGANIZATION_ID && resolvedOrg !== requestedOrg) {
      return 'Showing the system default';
    }
    if (this.resolvedOfficeId != null) {
      return 'Showing this office';
    }
    return 'Showing the organization template';
  }

  private preview(html: string): string {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 90 ? `${text.slice(0, 90)}…` : text;
  }
}
