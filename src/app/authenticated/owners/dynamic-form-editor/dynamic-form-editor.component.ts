import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, Output, EventEmitter, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { Observable, of, Subject, take } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormTokenProviderInputs } from '../../shared/forms/services/form-token-provider';
import { OwnerAuthorization } from '../models/owner-authorization.model';
import { DynamicFormDraftService } from '../services/dynamic-form-draft.service';
import { OwnerAgreementContext } from '../services/owners.service';
import { OwnerFormTokenProviderService } from '../services/owner-form-token-provider.service';
import { OwnerFormViewModeService } from '../services/owner-form-view-mode.service';

@Component({
  standalone: true,
  selector: 'app-dynamic-form-editor',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './dynamic-form-editor.component.html',
  styleUrl: './dynamic-form-editor.component.scss'
})
export class DynamicFormEditorComponent implements OnInit, OnChanges, OnDestroy {


  @Input() formName = '';
  @Input() formKey = '';
  @Input() token: string | null = null;
  @Input() ownerAuthorization: OwnerAuthorization = OwnerAuthorization.UnauthorizedOwner;
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() templateHtml: string | null = null;
  @Input() templateAssetPath: string | null = null;
  @Input() restoreProcessedHtml: string | null = null;
  @Input() restoreProcessedStyles: string | null = null;
  @Input() tokenContextType = 'owner';
  @Input() reloadVersion = 0;
  @Input() sharedContext$: Observable<OwnerAgreementContext | null> | null = null;
  @Output() viewRequested = new EventEmitter<string>();
  private sanitizer = inject(DomSanitizer);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private documentHtmlService = inject(DocumentHtmlService);
  private dynamicFormDraftService = inject(DynamicFormDraftService);
  private ownerFormTokenProviderService = inject(OwnerFormTokenProviderService);
  private ownerFormViewModeService = inject(OwnerFormViewModeService);
  private changeDetectorRef = inject(ChangeDetectorRef);
  @ViewChild('editIframe') editIframe?: ElementRef<HTMLIFrameElement>;

  isLoading = false;
  hasDraft = false;
  editableHtml: SafeHtml | null = null;
  baseTemplateHtml = '';
  templateStyles = '';
  iframeKey = 0;
  private ownerAgreementContext: OwnerAgreementContext | null = null;

  destroy$ = new Subject<void>();

  //#region Dynamic-Form-Editor
  ngOnInit(): void {
    if (this.sharedContext$) {
      this.loadFromSharedContext(this.sharedContext$);
      return;
    }
    this.loadEditorHtml();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const isInitialRender = Object.values(changes).every(change => change.firstChange);
    if (changes['sharedContext$'] && this.sharedContext$ && !isInitialRender) {
      this.loadFromSharedContext(this.sharedContext$);
      return;
    }
    if (isInitialRender) {
      return;
    }
    if (
      changes['templateHtml'] ||
      changes['templateAssetPath'] ||
      changes['restoreProcessedHtml'] ||
      changes['restoreProcessedStyles'] ||
      changes['formKey'] ||
      changes['ownerLeadId'] ||
      changes['officeId'] ||
      changes['propertyId'] ||
      changes['tokenContextType'] ||
      changes['reloadVersion']
    ) {
      this.loadEditorHtml();
    }
  }

  loadFromSharedContext(context$: Observable<OwnerAgreementContext | null>): void {
    context$.pipe(take(1)).subscribe(context => {
      this.ownerAgreementContext = context;
      this.loadEditorHtml();
    });
  }

  saveDraft(): void {
    const htmlSnapshot = this.captureLiveHtmlSnapshot();
    if (!htmlSnapshot) {
      this.toastr.warning('There is no form content to save.');
      return;
    }
    this.dynamicFormDraftService.saveDraft(this.getDraftStorageKey(), htmlSnapshot);
    this.hasDraft = true;
    this.toastr.success('Draft saved.');
  }

  resetForm(): void {
    this.dynamicFormDraftService.resetDraft(this.getDraftStorageKey());
    this.hasDraft = false;
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
    this.hasDraft = true;
    this.viewRequested.emit(htmlSnapshot);
  }

