import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, map, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { MappingService } from '../../../services/mapping.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { UserService } from '../../users/services/user.service';
import { DocumentConfig, EmailConfig } from '../../shared/base-document.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet, ColumnData } from '../../shared/data-table/models/column-data';
import { MaintenanceListDisplay } from '../../shared/models/mixed-models';
import { ScheduleDateCell } from '../models/dashboard-model';
import { DashboardCompanyDataService, DashboardCompanyDataSnapshot, emptyDashboardCompanyDataSnapshot } from '../services/dashboard-company-data.service';
import { DashboardNavigationService } from '../services/dashboard-navigation.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-schedules',
  templateUrl: './dashboard-schedules.component.html',
  styleUrl: './dashboard-schedules.component.scss',
  imports: [MaterialModule, DataTableComponent, DataTableFilterActionsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardSchedulesComponent implements OnInit, OnDestroy {
  private companyDataService = inject(DashboardCompanyDataService);
  private utilityService = inject(UtilityService);
  private documentExportService = inject(DocumentExportService);
  private documentHtmlService = inject(DocumentHtmlService);
  private formatterService = inject(FormatterService);
  private documentService = inject(DocumentService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private emailHtmlService = inject(EmailHtmlService);
  private mappingService = inject(MappingService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private dashboardNavigation = inject(DashboardNavigationService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  snapshot: DashboardCompanyDataSnapshot = emptyDashboardCompanyDataSnapshot;
  selectedServiceProviderId = '';
  scheduleDisplayRows: MaintenanceListDisplay[] = [];
  isPreparingEmail = false;
  isDownloadingSchedule = false;
  emailHtml: EmailHtmlResponse | null = null;

  //#region Dashboard-Schedules
  ngOnInit(): void {
    this.dashboardNavigation.setTabIndex(7);
    this.loadEmailHtml();
    this.companyDataService.snapshot$.pipe(takeUntil(this.destroy$)).subscribe(snapshot => {
      this.snapshot = snapshot;
      this.rebuildScheduleDisplayRows();
      this.markViewForCheck();
    });
  }
  //#endregion

  //#region Form Response Methods
  get scheduleColumns(): ColumnSet {
    return this.snapshot.scheduleCleaningColumns || {};
  }

  getScheduleExportColumns(): ColumnSet {
    const columns = this.snapshot.scheduleCleaningColumns || {};
    if (!this.utilityService.normalizeId(this.selectedServiceProviderId)) {
      return columns;
    }
    const { cleanerName: _cleanerName, ...columnsWithoutProvider } = columns;
    return columnsWithoutProvider;
  }

  get serviceProviderSelectOptions(): { value: string; label: string }[] {
    return [
      { value: '', label: 'All Service Providers' },
      ...(this.snapshot.serviceProviderOptions || []).map(option => ({
        value: option.userId,
        label: option.label
      }))
    ];
  }

  rebuildScheduleDisplayRows(): void {
    const providerId = this.utilityService.normalizeId(this.selectedServiceProviderId);
    const rows = this.snapshot.scheduleCleaningRows || [];
    this.scheduleDisplayRows = !providerId
      ? rows
      : rows.filter(row => this.utilityService.normalizeId(row.cleanerUserId) === providerId);
  }

  onServiceProviderChange(userId: string): void {
    this.selectedServiceProviderId = userId;
    this.rebuildScheduleDisplayRows();
    this.markViewForCheck();
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1)).subscribe({
      next: response => {
        this.emailHtml = this.mappingService.mapEmailHtml(response);
        this.markViewForCheck();
      },
      error: () => {
        this.emailHtml = null;
      }
    });
  }

  downloadSchedule(): void {
    if (this.scheduleDisplayRows.length === 0) {
      this.toastr.warning('No schedule rows to download.', CommonMessage.Error);
      return;
    }

    const organizationId = (this.authService.getUser()?.organizationId || '').trim();
    const selectedOfficeId = this.resolveScheduleExportOfficeId();
    if (!organizationId || selectedOfficeId == null) {
      this.toastr.warning('Organization or office is not available.', CommonMessage.Error);
      return;
    }

    this.isDownloadingSchedule = true;
    this.markViewForCheck();

    const schedulePrintOptions = { landscape: true };
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      this.buildScheduleExportHtml(),
      this.buildScheduleExportStyles(),
      schedulePrintOptions
    );

    this.documentService.generateDownload({
      htmlContent: htmlWithStyles,
      organizationId,
      officeId: selectedOfficeId,
      officeName: this.resolveScheduleExportOfficeName(selectedOfficeId),
      propertyId: null,
      reservationId: null,
      documentTypeId: Number(DocumentType.Other),
      fileName: this.buildScheduleExportFileName('pdf'),
      landscape: true
    }).pipe(take(1), finalize(() => {
      this.isDownloadingSchedule = false;
      this.markViewForCheck();
    })).subscribe({
      next: (pdfBlob: Blob) => {
        this.documentExportService.downloadBlob(pdfBlob, this.buildScheduleExportFileName('pdf'));
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.error('Error generating schedule PDF. Please try again.', CommonMessage.Error);
        console.error('Schedule PDF generation error:', error);
      }
    });
  }

  emailSchedule(): void {
    if (this.scheduleDisplayRows.length === 0) {
      this.toastr.warning('No schedule rows to email.', CommonMessage.Error);
      return;
    }

    const providerId = this.utilityService.normalizeId(this.selectedServiceProviderId);
    if (!providerId) {
      this.toastr.warning('Select a service provider before emailing the schedule.', CommonMessage.Error);
      return;
    }

    const scheduleSubject = (this.emailHtml?.scheduleSubject || '').trim();
    const scheduleBody = (this.emailHtml?.schedules || '').trim();
    if (!scheduleSubject || !scheduleBody) {
      this.toastr.warning('Schedule email template is not available.', CommonMessage.Error);
      return;
    }

    const organizationId = (this.authService.getUser()?.organizationId || '').trim();
    const selectedOfficeId = this.resolveScheduleExportOfficeId();
    if (!organizationId || selectedOfficeId == null) {
      this.toastr.warning('Organization or office is not available.', CommonMessage.Error);
      return;
    }

    const currentUser = this.authService.getUser();
    const fromEmail = (currentUser?.email || '').trim();
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const fromPhone = this.formatterService.phoneNumber(currentUser?.phone || '') || '';
    if (!fromEmail || !fromName) {
      this.toastr.warning('Current user email sender information is not available.', CommonMessage.Error);
      return;
    }

    this.isPreparingEmail = true;
    this.markViewForCheck();

    this.resolveScheduleRecipient().pipe(take(1), finalize(() => {
      this.isPreparingEmail = false;
      this.markViewForCheck();
    })).subscribe({
      next: recipient => {
        if (!recipient.email) {
          this.toastr.warning('Service provider user email is not available.', CommonMessage.Error);
          return;
        }

        const providerLabel = this.getSelectedServiceProviderLabel();
        const subject = this.buildScheduleEmailSubject(providerLabel);
        const body = this.buildScheduleEmailBody(fromName, fromEmail, fromPhone, recipient.name || providerLabel);
        const previewHtml = this.buildScheduleExportHtml();
        const emailConfig: EmailConfig = {
          subject,
          toEmail: recipient.email,
          toName: recipient.name || providerLabel,
          fromEmail,
          fromName,
          documentType: DocumentType.Other,
          emailType: EmailType.Schedules,
          plainTextContent: '',
          htmlContent: body,
          fileDetails: {
            fileName: this.buildScheduleExportFileName('pdf'),
            contentType: 'application/pdf',
            file: ''
          },
          errorMessage: 'Error sending schedule email. Please try again.'
        };
        const documentConfig: DocumentConfig = {
          previewIframeHtml: previewHtml,
          previewIframeStyles: this.buildScheduleExportStyles(),
          printStyleOptions: { landscape: true },
          organizationId,
          selectedOfficeId,
          selectedOfficeName: this.resolveScheduleExportOfficeName(selectedOfficeId),
          isDownloading: false
        };

        this.emailCreateDraftService.setDraft({
          emailConfig,
          documentConfig,
          returnUrl: this.dashboardNavigation.getDashboardReturnUrl()
        });
        void this.router.navigateByUrl(RouterUrl.EmailCreate);
      },
      error: () => {
        this.toastr.error('Unable to load service provider user.', CommonMessage.Error);
      }
    });
  }

  buildScheduleExportHtml(): string {
    const columnEntries = Object.entries(this.getScheduleExportColumns());
    const headerHtml = columnEntries.map(([, column]) => this.buildScheduleExportHeaderHtml(column)).join('');
    const bodyHtml = this.scheduleDisplayRows.map(row => {
      const cellHtml = columnEntries.map(([columnKey, column]) =>
        `<td class="${this.getScheduleExportCellClass(column)}">${this.formatScheduleExportCellHtml(row, columnKey)}</td>`
      ).join('');
      return `<tr>${cellHtml}</tr>`;
    }).join('');
    const titleText = this.escapeHtml(this.buildScheduleTitleText(this.getSelectedServiceProviderLabel()));
    const dateLabel = this.escapeHtml(this.getScheduleExportDateLabel());
    const titleHtml = dateLabel
      ? `<div class="schedule-export__title"><span class="schedule-export__title-text">${titleText}</span><span class="schedule-export__title-date">${dateLabel}</span></div>`
      : `<span class="schedule-export__title-text schedule-export__title-text--solo">${titleText}</span>`;

    return `<div class="schedule-export">
      ${titleHtml}
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>`;
  }

  buildScheduleExportHeaderHtml(column: ColumnData): string {
    const alignClass = this.getScheduleExportAlignClass(column.headerAlignment || column.alignment);
    if (column.headerLine2) {
      return `<th class="schedule-export__header${alignClass}"><span class="schedule-export-header-two-line"><span class="schedule-export-header-two-line__top">${this.escapeHtml(column.displayAs || '')}</span><span class="schedule-export-header-two-line__bottom">${this.escapeHtml(column.headerLine2)}</span></span></th>`;
    }
    return `<th class="schedule-export__header${alignClass}">${this.escapeHtml(column.displayAs || '')}</th>`;
  }

  getScheduleExportAlignClass(alignment?: string): string {
    return alignment === 'center' ? ' schedule-export__header--center' : '';
  }

  getScheduleExportCellClass(column: ColumnData): string {
    const alignClass = column.alignment === 'center' ? ' schedule-export__cell--center' : '';
    return `schedule-export__cell${alignClass}`;
  }

  formatScheduleExportCellHtml(row: MaintenanceListDisplay, columnKey: string): string {
    const value = (row as unknown as Record<string, unknown>)[columnKey];
    if (columnKey === 'hasPets') {
      return value === true ? 'Yes' : '';
    }
    if (this.isScheduleDateCell(value)) {
      const text = (value.text || '').trim();
      if (!text) {
        return '';
      }
      const emphasisClass = value.emphasis === 'primary'
        ? 'schedule-date-cell schedule-date-cell--primary'
        : value.emphasis === 'muted'
          ? 'schedule-date-cell schedule-date-cell--muted'
          : 'schedule-date-cell';
      return `<span class="${emphasisClass}">${this.escapeHtml(text)}</span>`;
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return this.escapeHtml(String((value as { value: string }).value || '').trim());
    }
    return this.escapeHtml(String(value ?? '').trim());
  }

  isScheduleDateCell(value: unknown): value is ScheduleDateCell {
    return !!value && typeof value === 'object' && 'text' in value;
  }

  buildScheduleExportStyles(): string {
    return `
      .schedule-export { font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
      .schedule-export__title { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin: 0 0 16px; }
      .schedule-export__title-text,
      .schedule-export__title-date { font-size: 16pt !important; font-weight: 700; line-height: 1.2; font-family: Arial, Helvetica, sans-serif; }
      .schedule-export__title-text { margin: 0; flex: 1 1 auto; }
      .schedule-export__title-text--solo { display: block; margin: 0 0 16px; }
      .schedule-export__title-date { text-align: right; white-space: nowrap; flex: 0 0 auto; }
      .schedule-export table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: auto; }
      .schedule-export__header,
      .schedule-export__cell { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; word-wrap: break-word; }
      .schedule-export__header { background: #e2e8f0; font-weight: 700; }
      .schedule-export__header--center,
      .schedule-export__cell--center { text-align: center; }
      .schedule-export-header-two-line { display: block; line-height: 1.2; }
      .schedule-export-header-two-line__top,
      .schedule-export-header-two-line__bottom { display: block; font-weight: 700; }
      .schedule-export tr:nth-child(even) td { background: #f8fafc; }
      .schedule-date-cell--primary { font-weight: 700; }
      .schedule-date-cell--muted { color: #9e9e9e; font-weight: 400; }
    `;
  }

  escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  getScheduleExportDateLabel(): string {
    return this.formatterService.formatDateString(this.utilityService.todayAsCalendarDateString());
  }

  buildScheduleTitleText(providerLabel: string): string {
    const baseSubject = (this.emailHtml?.scheduleSubject || '').trim() || 'Cleaning Schedule';
    if (providerLabel === 'All Service Providers') {
      return baseSubject;
    }
    return `${baseSubject}: ${providerLabel}`;
  }

  buildScheduleEmailSubject(providerLabel: string): string {
    const titleText = this.buildScheduleTitleText(providerLabel);
    const dateLabel = this.getScheduleExportDateLabel();
    if (!dateLabel) {
      return titleText;
    }
    return `${titleText} - ${dateLabel}`;
  }

  buildScheduleEmailBody(fromName: string, fromEmail: string, fromPhone: string, recipientName: string): string {
    const template = (this.emailHtml?.schedules || '').trim();
    return template
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{fromEmail\}\}/g, fromEmail)
      .replace(/\{\{fromPhone\}\}/g, fromPhone)
      .replace(/\{\{toName\}\}/g, recipientName)
      .replace(/\{\{salutationName\}\}/g, recipientName.trim().split(/\s+/)[0] || recipientName);
  }

  getSelectedServiceProviderOption(): { value: string; label: string } | null {
    const selectedId = this.utilityService.normalizeId(this.selectedServiceProviderId);
    if (!selectedId) {
      return null;
    }
    return this.serviceProviderSelectOptions.find(option => option.value === selectedId) ?? null;
  }

  getSelectedServiceProviderLabel(): string {
    const selected = this.getSelectedServiceProviderOption();
    if (!selected) {
      return 'All Service Providers';
    }
    return selected.label || 'Selected Service Provider';
  }

  buildScheduleExportFileName(extension: 'pdf' = 'pdf'): string {
    const providerPart = this.getSelectedServiceProviderLabel()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'All-Providers';
    const dateStamp = this.utilityService.todayAsCalendarDateString() || 'export';
    return `Schedule-${providerPart}-${dateStamp}.${extension}`;
  }

  resolveScheduleExportOfficeId(): number | null {
    if (this.snapshot.selectedOfficeId != null) {
      return this.snapshot.selectedOfficeId;
    }
    const rowOfficeId = this.scheduleDisplayRows.find(row => row.officeId != null)?.officeId;
    if (rowOfficeId != null) {
      return rowOfficeId;
    }
    return this.snapshot.offices?.[0]?.officeId ?? null;
  }

  resolveScheduleExportOfficeName(officeId: number): string {
    return this.snapshot.offices.find(office => office.officeId === officeId)?.name
      || `Office ${officeId}`;
  }

  resolveScheduleRecipient() {
    const providerId = this.utilityService.normalizeId(this.selectedServiceProviderId);
    const providerLabel = this.getSelectedServiceProviderLabel();

    return this.userService.getUserByGuid(providerId).pipe(
      map(user => ({
        email: (user.email || '').trim(),
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || providerLabel
      }))
    );
  }
  //#endregion

  //#region Navigate From Calendar
  goToProperty(event: { propertyId: string }): void {
    this.dashboardNavigation.goToProperty(this.router, event?.propertyId);
  }

  goToReservation(event: { reservationId?: string | null; propertyId?: string | null }): void {
    this.dashboardNavigation.goToReservation(this.router, event?.reservationId, event?.propertyId);
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
