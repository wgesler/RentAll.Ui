import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, firstValueFrom, forkJoin, of, take, takeUntil } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { RouterUrl } from '../../../../app.routes';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { MappingService } from '../../../../services/mapping.service';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { environment } from '../../../../../environments/environment';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { EntityType } from '../../../contacts/models/contact-enum';
import { ContactService } from '../../../contacts/services/contact.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { EmailType } from '../../../email/models/email.enum';
import { EmailHtmlResponse } from '../../../email/models/email-html.model';
import { EmailCreateDraftService } from '../../../email/services/email-create-draft.service';
import { EmailHtmlService } from '../../../email/services/email-html.service';
import { AccountingOfficeResponse } from '../../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../../organizations/models/office.model';
import { OrganizationResponse } from '../../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../../organizations/services/accounting-office.service';
import { OfficeService } from '../../../organizations/services/office.service';
import { PropertyResponse } from '../../../properties/models/property.model';
import { PropertyHtmlResponse } from '../../../properties/models/property-html.model';
import { PropertyService } from '../../../properties/services/property.service';
import { PropertyHtmlService } from '../../../properties/services/property-html.service';
import { ReservationResponse } from '../../../reservations/models/reservation-model';
import { ReservationService } from '../../../reservations/services/reservation.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../../shared/base-document.component';
import { SecurityDepositDetailResponse } from '../../models/security-deposit-report.model';
import { SecurityDepositService } from '../../services/security-deposit.service';
import { SecurityDepositReportHtmlBuilderService, SecurityDepositReportPrintContext } from '../../services/security-deposit-report-html-builder.service';