  onEditIframeLoad(): void {
    this.ensureEditorControlsInteractive();
  }

  //#endregion

  //#region Template Loading
  loadEditorHtml(): void {
    const restoredHtml = String(this.restoreProcessedHtml || '').trim();
    const restoredStyles = String(this.restoreProcessedStyles || '').trim();
    if (restoredHtml && restoredStyles) {
      const templateHtml = String(this.templateHtml || '').trim();
      this.baseTemplateHtml = String(this.templateHtml || '').trim() || restoredHtml;
      this.setEditorHtmlFromProcessed(restoredHtml, restoredStyles);
      this.changeDetectorRef.markForCheck();
      return;
    }

    const templateHtml = String(this.templateHtml || '').trim();
    if (!templateHtml) {
      this.baseTemplateHtml = '';
      this.setEditorHtml('');
      this.changeDetectorRef.markForCheck();
      return;
    }

    if (!this.htmlNeedsTokenReplacement(templateHtml)) {
      this.isLoading = true;
      this.baseTemplateHtml = templateHtml;
      this.applyInitialEditorHtml();
      this.isLoading = false;
      this.changeDetectorRef.markForCheck();
      return;
    }

    this.isLoading = true;
    this.changeDetectorRef.markForCheck();
    this.applyTokensToTemplate(templateHtml).pipe(take(1)).subscribe({
      next: replacedHtml => {
        this.baseTemplateHtml = replacedHtml || '';
        this.applyInitialEditorHtml();
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      },
      error: () => {
        this.baseTemplateHtml = templateHtml;
        this.applyInitialEditorHtml();
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      }
    });
  }

getTokenProviderInputs(): FormTokenProviderInputs {
    return {
      formName: this.formName,
      formKey: this.formKey,
      ownerLeadId: this.ownerLeadId,
      officeId: this.officeId,
      propertyId: this.propertyId,
      templateAssetPath: this.templateAssetPath
    };
  }

applyTokensToTemplate(templateHtml: string): Observable<string> {
    const inputs = this.getTokenProviderInputs();
    if (this.ownerAgreementContext) {
      return of(this.ownerFormTokenProviderService.applyTokensFromOwnerAgreementContext(
        templateHtml,
        inputs,
        this.ownerAgreementContext
      ));
    }
    return this.ownerFormTokenProviderService.applyTokens(templateHtml, inputs);
  }

