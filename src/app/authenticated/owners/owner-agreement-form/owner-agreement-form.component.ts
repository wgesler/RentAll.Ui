import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, finalize, Observable, Subject, of, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailService } from '../../email/services/email.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyAgreementResponse } from '../../properties/models/property-agreement.model';
import { BaseDocumentComponent, DocumentConfig, EmailConfig } from '../../shared/base-document.component';
import { CommonService } from '../../../services/common.service';
import { OwnerAgreementInformationResponse, replaceOwnerAgreementInformationSections } from '../models/owner-agreement-information.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { LeadOwnerResponse } from '../../leads/models/lead-owner.model';
import { DynamicFormDraftService } from '../services/dynamic-form-draft.service';
import { OwnerFormPlaceholderService } from '../services/owner-form-placeholder.service';
import { OwnerAgreementContext, OwnersService } from '../services/owners.service';
import { OwnerDocuSignSignerService } from '../services/owner-docusign-signer.service';
import { OwnerDocuSignSignersDialogService } from '../services/owner-docusign-signers-dialog.service';
import { OwnerIncludedOwnersService } from '../services/owner-included-owners.service';
import { OwnerFormViewModeService } from '../services/owner-form-view-mode.service';

@Component({
  standalone: true,
  selector: 'app-owner-agreement-form',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './owner-agreement-form.component.html',
  styleUrl: './owner-agreement-form.component.scss'
})
export class OwnerAgreementFormComponent extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() token: string | null = null;
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() includeLabel = 'Owner Agreement';
  @Input() showIncludeControls = false;
  @Input() templateAssetPath = 'assets/owner-agreement.html';
  @Input() templateHtml: string | null = null;
  @Input() documentDisplayName = 'Owner Agreement';
  @Input() documentFileSuffix = 'OwnerAgreement';
  // When provided (by the owner-shell), the heavy owner/property/office context is resolved once and
  // shared across all form tabs instead of each tab re-fetching it. Null = standalone self-loading.
  @Input() sharedContext$: Observable<OwnerAgreementContext | null> | null = null;
  /** When true (owner-shell Agreement tab selected), open document preview in view mode — mirrors lease shell behavior. */
  @Input() openInViewOnTabSelect = false;
  @Input() hideEditButtonInViewMode = false;

  form: FormGroup = this.buildForm();
  // Local/dev: load templates straight from local assets for fast iteration (mirrors lease.component).
  debuggingHtml = environment.local || environment.dev;
  isPageReady = false;
  isSaving = false;
  isDownloading = false;
  iframeKey = 0;
  previewIframeHtml = '';
  previewIframeStyles = '';
  editableHtml: SafeHtml | null = null;
  editorStyles = '';
  baseTemplateHtml = '';
  docuSignSignerTemplateHtml = '';
  isEditMode = true;
  pendingOpenInViewMode = false;
  safeHtml: SafeHtml | null = null;
  fallbackIframeHtml: SafeHtml | null = null;
  hasAttemptedPreviewRender = false;
  contextInitialized = false;
  liveExportHtml = '';
  liveExportStyles = '';
  /** Compressed check image kept outside srcdoc so view-mode iframe does not exceed size limits. */
  directDepositCheckImageDataUrl: string | null = null;
  pendingDirectDepositCheckImageDataUrl: string | null = null;
  directDepositCheckImageBlobUrl: string | null = null;
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('editIframe') editIframe?: ElementRef<HTMLIFrameElement>;
  organizationId = '';
  organization: OrganizationResponse | null;
  selectedOffice: OfficeResponse | null = null;
  accountingOffices: AccountingOfficeResponse[] = [];
  selectedProperty: PropertyResponse | null = null;
  propertyAgreement: PropertyAgreementResponse| null;
  ownerContact: ContactResponse | null = null;
  allContacts: ContactResponse[] = [];
  leadOwner: LeadOwnerResponse | null = null;
  agreementInformation: OwnerAgreementInformationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organization', 'offices', 'contacts', 'leadOwner', 'property', 'propertyAgreement', 'agreementInfo', 'accountingOffices']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private commonService: CommonService,
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
    private ownerFormPlaceholderService: OwnerFormPlaceholderService,
    private mappingService: MappingService,
    private ownersService: OwnersService,
    private ownerIncludedOwnersService: OwnerIncludedOwnersService,
    private ownerDocuSignSignerService: OwnerDocuSignSignerService,
    private ownerDocuSignSignersDialogService: OwnerDocuSignSignersDialogService,
    private ownerFormViewModeService: OwnerFormViewModeService,
    private http: HttpClient
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
  }

  //#region Owner-Agreement-Form
  ngOnInit(): void {
    this.organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    const fallbackDocument = this.documentHtmlService.buildHtmlDocument(
      '<div style="padding:24px;font-family:Arial,sans-serif;font-size:14px;color:#444;">Agreement preview is loading...</div>',
      '',
      ''
    );
    this.fallbackIframeHtml = this.sanitizer.bypassSecurityTrustHtml(fallbackDocument);
 
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      if (this.isPageReady && !this.hasAttemptedPreviewRender) {
        this.hasAttemptedPreviewRender = true;
        this.generatePreview();
      }
    });

    this.commonService.loadStates();
    this.contextInitialized = true;
    this.initializeDataContext();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Angular fires the first ngOnChanges before ngOnInit. Let ngOnInit own the initial load
    // so we don't initialize (and render) the preview twice. Only react to genuine input
    // changes that occur after the component has initialized.
    if (!this.contextInitialized) {
      return;
    }
    // Shared-context mode: the shell hands down a fresh context observable whenever the owner/
    // property/office selection changes. That supersedes the individual input-change handling below.
    if (changes['sharedContext$'] && this.sharedContext$) {
      this.hasAttemptedPreviewRender = false;
      this.loadFromSharedContext(this.sharedContext$);
      return;
    }
    const tokenChanged = changes['token'] && (changes['token'].previousValue !== changes['token'].currentValue);
    const propertyIdChanged = changes['propertyId'] && (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const officeIdChanged = changes['officeId'] && (changes['officeId'].previousValue !== changes['officeId'].currentValue);
    const templateHtmlChanged = changes['templateHtml'] && (changes['templateHtml'].previousValue !== changes['templateHtml'].currentValue);
    if (tokenChanged) {
      this.hasAttemptedPreviewRender = false;
      this.itemsToLoad$.next(new Set(['organization', 'offices', 'contacts', 'leadOwner', 'property', 'propertyAgreement', 'agreementInfo', 'accountingOffices']));
      this.initializeDataContext();
      return;
    }
    if (officeIdChanged) {
      this.syncSelectedOfficeFromLoadedOffices();
    }
    if (propertyIdChanged || officeIdChanged) {
      // Incremental restore: add property next.
      this.hasAttemptedPreviewRender = false;
      this.itemsToLoad$.next(new Set(['organization', 'offices', 'contacts', 'leadOwner', 'property', 'propertyAgreement', 'agreementInfo', 'accountingOffices']));
      this.initializeDataContext();
      return;
    }
    if (templateHtmlChanged) {
      this.hasAttemptedPreviewRender = false;
      this.generatePreview();
    }
    if (changes['openInViewOnTabSelect']) {
      const shouldOpenInView = !!changes['openInViewOnTabSelect'].currentValue;
      const wasOpenInView = !!changes['openInViewOnTabSelect'].previousValue;
      if (shouldOpenInView && !wasOpenInView) {
        this.switchToViewModeFromTabSelection();
      }
    }
  }

  switchToViewModeFromTabSelection(): void {
    if (!this.isEditMode) {
      this.pendingOpenInViewMode = false;
      return;
    }

    const draftHtml = this.debuggingHtml ? null : this.dynamicFormDraftService.loadDraft(this.getDraftStorageKey());
    const htmlForView = String(draftHtml || this.baseTemplateHtml || '').trim();
    if (htmlForView) {
      this.isEditMode = false;
      this.processAndSetHtml(htmlForView);
      this.pendingOpenInViewMode = false;
      return;
    }

    this.pendingOpenInViewMode = true;
  }

  isPublicTokenMode(): boolean {
    return String(this.token || '').trim().length > 0;
  }

  initializeDataContext(): void {
    if (this.sharedContext$) {
      this.loadFromSharedContext(this.sharedContext$);
      this.loadAllContactsForOwnerNames();
      return;
    }
    if (this.isPublicTokenMode()) {
      this.loadPublicContext();
      return;
    }
    this.loadOrganization();
    this.loadOffices();
    this.loadContacts();
    this.loadLeadOwner(this.ownerLeadId);
    this.loadProperty();
    this.loadAgreementInformation();
    this.loadAccountingOffices();
  }

  // Shell-driven: consume the shared context observable instead of self-fetching every entity.
  loadFromSharedContext(context$: Observable<OwnerAgreementContext | null>): void {
    this.itemsToLoad$.next(new Set(['context']));
    context$.pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'context');
      this.generatePreviewIfReady();
    })).subscribe({
      next: context => this.applySharedContext(context),
      error: () => this.applySharedContext(null)
    });
  }

  applySharedContext(context: OwnerAgreementContext | null): void {
    this.organization = context?.organization || null;
    this.organizationId = String(context?.organization?.organizationId || this.organizationId || '').trim();
    this.accountingOffices = context?.accountingOffices || [];
    this.ownerContact = context?.ownerContact || null;
    this.leadOwner = context?.leadOwner || null;
    this.selectedProperty = context?.property || null;
    this.propertyAgreement = context?.propertyAgreement || null;
    this.agreementInformation = context?.agreementInformation || null;
    this.syncSelectedOfficeFromLoadedOffices(context?.offices || []);
    this.loadAllContactsForOwnerNames();
    if (this.hasAttemptedPreviewRender) {
      this.generatePreview();
    }
  }

  onIncludeChange(): void {
    this.generatePreview();
  }

  saveDraft(): void {
    const isDirectDeposit = this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit';
    if (isDirectDeposit) {
      void this.prepareDirectDepositCheckImageForView().then(() => this.persistDirectDepositDraft(true));
      return;
    }
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
    this.clearDirectDepositCheckImageState();
    this.setEditorHtml(this.baseTemplateHtml || '');
    this.toastr.success('Form reset.');
  }

  async viewForm(): Promise<void> {
    const isDirectDeposit = this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit';
    if (isDirectDeposit) {
      await this.prepareDirectDepositCheckImageForView();
    }
    const htmlSnapshot = this.captureLiveHtmlSnapshot({ omitCheckImageFromHtml: isDirectDeposit });
    if (!htmlSnapshot) {
      this.toastr.warning('There is no form content to view.');
      return;
    }
    if (isDirectDeposit) {
      this.persistDirectDepositDraft(false);
    } else {
      this.dynamicFormDraftService.saveDraft(this.getDraftStorageKey(), htmlSnapshot);
    }
    this.pendingDirectDepositCheckImageDataUrl = this.directDepositCheckImageDataUrl;
    this.isEditMode = false;
    this.processAndSetHtml(htmlSnapshot);
  }

  editForm(): void {
    if (!this.isEditMode) {
      let htmlForEdit = String(this.previewIframeHtml || '').trim();
      if (!htmlForEdit) {
        this.captureLiveSnapshotForExport();
        htmlForEdit = String(this.liveExportHtml || this.baseTemplateHtml || '').trim();
      }
      const htmlToRestore = htmlForEdit || this.baseTemplateHtml || '';
      this.isEditMode = true;
      setTimeout(() => this.setEditorHtml(htmlToRestore));
    }
  }

  onEditIframeLoad(): void {
    this.clearIframeBeforeUnloadHandlers(this.editIframe);
    this.ensureEditorControlsInteractive();
    this.restoreDirectDepositCheckImageInEditor();
    if (this.pendingOpenInViewMode && this.openInViewOnTabSelect) {
      this.switchToViewModeFromTabSelection();
    }
  }

  onPreviewIframeLoad(): void {
    this.clearIframeBeforeUnloadHandlers(this.previewIframe);
    this.ensurePreviewControlsReadOnly();
    this.applyPendingDirectDepositCheckImage();
  }


  onSave(): void {
    this.captureLiveSnapshotForExport();
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning(`${this.documentDisplayName} preview is not ready to save.`);
      return;
    }
    this.isSaving = true;
    const dto = this.buildGenerateDto();
    this.ownersService.saveGeneratedDocumentByContext(this.token, dto).pipe(take(1)).subscribe({
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
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      includeDocument: new FormControl(true)
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadPublicContext(): void {
    const token = String(this.token || '').trim();
    if (!token) {
      this.organization = null;
      this.selectedOffice = null;
      this.accountingOffices = [];
      this.selectedProperty = null;
      this.propertyAgreement = null;
      this.ownerContact = null;
      this.leadOwner = null;
      this.agreementInformation = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leadOwner');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      this.generatePreviewIfReady();
      return;
    }

    this.ownersService.getPublicAgreementContext(token).pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leadOwner');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
        this.generatePreviewIfReady();
      })).subscribe({
      next: response => {
        this.organization = response.organization || null;
        this.organizationId = String(response.organization?.organizationId || '').trim();
        this.selectedOffice = response.office || null;
        this.leadOwner = response.owner || null;
        this.selectedProperty = response.property || null;
        this.propertyAgreement = response.propertyAgreement || null;
        this.agreementInformation = response.agreementInfo || null;
        this.accountingOffices = response.accountingOffice ? [response.accountingOffice] : [];
        const ownerContacts = response.contact ? [response.contact] : [];
        this.ownerContact = ownerContacts.length > 0
          ? ownerContacts[0]
          : this.mappingService.mapPublicOwnerContact(response.publicForm?.form);
        this.allContacts = this.ownerContact ? [this.ownerContact] : [];
        this.loadAllContactsForOwnerNames();
      },
      error: () => {
        this.organization = null;
        this.organizationId = '';
        this.selectedOffice = null;
        this.ownerContact = null;
        this.leadOwner = null;
        this.selectedProperty = null;
        this.propertyAgreement = null;
        this.agreementInformation = null;
        this.accountingOffices = [];
      }
    });
  }

  loadLeadOwner(leadOwnerId: number | null): void {
    const parsedLeadOwnerId = Number(leadOwnerId);
    if (!Number.isFinite(parsedLeadOwnerId) || parsedLeadOwnerId <= 0) {
      this.leadOwner = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leadOwner');
      return;
    }

    this.ownersService.getOwnerByContext(null, parsedLeadOwnerId).pipe(take(1),finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leadOwner');
      this.generatePreviewIfReady();
    })).subscribe({
      next: response => {
        if (!response) {
          this.leadOwner = null;
          return;
        }
        this.leadOwner = response;
        this.tryLoadPropertyByLeadOwnerCode();
      },
      error: () => {
        this.leadOwner = null;
      }
    });
  }

  loadOrganization(): void {
    if (!this.organizationId && !this.isPublicTokenMode()) {
      this.organization = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.generatePreviewIfReady();
      return;
    }
    this.ownersService.getOrganizationByContext(this.token).pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        this.generatePreviewIfReady();
      })).subscribe({
      next: (response: OrganizationResponse | null) => {
        if (!response) {
          this.organization = null;
          return;
        }
        this.organization = response;
        this.organizationId = String(response.organizationId || this.organizationId || '').trim();
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
    this.ownersService.getOfficeListByContext(null, this.organizationId).pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.generatePreviewIfReady();
      })).subscribe({
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
    this.ownersService.getOwnerContactsByContext().pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
        this.generatePreviewIfReady();
      })).subscribe({
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
      this.propertyAgreement = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      this.tryLoadPropertyByLeadOwnerCode();
      return;
    }
    this.ownersService.getPropertyByContext(this.token, this.propertyId).pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.generatePreviewIfReady();
      })).subscribe({
      next: property => {
        if (!property) {
          this.selectedProperty = null;
          this.propertyAgreement = null;
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
          return;
        }
        this.selectedProperty = property;
        // Property agreement depends on selectedProperty; reload once property resolves.
        this.utilityService.addLoadItem(this.itemsToLoad$, 'propertyAgreement');
        this.loadPropertyAgreement();
      },
      error: () => {
        this.selectedProperty = null;
        this.propertyAgreement = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      }
    });
  }

  private tryLoadPropertyByLeadOwnerCode(): void {
    if (this.isPublicTokenMode()) {
      return;
    }
    if (this.selectedProperty) {
      return;
    }
    const leadOwnerId = Number(this.ownerLeadId);
    if (!Number.isFinite(leadOwnerId) || leadOwnerId <= 0) {
      return;
    }
    const targetPropertyCode = String(this.leadOwner?.propertyCode || '').trim().toUpperCase();
    if (!targetPropertyCode) {
      return;
    }

    this.ownersService.getOwnerContactsByContext().pipe(take(1)).subscribe({
      next: contacts => {
        const ownerContact = (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === leadOwnerId
        );
        const ownerContactId = String(ownerContact?.contactId || '').trim();
        if (!ownerContactId) {
          return;
        }
        this.ownersService.getOwnerPropertiesByContext(null, ownerContactId).pipe(take(1)).subscribe({
          next: properties => {
            const matching = (properties || []).find(property =>
              String(property.propertyCode || '').trim().toUpperCase() === targetPropertyCode
            );
            const matchedPropertyId = String(matching?.propertyId || '').trim();
            if (!matchedPropertyId || matchedPropertyId === 'new') {
              return;
            }
            this.ownersService.getPropertyByContext(null, matchedPropertyId).pipe(take(1)).subscribe({
              next: property => {
                if (!property) {
                  return;
                }
                this.selectedProperty = property;
                this.utilityService.addLoadItem(this.itemsToLoad$, 'propertyAgreement');
                this.loadPropertyAgreement();
              },
              error: () => {}
            });
          },
          error: () => {}
        });
      },
      error: () => {}
    });
  }

  loadPropertyAgreement(): void {
    if (!this.selectedProperty) {
      this.propertyAgreement = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement');
      return;
    }

    this.ownersService.getPropertyAgreementByContext(this.token, this.selectedProperty.propertyId).pipe(take(1),finalize(() => {
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
    if (this.isPublicTokenMode()) {
      const token = String(this.token || '').trim();
      if (!token) {
        this.agreementInformation = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.generatePreviewIfReady();
        return;
      }
      this.ownersService.getAgreementInformationByContext(token, this.officeId, this.propertyId).pipe(take(1),finalize(() => {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
          this.generatePreviewIfReady();
        })
      ).subscribe({
        next: response => {
          this.agreementInformation = response || null;
        },
        error: () => {
          this.agreementInformation = null;
        }
      });
      return;
    }

    this.ownersService.getAgreementInformationByContext(null, this.officeId, this.propertyId).pipe(take(1),finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.generatePreviewIfReady();
      })
    ).subscribe({
      next: response => {
        this.agreementInformation = response || null;
      },
      error: () => {
        this.agreementInformation = null;
      }
    });
  }

  loadAccountingOffices(): void {
    this.ownersService.getAccountingOfficesByContext().pipe(take(1),finalize(() => {
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

  loadAllContactsForOwnerNames(): void {
    this.ownersService.getOwnerContactsByContext().pipe(take(1)).subscribe({
      next: contacts => {
        this.allContacts = contacts || [];
      },
      error: () => {
        this.allContacts = this.ownerContact ? [this.ownerContact] : [];
      }
    });
  }

  getPrimaryOwnerName(): string {
    return this.ownerIncludedOwnersService.getContactDisplayName(this.ownerContact);
  }

  isDirectDepositDocument(): boolean {
    return this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit';
  }

  getOwnerNameForDocument(): string {
    return this.getPrimaryOwnerName();
  }

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
    // A render is already in flight. As each parallel data load resolves it fires a "ready"
    // check, so multiple triggers can land in the same tick; skip the duplicate to avoid a
    // second iframe reload (the flash).
    if (this.itemsToLoad$.value.has('preview')) {
      return;
    }
    this.hasAttemptedPreviewRender = true;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'preview');
    const includeDocument = !!this.form.get('includeDocument')?.value;
    this.loadAgreementTemplate(includeDocument, this.templateAssetPath, this.templateHtml).pipe(finalize(() => {this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview'); })).subscribe({
      next: ownerAgreementHtml => {
        try {
          this.docuSignSignerTemplateHtml = String(ownerAgreementHtml || '').trim();
          const combinedHtml = this.replaceAgreementPlaceholders(ownerAgreementHtml);
          this.baseTemplateHtml = combinedHtml;
          // Local/dev: never let a saved draft mask template iteration. A draft captured before the
          // template gained its <style> block (style-less editorStyles) would otherwise clobber the
          // freshly loaded, styled asset on every reload.
          const draftKey = this.getDraftStorageKey();
          const draftHtml = this.debuggingHtml ? null : this.dynamicFormDraftService.loadDraft(draftKey);
          if (this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit') {
            this.directDepositCheckImageDataUrl = this.dynamicFormDraftService.loadDraftImage(draftKey);
          }
          let htmlToRender = draftHtml
            ? this.ensureHtmlHasTemplateStyles(draftHtml, this.baseTemplateHtml)
            : this.baseTemplateHtml;
          if (!String(htmlToRender || '').trim()) {
            htmlToRender = String(ownerAgreementHtml || '').trim();
          }
          if (!String(htmlToRender || '').trim()) {
            htmlToRender = '<div style="padding:24px;font-family:Arial,sans-serif;font-size:14px;color:#444;">Agreement template is empty.</div>';
          }
          this.setEditorHtml(htmlToRender);
          if (!this.isEditMode) {
            this.processAndSetHtml(htmlToRender);
          }
        } catch {
          // Fallback: render raw template so preview remains usable even if token replacement fails.
          this.docuSignSignerTemplateHtml = String(ownerAgreementHtml || '').trim();
          this.baseTemplateHtml = ownerAgreementHtml || '';
          const fallbackHtml = this.baseTemplateHtml;
          this.setEditorHtml(fallbackHtml);
          if (!this.isEditMode) {
            this.processAndSetHtml(fallbackHtml);
          }
          this.toastr.error(`${this.documentDisplayName} preview failed to render placeholders; showing template.`, CommonMessage.Error);
        }
      },
      error: () => {
        this.baseTemplateHtml = '';
        this.editableHtml = null;
        this.previewIframeHtml = '';
        this.safeHtml = null;
        this.toastr.error(`${this.documentDisplayName} template failed to load.`, CommonMessage.Error);
      }
    });
  }

  replaceAgreementPlaceholders(html: string): string {
    const today = this.formatterService.formatDateStringLong(this.utilityService.todayAsCalendarDateString()) || '';
    const agreementStartDate = this.getAgreementStartDate();
    const signerName = `${this.authService.getUser()?.firstName || ''} ${this.authService.getUser()?.lastName || ''}`.trim();
    const logoOfficeId = Number(this.selectedProperty?.officeId || this.selectedOffice?.officeId || this.officeId || 0);
    const selectedAccountingOffice = Number.isFinite(logoOfficeId) && logoOfficeId > 0
      ? this.accountingOffices.find(accounting => accounting.officeId === logoOfficeId) || null
      : null;
    const accountingOfficeLogo = this.getFileDetailsDataUrl(selectedAccountingOffice?.fileDetails);
    const selectedOfficeLogo = this.getFileDetailsDataUrl(this.selectedOffice?.fileDetails);
    const organizationLogo = this.getFileDetailsDataUrl(this.organization?.fileDetails);
    const officeLogo = this.getAccountingOfficeLogoDataUrl()
      || selectedOfficeLogo
      || organizationLogo
      || '';
    const companyName = this.getCompanyName();
    const ownerState = this.getOwnerState();
    const monthlyRent = this.getMonthlyRent();
    const ownerAddressSingleLine = this.composeAddress(this.ownerContact);
    const leadOwnerPropertyAddressSingleLine = this.composeAddress({
      address1: this.leadOwner?.address || '',
      address2: '',
      city: this.leadOwner?.city || '',
      state: this.leadOwner?.state || '',
      zip: this.leadOwner?.zip || ''
    });
    const propertyAddressLines = this.getPropertyAddressLines();
    const propertyAddressSingleLine =
      [propertyAddressLines.address1, propertyAddressLines.address2].filter(part => part.length > 0).join(', ')
      || leadOwnerPropertyAddressSingleLine
      || String(this.leadOwner?.locationOfProperty || '').trim();
    const propertyAddressFields = this.getPropertyAddressFieldTokens();
    const companyAddressSingleLine = this.getCompanyAddress();
    const accountingOfficeAddressSingleLine = this.getAccountingOfficeAddress();
    const ownerAddressLines = this.getOwnerAddressLines();
    const accountingOfficeAddressLines = this.getAccountingOfficeAddressLines();

    const ownerFullName = this.getOwnerNameForDocument();
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
      propertyCode: String(this.selectedProperty?.propertyCode || this.leadOwner?.propertyCode || '').trim(),
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
      propertyAddress1: propertyAddressLines.address1,
      propertyAddress2: propertyAddressLines.address2,
      address1: propertyAddressFields.address1,
      city: propertyAddressFields.city,
      state: propertyAddressFields.state,
      zip: propertyAddressFields.zip,
      agreementStartDate,
      agreementStartDateUnderlined: this.getUnderlinedFillValue(agreementStartDate),
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
      monthlyRent: this.getInlineFillTokenValue(monthlyRent),
      ownerMinimumMonthly: this.getInlineFillTokenValue(this.getPropertyAgreementFlatRateAmountText()),
      ownerFlatMonthly: this.getInlineFillTokenValue(this.getPropertyAgreementFlatRateAmountText()),
      officeLogoBase64: officeLogo
    };

    let content = this.ownerFormPlaceholderService.replaceTokens(
      replaceOwnerAgreementInformationSections(html, this.agreementInformation, {
        managementFeeTypeId: this.propertyAgreement?.managementFeeTypeId ?? null
      }),
      tokenValues,
      { highlightUnresolved: false }
    );

    if (companyName) {
      content = content.replace(/\bAvenue\s*West\b/gi, matched =>
        matched === matched.toUpperCase() ? companyName.toUpperCase() : companyName
      );
    }

    return this.ownerFormPlaceholderService.replaceTokens(content, {}, { highlightUnresolved: true });
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    this.refreshPreviewSafeHtml();
    this.iframeKey++;
    setTimeout(() => {
      this.writePreviewIframeDocument();
      this.ensurePreviewControlsReadOnly();
      this.applyPendingDirectDepositCheckImage();
      setTimeout(() => this.applyPendingDirectDepositCheckImage(), 150);
    });
  }

  setEditorHtml(html: string): void {
    const fallbackHtml = String(html || '').trim().length > 0
      ? html
      : '<div style="padding:24px;font-family:Arial,sans-serif;font-size:14px;color:#444;">Agreement preview is unavailable.</div>';
    const result = this.documentHtmlService.processHtml(fallbackHtml, true);
    const extractedStyles = String(result.extractedStyles || '').trim();
    // Returning from view passes previewIframeHtml, which no longer contains <style> tags.
    // Keep the styles that were split out when view mode was entered.
    this.editorStyles = extractedStyles || this.previewIframeStyles || this.editorStyles || '';
    const editableHtmlDocument = this.documentHtmlService.buildHtmlDocument(
      this.documentHtmlService.extractBodyContent(result.processedHtml || ''),
      '',
      this.editorStyles
    );
    this.editableHtml = this.sanitizer.bypassSecurityTrustHtml(editableHtmlDocument);
    this.iframeKey++;
    setTimeout(() => this.ensureEditorControlsInteractive());
    if (this.pendingOpenInViewMode && this.openInViewOnTabSelect) {
      setTimeout(() => this.switchToViewModeFromTabSelection());
    }
  }

  onEditHostClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const marker = target.closest('span.checkbox') as HTMLSpanElement | null;
    if (!marker) {
      return;
    }
    const isChecked = marker.getAttribute('data-checked') === 'true';
    marker.setAttribute('data-checked', isChecked ? 'false' : 'true');
    marker.textContent = '';
    event.preventDefault();
    event.stopPropagation();
  }

  ensureEditorControlsInteractive(): void {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return;
    }
    const isDirectDepositEditor = this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit';
    this.ensureEditableFieldStyles(editDoc);
    editHost.setAttribute('contenteditable', 'false');
    const staticEditableNodes = Array.from(editHost.querySelectorAll('[contenteditable]')) as HTMLElement[];
    staticEditableNodes.forEach(node => node.setAttribute('contenteditable', 'false'));

    // Keep static form text read-only; only unlock fillable fields/underlines.
    const fillableRegions = Array.from(
      editHost.querySelectorAll(
        [
          '.line',
          '.inline-underline-fill',
          '.signature-line',
          '.signature-entry',
          '.form-line',
          '.field-line',
          '.fill-line',
          '.fill-field',
          '[data-fillable="true"]',
          '[class*="underline"]'
        ].join(', ')
      )
    ) as HTMLElement[];

    const borderBottomCandidates = Array.from(editHost.querySelectorAll('span, div')) as HTMLElement[];
    borderBottomCandidates.forEach(candidate => {
      if (candidate.querySelector('input, textarea, select, button')) {
        return;
      }
      const computed = editDoc.defaultView?.getComputedStyle(candidate);
      if (!computed) {
        return;
      }
      const borderBottomWidth = Number.parseFloat(computed.borderBottomWidth || '0');
      const hasBorderBottom = computed.borderBottomStyle !== 'none' && Number.isFinite(borderBottomWidth) && borderBottomWidth > 0;
      if (!hasBorderBottom) {
        return;
      }
      if (!fillableRegions.includes(candidate)) {
        fillableRegions.push(candidate);
      }
    });

    fillableRegions.forEach(region => {
      if (region.querySelector('input, textarea, select, button')) {
        return;
      }
      // Keep top agreement info boxes read-only.
      if (region.closest('#container .border, .top-info-lines, .top-info-line')) {
        return;
      }
      if (isDirectDepositEditor) {
        // Direct-deposit has wrapper signature blocks; keep only actual lines editable.
        const nestedFillTarget = region.querySelector(
          '.line, .inline-underline-fill, .signature-line, .signature-entry, .form-line, .field-line, .fill-line, .fill-field, [data-fillable="true"]'
        );
        if (nestedFillTarget && nestedFillTarget !== region) {
          return;
        }
      }
      region.setAttribute('contenteditable', 'true');
      region.setAttribute('spellcheck', 'false');
      region.classList.add('owner-editable-field');
      if (!region.hasAttribute('tabindex')) {
        region.setAttribute('tabindex', '0');
      }
    });

    const controls = Array.from(editHost.querySelectorAll('input, textarea, select, option, button, label'));
    controls.forEach(control => {
      control.setAttribute('contenteditable', 'false');
    });
    const formControls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    formControls.forEach(control => {
      if (control.hasAttribute('disabled')) {
        control.removeAttribute('disabled');
      }
      control.classList.add('owner-editable-control');
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.readOnly = false;
        if (control.hasAttribute('readonly')) {
          control.removeAttribute('readonly');
        }
      }
    });

    const checkboxMarkers = Array.from(editHost.querySelectorAll('span.checkbox')) as HTMLSpanElement[];
    checkboxMarkers.forEach(marker => {
      marker.setAttribute('contenteditable', 'false');
      marker.style.cursor = 'pointer';
      marker.style.userSelect = 'none';
      const hasValue = String(marker.textContent || '').trim().length > 0;
      marker.setAttribute('data-checked', hasValue ? 'true' : 'false');
      marker.textContent = '';
    });
    if (!editHost.dataset['checkboxToggleBound']) {
      editHost.addEventListener('click', this.onEditHostClick);
      editHost.dataset['checkboxToggleBound'] = 'true';
    }
    if (isDirectDepositEditor) {
      this.wireDirectDepositUploadHandler(editDoc, editHost);
    }
  }

  ensurePreviewControlsReadOnly(): void {
    const previewDoc = this.previewIframe?.nativeElement?.contentDocument || this.previewIframe?.nativeElement?.contentWindow?.document;
    this.ownerFormViewModeService.applyViewModeToDocument(previewDoc, {
      isDirectDeposit: this.isDirectDepositDocument()
    });
  }

  wireDirectDepositUploadHandler(editDoc: Document, editHost: HTMLElement): void {
    const fileInput = editHost.querySelector('#voidedCheckUpload') as HTMLInputElement | null;
    if (!fileInput || fileInput.dataset['directDepositUploadBound'] === 'true') {
      return;
    }
    fileInput.dataset['directDepositUploadBound'] = 'true';
    fileInput.addEventListener('change', () => this.applyDirectDepositCheckUpload(editDoc, fileInput));
  }

  applyDirectDepositCheckUpload(editDoc: Document, fileInput: HTMLInputElement): void {
    const previewImage = editDoc.getElementById('uploadedCheckImage') as HTMLImageElement | null;
    const placeholder = editDoc.getElementById('uploadedCheckPlaceholder') as HTMLElement | null;
    if (!previewImage || !placeholder) {
      return;
    }

    const file = fileInput.files?.[0] || null;
    if (!file) {
      previewImage.style.display = 'none';
      previewImage.removeAttribute('src');
      placeholder.style.display = 'block';
      this.directDepositCheckImageDataUrl = null;
      this.pendingDirectDepositCheckImageDataUrl = null;
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const loader = new Image();
    loader.onload = () => {
      const compressed = this.compressImageForSnapshot(loader);
      URL.revokeObjectURL(objectUrl);
      if (!compressed) {
        this.toastr.warning('Unable to process the check image.');
        return;
      }
      previewImage.setAttribute('src', compressed);
      previewImage.style.display = 'block';
      placeholder.style.display = 'none';
      this.directDepositCheckImageDataUrl = compressed;
      this.pendingDirectDepositCheckImageDataUrl = compressed;
    };
    loader.onerror = () => URL.revokeObjectURL(objectUrl);
    loader.src = objectUrl;
  }

  async prepareDirectDepositCheckImageForView(): Promise<void> {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const sourceImage = editDoc?.getElementById('uploadedCheckImage') as HTMLImageElement | null;
    const src = String(sourceImage?.getAttribute('src') || '').trim();
    if (!sourceImage || !src) {
      this.clearDirectDepositCheckImageState();
      return;
    }

    const compressed = await this.compressImageDataUrlAsync(src, editDoc);
    if (!compressed) {
      this.toastr.warning('Unable to prepare the check image for preview.');
      this.clearDirectDepositCheckImageState();
      return;
    }

    this.directDepositCheckImageDataUrl = compressed;
    this.pendingDirectDepositCheckImageDataUrl = compressed;
    sourceImage.setAttribute('src', compressed);
    sourceImage.style.display = 'block';
    const placeholder = editDoc?.getElementById('uploadedCheckPlaceholder') as HTMLElement | null;
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }

  persistDirectDepositDraft(showToast: boolean): void {
    const draftKey = this.getDraftStorageKey();
    const htmlSnapshot = this.captureLiveHtmlSnapshot({ omitCheckImageFromHtml: true });
    if (!htmlSnapshot) {
      if (showToast) {
        this.toastr.warning('There is no form content to save.');
      }
      return;
    }
    this.dynamicFormDraftService.saveDraft(draftKey, htmlSnapshot);
    if (this.directDepositCheckImageDataUrl) {
      this.dynamicFormDraftService.saveDraftImage(draftKey, this.directDepositCheckImageDataUrl);
    } else {
      this.dynamicFormDraftService.resetDraftImage(draftKey);
    }
    if (showToast) {
      this.toastr.success('Draft saved.');
    }
  }

  restoreDirectDepositCheckImageInEditor(): void {
    if (this.resolveTemplateTypeForLookup(this.templateAssetPath) !== 'directDeposit') {
      return;
    }
    const dataUrl = String(
      this.directDepositCheckImageDataUrl || this.dynamicFormDraftService.loadDraftImage(this.getDraftStorageKey()) || ''
    ).trim();
    if (!dataUrl) {
      return;
    }
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const previewImage = editDoc?.getElementById('uploadedCheckImage') as HTMLImageElement | null;
    const placeholder = editDoc?.getElementById('uploadedCheckPlaceholder') as HTMLElement | null;
    if (!previewImage) {
      return;
    }
    previewImage.setAttribute('src', dataUrl);
    previewImage.style.display = 'block';
    if (placeholder) {
      placeholder.style.display = 'none';
    }
    this.directDepositCheckImageDataUrl = dataUrl;
  }

  writePreviewIframeDocument(): void {
    const shouldWriteDirectly = this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit'
      && !!String(this.pendingDirectDepositCheckImageDataUrl || '').trim();
    if (!shouldWriteDirectly) {
      return;
    }
    const iframe = this.previewIframe?.nativeElement;
    const previewHtmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(this.previewIframeHtml, this.getPreviewStylesForView());
    if (!iframe || !String(previewHtmlWithStyles || '').trim()) {
      return;
    }
    const previewDoc = iframe.contentDocument || iframe.contentWindow?.document || null;
    if (!previewDoc) {
      return;
    }
    previewDoc.open();
    previewDoc.write(previewHtmlWithStyles);
    previewDoc.close();
  }

  applyPendingDirectDepositCheckImage(): void {
    const dataUrl = String(this.pendingDirectDepositCheckImageDataUrl || '').trim();
    if (!dataUrl || this.resolveTemplateTypeForLookup(this.templateAssetPath) !== 'directDeposit') {
      return;
    }
    const previewDoc = this.previewIframe?.nativeElement?.contentDocument || this.previewIframe?.nativeElement?.contentWindow?.document;
    const previewImage = previewDoc?.getElementById('uploadedCheckImage') as HTMLImageElement | null;
    const placeholder = previewDoc?.getElementById('uploadedCheckPlaceholder') as HTMLElement | null;
    if (!previewImage) {
      return;
    }

    this.revokeDirectDepositCheckImageBlobUrl();
    const blob = this.dataUrlToBlob(dataUrl);
    if (!blob) {
      return;
    }
    this.directDepositCheckImageBlobUrl = URL.createObjectURL(blob);
    previewImage.src = this.directDepositCheckImageBlobUrl;
    previewImage.style.display = 'block';
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }

  clearDirectDepositCheckImageState(): void {
    this.directDepositCheckImageDataUrl = null;
    this.pendingDirectDepositCheckImageDataUrl = null;
    this.revokeDirectDepositCheckImageBlobUrl();
    this.dynamicFormDraftService.resetDraftImage(this.getDraftStorageKey());
  }

  revokeDirectDepositCheckImageBlobUrl(): void {
    if (!this.directDepositCheckImageBlobUrl) {
      return;
    }
    URL.revokeObjectURL(this.directDepositCheckImageBlobUrl);
    this.directDepositCheckImageBlobUrl = null;
  }

  async compressImageDataUrlAsync(dataUrl: string, ownerDocument?: Document | null): Promise<string | null> {
    const doc = ownerDocument || document;
    return new Promise(resolve => {
      const loader = doc.createElement('img');
      loader.onload = () => resolve(this.compressImageForSnapshot(loader));
      loader.onerror = () => resolve(null);
      loader.src = dataUrl;
    });
  }

  dataUrlToBlob(dataUrl: string): Blob | null {
    const match = String(dataUrl || '').trim().match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
    if (!match) {
      return null;
    }
    const mimeType = match[1] || 'application/octet-stream';
    const isBase64 = !!match[2];
    const data = match[3] || '';
    try {
      if (isBase64) {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
          bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: mimeType });
      }
      return new Blob([decodeURIComponent(data)], { type: mimeType });
    } catch {
      return null;
    }
  }

  attachDirectDepositCheckImageToHtml(html: string, checkImageDataUrl: string | null): string {
    const dataUrl = String(checkImageDataUrl || '').trim();
    if (!dataUrl) {
      return html;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const previewImage = doc.getElementById('uploadedCheckImage') as HTMLImageElement | null;
    const placeholder = doc.getElementById('uploadedCheckPlaceholder') as HTMLElement | null;
    if (!previewImage) {
      return html;
    }
    previewImage.setAttribute('src', dataUrl);
    previewImage.style.display = 'block';
    if (placeholder) {
      placeholder.style.display = 'none';
    }
    const bodyContent = doc.body?.innerHTML || '';
    const templateStyles = this.documentHtmlService.processHtml(html, false).extractedStyles;
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', templateStyles);
  }

  syncFillableRegionsForSnapshot(sourceHost: HTMLElement, clonedHost: HTMLElement): void {
    const selector = [
      '.line',
      '.inline-underline-fill',
      '.signature-line',
      '.signature-entry',
      '.form-line',
      '.field-line',
      '.fill-line',
      '.fill-field',
      '[data-fillable="true"]'
    ].join(', ');
    const sourceRegions = Array.from(sourceHost.querySelectorAll(selector)) as HTMLElement[];
    const clonedRegions = Array.from(clonedHost.querySelectorAll(selector)) as HTMLElement[];
    sourceRegions.forEach((sourceRegion, index) => {
      const clonedRegion = clonedRegions[index];
      if (!clonedRegion) {
        return;
      }
      clonedRegion.innerHTML = sourceRegion.innerHTML;
    });
  }

  finalizeDirectDepositViewSnapshot(
    sourceHost: HTMLElement,
    clonedHost: HTMLElement,
    options?: { omitCheckImageFromHtml?: boolean }
  ): void {
    const sourceImage = sourceHost.querySelector('#uploadedCheckImage') as HTMLImageElement | null;
    const clonedImage = clonedHost.querySelector('#uploadedCheckImage') as HTMLImageElement | null;
    const clonedPlaceholder = clonedHost.querySelector('#uploadedCheckPlaceholder') as HTMLElement | null;
    if (clonedImage && sourceImage) {
      const optimizedSrc = this.compressImageForSnapshot(sourceImage) || sourceImage.getAttribute('src') || '';
      if (optimizedSrc && !options?.omitCheckImageFromHtml) {
        clonedImage.setAttribute('src', optimizedSrc);
        clonedImage.style.display = 'block';
        if (clonedPlaceholder) {
          clonedPlaceholder.style.display = 'none';
        }
      } else {
        clonedImage.removeAttribute('src');
        clonedImage.style.display = 'none';
        if (clonedPlaceholder) {
          clonedPlaceholder.style.display = optimizedSrc ? 'none' : 'block';
        }
      }
    }

    clonedHost.querySelector('.upload-check-header')?.remove();
    clonedHost.querySelector('#voidedCheckUpload')?.remove();
    clonedHost.querySelector('script')?.remove();
  }

  compressImageForSnapshot(img: HTMLImageElement, maxWidth = 480, maxHeight = 360, quality = 0.65): string | null {
    const doc = img.ownerDocument;
    if (!doc || !img.naturalWidth || !img.naturalHeight) {
      return null;
    }

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    const widthScale = maxWidth / width;
    const heightScale = maxHeight / height;
    const scale = Math.min(1, widthScale, heightScale);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    const canvas = doc.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(img, 0, 0, width, height);

    const maxBytes = 180000;
    let currentQuality = quality;
    try {
      let dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
      while (dataUrl.length > maxBytes && currentQuality > 0.35) {
        currentQuality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
      }
      return dataUrl.length <= maxBytes ? dataUrl : null;
    } catch {
      return null;
    }
  }

  applyReadOnlyToAgreementHost(host: HTMLElement): void {
    this.ownerFormViewModeService.applyReadOnlyForView(host);
  }

  clearIframeBeforeUnloadHandlers(iframeRef?: ElementRef<HTMLIFrameElement>): void {
    const iframeWindow = iframeRef?.nativeElement?.contentWindow ?? null;
    const iframeDocument = iframeRef?.nativeElement?.contentDocument ?? null;
    iframeDocument?.body?.removeEventListener('click', this.onEditHostClick);
    if (iframeWindow) {
      iframeWindow.onbeforeunload = null;
      iframeWindow.onunload = null;
    }
    const iframeDocWindow = iframeDocument?.defaultView ?? null;
    if (iframeDocWindow) {
      iframeDocWindow.onbeforeunload = null;
      iframeDocWindow.onunload = null;
    }
  }

  ensureEditableFieldStyles(editDoc: Document): void {
    this.ownerFormViewModeService.ensureEditModeStyles(editDoc);
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

    let liveHtml = this.buildLiveHtmlSnapshot(doc);
    if (!liveHtml.trim()) {
      this.liveExportHtml = '';
      this.liveExportStyles = '';
      return;
    }

    if (this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit' && this.directDepositCheckImageDataUrl) {
      liveHtml = this.attachDirectDepositCheckImageToHtml(liveHtml, this.directDepositCheckImageDataUrl);
    }

    this.liveExportHtml = liveHtml;
    this.liveExportStyles = this.collectDocumentStyles(doc) || this.previewIframeStyles;
    this.previewIframeHtml = this.liveExportHtml;
    this.previewIframeStyles = this.liveExportStyles;
  }

  captureLiveHtmlSnapshot(options?: { omitCheckImageFromHtml?: boolean }): string {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return '';
    }

    const sourceCheckImage = editHost.querySelector('#uploadedCheckImage') as HTMLImageElement | null;
    const savedCheckImageState = options?.omitCheckImageFromHtml && sourceCheckImage
      ? {
          src: sourceCheckImage.getAttribute('src'),
          display: sourceCheckImage.style.display,
          placeholderDisplay: (editHost.querySelector('#uploadedCheckPlaceholder') as HTMLElement | null)?.style.display || ''
        }
      : null;
    if (options?.omitCheckImageFromHtml && sourceCheckImage) {
      sourceCheckImage.removeAttribute('src');
      sourceCheckImage.style.display = 'none';
    }

    const controls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    controls.forEach((control, index) => {
      control.setAttribute('data-agreement-control-id', String(index));
    });

    let clonedRoot: HTMLElement;
    try {
      clonedRoot = editHost.cloneNode(true) as HTMLElement;
    } finally {
      if (savedCheckImageState && sourceCheckImage) {
        if (savedCheckImageState.src) {
          sourceCheckImage.setAttribute('src', savedCheckImageState.src);
        }
        sourceCheckImage.style.display = savedCheckImageState.display || 'block';
        const placeholder = editHost.querySelector('#uploadedCheckPlaceholder') as HTMLElement | null;
        if (placeholder) {
          placeholder.style.display = savedCheckImageState.placeholderDisplay || 'none';
        }
      }
    }
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
    if (this.resolveTemplateTypeForLookup(this.templateAssetPath) === 'directDeposit') {
      this.syncFillableRegionsForSnapshot(editHost, clonedRoot);
      this.finalizeDirectDepositViewSnapshot(editHost, clonedRoot, options);
    }
    this.applyReadOnlyToAgreementHost(clonedRoot);
    const bodyContent = clonedRoot.innerHTML;
    const templateStyles = this.getViewTemplateStyles(editDoc);
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', templateStyles);
  }

  /** Template CSS for view/export; excludes runtime edit-only style blocks injected into the iframe. */
  private getViewTemplateStyles(editDoc?: Document | null): string {
    if (editDoc) {
      const collected = this.collectTemplateDocumentStyles(editDoc);
      if (collected.trim()) {
        return collected;
      }
    }
    return (this.editorStyles || this.previewIframeStyles || '').trim();
  }

  private ensureHtmlHasTemplateStyles(html: string, styleSourceHtml: string): string {
    const draftStyles = this.documentHtmlService.processHtml(html, false).extractedStyles.trim();
    if (draftStyles) {
      return html;
    }
    const templateStyles = this.documentHtmlService.processHtml(styleSourceHtml, false).extractedStyles.trim();
    if (!templateStyles) {
      return html;
    }
    const bodyContent = this.documentHtmlService.extractBodyContent(html);
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', templateStyles);
  }

  private collectTemplateDocumentStyles(doc: Document): string {
    const styleTags = Array.from(doc.querySelectorAll('style'));
    return styleTags
      .filter(tag => !this.ownerFormViewModeService.isRuntimeStyleId(tag.id || ''))
      .map(tag => tag.textContent || '')
      .filter(styleText => styleText.trim().length > 0)
      .join('\n\n');
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
    marker.textContent = isChecked ? '☒' : '☐';
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

  getPreviewStylesForView(): string {
    const viewModeStyles = !this.isEditMode
      ? this.ownerFormViewModeService.getViewModeStylesCss({ isDirectDeposit: this.isDirectDepositDocument() })
      : '';
    return [this.previewIframeStyles, viewModeStyles].filter(style => String(style || '').trim()).join('\n\n');
  }

  refreshPreviewSafeHtml(): void {
    const previewHtmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(this.previewIframeHtml, this.getPreviewStylesForView());
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(previewHtmlWithStyles);
  }

  loadAgreementTemplate(includeTemplate: boolean, assetPath: string, templateHtml?: string | null): Observable<string> {
    if (!includeTemplate) {
      return of('');
    }
    // Explicit template (e.g. dynamic state forms) always wins.
    if (String(templateHtml || '').trim()) {
      return of(String(templateHtml));
    }
    const primaryPath = String(assetPath || '').trim() || 'assets/owner-agreement.html';
    // Local/dev: pull the template straight from the local asset for fast iteration; the DB
    // template (seeded copy + per-property overrides) is used in staging/production.
    if (this.debuggingHtml) {
      return this.http.get(primaryPath, { responseType: 'text' }).pipe(take(1));
    }
    const templateType = this.resolveTemplateTypeForLookup(primaryPath);
    return this.ownersService.getTemplateHtmlByContext(this.token, this.propertyId, templateType).pipe(take(1));
  }

  resolveTemplateTypeForLookup(assetPath: string): string {
    const normalizedPath = String(assetPath || '').trim().toLowerCase();
    if (normalizedPath.includes('direct-deposit')) {
      return 'directDeposit';
    }
    return 'ownerAgreement';
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
  //#endregion

  //#region DocuSign Methods
  getDocuSignSignerRolesHtmlSource(): string {
    return String(this.docuSignSignerTemplateHtml || this.templateHtml || '').trim();
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
    const subject = propertyCode
      ? `${this.documentDisplayName} - ${propertyCode}`
      : this.documentDisplayName;

    const roles = this.ownerDocuSignSignerService.parseSignerRolesFromHtml(
      this.getDocuSignSignerRolesHtmlSource()
    );
    const signers = await this.ownerDocuSignSignersDialogService.promptForSigners({
      formTitle: this.documentDisplayName,
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
      fileName: this.getDocumentFileName(this.documentFileSuffix),
      errorMessage: `Error sending ${this.documentDisplayName.toLowerCase()} for signature. Please try again.`
    });
  }
  //#endregion

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
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning(`${this.documentDisplayName} preview is not ready to download.`);
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
        this.toastr.error(`Unable to download ${this.documentDisplayName.toLowerCase()}.`, CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Get Methods
  getAgreementStartDate(): string {
    const availableFrom = String(this.selectedProperty?.availableFrom || '').trim();
    if (!availableFrom) {
      return '';
    }
    return this.formatterService.formatDateStringLong(availableFrom) || '';
  }

  getDocumentFileName(label: string): string {
    return this.utilityService.generateDocumentFileName('lease', this.selectedProperty?.propertyCode || undefined, label);
  }

  getDraftStorageKey(): string {
    const organizationId = String(this.organizationId || this.authService.getUser()?.organizationId || '').trim();
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
    return String(this.organization?.name || this.commonService.getOrganizationValue()?.name || '').trim();
  }

  getOfficeName(): string {
    return String(this.getEffectiveOffice()?.name || '').trim();
  }

  getCompanyState(): string {
    const stateCode = String(this.getEffectiveOffice()?.state || this.organization?.state || this.commonService.getOrganizationValue()?.state || '').trim();
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
    return String(this.getEffectiveOffice()?.city || this.organization?.city || this.commonService.getOrganizationValue()?.city || '').trim();
  }

  getCompanyAddress(): string {
    return [this.getCompanyAddress1(), this.getCompanyAddress2()].filter(part => part.length > 0).join(', ');
  }

  getCompanyAddress1(): string {
    const address1 = String(this.getEffectiveOffice()?.address1 || this.organization?.address1 || this.commonService.getOrganizationValue()?.address1 || '').trim();
    const suiteRaw = String(this.getEffectiveOffice()?.suite || this.organization?.suite || this.commonService.getOrganizationValue()?.suite || '').trim();
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
    const zip = String(this.getEffectiveOffice()?.zip || this.organization?.zip || this.commonService.getOrganizationValue()?.zip || '').trim();
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
    const offices = this.ownersService.getOfficeListSnapshotByContext() || [];
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

  getAccountingOfficeLogoDataUrl(): string {
    const officeId = Number(this.selectedProperty?.officeId || this.selectedOffice?.officeId || this.officeId || 0);
    if (!Number.isFinite(officeId) || officeId <= 0) {
      return '';
    }
    const accountingOffice = this.accountingOffices.find(accounting => accounting.officeId === officeId);
    return this.getFileDetailsDataUrl(accountingOffice?.fileDetails);
  }

  getFileDetailsDataUrl(fileDetails: { dataUrl?: string | null; file?: string | null; contentType?: string | null } | null | undefined): string {
    const dataUrl = String(fileDetails?.dataUrl || '').trim();
    if (dataUrl) {
      return dataUrl;
    }

    const file = String(fileDetails?.file || '').trim();
    if (!file) {
      return '';
    }

    if (file.startsWith('data:')) {
      return file;
    }

    const contentType = String(fileDetails?.contentType || 'image/png').trim() || 'image/png';
    return `data:${contentType};base64,${file}`;
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
      const leadOwnerAddress = this.buildAddressLines(
        this.leadOwner?.address || '',
        '',
        this.leadOwner?.city || '',
        this.leadOwner?.state || '',
        this.leadOwner?.zip || ''
      );
      if (String(leadOwnerAddress.address1 || '').trim() || String(leadOwnerAddress.address2 || '').trim()) {
        return leadOwnerAddress;
      }
      const fallbackLocation = String(this.leadOwner?.locationOfProperty || '').trim();
      if (fallbackLocation) {
        return { address1: fallbackLocation, address2: '' };
      }
      return { address1: '', address2: '' };
    }
    return this.buildAddressLines(
      this.getPropertyAddressLine1(this.selectedProperty),
      this.selectedProperty.address2,
      this.selectedProperty.city,
      this.selectedProperty.state,
      this.selectedProperty.zip
    );
  }

  getPropertyAddressLine1(property: PropertyResponse | null | undefined): string {
    if (!property) {
      return '';
    }
    const address1 = String(property.address1 ?? '').trim();
    const suite = String(property.suite ?? '')
      .trim()
      .replace(/^#+\s*/, '');
    const streetParts: string[] = [];
    if (address1) {
      streetParts.push(address1);
    }
    if (suite) {
      streetParts.push(`#${suite}`);
    }
    return streetParts.join(' ');
  }

  getPropertyAddressFieldTokens(): { address1: string; city: string; state: string; zip: string } {
    if (this.selectedProperty) {
      return {
        address1: this.getPropertyAddressLine1(this.selectedProperty),
        city: String(this.selectedProperty.city || '').trim(),
        state: String(this.selectedProperty.state || '').trim(),
        zip: String(this.selectedProperty.zip || '').trim()
      };
    }
    return {
      address1: String(this.leadOwner?.address || '').trim(),
      city: String(this.leadOwner?.city || '').trim(),
      state: String(this.leadOwner?.state || '').trim(),
      zip: String(this.leadOwner?.zip || '').trim()
    };
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
    const organizationName = String(this.organization?.name || this.commonService.getOrganizationValue()?.name || '').trim();
    const officeName = String(this.getEffectiveOffice()?.name || '').trim();
    return `${organizationName} ${officeName}`.trim();
  }

  getOrganizationWebsite(): string {
    return String(this.getEffectiveOffice()?.website || this.organization?.website || this.commonService.getOrganizationValue()?.website || '').trim();
  }

  getOwnerSplit(): string {
    return this.formatAgreementPercentToken(
      this.propertyAgreement?.revenueSplitOwner,
      this.getEffectiveOffice()?.defaultRevenueSplitOwner
    );
  }

  getCompanySplit(): string {
    return this.formatAgreementPercentToken(
      this.propertyAgreement?.revenueSplitOffice,
      this.getEffectiveOffice()?.defaultRevenueSplitOffice
    );
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
    return this.formatAgreementCurrency(this.propertyAgreement?.workingCapitalBalance);
  }

  getOnlineFee(): string {
    return this.formatAgreementCurrency(this.getEffectiveOffice()?.defaultOnlineFee);
  }

  getOfflineFee(): string {
    return this.formatAgreementCurrency(this.getEffectiveOffice()?.defaultOfflineFee);
  }

  getOnlineCleanFee(): string {
    return this.formatAgreementCurrency(this.getEffectiveOffice()?.defaultOnlineClean);
  }

  getMonthlyRent(): string {
    const monthlyRate = Number(this.selectedProperty?.monthlyRate);
    if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
      return '';
    }
    const rangeLow = Math.max(0, monthlyRate - 500);
    const lowFormatted = this.formatAgreementCurrencyRaw(rangeLow);
    const highFormatted = this.formatAgreementCurrencyRaw(monthlyRate);
    if (!lowFormatted || !highFormatted) {
      return '';
    }
    return `${lowFormatted} - ${highFormatted}`;
  }

  /** Plain currency text for tokens inside an existing inline-underline-fill span (property agreement flat rate). */
  getPropertyAgreementFlatRateAmountText(): string {
    const value = this.propertyAgreement?.flatRateAmount;
    if (value == null) {
      return '';
    }
    const parsed = Number(String(value).replace(/[$,]/g, ''));
    if (!Number.isFinite(parsed) || parsed === 0) {
      return '';
    }
    return this.formatAgreementCurrencyRaw(parsed);
  }

  getEmptyUnderlineSpan(): string {
    return '<span class="inline-underline-fill owner-editable-field"></span>';
  }

  getPopulatedUnderlineSpan(value: string): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return this.getEmptyUnderlineSpan();
    }
    return `<span class="inline-underline-fill owner-editable-field">&nbsp;&nbsp;${trimmed}&nbsp;&nbsp;</span>`;
  }

  /** Inner text for spans that already exist in the template (e.g. {{monthlyRent}}). */
  getInlineFillTokenValue(value: string | null | undefined): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return '';
    }
    return `&nbsp;&nbsp;${trimmed}&nbsp;&nbsp;`;
  }
  //#endregion

  //#region Utility Methods
  formatAgreementPercentPlain(value: number | string | null | undefined): string {
    if (value == null || value === '') {
      return '';
    }
    const n = Number(String(value).replace(/%\s*$/, ''));
    if (!Number.isFinite(n) || n === 0) {
      return '';
    }
    return `${n}%`;
  }

  formatAgreementPercentToken(
    agreementValue: number | string | null | undefined,
    officeDefaultValue: number | string | null | undefined
  ): string {
    const plain = this.formatAgreementPercentPlain(agreementValue) || this.formatAgreementPercentPlain(officeDefaultValue);
    return plain ? this.getPopulatedUnderlineSpan(plain) : this.getEmptyUnderlineSpan();
  }

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

  ngOnDestroy(): void {
    this.revokeDirectDepositCheckImageBlobUrl();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
