import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, finalize, Observable, Subject, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailService } from '../../email/services/email.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { BaseDocumentComponent, DocumentConfig, EmailConfig } from '../../shared/base-document.component';
import { FormTokenProviderInputs } from '../../shared/forms/services/form-token-provider';
import { OwnerAuthorization, isOwnerAuthorizedAdmin } from '../models/owner-authorization.model';
import { OwnerDocuSignSignerService } from '../services/owner-docusign-signer.service';
import { OwnerDocuSignSignersDialogService } from '../services/owner-docusign-signers-dialog.service';
import { OwnersService, OwnerAgreementContext } from '../services/owners.service';
import { OwnerFormTokenProviderService } from '../services/owner-form-token-provider.service';
import { OwnerFormViewModeService } from '../services/owner-form-view-mode.service';

@Component({
  standalone: true,
  selector: 'app-dynamic-form-create',
  imports: [CommonModule, MaterialModule],
  templateUrl: './dynamic-form-create.component.html',
  styleUrl: './dynamic-form-create.component.scss'
})
export class DynamicFormCreateComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() formName = '';
  @Input() formKey = '';
  @Input() token: string | null = null;
  @Input() ownerAuthorization: OwnerAuthorization = OwnerAuthorization.UnauthorizedOwner;
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() sourceTemplateHtml = '';
  @Input() sharedContext$: Observable<OwnerAgreementContext | null> | null = null;
  @Output() editRequested = new EventEmitter<{ processedHtml: string; processedStyles: string }>();
  @Output() displayStateUpdated = new EventEmitter<{ processedHtml: string; processedStyles: string }>();
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;

  isPageReady = true;
  isSaving = false;
  isDownloading = false;
  iframeKey = 0;
  previewIframeHtml = '';
  previewIframeStyles = '';
  safeHtml: SafeHtml | null = null;
  liveExportHtml = '';
  liveExportStyles = '';
  organizationId = '';
  organization: OrganizationResponse | null = null;
  selectedOffice: OfficeResponse | null = null;
  selectedProperty: PropertyResponse | null = null;
  ownerContact: ContactResponse | null = null;
  allContacts: ContactResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();
  private ownerAgreementContext: OwnerAgreementContext | null = null;

  get canShowDocuSignButton(): boolean {
    return isOwnerAuthorizedAdmin(this.ownerAuthorization) && this.hasDocuSignAccess;
  }

  constructor(
    private ownersService: OwnersService,
    private ownerFormTokenProviderService: OwnerFormTokenProviderService,
    private ownerFormViewModeService: OwnerFormViewModeService,
    private ownerDocuSignSignerService: OwnerDocuSignSignerService,
    private ownerDocuSignSignersDialogService: OwnerDocuSignSignersDialogService,
    private utilityService: UtilityService,
    documentHtmlService: DocumentHtmlService,
    private sanitizer: DomSanitizer,
    private changeDetectorRef: ChangeDetectorRef,
    documentService: DocumentService,
    documentExportService: DocumentExportService,
    public override toastr: ToastrService,
    emailService: EmailService,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
  }

  //#region Dynamic-Form-Create
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    if (this.sharedContext$) {
      this.loadFromSharedContext(this.sharedContext$);
      return;
    }

    this.organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    this.loadOrganization();
    this.loadOffices();
    this.loadContacts();
    this.loadProperty();
    this.loadDisplayHtml();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sharedContext$'] && this.sharedContext$ && !changes['sharedContext$'].firstChange) {
      this.loadFromSharedContext(this.sharedContext$);
      return;
    }

    const officeIdChanged = changes['officeId'] && (changes['officeId'].previousValue !== changes['officeId'].currentValue);
    const propertyIdChanged = changes['propertyId'] && (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    if (officeIdChanged) {
      this.syncSelectedOfficeFromLoadedOffices();
    }
    if (propertyIdChanged) {
      this.loadProperty();
    }
    if (changes['sourceTemplateHtml'] || changes['propertyId'] || changes['officeId']) {
      this.loadDisplayHtml();
    }
  }

  loadFromSharedContext(context$: Observable<OwnerAgreementContext | null>): void {
    this.itemsToLoad$.next(new Set(['context']));
    context$.pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'context');
    })).subscribe({
      next: context => {
        this.applySharedContext(context);
        this.loadDisplayHtml();
      },
      error: () => {
        this.applySharedContext(null);
        this.loadDisplayHtml();
      }
    });
  }

  applySharedContext(context: OwnerAgreementContext | null): void {
    this.ownerAgreementContext = context;
    this.organization = context?.organization || null;
    this.organizationId = String(context?.organization?.organizationId || '').trim();
    this.ownerContact = context?.ownerContact || null;
    this.allContacts = context?.ownerContact ? [context.ownerContact] : [];
    this.selectedProperty = context?.property || null;
    this.syncSelectedOfficeFromLoadedOffices(context?.offices || []);
  }

  private loadDisplayHtml(): void {
    const templateHtml = this.getTokenSourceHtml();
    if (!templateHtml) {
      this.processAndSetHtml('');
      return;
    }
    this.applyDisplayTokens(templateHtml);
  }

  private applyDisplayTokens(templateHtml: string): void {
    if (!this.htmlNeedsTokenReplacement(templateHtml)) {
      this.processAndSetHtml(templateHtml);
      return;
    }

    const inputs = this.getTokenProviderInputs();
    if (this.ownerAgreementContext) {
      this.processAndSetHtml(
        this.ownerFormTokenProviderService.applyTokensFromOwnerAgreementContext(
          templateHtml,
          inputs,
          this.ownerAgreementContext
        )
      );
      return;
    }

    this.ownerFormTokenProviderService.applyTokens(templateHtml, inputs).pipe(take(1)).subscribe({
      next: html => this.processAndSetHtml(html || ''),
      error: () => this.processAndSetHtml(templateHtml)
    });
  }

  private getTokenProviderInputs(): FormTokenProviderInputs {
    return {
      formName: this.formName,
      formKey: this.formKey,
      ownerLeadId: this.ownerLeadId,
      officeId: this.officeId,
      propertyId: this.propertyId,
      templateAssetPath: null
    };
  }

  private getTokenSourceHtml(): string {
    return String(this.sourceTemplateHtml || '').trim();
  }

  private htmlNeedsTokenReplacement(html: string): boolean {
    return /\{\{[^}]+\}\}/.test(String(html || ''));
  }

  onEdit(): void {
    this.editRequested.emit({
      processedHtml: this.previewIframeHtml || '',
      processedStyles: this.previewIframeStyles || ''
    });
  }

  override onPrint(): void {
    this.captureLiveSnapshotForExport();
    const htmlForPrint = this.liveExportHtml || this.previewIframeHtml;
    const stylesForPrint = this.liveExportStyles || this.previewIframeStyles;
    if (!htmlForPrint) {
      this.toastr.warning('Form preview is not ready to print.');
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
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning('Form preview is not ready to download.');
      return;
    }
    this.isDownloading = true;
    const dto = this.buildGenerateDto();
    this.ownersService.generateDocumentDownloadByContext(this.token, dto).pipe(take(1)).subscribe({
      next: blob => {
        this.documentExportService.downloadBlob(blob, dto.fileName);
        this.isDownloading = false;
      },
      error: () => {
        this.isDownloading = false;
        this.toastr.error(`Unable to download ${String(this.formName || 'form').toLowerCase()}.`, CommonMessage.Error);
      }
    });
  }

  onSave(): void {
    this.captureLiveSnapshotForExport();
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning('Form preview is not ready to save.');
      return;
    }
    this.isSaving = true;
    const dto = this.buildGenerateDto();
    this.ownersService.saveGeneratedDocumentByContext(this.token, dto).pipe(take(1)).subscribe({
      next: () => {
        this.isSaving = false;
        this.toastr.success(`${this.formName || 'Form'} saved successfully`, CommonMessage.Success);
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error(`Unable to save ${String(this.formName || 'form').toLowerCase()}.`, CommonMessage.Error);
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
    const title = this.formName || 'Form';

    const emailConfig: EmailConfig = {
      subject: propertyCode ? `${title} - ${propertyCode}` : title,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.OwnerAgreement,
      emailType: EmailType.Other,
      plainTextContent: `Please find the attached ${String(title).toLowerCase()}.`,
      htmlContent: `<p>Please find the attached ${String(title).toLowerCase()}.</p>`,
      fileDetails: {
        fileName: this.getDocumentFileName(),
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

  //#region DocuSign Methods
  getDocuSignSignerRolesHtmlSource(): string {
    return String(this.sourceTemplateHtml || '').trim();
  }

  buildDocuSignSignerContext() {
    const currentUser = this.authService.getUser();
    return {
      primaryOwnerContact: this.ownerContact,
      additionalOwnerContactIds: [],
      contacts: this.allContacts,
      agent: {
        email: String(currentUser?.email || '').trim(),
        name: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim()
      }
    };
  }

  override async onDocuSign(): Promise<void> {
    this.captureLiveSnapshotForExport();
    const propertyCode = this.selectedProperty?.propertyCode || '';
    const title = this.formName || 'Form';
    const subject = propertyCode ? `${title} - ${propertyCode}` : title;
    const roles = this.ownerDocuSignSignerService.parseSignerRolesFromHtml(
      this.getDocuSignSignerRolesHtmlSource()
    );
    const signers = await this.ownerDocuSignSignersDialogService.promptForSigners({
      formTitle: title,
      roles,
      context: this.buildDocuSignSignerContext(),
      officeId: this.selectedOffice?.officeId ?? this.officeId,
      contacts: this.allContacts
    });
    if (!signers) {
      return;
    }

    await super.onDocuSign({
      subject,
      signers,
      documentType: DocumentType.OwnerAgreement,
      fileName: this.getDocumentFileName(),
      errorMessage: `Error sending ${String(title).toLowerCase()} for signature. Please try again.`
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganization(): void {
    this.ownersService.getOrganizationByContext(null).pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      })).subscribe({
      next: response => {
        this.organization = response;
      },
      error: () => {
        this.organization = null;
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.selectedOffice = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }
    this.ownersService.getOfficeListByContext(null, this.organizationId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: offices => {
        this.syncSelectedOfficeFromLoadedOffices(offices || []);
      },
      error: () => {
        this.selectedOffice = null;
      }
    });
  }

  syncSelectedOfficeFromLoadedOffices(offices?: OfficeResponse[]): void {
    const officeList = offices || this.ownersService.getOfficeListSnapshotByContext() || [];
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
    this.ownersService.getOwnerContactsByContext().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: contacts => {
        this.allContacts = contacts || [];
        const ownerLeadId = Number(this.ownerLeadId);
        this.ownerContact = this.allContacts.find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === ownerLeadId
        ) || null;
      },
      error: () => {
        this.allContacts = [];
        this.ownerContact = null;
      }
    });
  }

  loadProperty(): void {
    if (!this.propertyId || this.propertyId === 'new') {
      this.selectedProperty = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }
    this.ownersService.getPropertyByContext(null, this.propertyId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: property => {
        this.selectedProperty = property;
      },
      error: () => {
        this.selectedProperty = null;
      }
    });
  }
  //#endregion

  //#region Preview + Snapshot Methods
  processAndSetHtml(html: string): void {
    if (!String(html || '').trim()) {
      this.previewIframeHtml = '';
      this.previewIframeStyles = '';
      this.safeHtml = null;
      this.changeDetectorRef.markForCheck();
      return;
    }
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.refreshPreviewSafeHtml();
    this.iframeKey++;
    this.displayStateUpdated.emit({
      processedHtml: this.previewIframeHtml,
      processedStyles: this.previewIframeStyles
    });
    setTimeout(() => this.ensurePreviewViewMode());
    this.changeDetectorRef.markForCheck();
  }

  getPreviewStylesForView(): string {
    const viewModeStyles = this.ownerFormViewModeService.getViewModeStylesCss();
    return [this.previewIframeStyles, viewModeStyles].filter(style => String(style || '').trim()).join('\n\n');
  }

  refreshPreviewSafeHtml(): void {
    const previewHtmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(this.previewIframeHtml, this.getPreviewStylesForView());
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(previewHtmlWithStyles);
  }

  onPreviewIframeLoad(): void {
    this.ensurePreviewViewMode();
  }

  ensurePreviewViewMode(): void {
    const previewDoc = this.previewIframe?.nativeElement?.contentDocument || this.previewIframe?.nativeElement?.contentWindow?.document;
    this.ownerFormViewModeService.applyViewModeToDocument(previewDoc);
  }

  getPreviewDocument(): Document | null {
    const viewChildDoc = this.previewIframe?.nativeElement?.contentDocument || this.previewIframe?.nativeElement?.contentWindow?.document || null;
    if (viewChildDoc) {
      return viewChildDoc;
    }
    const fallbackIframe = document.querySelector('iframe.dynamic-form-create-iframe') as HTMLIFrameElement | null;
    return fallbackIframe?.contentDocument || null;
  }

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

  buildLiveHtmlSnapshot(doc: Document): string {
    const sourceControls = Array.from(doc.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    sourceControls.forEach((control, index) => {
      control.setAttribute('data-export-control-id', String(index));
    });

    const clonedRoot = doc.documentElement.cloneNode(true) as HTMLElement;
    sourceControls.forEach(sourceControl => {
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
        if (inputType === 'checkbox' || inputType === 'radio') {
          clonedInput.checked = sourceInput.checked;
          clonedInput.defaultChecked = sourceInput.checked;
          if (sourceInput.checked) {
            clonedInput.setAttribute('checked', 'checked');
          } else {
            clonedInput.removeAttribute('checked');
          }
        } else {
          clonedInput.value = sourceInput.value || '';
          clonedInput.defaultValue = sourceInput.value || '';
          clonedInput.setAttribute('value', sourceInput.value || '');
        }
        return;
      }

      if (sourceTag === 'textarea' && clonedTag === 'textarea') {
        const sourceTextarea = sourceControl as HTMLTextAreaElement;
        const clonedTextarea = clonedControl as HTMLTextAreaElement;
        clonedTextarea.value = sourceTextarea.value || '';
        clonedTextarea.defaultValue = sourceTextarea.value || '';
        clonedTextarea.textContent = sourceTextarea.value || '';
        return;
      }

      if (sourceTag === 'select' && clonedTag === 'select') {
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

    sourceControls.forEach(control => control.removeAttribute('data-export-control-id'));
    Array.from(clonedRoot.querySelectorAll('[data-export-control-id]')).forEach(control => control.removeAttribute('data-export-control-id'));

    return clonedRoot.outerHTML;
  }

  collectDocumentStyles(doc: Document): string {
    const styleTags = Array.from(doc.querySelectorAll('style'));
    return styleTags
      .filter(tag => !this.ownerFormViewModeService.isRuntimeStyleId(tag.id || ''))
      .map(styleTag => styleTag.textContent || '')
      .filter(styleText => styleText.trim().length > 0)
      .join('\n\n');
  }
  //#endregion

  //#region Base Document + Utility
  buildGenerateDto(): GenerateDocumentFromHtmlDto {
    return {
      htmlContent: this.documentHtmlService.getPdfHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles, { fontSize: '9pt', includeLeaseStyles: true }),
      organizationId: this.organizationId,
      officeId: this.selectedOffice?.officeId || 0,
      officeName: this.selectedOffice?.name || '',
      propertyId: this.selectedProperty?.propertyId || null,
      reservationId: null,
      documentTypeId: DocumentType.OwnerAgreement,
      fileName: this.getDocumentFileName()
    };
  }

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

  getDocumentFileName(): string {
    const suffix = String(this.formName || 'Form').replace(/[^a-zA-Z0-9]+/g, '');
    return this.utilityService.generateDocumentFileName('lease', this.selectedProperty?.propertyCode || undefined, suffix || 'Form');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