  applyInitialEditorHtml(): void {
    const templateHtml = String(this.templateHtml || '').trim();
    const draftHtml = this.dynamicFormDraftService.loadDraft(this.getDraftStorageKey());
    this.hasDraft = !!draftHtml;
    const htmlToRender = templateHtml && this.htmlNeedsTokenReplacement(templateHtml)
      ? (this.baseTemplateHtml || '')
      : (draftHtml || this.baseTemplateHtml || templateHtml || '');
    this.setEditorHtml(htmlToRender);
  }

htmlNeedsTokenReplacement(html: string): boolean {
    return /\{\{[^}]+\}\}/.test(String(html || ''));
  }

  setEditorHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html || '', true);
    const extractedStyles = String(result.extractedStyles || '').trim();
    this.templateStyles = extractedStyles
      || String(this.restoreProcessedStyles || '').trim()
      || this.templateStyles
      || '';
    this.setEditorHtmlFromProcessed(result.processedHtml || '', this.templateStyles);
  }

  setEditorHtmlFromProcessed(processedHtml: string, styles: string): void {
    const templateStyles = String(styles || '').trim();
    this.templateStyles = templateStyles;
    const editableHtmlDocument = this.documentHtmlService.buildHtmlDocument(
      this.documentHtmlService.extractBodyContent(processedHtml || ''),
      '',
      templateStyles
    );
    this.editableHtml = this.sanitizer.bypassSecurityTrustHtml(editableHtmlDocument);
    this.iframeKey++;
    setTimeout(() => this.ensureEditorControlsInteractive());
  }
  //#endregion

  //#region Editor Interaction Methods
  ensureEditorControlsInteractive(): void {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return;
    }
    const normalizedTemplatePath = String(this.templateAssetPath || '').trim().toLowerCase();
    const normalizedFormName = String(this.formName || '').trim().toLowerCase();
    const isBrokerageEditor = this.ownerFormViewModeService.isBrokerageFormContext(
      this.formName,
      this.templateAssetPath,
      this.templateHtml
    );
    const isW9Editor = normalizedTemplatePath.includes('w9') || normalizedFormName.includes('w9');
    this.ownerFormViewModeService.ensureEditModeStyles(editDoc);
    editHost.classList.toggle('w9-editor-mode', isW9Editor);
    editHost.setAttribute('contenteditable', 'false');
    const staticEditableNodes = Array.from(editHost.querySelectorAll('[contenteditable]')) as HTMLElement[];
    staticEditableNodes.forEach(node => node.setAttribute('contenteditable', 'false'));
    editHost.querySelectorAll('.owner-editable-field').forEach(node => {
      const element = node as HTMLElement;
      if (this.ownerFormViewModeService.shouldTreatAsStaticFormRegion(element, editDoc, { isBrokerage: isBrokerageEditor })) {
        element.classList.remove('owner-editable-field');
        element.setAttribute('contenteditable', 'false');
        this.ownerFormViewModeService.clearEditableFieldAppearance(element);
      }
    });

    const fillableRegions = Array.from(
      editHost.querySelectorAll(
        [
          '.line',
          '.inline-underline-fill',
          '.signature-line',
          '.signature-entry',
          '.line-tail',
          '.blank-line',
          '.blank-line-short',
          '.line-input',
          '.sig-input',
          '.sig-line',
          '.signature-edit-line',
          '.signature-date-line',
          '.printed-line',
          '.date-line',
          '.form-line',
          '.field-line',
          '.fill-line',
          '.fill-field',
          '.address-single',
          '.address-values > div',
          '[data-fillable="true"]',
          '[class*="underline"]'
        ].join(', ')
      )
    ) as HTMLElement[];

    const borderBottomCandidates = isBrokerageEditor
      ? []
      : Array.from(editHost.querySelectorAll('span, div')) as HTMLElement[];
    borderBottomCandidates.forEach(candidate => {
      if (candidate.classList.contains('checkbox')) {
        return;
      }
      if (candidate.childElementCount > 0) {
        return;
      }
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
      if (region.classList.contains('checkbox') || region.matches('input[type="checkbox"], input[type="radio"]')) {
        return;
      }
      if (region.querySelector('input, textarea, select, button')) {
        return;
      }
      if (this.ownerFormViewModeService.shouldTreatAsStaticFormRegion(region, editDoc, { isBrokerage: isBrokerageEditor })) {
        return;
      }
      const nestedFillTarget = region.querySelector(
        '.line, .inline-underline-fill, .signature-line, .signature-entry, .form-line, .field-line, .fill-line, .fill-field, [data-fillable="true"]'
      );
      if (nestedFillTarget && nestedFillTarget !== region) {
        return;
      }
      if (region.children.length > 3) {
        return;
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
    this.wrapStaticChoiceMarkers(editHost);
    this.initializeStaticCheckboxMarkers(editHost);
    if (!editHost.dataset['dynamicFormClickBound']) {
      editHost.addEventListener('click', this.onEditHostClick);
      editHost.dataset['dynamicFormClickBound'] = 'true';
    }
  }

  onEditHostClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const staticCheckbox = target.closest('span.checkbox') as HTMLSpanElement | null;
    if (staticCheckbox) {
      const isChecked = staticCheckbox.getAttribute('data-checked') === 'true';
      staticCheckbox.setAttribute('data-checked', isChecked ? 'false' : 'true');
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const marker = target.closest('[data-choice-marker="true"]') as HTMLElement | null;
    if (!marker) {
      return;
    }
    marker.textContent = marker.textContent === '☒' ? '☐' : '☒';
    event.preventDefault();
    event.stopPropagation();
  };
  //#endregion

  //#region Marker Methods
  initializeStaticCheckboxMarkers(editHost: HTMLElement): void {
    const markers = Array.from(editHost.querySelectorAll('span.checkbox')) as HTMLSpanElement[];
    markers.forEach(marker => {
      marker.setAttribute('contenteditable', 'false');
      marker.style.cursor = 'pointer';
      marker.style.userSelect = 'none';
      const value = String(marker.textContent || '').trim();
      const isChecked = value === 'x' || value === 'X' || value === '✓' || value === '✔' || value === '☑' || value === '●';
      marker.setAttribute('data-checked', isChecked ? 'true' : 'false');
      marker.textContent = '';
    });
  }

  wrapStaticChoiceMarkers(editHost: HTMLElement): void {
    const doc = editHost.ownerDocument;
    const walker = doc.createTreeWalker(editHost, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      const textNode = currentNode as Text;
      const parentElement = textNode.parentElement;
      if (
        parentElement &&
        parentElement.tagName.toLowerCase() !== 'script' &&
        parentElement.tagName.toLowerCase() !== 'style' &&
        !parentElement.closest('[data-choice-marker="true"]') &&
        /[☐☑☒]/.test(textNode.textContent || '')
      ) {
        textNodes.push(textNode);
      }
      currentNode = walker.nextNode();
    }

    textNodes.forEach(textNode => {
      const value = textNode.textContent || '';
      if (!value) {
        return;
      }
      const fragment = doc.createDocumentFragment();
      let buffer = '';
      for (const char of value) {
        if (char === '☐' || char === '☑' || char === '☒') {
          if (buffer) {
            fragment.appendChild(doc.createTextNode(buffer));
            buffer = '';
          }
          const marker = doc.createElement('span');
          marker.setAttribute('data-choice-marker', 'true');
          marker.setAttribute('contenteditable', 'false');
          marker.className = 'dynamic-form-choice-marker';
          marker.textContent = char === '☐' ? '☐' : '☒';
          fragment.appendChild(marker);
          continue;
        }
        buffer += char;
      }
      if (buffer) {
        fragment.appendChild(doc.createTextNode(buffer));
      }
      textNode.replaceWith(fragment);
    });
  }
  //#endregion

  //#region Snapshot Methods
  captureLiveHtmlSnapshot(): string {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return '';
    }

    const controls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    controls.forEach((control, index) => {
      control.setAttribute('data-dynamic-control-id', String(index));
    });

    const clonedRoot = editHost.cloneNode(true) as HTMLElement;
    controls.forEach(sourceControl => {
      const controlId = sourceControl.getAttribute('data-dynamic-control-id');
      if (!controlId) {
        return;
      }
      const clonedControl = clonedRoot.querySelector(`[data-dynamic-control-id="${controlId}"]`) as
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

    controls.forEach(control => control.removeAttribute('data-dynamic-control-id'));
    Array.from(clonedRoot.querySelectorAll('[data-dynamic-control-id]')).forEach(control => control.removeAttribute('data-dynamic-control-id'));

    const bodyContent = clonedRoot.innerHTML;
    const templateStyles = this.collectTemplateDocumentStyles(editDoc);
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', templateStyles);
  }

collectTemplateDocumentStyles(doc: Document): string {
    const styleTags = Array.from(doc.querySelectorAll('style'));
    return styleTags
      .filter(tag => !this.ownerFormViewModeService.isRuntimeStyleId(tag.id || ''))
      .map(tag => tag.textContent || '')
      .filter(styleText => styleText.trim().length > 0)
      .join('\n\n');
  }
  //#endregion

  //#region Utility Methods
  getDraftStorageKey(): string {
    const organizationId = String(
      this.ownerAgreementContext?.organization?.organizationId
      || this.authService.getUser()?.organizationId
      || ''
    ).trim();
    return this.dynamicFormDraftService.buildDraftKey(
      organizationId,
      this.ownerLeadId,
      this.officeId,
      this.propertyId,
      this.formKey
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