@Component({
  selector: 'app-security-deposit-report',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './security-deposit-report.component.html',
  styleUrl: './security-deposit-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecurityDepositReportComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() shellMode = true;
  @Input() reservationIdInput: string | null = null;
  @Input() officeIdInput: number | null = null;
  @Input() securityDepositReturnDateInput: string | null = null;
  @Output() backEvent = new EventEmitter<void>();

  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private securityDepositService = inject(SecurityDepositService);
  private reservationService = inject(ReservationService);
  private propertyService = inject(PropertyService);
  private propertyHtmlService = inject(PropertyHtmlService);
  private contactService = inject(ContactService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private commonService = inject(CommonService);
  private mappingService = inject(MappingService);
  private formatterService = inject(FormatterService);
  private utilityService = inject(UtilityService);
  private documentReloadService = inject(DocumentReloadService);
  private reportHtmlBuilder = inject(SecurityDepositReportHtmlBuilderService);
  private emailHtmlService = inject(EmailHtmlService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  reservationId: string | null = null;
  officeId: number | null = null;
  securityDepositReturnDate: string | null = null;
  detail: SecurityDepositDetailResponse | null = null;
  reservation: ReservationResponse | null = null;
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  contact: ContactResponse | null = null;
  contacts: ContactResponse[] = [];
  organization: OrganizationResponse | null = null;
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  accountingOfficeLogo = '';
  emailHtml: EmailHtmlResponse | null = null;
  previewHtmlBeforeIframe = '';
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isServiceError = false;
  isDownloading = false;
  isSubmitting = false;
  debuggingHtml = environment.local || environment.dev;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['detail', 'template', 'organization']));
  destroy$ = new Subject<void>();

  constructor() {
    super();
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    this.loadOrganization();
    this.loadContacts();
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadEmailHtml();
    this.loadReport();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservationIdInput'] || changes['officeIdInput'] || changes['securityDepositReturnDateInput']) {
      this.loadReport();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  buildForm(): FormGroup {
    return this.fb.group({
      reportHtml: new FormControl('')
    });
  }

  onBack(): void {
    this.backEvent.emit();
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: contacts => {
        this.contacts = contacts || [];
        this.syncPrimaryContact();
        this.renderPreview();
        this.cdr.markForCheck();
      },
      error: () => {
        this.contacts = [];
        this.cdr.markForCheck();
      }
    });
  }

  syncPrimaryContact(): void {
    const reservationContactId = String(this.reservation?.contactIds?.[0] || this.detail?.reservation.contactId || '').trim();
    this.contact = reservationContactId
      ? this.contacts.find(item => item.contactId === reservationContactId) || this.contact
      : this.contact;
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1)).subscribe({
      next: html => this.emailHtml = html,
      error: () => this.emailHtml = null
    });
  }

  getRecipientEmail(): string {
    if (!this.contact) {
      return '';
    }

    const email = this.contact.entityTypeId === EntityType.Company
      ? this.contact.companyEmail
      : this.contact.email;
    return String(email || '').trim();
  }

  getRecipientName(): string {
    if (!this.contact) {
      return '';
    }

    const name = this.contact.entityTypeId === EntityType.Company
      ? this.contact.companyName
      : this.contact.fullName;
    return String(name || '').trim();
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(take(1)).subscribe({
      next: organization => {
        this.organization = organization;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        this.renderPreview();
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        this.cdr.markForCheck();
      }
    });
  }

  loadReport(): void {
    const reservationId = String(this.reservationIdInput || '').trim();
    if (!reservationId) {
      return;
    }

    this.reservationId = reservationId;
    this.officeId = this.officeIdInput;
    this.securityDepositReturnDate = String(this.securityDepositReturnDateInput || '').trim() || null;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'detail');

    this.securityDepositService.getSecurityDepositDetail(reservationId).pipe(take(1)).subscribe({
      next: response => {
        this.detail = this.mappingService.mapSecurityDepositDetailResponse(response);
        this.loadSupportingData();
      },
      error: () => {
        this.isServiceError = true;
        this.detail = null;
        this.clearPreview();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'detail');
        this.cdr.markForCheck();
      }
    });
  }

  loadSupportingData(): void {
    const reservationId = String(this.reservationId || '').trim();
    if (!reservationId || !this.detail) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'detail');
      return;
    }

    const propertyId = String(this.detail.reservation.propertyId || '').trim();
    const property$ = propertyId
      ? this.propertyService.getPropertyByGuid(propertyId)
      : of(null as PropertyResponse | null);
    const propertyHtml$ = propertyId && !this.debuggingHtml
      ? this.propertyHtmlService.getPropertyHtmlByPropertyId(propertyId).pipe(
        take(1),
        catchError(() => of(null as PropertyHtmlResponse | null))
      )
      : of(null as PropertyHtmlResponse | null);

    forkJoin({
      reservation: this.reservationService.getReservationByGuid(reservationId),
      property: property$,
      propertyHtml: propertyHtml$
    }).pipe(take(1)).subscribe({
      next: ({ reservation, property, propertyHtml }) => {
        this.reservation = reservation;
        this.property = property;
        this.propertyHtml = propertyHtml;
        this.syncPrimaryContact();
        this.officeId = this.officeId ?? (Number(reservation?.officeId ?? this.detail?.reservation.officeId ?? 0) || null);
        this.selectedOffice = this.offices.find(office => Number(office.officeId) === Number(this.officeId)) || null;
        this.selectedAccountingOffice = this.accountingOffices.find(office => Number(office.officeId) === Number(this.officeId)) || null;
        this.updateAccountingOfficeLogo();

        const contactId = String(reservation?.contactIds?.[0] || this.detail?.reservation.contactId || '').trim();
        if (!contactId) {
          this.contact = null;
          this.loadSecurityDepositReportHtml();
          return;
        }

        this.contactService.getContactByGuid(contactId).pipe(take(1)).subscribe({
          next: contact => {
            this.contact = contact;
            this.loadSecurityDepositReportHtml();
          },
          error: () => {
            this.contact = null;
            this.loadSecurityDepositReportHtml();
          }
        });
      },
      error: () => {
        this.loadSecurityDepositReportHtml();
      }
    });
  }

  loadOffices(): void {
    this.officeService.getAllOffices().pipe(take(1)).subscribe({
      next: offices => {
        this.offices = offices || [];
        this.selectedOffice = this.offices.find(office => Number(office.officeId) === Number(this.officeId)) || null;
        if (this.detail) {
          this.renderPreview();
        }
        this.cdr.markForCheck();
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.accountingOfficeService.getAllAccountingOffices().pipe(take(1)).subscribe(accountingOffices => {
          this.accountingOffices = accountingOffices || [];
          this.selectedAccountingOffice = this.accountingOffices.find(office => Number(office.officeId) === Number(this.officeId)) || null;
          this.updateAccountingOfficeLogo();
          this.cdr.markForCheck();
        });
      }
    });
  }

  loadSecurityDepositReportHtml(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'template');

    if (this.debuggingHtml) {
      this.http.get(`assets/security-deposit-report.html?ts=${Date.now()}`, { responseType: 'text' }).pipe(
        take(1),
        finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'template'))
      ).subscribe({
        next: html => {
          const templateHtml = html || '';
          this.form.patchValue({ reportHtml: templateHtml }, { emitEvent: false });
          this.renderPreview();
        },
        error: () => {
          this.form.patchValue({ reportHtml: '' }, { emitEvent: false });
          this.clearPreview();
          this.cdr.markForCheck();
        }
      });
      return;
    }

    const templateHtml = (this.propertyHtml?.securityDepositReport || '').trim();
    if (templateHtml) {
      this.form.patchValue({ reportHtml: templateHtml }, { emitEvent: false });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'template');
      this.renderPreview();
      return;
    }

    this.form.patchValue({ reportHtml: '' }, { emitEvent: false });
    this.clearPreview();
    this.toastr.warning('No security deposit report HTML template found for this property.', 'No Template');
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'template');
    this.cdr.markForCheck();
  }

  renderPreview(): void {
    if (!this.detail) {
      return;
    }

    const templateHtml = String(this.form.get('reportHtml')?.value || '').trim();
    if (!templateHtml) {
      return;
    }

    this.processAndSetHtml(templateHtml);
  }

  processAndSetHtml(html: string): void {
    this.previewHtmlBeforeIframe = html;
    const { processedHtml, extractedStyles } = this.reportHtmlBuilder.buildProcessedPreview(html, this.buildPrintContext());
    this.previewIframeHtml = processedHtml;
    this.previewIframeStyles = extractedStyles;
    const bodyContent = this.documentHtmlService.extractBodyContent(processedHtml);
    const srcdoc = extractedStyles.trim()
      ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><style data-dynamic-styles="true">${extractedStyles}</style></head><body>${bodyContent}</body></html>`
      : processedHtml;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(srcdoc);
    this.iframeKey++;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'detail');
    this.cdr.markForCheck();
  }

  clearPreview(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  onPreviewIframeLoad(): void {
    this.injectStylesIntoIframe();
    this.resizePreviewIframeToContent();
    window.setTimeout(() => this.resizePreviewIframeToContent(), 150);
    window.setTimeout(() => this.resizePreviewIframeToContent(), 500);
  }

  resizePreviewIframeToContent(): void {
    const iframe = this.previewIframe?.nativeElement;
    if (!iframe) {
      return;
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      return;
    }

    const body = doc.body;
    const html = doc.documentElement;
    const contentHeight = Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      html?.clientHeight || 0,
      html?.scrollHeight || 0,
      html?.offsetHeight || 0
    );

    if (contentHeight > 0) {
      iframe.style.height = `${contentHeight + 12}px`;
    }
  }

  updateAccountingOfficeLogo(): void {
    if (this.selectedAccountingOffice?.fileDetails?.dataUrl) {
      this.accountingOfficeLogo = this.selectedAccountingOffice.fileDetails.dataUrl;
    } else if (this.selectedAccountingOffice?.fileDetails?.file && this.selectedAccountingOffice?.fileDetails?.contentType) {
      this.accountingOfficeLogo = `data:${this.selectedAccountingOffice.fileDetails.contentType};base64,${this.selectedAccountingOffice.fileDetails.file}`;
    } else {
      this.accountingOfficeLogo = '';
    }
  }

  buildPrintContext(): SecurityDepositReportPrintContext {
    return {
      detail: this.detail!,
      reservation: this.reservation,
      property: this.property,
      contact: this.contact,
      contacts: this.contacts,
      selectedOffice: this.selectedOffice,
      selectedAccountingOffice: this.selectedAccountingOffice,
      accountingOfficeLogo: this.accountingOfficeLogo,
      organization: this.organization,
      securityDepositReturnDate: this.securityDepositReturnDate
    };
  }

  async saveReport(): Promise<void> {
    if (!this.detail || !this.selectedOffice || !this.previewIframeHtml) {
      this.toastr.warning('Security deposit report is not ready to save.', 'Missing Selection');
      return;
    }

    this.isSubmitting = true;
    this.cdr.markForCheck();

    try {
      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        this.previewIframeHtml,
        this.previewIframeStyles
      );
      const reservationCode = this.detail.reservation.reservationCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.reservationId || 'Report';
      const fileName = this.buildReportFileName('pdf');

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: this.organization?.organizationId || this.authService.getUser()?.organizationId || '',
        officeId: this.selectedOffice.officeId,
        officeName: this.selectedOffice.name,
        propertyId: this.property?.propertyId || this.detail.reservation.propertyId || null,
        reservationId: this.reservationId,
        documentTypeId: DocumentType.SecurityDepositReport,
        fileName
      };

      await firstValueFrom(this.documentService.generate(generateDto));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
      this.iframeKey++;
    } catch (error) {
      console.error('Security deposit report save error:', error);
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  buildReportFileName(extension: 'pdf'): string {
    const reservationCode = this.detail?.reservation.reservationCode?.replace(/[^a-zA-Z0-9-]/g, '') || this.reservationId || 'Report';
    const dateStamp = this.utilityService.todayAsCalendarDateString();
    return `SecurityDeposit_${reservationCode}_${dateStamp}.${extension}`;
  }

  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organization?.organizationId || this.authService.getUser()?.organizationId?.trim() || null,
      selectedOfficeId: this.officeId ?? this.selectedOffice?.officeId ?? null,
      selectedOfficeName: this.selectedOffice?.name,
      selectedReservationId: this.reservationId,
      propertyId: this.property?.propertyId ?? this.detail?.reservation.propertyId ?? null,
      contacts: this.contact ? [this.contact] : [],
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
    this.cdr.markForCheck();
  }

  override async onEmail(): Promise<void> {
    if (!this.detail || !this.previewIframeHtml) {
      this.toastr.warning('Security deposit report is not ready to email.', 'No Report');
      return;
    }

    const toEmail = this.getRecipientEmail();
    const toName = this.getRecipientName();
    if (!toEmail || !toName) {
      this.toastr.warning('Recipient email information is missing.', 'No Email');
      return;
    }

    const salutationName = `${this.contact?.firstName || ''}`.trim() || toName.trim().split(/\s+/)[0] || '';
    const tenantName = `${this.reservation?.tenantName || this.detail.reservation.tenantName || ''}`.trim();
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const accountingName = this.selectedAccountingOffice?.name || this.selectedOffice?.name || '';
    const accountingPhone = this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '';
    const reservationCode = this.detail.reservation.reservationCode || 'SecurityDeposit';
    const emailTemplateHtml = this.contact?.entityTypeId === EntityType.Company
      ? (this.emailHtml?.corporateInvoice || this.emailHtml?.invoice || '')
      : (this.emailHtml?.invoice || '');
    const subject = (this.emailHtml?.invoiceSubject || 'Security Deposit Report: {{invoiceCode}}')
      .replace(/\{\{invoiceCode\}\}/g, reservationCode);
    const body = (emailTemplateHtml || '<p>Please find your security deposit report attached.</p>')
      .replace(/\{\{salutationName\}\}/g, salutationName)
      .replace(/\{\{tenantName\}\}/g, tenantName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{companyName\}\}/g, this.organization?.name || '')
      .replace(/\{\{accountingName\}\}/g, accountingName)
      .replace(/\{\{accountingPhone\}\}/g, accountingPhone)
      .replace(/\{\{invoiceCode\}\}/g, reservationCode);

    const emailConfig: EmailConfig = {
      subject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.SecurityDepositReport,
      emailType: EmailType.Other,
      plainTextContent: '',
      htmlContent: body,
      fileDetails: {
        fileName: this.buildReportFileName('pdf'),
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }

  override async onDownload(): Promise<void> {
    if (!this.detail) {
      this.toastr.warning('Security deposit report is not ready to download.', 'No Report');
      return;
    }

    const downloadConfig: DownloadConfig = {
      fileName: this.buildReportFileName('pdf'),
      documentType: DocumentType.SecurityDepositReport,
      noPreviewMessage: 'Security deposit report is not ready to download.',
      noSelectionMessage: 'Organization or office is not available.'
    };

    await super.onDownload(downloadConfig);
  }

  override onPrint(): void {
    super.onPrint('Security deposit report is not ready to print.');
  }

  get isPageReady(): boolean {
    return this.itemsToLoad$.value.size === 0;
  }
}
