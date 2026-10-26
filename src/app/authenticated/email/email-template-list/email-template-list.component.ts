import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject, combineLatest, finalize, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { FeatureResponse } from '../../organizations/models/organization-feature.model';
import { FeatureType } from '../../organizations/models/organization-enum';
import { OrganizationFeatureService } from '../../organizations/services/organization-feature.service';
import { UserGroups } from '../../users/models/user-enums';
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
const MANAGEMENT_EMAIL_KEYS = new Set(['welcome', 'corporateLetter', 'departure', 'schedules', 'missingReceipts']);
const LEASE_EMAIL_KEYS = new Set(['lease', 'corporateLease']);

@Component({
  standalone: true,
  selector: 'app-email-template-list',
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './email-template-list.component.html',
  styleUrl: './email-template-list.component.scss'
})
export class EmailTemplateListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() organizationId: string | null = null;
  @Input() organizationName = '';
  @Input() officeId: number | null = null;
  @Input() officeName = '';
  @Input() officeCount = 0;

  private emailHtmlService = inject(EmailHtmlService);
  private mappingService = inject(MappingService);
  private organizationFeatureService = inject(OrganizationFeatureService);
  private authService = inject(AuthService);
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
  private features: FeatureResponse[] = [];
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    combineLatest([
      this.emailHtmlService.getEmailHtml$(),
      this.organizationFeatureService.getAllFeatures()
    ]).pipe(takeUntil(this.destroy$)).subscribe(([emailHtml, features]) => {
      this.features = features || [];
      if (!emailHtml || !this.emailHtmlService.isLoadedFor(this.organizationId, this.templateOfficeId())) {
        return;
      }
      this.applyTemplate(emailHtml);
    });
  }

  ngOnChanges(): void {
    this.ensureTemplate();
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
      width: '980px',
      maxWidth: '95vw',
      data: {
        name: row.name,
        subject: row.subjectField ? String(this.template[row.subjectField] || '') : '',
        body: String(this.template[row.bodyField] || ''),
        hasSubject: !!row.subjectField
      }
    });
    dialogRef.afterClosed().pipe(take(1), takeUntil(this.destroy$)).subscribe((result: EmailTemplateDialogResult | undefined) => {
      if (!result) {
        return;
      }
      this.save(row, result);
    });
  }

  private ensureTemplate(): void {
    if (!this.organizationId) {
      this.rows = [];
      this.template = null;
      this.isPageReady = true;
      return;
    }
    if (this.officeId != null && this.officeId > 0 && this.officeCount === 0) {
      return;
    }
    this.emailHtmlService.ensureEmailHtmlLoaded(this.organizationId, this.templateOfficeId()).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: emailHtml => {
        if (!emailHtml) {
          this.rows = [];
          this.template = null;
          this.sourceLabel = '';
          this.isPageReady = true;
        }
      },
      error: () => {
        this.rows = [];
        this.template = null;
        this.sourceLabel = '';
        this.isPageReady = true;
        this.toastr.error('Email templates could not be loaded.');
      }
    });
  }

  private applyTemplate(emailHtml: EmailHtmlResponse): void {
    this.template = this.mappingService.mapEmailHtml(emailHtml);
    this.resolvedOrganizationId = this.template.organizationId || '';
    this.resolvedOfficeId = this.template.officeId ?? null;
    this.sourceLabel = this.resolveSourceLabel();
    this.rows = this.visibleTemplates(this.features).map(item => ({
      ...item,
      subject: item.subjectField ? String(this.template?.[item.subjectField] || '') : '',
      content: this.preview(String(this.template?.[item.bodyField] || ''))
    }));
    this.isPageReady = true;
  }

  private templateOfficeId(): number | null {
    return this.officeCount > 1 && this.officeId != null && this.officeId > 0 ? this.officeId : null;
  }

  private save(row: EmailTemplateRow, result: EmailTemplateDialogResult): void {
    if (!this.template || !this.organizationId) {
      return;
    }
    if (this.organizationId.toLowerCase() === SYSTEM_ORGANIZATION_ID) {
      this.toastr.error('Email templates cannot be saved on the system default.');
      return;
    }
    const saveForOffice = this.officeCount > 1 && this.officeId != null && this.officeId > 0;
    const payload: EmailHtmlResponse = {
      ...this.template,
      organizationId: this.organizationId,
      officeId: saveForOffice ? this.officeId : null
    };
    if (row.subjectField) {
      (payload[row.subjectField] as string) = result.subject;
    }
    (payload[row.bodyField] as string) = result.body;
    this.isSaving = true;
    this.emailHtmlService.saveEmailHtml(payload).pipe(take(1), finalize(() => { this.isSaving = false; }), takeUntil(this.destroy$)).subscribe({
      next: response => {
        const savedOfficeId = payload.officeId;
        this.toastr.success(savedOfficeId != null && this.officeName
          ? `Email Template Saved for ${this.organizationName}: ${this.officeName}`
          : `Email Template Saved for ${this.organizationName}`);
        this.emailHtmlService.remember(this.organizationId, saveForOffice ? this.officeId : null, response);
      },
      error: (err: HttpErrorResponse) => {
        const message = err?.error?.message || 'Email template could not be saved.';
        this.toastr.error(message);
      }
    });
  }

  private hasFeature(features: FeatureResponse[], featureTypeId: FeatureType): boolean {
    return (features || []).some(feature =>
      Number(feature.featureTypeId) === featureTypeId
      && this.organizationFeatureService.coerceHasAccess(feature.hasAccess));
  }

  private visibleTemplates(features: FeatureResponse[]): Array<Pick<EmailTemplateRow, 'key' | 'name' | 'subjectField' | 'bodyField'>> {
    const hasManagement = this.hasFeature(features, FeatureType.Management);
    const hasLease = this.hasFeature(features, FeatureType.Leasing);
    const isSuperAdmin = this.authService.hasRole(UserGroups.SuperAdmin);
    return EMAIL_TEMPLATES.filter(item => {
      if (MANAGEMENT_EMAIL_KEYS.has(item.key) && !hasManagement) {
        return false;
      }
      if (LEASE_EMAIL_KEYS.has(item.key) && !hasLease) {
        return false;
      }
      if (item.key === 'billing' && !isSuperAdmin) {
        return false;
      }
      return true;
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
