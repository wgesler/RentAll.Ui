import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, catchError, filter, finalize, firstValueFrom, forkJoin, of, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../../app.routes';
import { MaterialModule } from '../../../../material.module';
import { CommonService } from '../../../../services/common.service';
import { DocumentExportService } from '../../../../services/document-export.service';
import { DocumentHtmlService } from '../../../../services/document-html.service';
import { FormatterService } from '../../../../services/formatter-service';
import { UtilityService } from '../../../../services/utility.service';
import { ContactResponse } from '../../../contacts/models/contact.model';
import { ContactService } from '../../../contacts/services/contact.service';
import { DocumentType } from '../../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../../documents/models/document.model';
import { DocumentReloadService } from '../../../documents/services/document-reload.service';
import { EntityType } from '../../../contacts/models/contact-enum';
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
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../../shared/base-document.component';
import { OwnerStatementPrintContext } from '../../models/owner-statement-print-context.model';
import { OwnerStatementMonthLineListDisplay, OwnerStatementPropertyActivityLineResponse } from '../../models/owner-statement.model';
import { OwnerStatementHtmlBuilderService } from '../../services/owner-statement-html-builder.service';
import { OwnerStatementService } from '../../services/owner-statement.service';
import { DocumentService } from '../../../documents/services/document.service';
import { EmailService } from '../../../email/services/email.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-owner-statement-create',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './owner-statement-create.component.html',
  styleUrl: './owner-statement-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OwnerStatementCreateComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {

  @Input() line: OwnerStatementMonthLineListDisplay | null = null;
  @Input() shellMode = true;
  @Output() backEvent = new EventEmitter<void>();
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private utilityService = inject(UtilityService);
  private formatterService = inject(FormatterService);
  private htmlBuilder = inject(OwnerStatementHtmlBuilderService);
  private commonService = inject(CommonService);
  private contactService = inject(ContactService);
  private propertyService = inject(PropertyService);
  private propertyHtmlService = inject(PropertyHtmlService);
  private ownerStatementService = inject(OwnerStatementService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private sanitizer = inject(DomSanitizer);
  private documentReloadService = inject(DocumentReloadService);
  private emailHtmlService = inject(EmailHtmlService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  override toastr: ToastrService;
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  form: FormGroup;
  organizationId = '';
  organization: OrganizationResponse | null = null;
  offices: OfficeResponse[] = [];
  accountingOffices: AccountingOfficeResponse[] = [];
  contacts: ContactResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  ownerContact: ContactResponse | null = null;
  property: PropertyResponse | null = null;
  propertyHtml: PropertyHtmlResponse | null = null;
  statementActivityLines: OwnerStatementPropertyActivityLineResponse[] = [];
  statementAccrualActivityLines: OwnerStatementPropertyActivityLineResponse[] = [];
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isDownloading = false;
  isSubmitting = false;
  debuggingHtml = environment.local || environment.dev;
  emailHtml: EmailHtmlResponse | null = null;
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'previewHtml']));
  destroy$ = new Subject<void>();

  constructor() {
    super();
    this.form = this.buildForm();
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() || '';
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadContacts();
    this.loadOrganization();
    this.loadEmailHtml();
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1)).subscribe({
      next: html => {
        this.emailHtml = html;
        this.cdr.markForCheck();
      },
      error: () => {
        this.emailHtml = null;
      }
    });
  }

  async saveOwnerStatement(): Promise<void> {
    if (!this.previewIframeHtml || !this.line) {
      this.toastr.warning('No owner statement preview is available to save.', 'No Preview');
      return;
    }

    this.isSubmitting = true;
    this.cdr.markForCheck();
    try {
      const config = this.getDocumentConfig();
      if (!config.organizationId || !config.selectedOfficeId) {
        this.toastr.warning('Office or organization is not available.', 'Missing Data');
        return;
      }

      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        config.previewIframeHtml,
        config.previewIframeStyles
      );

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: config.organizationId,
        officeId: config.selectedOfficeId,
        officeName: config.selectedOfficeName || '',
        propertyId: config.propertyId || null,
        reservationId: null,
        documentTypeId: DocumentType.OwnerStatement,
        fileName: this.getOwnerStatementFileName(),
        generatePdf: true
      };

      await firstValueFrom(this.documentService.generate(generateDto).pipe(take(1)));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
      this.iframeKey++;
    } catch (error) {
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(
        detail ? `Document generation failed. ${detail}` : 'Document generation failed. Please try again.',
        'Error'
      );
      this.iframeKey++;
    } finally {
      this.isSubmitting = false;
      this.cdr.markForCheck();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['line']) {
      return;
    }

    if (!this.line) {
      this.statementActivityLines = [];
      this.statementAccrualActivityLines = [];
      this.clearPreview();
      return;
    }

    this.applyLineSelections();
    this.loadProperty(this.line.propertyId);
    this.loadPropertyActivityLines();
  }

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.applyLineSelections();
      });
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe(() => {
      this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(accountingOffices => {
        this.accountingOffices = accountingOffices || [];
        this.applyLineSelections();
      });
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: rows => {
        this.contacts = rows || [];
        this.applyLineSelections();
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadOrganization(): void {
    const cached = this.commonService.getOrganizationValue();
    if (cached) {
      this.organization = cached;
      return;
    }

    this.commonService.loadOrganization();
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1)).subscribe(org => {
      this.organization = org;
      this.cdr.markForCheck();
    });
  }

  loadProperty(propertyId: string): void {
    if (!propertyId) {
      this.property = null;
      this.propertyHtml = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.tryGeneratePreview();
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    forkJoin({
      property: this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)),
      propertyHtml: this.propertyHtmlService.getPropertyHtmlByPropertyId(propertyId).pipe(
        take(1),
        catchError(() => of(null))
      )
    }).pipe(finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'))).subscribe({
      next: ({ property, propertyHtml }) => {
        this.property = property;
        this.propertyHtml = propertyHtml;
        this.tryGeneratePreview();
      },
      error: () => {
        this.property = null;
        this.propertyHtml = null;
        this.tryGeneratePreview();
      }
    });
  }

  loadPropertyActivityLines(): void {
    if (!this.line?.propertyId || !this.line?.officeId) {
      this.statementActivityLines = [];
      this.statementAccrualActivityLines = [];
      this.tryGeneratePreview();
      return;
    }

    const periodStartDate = (this.line.periodStartDate || this.line.monthDate || '').trim();
    const periodEndDate = (this.line.periodEndDate || this.line.monthDate || periodStartDate).trim();
    const propertyId = this.line.propertyId;
    const searchRequest = {
      officeIds: [this.line.officeId],
      propertyId,
      startDate: periodStartDate || null,
      endDate: periodEndDate || null
    };

    forkJoin({
      cashLines: this.ownerStatementService.searchOwnerStatementPropertyActivityLines(searchRequest),
      accrualLines: this.ownerStatementService.searchOwnerStatementAccrualPropertyActivityLines(searchRequest)
    }).pipe(take(1)).subscribe({
      next: ({ cashLines, accrualLines }) => {
        this.statementActivityLines = cashLines || [];
        this.statementAccrualActivityLines = accrualLines || [];
        this.tryGeneratePreview();
      },
      error: () => {
        this.statementActivityLines = [];
        this.statementAccrualActivityLines = [];
        this.tryGeneratePreview();
      }
    });
  }
  //#endregion

  //#region Preview
  applyLineSelections(): void {
    if (!this.line) {
      return;
    }

    this.selectedOffice = this.offices.find(office => office.officeId === this.line!.officeId) || null;
    this.selectedAccountingOffice = this.accountingOffices.find(office => office.officeId === this.line!.officeId) || null;
    this.ownerContact = this.contacts.find(contact => contact.contactId === this.line!.ownerId) || null;

    this.form.patchValue({
      selectedOfficeId: this.line.officeId,
      ownerName: this.line.ownerName,
      propertyCode: this.line.propertyCode,
      statementMonth: this.getStatementMonthLabel()
    }, { emitEvent: false });

    this.tryGeneratePreview();
  }

  tryGeneratePreview(): void {
    if (!this.line || !this.selectedOffice) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      return;
    }

    this.loadOwnerStatementHtml();
  }

  loadOwnerStatementHtml(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'previewHtml');
    const finishPreviewLoad = () => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');

    if (this.debuggingHtml) {
      this.http.get(`assets/owner-statement.html?ts=${Date.now()}`, { responseType: 'text' }).pipe(take(1), finalize(finishPreviewLoad)).subscribe({
        next: html => {
          const ctx = this.buildPrintContext();
          const { previewIframeHtml, previewIframeStyles } = this.htmlBuilder.buildProcessedPreview(html || '', ctx);
          this.processAndSetHtml(previewIframeHtml, previewIframeStyles);
        },
        error: () => {
          this.clearPreview();
        }
      });
      return;
    }

    if (!this.property?.propertyId) {
      this.clearPreview();
      finishPreviewLoad();
      return;
    }

    const templateHtml = (this.propertyHtml?.ownerStatement || '').trim();
    if (templateHtml) {
      const ctx = this.buildPrintContext();
      const { previewIframeHtml, previewIframeStyles } = this.htmlBuilder.buildProcessedPreview(templateHtml, ctx);
      this.processAndSetHtml(previewIframeHtml, previewIframeStyles);
      finishPreviewLoad();
      return;
    }

    this.clearPreview();
    this.toastr.warning('No owner statement HTML template found for this property.', 'No Template');
    finishPreviewLoad();
  }

  buildPrintContext(): OwnerStatementPrintContext {
    return {
      line: this.line!,
      organization: this.organization,
      selectedOffice: this.selectedOffice,
      selectedAccountingOffice: this.selectedAccountingOffice,
      ownerContact: this.ownerContact,
      property: this.property,
      statementActivityLines: this.statementActivityLines,
      statementAccrualActivityLines: this.statementAccrualActivityLines
    };
  }

  processAndSetHtml(processedHtml: string, extractedStyles: string): void {
    this.previewIframeHtml = processedHtml;
    this.previewIframeStyles = extractedStyles;
    const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(processedHtml, extractedStyles);
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(htmlWithStyles);
    this.iframeKey++;
    this.cdr.markForCheck();
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

  clearPreview(): void {
    this.previewIframeHtml = '';
    this.previewIframeStyles = '';
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
    this.iframeKey++;
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Overrides
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organization?.organizationId || this.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId || this.line?.officeId || null,
      selectedOfficeName: this.selectedOffice?.name || this.line?.officeName || '',
      selectedReservationId: null,
      propertyId: this.line?.propertyId || null,
      contacts: this.contacts,
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onDownload(): Promise<void> {
    const config: DownloadConfig = {
      fileName: this.getOwnerStatementFileName(),
      documentType: DocumentType.OwnerStatement,
      noPreviewMessage: 'Please select an owner statement line first.',
      noSelectionMessage: 'Office or organization is missing.'
    };
    await super.onDownload(config);
  }

  override async onEmail(): Promise<void> {
    if (!this.line || !this.previewIframeHtml) {
      this.toastr.warning('Please select an owner statement line first.', 'No Statement');
      return;
    }

    const toEmail = this.getOwnerEmail();
    const toName = this.getOwnerName();
    if (!toEmail || !toName) {
      this.toastr.warning('Owner email information is missing.', 'No Email');
      return;
    }

    const salutationName = `${this.ownerContact?.firstName || ''}`.trim() || toName.trim().split(/\s+/)[0] || '';
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const accountingName = this.selectedAccountingOffice?.name || this.selectedOffice?.name || '';
    const accountingPhone = this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '';
    const propertyCode = (this.line.propertyCode || 'OwnerStatement').replace(/[^a-zA-Z0-9-]/g, '');
    const monthDisplay = this.getStatementMonthLabel();
    const subject = (this.emailHtml?.ownerStatementSubject || 'Owner Statement: {{propertyCode}}')
      .replace(/\{\{propertyCode\}\}/g, propertyCode)
      .replace(/\{\{statementMonth\}\}/g, monthDisplay);
    const body = (this.emailHtml?.ownerStatement || '<p>Please find your owner statement attached.</p>')
      .replace(/\{\{salutationName\}\}/g, salutationName)
      .replace(/\{\{toName\}\}/g, salutationName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{fromEmail\}\}/g, fromEmail)
      .replace(/\{\{companyName\}\}/g, this.organization?.name || '')
      .replace(/\{\{accountingName\}\}/g, accountingName)
      .replace(/\{\{accountingPhone\}\}/g, accountingPhone)
      .replace(/\{\{statementMonth\}\}/g, monthDisplay);

    const emailConfig: EmailConfig = {
      subject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.OwnerStatement,
      emailType: EmailType.Other,
      plainTextContent: '',
      htmlContent: body,
      fileDetails: {
        fileName: this.getOwnerStatementFileName(),
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

  override onPrint(): void {
    super.onPrint('Please select an owner statement line first.');
  }

  getOwnerStatementFileName(): string {
    if (!this.line) {
      return 'OwnerStatement.pdf';
    }
    return this.htmlBuilder.buildOwnerStatementFileName(this.line);
  }

  getOwnerEmail(): string {
    if (!this.ownerContact) {
      return '';
    }
    return (this.ownerContact.entityTypeId === EntityType.Company
      ? this.ownerContact.companyEmail
      : this.ownerContact.email) || '';
  }

  getOwnerName(): string {
    if (!this.ownerContact) {
      return (this.line?.ownerName || '').trim();
    }
    return (this.ownerContact.entityTypeId === EntityType.Company
      ? this.ownerContact.companyName
      : this.ownerContact.fullName || `${this.ownerContact.firstName || ''} ${this.ownerContact.lastName || ''}`.trim()) || (this.line?.ownerName || '').trim();
  }
  //#endregion

  //#region Utility
  getStatementMonthLabel(): string {
    if (!this.line) {
      return '';
    }
    return this.htmlBuilder.getStatementMonthLabel(this.line);
  }

  buildForm(): FormGroup {
    return this.fb.group({
      selectedOfficeId: new FormControl(null),
      ownerName: new FormControl(''),
      propertyCode: new FormControl(''),
      statementMonth: new FormControl(''),
      ownerStatement: new FormControl('')
    });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
