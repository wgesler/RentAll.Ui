import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, filter, finalize, Observable, Subject, of, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { LeadsService } from '../../leads/services/leads.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailService } from '../../email/services/email.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { PropertyAgreementResponse } from '../../properties/models/property-agreement.model';
import { PropertyAgreementService } from '../../properties/services/property-agreement.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { CommonService } from '../../../services/common.service';
import { OwnerAgreementInformationResponse, replaceOwnerAgreementInformationSections } from '../models/owner-agreement-information.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { LeadOwnerResponse } from '../../leads/models/lead-owner.model';
import { DynamicFormDraftService } from '../services/dynamic-form-draft.service';
import { OwnerFormPlaceholderService } from '../services/owner-form-placeholder.service';

@Component({
  standalone: true,
  selector: 'app-owner-agreement-form',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './owner-agreement-form.component.html',
  styleUrl: './owner-agreement-form.component.scss'
})
export class OwnerAgreementFormComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() includeLabel = 'Owner Agreement';
  @Input() templateAssetPath = 'assets/owner-agreement.html';
  @Input() templateHtml: string | null = null;
  @Input() documentDisplayName = 'Owner Agreement';
  @Input() documentFileSuffix = 'OwnerAgreement';

  form: FormGroup = this.buildForm();
  isPageReady = false;
  isSaving = false;
  isDownloading = false;
  iframeKey = 0;
  previewIframeHtml = '';
  previewIframeStyles = '';
  editableHtml: SafeHtml | null = null;
  editorStyles = '';
  baseTemplateHtml = '';
  isEditMode = true;
  safeHtml: SafeHtml | null = null;
  liveExportHtml = '';
  liveExportStyles = '';
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('editIframe') editIframe?: ElementRef<HTMLIFrameElement>;
  organizationId = '';
  organization: OrganizationResponse | null;
  selectedOffice: OfficeResponse | null = null;
  accountingOffices: AccountingOfficeResponse[] = [];
  selectedProperty: PropertyResponse | null = null;
  propertyAgreement: PropertyAgreementResponse| null;
  ownerContact: ContactResponse | null = null;
  leadOwner: LeadOwnerResponse | null = null;
  agreementInformation: OwnerAgreementInformationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organization', 'offices', 'contacts', 'leadOwner', 'property', 'propertyAgreement', 'agreementInfo', 'accountingOffices', 'preview']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private commonService: CommonService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private propertyAgreementService: PropertyAgreementService,
    private leadsService: LeadsService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    documentHtmlService: DocumentHtmlService,
    private sanitizer: DomSanitizer,
    documentService: DocumentService,
    documentExportService: DocumentExportService,
    public override toastr: ToastrService,
    emailService: EmailService,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService,
    private dynamicFormDraftService: DynamicFormDraftService,
    private ownerFormPlaceholderService: OwnerFormPlaceholderService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
  }

  //#region Owner-Agreement-Form
  ngOnInit(): void {
    this.organizationId = String(this.authService.getUser()?.organizationId || '').trim();
 
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.commonService.loadStates();
    this.loadOrganization();
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadContacts();
    this.loadLeadOwner(this.ownerLeadId);
    this.loadPropertyContext();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const propertyIdChanged = changes['propertyId'] && (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const officeIdChanged = changes['officeId'] && (changes['officeId'].previousValue !== changes['officeId'].currentValue);
    const templateHtmlChanged = changes['templateHtml'] && (changes['templateHtml'].previousValue !== changes['templateHtml'].currentValue);
    if (officeIdChanged) {
      this.syncSelectedOfficeFromLoadedOffices();
    }
    if (propertyIdChanged || officeIdChanged) {
      this.itemsToLoad$.next(new Set(['property', 'propertyAgreement', 'agreementInfo', 'preview']));
      this.loadPropertyContext();
      return;
    }
    if (templateHtmlChanged) {
      this.generatePreview();
    }
  }

  onIncludeChange(): void {
    this.generatePreview();
  }

  saveDraft(): void {
    const htmlSnapshot = this.captureLiveHtmlSnapshot();
    if (!htmlSnapshot) {
      this.toastr.warning('There is no form content to save.');
      return;
    }
    this.dynamicFormDraftService.saveDraft(this.getDraftStorageKey(), htmlSnapshot);
    this.toastr.success('Draft saved.');
  }

  resetForm(): void {
    this.dynamicFormDraftService.resetDraft(this.getDraftStorageKey());
    this.setEditorHtml(this.baseTemplateHtml || '');
    this.toastr.success('Form reset.');
  }

  viewForm(): void {
    const htmlSnapshot = this.captureLiveHtmlSnapshot();
    if (!htmlSnapshot) {
      this.toastr.warning('There is no form content to view.');
      return;
    }
    this.dynamicFormDraftService.saveDraft(this.getDraftStorageKey(), htmlSnapshot);
    this.isEditMode = false;
    this.processAndSetHtml(htmlSnapshot);
  }

  editForm(): void {
    if (!this.isEditMode) {
      this.captureLiveSnapshotForExport();
      const htmlForEdit = this.liveExportHtml || this.previewIframeHtml || this.baseTemplateHtml;
      this.setEditorHtml(htmlForEdit);
      this.isEditMode = true;
    }
  }

  onEditIframeLoad(): void {
    this.ensureEditorControlsInteractive();
  }

  override onPrint(): void {
    this.captureLiveSnapshotForExport();
    const htmlForPrint = this.liveExportHtml || this.previewIframeHtml;
    const stylesForPrint = this.liveExportStyles || this.previewIframeStyles;
    if (!htmlForPrint) {
      this.toastr.warning(`${this.documentDisplayName} preview is not ready to print.`);
      return;
    }
    const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(
      htmlForPrint,
      stylesForPrint,
      { fontSize: '9pt', includeLeaseStyles: true }
    );
    this.documentExportService.printHTML(htmlWithStyles);
  }

  override async onDownload(): Promise<void> {
    this.captureLiveSnapshotForExport();
    const downloadConfig: DownloadConfig = {
      fileName: this.getDocumentFileName(this.documentFileSuffix),
      documentType: DocumentType.OwnerAgreement,
      noPreviewMessage: `${this.documentDisplayName} preview is not ready to download.`,
      noSelectionMessage: 'Organization or Office not available.'
    };
    await super.onDownload(downloadConfig);
  }

  onSave(): void {
    this.captureLiveSnapshotForExport();
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning(`${this.documentDisplayName} preview is not ready to save.`);
      return;
    }
    this.isSaving = true;
    const dto = this.buildGenerateDto();
    this.documentService.generate(dto).pipe(take(1)).subscribe({
      next: () => {
        this.isSaving = false;
        this.toastr.success(`${this.documentDisplayName} saved successfully`, CommonMessage.Success);
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error(`Unable to save ${this.documentDisplayName.toLowerCase()}.`, CommonMessage.Error);
      }
    });
  }

  override async onEmail(): Promise<void> {
    this.captureLiveSnapshotForExport();
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const toEmail = this.ownerContact?.email || '';
    const toName = this.ownerContact?.fullName || `${this.ownerContact?.firstName || ''} ${this.ownerContact?.lastName || ''}`.trim();
    const propertyCode = this.selectedProperty?.propertyCode || '';
    const subject = propertyCode
      ? `${this.documentDisplayName} - ${propertyCode}`
      : this.documentDisplayName;

    const emailConfig: EmailConfig = {
      subject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.OwnerAgreement,
      emailType: EmailType.Other,
      plainTextContent: 'Please find the attached owner agreement.',
      htmlContent: '<p>Please find the attached owner agreement.</p>',
      fileDetails: {
        fileName: this.getDocumentFileName(this.documentFileSuffix),
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    await this.router.navigateByUrl(RouterUrl.EmailCreate);
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      includeDocument: new FormControl(true)
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadPropertyContext(): void {
    this.loadProperty();
    this.loadPropertyAgreement();
    this.loadAgreementInformation();
  }

  loadLeadOwner(leadOwnerId: number | null): void {
    const parsedLeadOwnerId = Number(leadOwnerId);
    if (!Number.isFinite(parsedLeadOwnerId) || parsedLeadOwnerId <= 0) {
      this.leadOwner = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leadOwner');
      return;
    }

    this.leadsService.getOwnerLeadById(parsedLeadOwnerId).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leadOwner');
      this.generatePreviewIfReady();
    })).subscribe({
      next: response => {
        this.leadOwner = response;
      },
      error: () => {
        this.leadOwner = null;
      }
    });
  }

  loadOrganization(): void {
    this.commonService.loadOrganization();
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), takeUntil(this.destroy$)).subscribe({
      next: (response: OrganizationResponse) => {
        this.organization = response;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.selectedOffice = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: offices => {
        this.syncSelectedOfficeFromLoadedOffices(offices || []);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.selectedOffice = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      }
    });
  }

  syncSelectedOfficeFromLoadedOffices(offices?: OfficeResponse[]): void {
    const officeList = offices || this.officeService.getAllOfficesValue() || [];
    const requestedOfficeId = Number(this.officeId);
    if (Number.isFinite(requestedOfficeId) && requestedOfficeId > 0) {
      this.selectedOffice = officeList.find(office => office.officeId === requestedOfficeId) || null;
      if (this.selectedOffice) {
        return;
      }
    }

    const defaultOfficeId = Number(this.authService.getUser()?.defaultOfficeId);
    if (Number.isFinite(defaultOfficeId) && defaultOfficeId > 0) {
      this.selectedOffice = officeList.find(office => office.officeId === defaultOfficeId) || null;
      if (this.selectedOffice) {
        return;
      }
    }

    this.selectedOffice = officeList.length === 1 ? officeList[0] : null;
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: contacts => {
        const ownerLeadId = Number(this.ownerLeadId);
        this.ownerContact = (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === ownerLeadId
        ) || null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.ownerContact = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
      }
    });
  }

  loadProperty(): void {
    if (!this.propertyId || this.propertyId === 'new') {
      this.selectedProperty = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: property => {
        this.selectedProperty = property;
        // Property agreement depends on selectedProperty; reload once property resolves.
        this.utilityService.addLoadItem(this.itemsToLoad$, 'propertyAgreement');
        this.loadPropertyAgreement();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.selectedProperty = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }

  loadPropertyAgreement(): void {
    if (!this.selectedProperty) {
      this.propertyAgreement = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      return;
    }

    this.propertyAgreementService.getPropertyAgreement(this.selectedProperty.propertyId).pipe(takeUntil(this.destroy$), take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      this.generatePreviewIfReady();
    })).subscribe({
      next: agreement => {
        this.propertyAgreement = agreement;
      },
      error: () => {
        this.propertyAgreement = null;
      }
    });
  }

  loadAgreementInformation(): void {
    const scopedPropertyId = this.propertyId && this.propertyId !== 'new' ? this.propertyId : null;
    this.leadsService.getOwnerAgreementInformationByScope(this.officeId, scopedPropertyId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.agreementInformation = response || null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.agreementInformation = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.generatePreviewIfReady();
      }
    });
  }

  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      this.generatePreviewIfReady();
    })).subscribe({
      next: accountingOffices => {
        this.accountingOffices = accountingOffices || [];
      },
      error: () => {
        this.accountingOffices = [];
      }
    });
  }
  //#endregion

  //#region Preview Methods
  generatePreviewIfReady(): void {
    const items = this.itemsToLoad$.value;
    const remaining = new Set([...items].filter(item => item !== 'preview'));
    if (remaining.size > 0) {
      return;
    }
    this.generatePreview();
  }

  generatePreview(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'preview');
    const includeDocument = !!this.form.get('includeDocument')?.value;
    this.loadAgreementTemplate(includeDocument, this.templateAssetPath, this.templateHtml).pipe(takeUntil(this.destroy$)).subscribe({
      next: ownerAgreementHtml => {
        const combinedHtml = this.replaceAgreementPlaceholders(ownerAgreementHtml);
        this.baseTemplateHtml = combinedHtml;
        const draftHtml = this.dynamicFormDraftService.loadDraft(this.getDraftStorageKey());
        const htmlToRender = draftHtml || this.baseTemplateHtml;
        this.setEditorHtml(htmlToRender);
        if (!this.isEditMode) {
          this.processAndSetHtml(htmlToRender);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
      },
      error: () => {
        this.baseTemplateHtml = '';
        this.editableHtml = null;
        this.previewIframeHtml = '';
        this.safeHtml = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
      }
    });
  }

  replaceAgreementPlaceholders(html: string): string { 
    const today = this.formatterService.formatDateStringLong(this.utilityService.todayAsCalendarDateString()) || '';
    const signerName = `${this.authService.getUser()?.firstName || ''} ${this.authService.getUser()?.lastName || ''}`.trim();
    const officeLogo = this.selectedOffice?.fileDetails?.dataUrl || this.organization?.fileDetails?.dataUrl || '';
    const companyName = this.getCompanyName();
    const ownerState = this.getOwnerState();
    const monthlyRent = this.getMonthlyRent();
    const ownerAddressSingleLine = this.composeAddress(this.ownerContact);
    const propertyAddressSingleLine = this.composeAddress(this.selectedProperty);
    const companyAddressSingleLine = this.getCompanyAddress();
    const accountingOfficeAddressSingleLine = this.getAccountingOfficeAddress();
    const ownerAddressLines = this.getOwnerAddressLines();
    const propertyAddressLines = this.getPropertyAddressLines();
    const accountingOfficeAddressLines = this.getAccountingOfficeAddressLines();

    const ownerFullName = this.ownerContact?.fullName || `${this.ownerContact?.firstName || ''} ${this.ownerContact?.lastName || ''}`.trim();
    const tokenValues: Record<string, string> = {
      ownerAgreementTitle: this.documentDisplayName,
      companyName,
      companyNameInCaps: companyName.toUpperCase(),
      companyCityInCaps: this.getCompanyCity().toUpperCase(),
      officeName: this.getOfficeName(),
      companyState: this.getCompanyState(),
      companyCity: this.getCompanyCity(),
      companyAddress: this.getCompanyAddress(),
      companyAddressSingleLine,
      companyAddress1: this.getCompanyAddress1(),
      companyAddress2: this.getCompanyAddress2(),
      'organization-office': this.getOrganizationOfficeDisplay(),
      propertyCode: this.selectedProperty?.propertyCode || '',
      organizationState: this.organization?.state || '',
      accountingOfficeAddress: this.getAccountingOfficeAddress(),
      accountingOfficeAddressSingleLine,
      accountingOfficeAddressTop: this.getTopAddressDisplay('Office:', accountingOfficeAddressLines.address1, accountingOfficeAddressLines.address2),
      ownerFullName,
      ownerName: ownerFullName,
      ownerFullNameUnderlined: this.getUnderlinedFillValue(ownerFullName),
      ownerState,
      ownerAddressSingleLine,
      ownerAddressSingleLineUnderlined: this.getUnderlinedFillValue(ownerAddressSingleLine),
      ownerAddress: this.getTopAddressDisplay('Owner Address:', ownerAddressLines.address1, ownerAddressLines.address2),
      propertyAddressSingleLine,
      propertyAddress: this.getTopAddressDisplay('Property Address:', propertyAddressLines.address1, propertyAddressLines.address2),
      agreementStartDate: today,
      agreementStartDateUnderlined: this.getUnderlinedFillValue(today),
      ownerSignatureDate: today,
      agentSignatureDate: today,
      agentSignerName: signerName,
      officePhone: this.getOfficePhoneText(),
      officeFax: this.getOfficeFaxText(),
      organizationWebsite: this.getOrganizationWebsite(),
      ownerSplit: this.getOwnerSplit() || '',
      companySplit: this.getCompanySplit() || '',
      workingBalance: this.getWorkingBalance() || '',
      markup: this.getCompanyMarkup() || '',
      onlineClean: this.getOnlineCleanFee() || '',
      onlineFee: this.getOnlineFee() || '',
      offlineFee: this.getOfflineFee() || '',
      monthlyRent: this.getUnderlinedFillValue(monthlyRent),
      officeLogoBase64: officeLogo
    };

    let content = this.ownerFormPlaceholderService.replaceTokens(
      replaceOwnerAgreementInformationSections(html, this.agreementInformation),
      tokenValues,
      { clearUnresolved: false }
    );

    if (companyName) {
      content = content.replace(/\bAvenue\s*West\b/gi, matched =>
        matched === matched.toUpperCase() ? companyName.toUpperCase() : companyName
      );
    }

    return this.ownerFormPlaceholderService.replaceTokens(content, {}, { clearUnresolved: true });
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.refreshPreviewSafeHtml();
    this.iframeKey++;
  }

  setEditorHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html || '', true);
    this.editorStyles = result.extractedStyles || '';
    const editableHtmlDocument = this.documentHtmlService.buildHtmlDocument(
      this.documentHtmlService.extractBodyContent(result.processedHtml || ''),
      '',
      this.editorStyles || ''
    );
    this.editableHtml = this.sanitizer.bypassSecurityTrustHtml(editableHtmlDocument);
    setTimeout(() => this.ensureEditorControlsInteractive());
  }

  ensureEditorControlsInteractive(): void {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return;
    }
    editHost.setAttribute('contenteditable', 'true');
    const controls = Array.from(editHost.querySelectorAll('input, textarea, select, option, button, label'));
    controls.forEach(control => {
      control.setAttribute('contenteditable', 'false');
    });
    const formControls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    formControls.forEach(control => {
      if (control.hasAttribute('disabled')) {
        control.removeAttribute('disabled');
      }
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.readOnly = false;
        if (control.hasAttribute('readonly')) {
          control.removeAttribute('readonly');
        }
      }
    });
  }
  //#endregion

  //#region Form Response Methods
  captureLiveSnapshotForExport(): void {
    const doc = this.getPreviewDocument();
    if (!doc) {
      this.liveExportHtml = '';
      this.liveExportStyles = '';
      return;
    }

    const liveHtml = this.buildLiveHtmlSnapshot(doc);
    if (!liveHtml.trim()) {
      this.liveExportHtml = '';
      this.liveExportStyles = '';
      return;
    }

    this.liveExportHtml = liveHtml;
    this.liveExportStyles = this.collectDocumentStyles(doc) || this.previewIframeStyles;
    this.previewIframeHtml = this.liveExportHtml;
    this.previewIframeStyles = this.liveExportStyles;
  }

  captureLiveHtmlSnapshot(): string {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return '';
    }
    const controls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    controls.forEach((control, index) => {
      control.setAttribute('data-agreement-control-id', String(index));
    });

    const clonedRoot = editHost.cloneNode(true) as HTMLElement;
    controls.forEach(sourceControl => {
      const controlId = sourceControl.getAttribute('data-agreement-control-id');
      if (!controlId) {
        return;
      }
      const clonedControl = clonedRoot.querySelector(`[data-agreement-control-id="${controlId}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (!clonedControl) {
        return;
      }

      const sourceTag = sourceControl.tagName.toLowerCase();
      const clonedTag = clonedControl.tagName.toLowerCase();
      if (sourceTag === 'input' && clonedTag === 'input') {
        const sourceInput = sourceControl as HTMLInputElement;
        const cloneInput = clonedControl as HTMLInputElement;
        const inputType = String(sourceInput.type || '').toLowerCase();
        if (inputType === 'checkbox' || inputType === 'radio') {
          cloneInput.checked = sourceInput.checked;
          cloneInput.defaultChecked = sourceInput.checked;
          if (sourceInput.checked) {
            cloneInput.setAttribute('checked', 'checked');
          } else {
            cloneInput.removeAttribute('checked');
          }
        } else {
          cloneInput.value = sourceInput.value || '';
          cloneInput.defaultValue = sourceInput.value || '';
          cloneInput.setAttribute('value', sourceInput.value || '');
        }
      } else if (sourceTag === 'textarea' && clonedTag === 'textarea') {
        const sourceTextarea = sourceControl as HTMLTextAreaElement;
        const clonedTextarea = clonedControl as HTMLTextAreaElement;
        clonedTextarea.value = sourceTextarea.value || '';
        clonedTextarea.defaultValue = sourceTextarea.value || '';
        clonedTextarea.textContent = sourceTextarea.value || '';
      } else if (sourceTag === 'select' && clonedTag === 'select') {
        const sourceSelect = sourceControl as HTMLSelectElement;
        const clonedSelect = clonedControl as HTMLSelectElement;
        clonedSelect.selectedIndex = sourceSelect.selectedIndex;
        Array.from(sourceSelect.options).forEach((sourceOption, optionIndex) => {
          const clonedOption = clonedSelect.options[optionIndex];
          if (!clonedOption) {
            return;
          }
          clonedOption.selected = sourceOption.selected;
          clonedOption.defaultSelected = sourceOption.selected;
          if (sourceOption.selected) {
            clonedOption.setAttribute('selected', 'selected');
          } else {
            clonedOption.removeAttribute('selected');
          }
        });
      }
    });

    controls.forEach(control => control.removeAttribute('data-agreement-control-id'));
    Array.from(clonedRoot.querySelectorAll('[data-agreement-control-id]')).forEach(control => control.removeAttribute('data-agreement-control-id'));
    const bodyContent = clonedRoot.innerHTML;
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', this.editorStyles || '');
  }

  getPreviewDocument(): Document | null {
    const viewChildDoc = this.previewIframe?.nativeElement?.contentDocument || this.previewIframe?.nativeElement?.contentWindow?.document || null;
    if (viewChildDoc) {
      return viewChildDoc;
    }

    const fallbackIframe = document.querySelector('iframe.preview-iframe') as HTMLIFrameElement | null;
    return fallbackIframe?.contentDocument || null;
  }

  buildLiveHtmlSnapshot(doc: Document): string {
    const sourceControls = Array.from(doc.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    sourceControls.forEach((control, index) => {
      control.setAttribute('data-export-control-id', String(index));
    });

    const clonedRoot = doc.documentElement.cloneNode(true) as HTMLElement;

    sourceControls.forEach((sourceControl) => {
      const controlId = sourceControl.getAttribute('data-export-control-id');
      if (!controlId) {
        return;
      }

      const clonedControl = clonedRoot.querySelector(`[data-export-control-id="${controlId}"]`) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;
      if (!clonedControl) {
        return;
      }

      const sourceTag = sourceControl.tagName.toLowerCase();
      const clonedTag = clonedControl.tagName.toLowerCase();

      if (sourceTag === 'input' && clonedTag === 'input') {
        const sourceInput = sourceControl as HTMLInputElement;
        const clonedInput = clonedControl as HTMLInputElement;
        const inputType = (sourceInput.type || '').toLowerCase();
        const sourceComputedStyle = window.getComputedStyle(sourceInput);
        const sourceFontStyle = {
          fontSize: sourceComputedStyle.fontSize,
          fontFamily: sourceComputedStyle.fontFamily,
          fontWeight: sourceComputedStyle.fontWeight,
          lineHeight: sourceComputedStyle.lineHeight,
          letterSpacing: sourceComputedStyle.letterSpacing
        };
        if (inputType === 'checkbox' || inputType === 'radio') {
          clonedInput.checked = sourceInput.checked;
          clonedInput.defaultChecked = sourceInput.checked;
          if (sourceInput.checked) {
            clonedInput.setAttribute('checked', 'checked');
          } else {
            clonedInput.removeAttribute('checked');
          }
          this.replaceChoiceControlWithMarker(clonedInput, sourceInput.checked, sourceInput.offsetWidth, sourceInput.offsetHeight);
        } else {
          clonedInput.value = sourceInput.value || '';
          clonedInput.defaultValue = sourceInput.value || '';
          clonedInput.setAttribute('value', sourceInput.value || '');
          this.replaceTextControlWithValue(clonedInput, sourceInput.value || '', sourceInput.offsetHeight, sourceInput.offsetWidth, false, sourceFontStyle);
        }
        return;
      }

      if (sourceTag === 'textarea' && clonedTag === 'textarea') {
        const sourceTextarea = sourceControl as HTMLTextAreaElement;
        const clonedTextarea = clonedControl as HTMLTextAreaElement;
        const sourceComputedStyle = window.getComputedStyle(sourceTextarea);
        const sourceFontStyle = {
          fontSize: sourceComputedStyle.fontSize,
          fontFamily: sourceComputedStyle.fontFamily,
          fontWeight: sourceComputedStyle.fontWeight,
          lineHeight: sourceComputedStyle.lineHeight,
          letterSpacing: sourceComputedStyle.letterSpacing
        };
        clonedTextarea.value = sourceTextarea.value || '';
        clonedTextarea.defaultValue = sourceTextarea.value || '';
        clonedTextarea.textContent = sourceTextarea.value || '';
        this.replaceTextControlWithValue(clonedTextarea, sourceTextarea.value || '', sourceTextarea.offsetHeight, sourceTextarea.offsetWidth, true, sourceFontStyle);
        return;
      }

      if (sourceTag === 'select' && clonedTag === 'select') {
        const sourceSelect = sourceControl as HTMLSelectElement;
        const clonedSelect = clonedControl as HTMLSelectElement;
        const sourceComputedStyle = window.getComputedStyle(sourceSelect);
        const sourceFontStyle = {
          fontSize: sourceComputedStyle.fontSize,
          fontFamily: sourceComputedStyle.fontFamily,
          fontWeight: sourceComputedStyle.fontWeight,
          lineHeight: sourceComputedStyle.lineHeight,
          letterSpacing: sourceComputedStyle.letterSpacing
        };
        clonedSelect.selectedIndex = sourceSelect.selectedIndex;
        Array.from(sourceSelect.options).forEach((sourceOption, optionIndex) => {
          const clonedOption = clonedSelect.options[optionIndex];
          if (!clonedOption) {
            return;
          }
          clonedOption.selected = sourceOption.selected;
          clonedOption.defaultSelected = sourceOption.selected;
          if (sourceOption.selected) {
            clonedOption.setAttribute('selected', 'selected');
          } else {
            clonedOption.removeAttribute('selected');
          }
        });
        const selectedOptionText = sourceSelect.options[sourceSelect.selectedIndex]?.text || '';
        this.replaceTextControlWithValue(clonedSelect, selectedOptionText, sourceSelect.offsetHeight, sourceSelect.offsetWidth, false, sourceFontStyle);
      }
    });

    sourceControls.forEach(control => {
      control.removeAttribute('data-export-control-id');
    });
    Array.from(clonedRoot.querySelectorAll('[data-export-control-id]')).forEach(control => {
      control.removeAttribute('data-export-control-id');
    });

    return clonedRoot.outerHTML;
  }

  replaceChoiceControlWithMarker(control: HTMLElement, isChecked: boolean, sourceWidth: number, sourceHeight: number): void {
    const marker = control.ownerDocument.createElement('span');
    marker.className = control.className || '';
    marker.textContent = isChecked ? '☑' : '☐';
    marker.style.display = 'inline-flex';
    marker.style.alignItems = 'center';
    marker.style.justifyContent = 'center';
    marker.style.minWidth = `${Math.max(sourceWidth || 0, 12)}px`;
    marker.style.minHeight = `${Math.max(sourceHeight || 0, 12)}px`;
    marker.style.lineHeight = '1';
    marker.style.verticalAlign = 'middle';
    marker.style.fontSize = '12px';
    control.replaceWith(marker);
  }

  replaceTextControlWithValue(
    control: HTMLElement,
    value: string,
    sourceHeight: number,
    sourceWidth: number,
    preserveWhitespace: boolean = false,
    sourceFontStyle?: {
      fontSize?: string;
      fontFamily?: string;
      fontWeight?: string;
      lineHeight?: string;
      letterSpacing?: string;
    }
  ): void {
    const textNode = control.ownerDocument.createElement('span');
    textNode.className = control.className || '';
    textNode.textContent = value;
    textNode.style.display = 'inline-block';
    textNode.style.minHeight = `${Math.max(sourceHeight || 0, 14)}px`;
    textNode.style.minWidth = `${Math.max(sourceWidth || 0, 24)}px`;
    textNode.style.width = sourceWidth > 0 ? `${sourceWidth}px` : '100%';
    textNode.style.lineHeight = '1.2';
    textNode.style.whiteSpace = preserveWhitespace ? 'pre-wrap' : 'normal';
    textNode.style.verticalAlign = 'middle';
    if (sourceFontStyle?.fontSize) {
      textNode.style.fontSize = sourceFontStyle.fontSize;
    }
    if (sourceFontStyle?.fontFamily) {
      textNode.style.fontFamily = sourceFontStyle.fontFamily;
    }
    if (sourceFontStyle?.fontWeight) {
      textNode.style.fontWeight = sourceFontStyle.fontWeight;
    }
    if (sourceFontStyle?.lineHeight) {
      textNode.style.lineHeight = sourceFontStyle.lineHeight;
    }
    if (sourceFontStyle?.letterSpacing) {
      textNode.style.letterSpacing = sourceFontStyle.letterSpacing;
    }
    control.replaceWith(textNode);
  }

  collectDocumentStyles(doc: Document): string {
    const styleTags = Array.from(doc.querySelectorAll('style'));
    return styleTags.map(styleTag => styleTag.textContent || '').filter(styleText => styleText.trim().length > 0).join('\n\n');
  }

  refreshPreviewSafeHtml(): void {
    const previewHtmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles);
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(previewHtmlWithStyles);
  }

  loadAgreementTemplate(includeTemplate: boolean, assetPath: string, templateHtml?: string | null): Observable<string> {
    if (!includeTemplate) {
      return of('');
    }
    if (String(templateHtml || '').trim()) {
      return of(String(templateHtml));
    }
    return this.http.get(assetPath, { responseType: 'text' }).pipe(take(1));
  }

  buildGenerateDto(): GenerateDocumentFromHtmlDto {
    return {
      htmlContent: this.documentHtmlService.getPdfHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles, { fontSize: '9pt', includeLeaseStyles: true }),
      organizationId: this.organizationId,
      officeId: this.selectedOffice?.officeId || 0,
      officeName: this.selectedOffice?.name || '',
      propertyId: this.selectedProperty?.propertyId || null,
      reservationId: null,
      documentTypeId: DocumentType.OwnerAgreement,
      fileName: this.getDocumentFileName(this.documentFileSuffix)
    };
  }

  //#region Abstract BaseDocumentComponent
  protected override getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId || null,
      selectedOfficeName: this.selectedOffice?.name || '',
      selectedReservationId: null,
      propertyId: this.selectedProperty?.propertyId || null,
      contacts: this.ownerContact ? [this.ownerContact] : [],
      isDownloading: this.isDownloading,
      printStyleOptions: { fontSize: '9pt', includeLeaseStyles: true }
    };
  }

  protected override setDownloading(value: boolean): void {
    this.isDownloading = value;
  }
  //#endregion

  getDocumentFileName(label: string): string {
    return this.utilityService.generateDocumentFileName('lease', this.selectedProperty?.propertyCode || undefined, label);
  }

  getDraftStorageKey(): string {
    const organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    const formKey = `${this.documentFileSuffix}-${this.templateAssetPath}`;
    return this.dynamicFormDraftService.buildDraftKey(
      organizationId,
      this.ownerLeadId,
      this.officeId,
      this.propertyId,
      formKey
    );
  }

  composeAddress(source: { address1?: string | null; address2?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null | undefined): string {
    if (!source) {
      return '';
    }
    return [
      String(source.address1 || '').trim(),
      String(source.address2 || '').trim(),
      String(source.city || '').trim(),
      String(source.state || '').trim(),
      String(source.zip || '').trim()
    ].filter(part => part.length > 0).join(', ');
  }

  getCompanyName(): string {
    return String(this.commonService.getOrganizationValue()?.name || '').trim();
  }

  getOfficeName(): string {
    return String(this.getEffectiveOffice()?.name || '').trim();
  }

  getCompanyState(): string {
    const stateCode = String(this.getEffectiveOffice()?.state || this.commonService.getOrganizationValue()?.state || '').trim();
    if (!stateCode) {
      return '';
    }

    const stateMatch = (this.commonService.getStatesFullValue() || []).find(state =>
      String(state.code || '').trim().toLowerCase() === stateCode.toLowerCase()
    );

    return String(stateMatch?.name || stateCode).trim();
  }

  getOwnerState(): string {
    const ownerStateCode = String(this.ownerContact?.state || '').trim();
    if (!ownerStateCode) {
      return '';
    }
    const stateMatch = (this.commonService.getStatesFullValue() || []).find(state =>
      String(state.code || '').trim().toLowerCase() === ownerStateCode.toLowerCase()
    );
    return String(stateMatch?.name || ownerStateCode).trim();
  }

  getCompanyCity(): string {
    return String(this.getEffectiveOffice()?.city || this.commonService.getOrganizationValue()?.city || '').trim();
  }

  getCompanyAddress(): string {
    return [this.getCompanyAddress1(), this.getCompanyAddress2()].filter(part => part.length > 0).join(', ');
  }

  getCompanyAddress1(): string {
    const address1 = String(this.getEffectiveOffice()?.address1 || this.commonService.getOrganizationValue()?.address1 || '').trim();
    const suiteRaw = String(this.getEffectiveOffice()?.suite || this.commonService.getOrganizationValue()?.suite || '').trim();
    if (!address1) {
      return '';
    }
    if (!suiteRaw) {
      return address1;
    }
    const suite = this.normalizeSuiteForDisplay(suiteRaw);
    return `${address1}, ${suite}`;
  }

  getCompanyAddress2(): string {
    const city = this.getCompanyCity();
    const state = this.getCompanyState();
    const zip = String(this.getEffectiveOffice()?.zip || this.commonService.getOrganizationValue()?.zip || '').trim();
    const cityState = [city, state].filter(part => part.length > 0).join(', ');
    return [cityState, zip].filter(part => part.length > 0).join(' ');
  }

  getEffectiveOffice(): OfficeResponse | null {
    if (this.selectedOffice) {
      return this.selectedOffice;
    }
    const propertyOfficeId = this.selectedProperty?.officeId;
    if (!propertyOfficeId) {
      return null;
    }
    const offices = this.officeService.getAllOfficesValue() || [];
    return offices.find(office => office.officeId === propertyOfficeId) || null;
  }

  getAccountingOfficeAddress(): string {
    const accountingOffice = this.accountingOffices.find(accounting => accounting.officeId === this.selectedProperty?.officeId);
    const officeAddressSource = accountingOffice || this.getEffectiveOffice();
    if (!officeAddressSource) {
      return '';
    }
    const address1 = String(officeAddressSource.address1 || '').trim();
    const suite = String((officeAddressSource as any).suite || '').trim();
    const address1WithSuite = suite ? `${address1}, ${suite}` : address1;
    const parts = [address1WithSuite, officeAddressSource.city, officeAddressSource.state, officeAddressSource.zip]
      .map(part => String(part || '').trim())
      .filter(part => part.length > 0);
    return parts.join(', ');
  }

  getAccountingOfficeAddressLines(): { address1: string; address2: string } {
    const accountingOffice = this.accountingOffices.find(accounting => accounting.officeId === this.selectedProperty?.officeId);
    const officeAddressSource = accountingOffice || this.getEffectiveOffice();
    if (!officeAddressSource) {
      return { address1: '', address2: '' };
    }
    const address1 = String(officeAddressSource.address1 || '').trim();
    const suiteRaw = String((officeAddressSource as any).suite || '').trim();
    const suite = this.normalizeSuiteForDisplay(suiteRaw);
    const line1 = [address1, suite].filter(part => part.length > 0).join(', ');
    const city = String(officeAddressSource.city || '').trim();
    const state = String(officeAddressSource.state || '').trim();
    const zip = String(officeAddressSource.zip || '').trim();
    const cityState = [city, state].filter(part => part.length > 0).join(', ');
    const line2 = [cityState, zip].filter(part => part.length > 0).join(' ');
    return { address1: line1, address2: line2 };
  }

  getOwnerAddressLines(): { address1: string; address2: string } {
    if (!this.ownerContact) {
      return { address1: '', address2: '' };
    }
    return this.buildAddressLines(
      this.ownerContact.address1,
      this.ownerContact.address2,
      this.ownerContact.city,
      this.ownerContact.state,
      this.ownerContact.zip
    );
  }

  getPropertyAddressLines(): { address1: string; address2: string } {
    if (!this.selectedProperty) {
      return { address1: '', address2: '' };
    }
    return this.buildAddressLines(
      this.selectedProperty.address1,
      this.selectedProperty.address2,
      this.selectedProperty.city,
      this.selectedProperty.state,
      this.selectedProperty.zip
    );
  }

  buildAddressLines(address1: string | null | undefined, address2: string | null | undefined, city: string | null | undefined, state: string | null | undefined, zip: string | null | undefined): { address1: string; address2: string } {
    const line1 = [String(address1 || '').trim(), String(address2 || '').trim()].filter(part => part.length > 0).join(', ');
    const cityState = [String(city || '').trim(), String(state || '').trim()].filter(part => part.length > 0).join(', ');
    const line2 = [cityState, String(zip || '').trim()].filter(part => part.length > 0).join(' ');
    return { address1: line1, address2: line2 };
  }

  getTopAddressDisplay(label: string, address1: string | null | undefined, address2: string | null | undefined): string {
    const line1 = String(address1 || '').trim();
    const line2 = String(address2 || '').trim();
    if (!line1 && !line2) {
      return '';
    }
    if (!line2) {
      return line1;
    }
    if (this.utilityService.isAddressSingleLine(label, line1, line2)) {
      return `${line1}, ${line2}`;
    }
    return `${line1}<br>&nbsp;&nbsp;&nbsp;&nbsp;${line2}`;
  }

  getUnderlinedFillValue(value: string | null | undefined): string {
    return this.ownerFormPlaceholderService.getUnderlinedFillValue(value);
  }

  normalizeSuiteForDisplay(suiteRaw: string | null | undefined): string {
    const value = String(suiteRaw || '').trim();
    if (!value) {
      return '';
    }
    if (/^(suite|ste|unit|apt|apartment)\b/i.test(value)) {
      return value;
    }
    if (value.startsWith('#')) {
      return value;
    }
    return `#${value}`;
  }

  getOrganizationOfficeDisplay(): string {
    const organizationName = String(this.commonService.getOrganizationValue()?.name || '').trim();
    const officeName = String(this.getEffectiveOffice()?.name || '').trim();
    return `${organizationName} ${officeName}`.trim();
  }

  getOrganizationWebsite(): string {
    return String(this.getEffectiveOffice()?.website || this.commonService.getOrganizationValue()?.website || '').trim();
  }

  getOwnerSplit(): string {
    return this.formatAgreementPercentForDisplay(this.propertyAgreement?.revenueSplitOwner);
  }

  getCompanySplit(): string {
    return this.formatAgreementPercentForDisplay(this.propertyAgreement?.revenueSplitOffice);
  }

  getCompanyMarkup(): string {
    return this.formatAgreementPercentForDisplay(this.propertyAgreement?.markup);
  }

  getOfficePhoneText(): string {
    const phone = this.getEffectiveOffice()?.phone;
    return this.formatterService.phoneNumber(phone) || 'N/A';
  }

  getOfficeFaxText(): string {
    const fax = this.getEffectiveOffice()?.fax;
    return this.formatterService.phoneNumber(fax) || 'N/A';
  }

  getWorkingBalance(): string { 
    return this.formatAgreementCurrency(this.leadOwner?.workingBalance);
  }
  
  getOnlineFee(): string { 
    return this.formatAgreementCurrency(this.leadOwner?.onlineFee);
  }

  getOfflineFee(): string { 
    return this.formatAgreementCurrency(this.leadOwner?.offlineFee);
  }

  getOnlineCleanFee(): string { 
    return this.formatAgreementCurrency(this.leadOwner?.onlineClean);
  }

  getMonthlyRent(): string {
    const leadOwnerTargetMonthly = Number(this.leadOwner?.adjustedGrossRentTarget);
    if (Number.isFinite(leadOwnerTargetMonthly) && leadOwnerTargetMonthly > 0) {
      return this.formatAgreementCurrencyRaw(leadOwnerTargetMonthly);
    }
    const propertyBillingRate = Number((this.selectedProperty as any)?.billingRate);
    if (Number.isFinite(propertyBillingRate) && propertyBillingRate > 0) {
      return this.formatAgreementCurrencyRaw(propertyBillingRate);
    }
    return '';
  }
  //#region

  //#region Utility Methods
  formatAgreementPercentForDisplay(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return this.getEmptyUnderlineSpan();
    }
    const n = Number(String(value).replace(/%\s*$/, ''));
    if (!Number.isFinite(n) || n === 0) {
      return this.getEmptyUnderlineSpan();
    }
    return this.getPopulatedUnderlineSpan(`${n}%`);
  }

  formatAgreementDecimalForDisplay(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return this.getEmptyUnderlineSpan();
    }
    const n = Number(String(value).replace(/[$,]/g, ''));
    if (!Number.isFinite(n) || n === 0) {
      return this.getEmptyUnderlineSpan();
    }
    return this.getPopulatedUnderlineSpan(this.formatAgreementCurrencyRaw(n));
  }

  formatAgreementCurrency(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return this.getEmptyUnderlineSpan();
    }
    const parsed = Number(String(value).replace(/[$,]/g, ''));
    if (!Number.isFinite(parsed) || parsed === 0) {
      return this.getEmptyUnderlineSpan();
    }
    return this.getPopulatedUnderlineSpan(this.formatAgreementCurrencyRaw(parsed));
  }

  formatAgreementCurrencyRaw(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return '';
    }
    const parsed = Number(String(value).replace(/[$,]/g, ''));
    if (!Number.isFinite(parsed)) {
      return '';
    }
    return '$' + parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  getEmptyUnderlineSpan(): string {
    return '<span class="inline-underline-fill"></span>';
  }

  getPopulatedUnderlineSpan(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return this.getEmptyUnderlineSpan();
    }
    return `<span class="inline-underline-fill">&nbsp;&nbsp;${trimmed}&nbsp;&nbsp;</span>`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
