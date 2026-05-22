import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, Output, EventEmitter, SimpleChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { Subject, catchError, of, switchMap, take, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { DynamicFormDraftService } from '../services/dynamic-form-draft.service';
import { FormTokenProviderRegistryService } from '../../shared/forms/services/form-token-provider-registry.service';
import { OWNER_FORM_TOKEN_PROVIDER } from '../services/owner-form-token-provider.service';

@Component({
  standalone: true,
  selector: 'app-dynamic-form-editor',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  providers: [OWNER_FORM_TOKEN_PROVIDER, FormTokenProviderRegistryService],
  templateUrl: './dynamic-form-editor.component.html',
  styleUrl: './dynamic-form-editor.component.scss'
})
export class DynamicFormEditorComponent implements OnInit, OnChanges, OnDestroy {
  @Input() formName = '';
  @Input() formKey = '';
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() templateHtml: string | null = null;
  @Input() templateAssetPath: string | null = null;
  @Input() tokenContextType = 'owner';
  @Output() viewRequested = new EventEmitter<string>();
  @ViewChild('editSurface') editSurface?: ElementRef<HTMLElement>;

  isLoading = false;
  hasDraft = false;
  editableHtml: SafeHtml | null = null;
  baseTemplateHtml = '';
  editorStyles = '';

  destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private authService: AuthService,
    private toastr: ToastrService,
    private documentHtmlService: DocumentHtmlService,
    private dynamicFormDraftService: DynamicFormDraftService,
    private formTokenProviderRegistryService: FormTokenProviderRegistryService
  ) {}

  //#region Dynamic-Form-Editor
  ngOnInit(): void {
    this.loadEditorHtml();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['templateHtml'] ||
      changes['templateAssetPath'] ||
      changes['formKey'] ||
      changes['ownerLeadId'] ||
      changes['officeId'] ||
      changes['propertyId'] ||
      changes['tokenContextType']
    ) {
      this.loadEditorHtml();
    }
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

  //#endregion

  //#region Template Loading
  loadEditorHtml(): void {
    this.isLoading = true;
    this.loadTemplateHtml().pipe(
      switchMap(templateHtml => this.formTokenProviderRegistryService.applyTokens(this.tokenContextType, templateHtml, {
        formName: this.formName,
        formKey: this.formKey,
        ownerLeadId: this.ownerLeadId,
        officeId: this.officeId,
        propertyId: this.propertyId,
        templateAssetPath: this.templateAssetPath
      })),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: replacedHtml => {
        this.baseTemplateHtml = replacedHtml || '';
        this.applyInitialEditorHtml();
        this.isLoading = false;
      },
      error: () => {
        this.baseTemplateHtml = '';
        this.applyInitialEditorHtml();
        this.isLoading = false;
      }
    });
  }

  loadTemplateHtml() {
    const inlineTemplate = String(this.templateHtml || '').trim();
    if (inlineTemplate) {
      return of(inlineTemplate);
    }
    const assetPath = String(this.templateAssetPath || '').trim();
    if (!assetPath) {
      return of('');
    }
    return this.http.get(assetPath, { responseType: 'text' }).pipe(
      take(1),
      catchError(() => of(''))
    );
  }

  applyInitialEditorHtml(): void {
    const draftHtml = this.dynamicFormDraftService.loadDraft(this.getDraftStorageKey());
    this.hasDraft = !!draftHtml;
    const htmlToRender = draftHtml || this.baseTemplateHtml || '';
    this.setEditorHtml(htmlToRender);
  }

  setEditorHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html || '', true);
    this.editorStyles = result.extractedStyles || '';
    const bodyContent = this.documentHtmlService.extractBodyContent(result.processedHtml || '');
    this.editableHtml = this.sanitizer.bypassSecurityTrustHtml(`<style>${this.editorStyles}</style>${bodyContent}`);
    setTimeout(() => this.ensureEditorControlsInteractive());
  }
  //#endregion

  //#region Editor Interaction Methods
  ensureEditorControlsInteractive(): void {
    const editHost = this.editSurface?.nativeElement;
    if (!editHost) {
      return;
    }
    editHost.setAttribute('contenteditable', 'false');
    const staticEditableNodes = Array.from(editHost.querySelectorAll('[contenteditable]')) as HTMLElement[];
    staticEditableNodes.forEach(node => {
      const tagName = node.tagName.toLowerCase();
      if (tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select' && tagName !== 'option') {
        node.setAttribute('contenteditable', 'false');
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
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.readOnly = false;
        if (control.hasAttribute('readonly')) {
          control.removeAttribute('readonly');
        }
      }
    });
    this.wrapStaticChoiceMarkers(editHost);
  }

  onEditSurfaceClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    const marker = target.closest('[data-choice-marker="true"]') as HTMLElement | null;
    if (!marker) {
      return;
    }
    marker.textContent = marker.textContent === '☑' ? '☐' : '☑';
    event.preventDefault();
    event.stopPropagation();
  }
  //#endregion

  //#region Marker Methods
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
        /[☐☑]/.test(textNode.textContent || '')
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
        if (char === '☐' || char === '☑') {
          if (buffer) {
            fragment.appendChild(doc.createTextNode(buffer));
            buffer = '';
          }
          const marker = doc.createElement('span');
          marker.setAttribute('data-choice-marker', 'true');
          marker.setAttribute('contenteditable', 'false');
          marker.className = 'dynamic-form-choice-marker';
          marker.textContent = char;
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
    const editHost = this.editSurface?.nativeElement;
    if (!editHost) {
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
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', this.editorStyles || '');
  }
  //#endregion

  //#region Utility Methods
  getDraftStorageKey(): string {
    const organizationId = String(this.authService.getUser()?.organizationId || '').trim();
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
