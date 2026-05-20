import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, Output, EventEmitter, SimpleChanges, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastrService } from 'ngx-toastr';
import { Subject, take, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { DynamicFormDraftService } from '../services/dynamic-form-draft.service';

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
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() templateHtml: string | null = null;
  @Input() templateAssetPath: string | null = null;
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
    private dynamicFormDraftService: DynamicFormDraftService
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
      changes['propertyId']
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
    const inlineTemplate = String(this.templateHtml || '').trim();
    if (inlineTemplate) {
      this.baseTemplateHtml = inlineTemplate;
      this.applyInitialEditorHtml();
      this.isLoading = false;
      return;
    }

    const assetPath = String(this.templateAssetPath || '').trim();
    if (!assetPath) {
      this.baseTemplateHtml = '';
      this.applyInitialEditorHtml();
      this.isLoading = false;
      return;
    }

    this.http.get(assetPath, { responseType: 'text' }).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: html => {
        this.baseTemplateHtml = html || '';
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
