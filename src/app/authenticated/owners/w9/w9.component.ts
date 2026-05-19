import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SecurityContext, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, filter, Observable, of, Subject, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailService } from '../../email/services/email.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { CommonService } from '../../../services/common.service';

@Component({
  standalone: true,
  selector: 'app-w9',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './w9.component.html',
  styleUrl: './w9.component.scss'
})
export class W9Component extends BaseDocumentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() safeHtml: string | SafeHtml | null = null;
  @Input() iframeKey = 0;
  @ViewChild('editSurface') editSurface?: ElementRef<HTMLElement>;
  @ViewChild('previewFrame') previewFrame?: ElementRef<HTMLIFrameElement>;

  form: FormGroup = this.buildForm();
  isPageReady = false;
  isSaving = false;
  isDownloading = false;
  isViewMode = false;
  previewIframeHtml = '';
  previewIframeStyles = '';
  editableHtml: SafeHtml | null = null;
  viewedHtml: SafeHtml | null = null;
  organizationId = '';
  organization: OrganizationResponse | null = null;
  selectedOffice: OfficeResponse | null = null;
  selectedProperty: PropertyResponse | null = null;
  ownerContact: ContactResponse | null = null;
  previewIframeSrcDoc = '';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organization', 'offices', 'contacts', 'property', 'preview']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private commonService: CommonService,
    private officeService: OfficeService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private utilityService: UtilityService,
    documentHtmlService: DocumentHtmlService,
    private sanitizer: DomSanitizer,
    documentService: DocumentService,
    documentExportService: DocumentExportService,
    public override toastr: ToastrService,
    emailService: EmailService,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
  }

  //#region W9
  ngOnInit(): void {
    if (this.isEmbeddedPreviewMode()) {
      this.isPageReady = true;
      this.refreshEmbeddedPreview();
      return;
    }

    this.organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadOrganization();
    this.loadOffices();
    this.loadContacts();
    this.loadProperty();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['safeHtml'] || changes['iframeKey']) {
      this.refreshEmbeddedPreview();
    }
    if (this.isEmbeddedPreviewMode()) {
      return;
    }

    const officeIdChanged = changes['officeId'] && changes['officeId'].previousValue !== changes['officeId'].currentValue;
    const propertyIdChanged = changes['propertyId'] && changes['propertyId'].previousValue !== changes['propertyId'].currentValue;
    if (officeIdChanged) {
      this.syncSelectedOfficeFromLoadedOffices();
    }
    if (propertyIdChanged || officeIdChanged) {
      this.itemsToLoad$.next(new Set(['property', 'preview']));
      this.loadProperty();
    }
  }

  onIncludeChange(): void {
    if (this.isEmbeddedPreviewMode()) {
      return;
    }
    this.generatePreview();
  }

  getPreviewDocument(): Document | null {
    return this.previewFrame?.nativeElement?.contentDocument || null;
  }

  onView(): void {
    this.captureLiveSnapshotForExport();
    const bodyContent = this.documentHtmlService.extractBodyContent(this.previewIframeHtml);
    this.viewedHtml = this.sanitizer.bypassSecurityTrustHtml(`<style>${this.previewIframeStyles || ''}</style>${bodyContent || ''}`);
    this.isViewMode = true;
  }

  onEdit(): void {
    this.isViewMode = false;
  }

  override onPrint(): void {
    this.captureLiveSnapshotForExport();
    if (!this.previewIframeHtml) {
      this.toastr.warning('W-9 preview is not ready to print.');
      return;
    }
    const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(
      this.previewIframeHtml,
      this.previewIframeStyles,
      { fontSize: '10pt', includeLeaseStyles: true }
    );
    this.documentExportService.printHTML(htmlWithStyles);
  }

  override async onDownload(): Promise<void> {
    this.captureLiveSnapshotForExport();
    const downloadConfig: DownloadConfig = {
      fileName: this.getDocumentFileName(),
      documentType: DocumentType.OwnerAgreement,
      noPreviewMessage: 'W-9 preview is not ready to download.',
      noSelectionMessage: 'Organization or Office not available.'
    };
    await super.onDownload(downloadConfig);
  }

  onSave(): void {
    this.captureLiveSnapshotForExport();
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning('W-9 preview is not ready to save.');
      return;
    }
    this.isSaving = true;
    const dto = this.buildGenerateDto();
    this.documentService.generate(dto).pipe(take(1)).subscribe({
      next: () => {
        this.isSaving = false;
        this.toastr.success('W-9 form saved successfully', CommonMessage.Success);
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error('Unable to save W-9 form.', CommonMessage.Error);
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

    const emailConfig: EmailConfig = {
      subject: this.selectedProperty?.propertyCode ? `W-9 Form - ${this.selectedProperty.propertyCode}` : 'W-9 Form',
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.OwnerAgreement,
      emailType: EmailType.Other,
      plainTextContent: 'Please find the attached W-9 form.',
      htmlContent: '<p>Please find the attached W-9 form.</p>',
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

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      includeDocument: new FormControl(true)
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOrganization(): void {
    this.commonService.loadOrganization();
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), takeUntil(this.destroy$)).subscribe({
      next: response => {
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
      this.generatePreviewIfReady();
      return;
    }
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: property => {
        this.selectedProperty = property;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.selectedProperty = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.generatePreviewIfReady();
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
    this.loadTemplate(includeDocument, 'assets/w9.html').pipe(takeUntil(this.destroy$)).subscribe({
      next: html => {
        this.processAndSetHtml(html);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
      },
      error: () => {
        this.previewIframeHtml = '';
        this.editableHtml = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
      }
    });
  }

  loadTemplate(includeTemplate: boolean, assetPath: string): Observable<string> {
    if (!includeTemplate) {
      return of('');
    }
    return this.http.get(assetPath, { responseType: 'text' }).pipe(take(1));
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    const bodyContent = this.documentHtmlService.extractBodyContent(this.previewIframeHtml);
    this.editableHtml = this.sanitizer.bypassSecurityTrustHtml(`<style>${this.previewIframeStyles || ''}</style>${bodyContent || ''}`);
    this.viewedHtml = this.editableHtml;
    this.isViewMode = false;
  }
  //#endregion

  //#region Export Capture Methods
  captureLiveSnapshotForExport(): void {
    if (this.isEmbeddedPreviewMode()) {
      return;
    }

    const editHost = this.editSurface?.nativeElement;
    if (!editHost) {
      return;
    }

    const sourceControls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    sourceControls.forEach((control, index) => {
      control.setAttribute('data-export-control-id', String(index));
    });

    const bodyClone = editHost.cloneNode(true) as HTMLElement;
    sourceControls.forEach(sourceControl => {
      const controlId = sourceControl.getAttribute('data-export-control-id');
      if (!controlId) {
        return;
      }

      const clonedControl = bodyClone.querySelector(`[data-export-control-id="${controlId}"]`) as
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
    Array.from(bodyClone.querySelectorAll('[data-export-control-id]')).forEach(control => {
      control.removeAttribute('data-export-control-id');
    });

    const bodyContent = bodyClone.innerHTML;
    this.previewIframeHtml = this.documentHtmlService.buildHtmlDocument(bodyContent, '', this.previewIframeStyles);
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
  //#endregion

  //#region Base Document + Utility
  isEmbeddedPreviewMode(): boolean {
    return this.safeHtml !== null && this.safeHtml !== undefined;
  }

  refreshEmbeddedPreview(): void {
    if (!this.isEmbeddedPreviewMode()) {
      this.previewIframeSrcDoc = '';
      return;
    }
    if (typeof this.safeHtml === 'string') {
      this.previewIframeSrcDoc = this.safeHtml;
    } else {
      this.previewIframeSrcDoc = this.sanitizer.sanitize(SecurityContext.HTML, this.safeHtml) || '';
    }
    this.isPageReady = true;
  }

  buildGenerateDto(): GenerateDocumentFromHtmlDto {
    return {
      htmlContent: this.documentHtmlService.getPdfHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles, { fontSize: '10pt', includeLeaseStyles: true }),
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
      printStyleOptions: { fontSize: '10pt', includeLeaseStyles: true }
    };
  }

  protected override setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  getDocumentFileName(): string {
    return this.utilityService.generateDocumentFileName('lease', this.selectedProperty?.propertyCode || undefined, 'W9Form');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
