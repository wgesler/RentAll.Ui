import { Injectable } from '@angular/core';

export interface OwnerFormViewModeStyleOptions {
  isDirectDeposit?: boolean;
}

export interface OwnerFormEditModeStyleOptions {
  scopeSelector?: string;
}

@Injectable({
  providedIn: 'root'
})
export class OwnerFormViewModeService {
  readonly viewModeStyleId = 'owner-form-view-mode-style';
  readonly editableFieldStyleId = 'owner-editable-field-style';

  clearEditableFieldAppearance(node: HTMLElement): void {
    node.style.removeProperty('background');
    node.style.removeProperty('background-color');
    node.style.removeProperty('background-image');
    node.style.removeProperty('outline');
    node.style.removeProperty('outline-offset');
    node.style.removeProperty('box-shadow');
    node.style.cursor = 'default';
  }

  applyReadOnlyForView(host: HTMLElement): void {
    host.setAttribute('contenteditable', 'false');
    host.removeAttribute('spellcheck');
    const editableNodes = Array.from(host.querySelectorAll('[contenteditable]')) as HTMLElement[];
    editableNodes.forEach(node => {
      node.setAttribute('contenteditable', 'false');
      node.removeAttribute('spellcheck');
      node.removeAttribute('tabindex');
    });
    this.getEditableFieldSelectorList().forEach(selector => {
      host.querySelectorAll(selector).forEach(node => {
        this.clearEditableFieldAppearance(node as HTMLElement);
      });
    });
    host.querySelectorAll('.owner-editable-field').forEach(node => node.classList.remove('owner-editable-field'));
    host.querySelectorAll('.owner-editable-control').forEach(node => node.classList.remove('owner-editable-control'));
    const formControls = Array.from(host.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    formControls.forEach(control => {
      this.clearEditableFieldAppearance(control);
      control.setAttribute('disabled', 'disabled');
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.readOnly = true;
      }
    });
    const checkboxMarkers = Array.from(host.querySelectorAll('span.checkbox')) as HTMLSpanElement[];
    checkboxMarkers.forEach(marker => {
      marker.setAttribute('contenteditable', 'false');
      marker.style.cursor = 'default';
      marker.style.pointerEvents = 'none';
      marker.style.userSelect = 'none';
    });
  }

  private getEditableFieldSelectorList(): string[] {
    return [
      '.line',
      '.inline-underline-fill',
      '.owner-editable-field',
      '.owner-editable-control',
      '.blank-line',
      '.blank-line-short',
      '.line-input',
      '.sig-input',
      '.signature-line',
      '.signature-edit-line',
      '.signature-date-line',
      '.printed-line',
      '.date-line',
      '.textbox',
      '.form-line',
      '.field-line',
      '.fill-line',
      '.fill-field',
      '.line-tail',
      '.underline',
      '.sig-line',
      '.address-single',
      '.address-values > div',
      '.llc-line',
      '.fields input[type="text"]',
      'input[type="text"]'
    ];
  }

  getViewModeStylesCss(options?: OwnerFormViewModeStyleOptions): string {
    const directDepositViewStyles = options?.isDirectDeposit
      ? `
      .upload-check-header,
      .upload-check-input {
        display: none !important;
      }
      .uploaded-check-image[src] {
        display: block !important;
      }
      `
      : '';
    const fieldSelectorList = this.getEditableFieldSelectorList();
    const fieldSelectors = fieldSelectorList.join(',\n      ');
    const hoverFocusSelectors = fieldSelectorList
      .flatMap(selector => [`${selector}:hover`, `${selector}:focus`])
      .join(',\n      ');
    return `
      ${fieldSelectors} {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        cursor: default !important;
        outline: none !important;
        box-shadow: none !important;
      }
      ${hoverFocusSelectors} {
        outline: none !important;
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      .underline,
      .sig-line,
      .address-single,
      .inline-underline-fill {
        position: relative !important;
      }
      .underline::after,
      .sig-line::after,
      .address-single::after,
      .address-values > div::after,
      .inline-underline-fill::after {
        content: "" !important;
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: -1pt !important;
        border-bottom: 1pt solid #000 !important;
        pointer-events: none !important;
      }
      .sig-line {
        display: block !important;
        min-height: 18pt !important;
        width: 100% !important;
      }
      .sig-input,
      .line-input {
        border-bottom: 1pt solid #000 !important;
        border-radius: 0 !important;
      }
      .fields input[type="text"],
      input[type="text"],
      .llc-line,
      .fields .line,
      .inline-entry .line {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }
      input.digit,
      .digit.owner-editable-control {
        background: #fff !important;
      }
      ${directDepositViewStyles}
    `;
  }

  getEditModeStylesCss(options?: OwnerFormEditModeStyleOptions): string {
    const scope = String(options?.scopeSelector || '').trim();
    const prefix = scope ? `${scope} ` : '';
    const w9Host = scope ? `${scope}.w9-editor-mode` : '.w9-editor-mode';
    return `
      ${prefix}.inline-underline-fill,
      ${prefix}.owner-editable-field {
        position: relative;
        border-bottom: none !important;
        border-radius: 4px !important;
        background-clip: padding-box;
        padding: 0 4px 1pt 4px;
        margin-bottom: 1pt;
        background-color: rgba(37, 99, 235, 0.14);
        transition: outline-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
        cursor: text;
      }
      ${prefix}.inline-underline-fill::after,
      ${prefix}.owner-editable-field::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1pt;
        border-bottom: 1pt solid #000;
        pointer-events: none;
      }
      ${prefix}.owner-editable-field.checkbox::after {
        content: none !important;
      }
      ${prefix}.inline-underline-fill:hover,
      ${prefix}.owner-editable-field:hover {
        outline: 1px solid #90caf9;
        outline-offset: 1px;
        background-color: rgba(33, 150, 243, 0.06);
      }
      ${prefix}.inline-underline-fill:focus,
      ${prefix}.owner-editable-field:focus {
        outline: 1px solid #1976d2 !important;
        outline-offset: 1px;
        background-color: rgba(25, 118, 210, 0.10);
        box-shadow: 0 0 0 1px rgba(25, 118, 210, 0.25);
      }
      ${prefix}.owner-editable-control {
        border-radius: 4px !important;
        background-clip: padding-box;
        background:
          linear-gradient(#000, #000) left calc(100% - 0pt) / 100% 1pt no-repeat,
          rgba(37, 99, 235, 0.14);
        padding: 0 4px 1pt 4px;
        margin-bottom: 1pt;
        transition: outline-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
      }
      ${prefix}.owner-editable-control:hover {
        outline: 1px solid #90caf9;
        outline-offset: 1px;
        background-color: rgba(33, 150, 243, 0.06);
      }
      ${prefix}.owner-editable-control:focus {
        outline: 1px solid #1976d2 !important;
        outline-offset: 1px;
        background-color: rgba(25, 118, 210, 0.10);
        box-shadow: 0 0 0 1px rgba(25, 118, 210, 0.25);
      }
      ${prefix}.owner-editable-control[type="radio"],
      ${prefix}.owner-editable-control[type="checkbox"] {
        appearance: none !important;
        -webkit-appearance: none !important;
        width: 14px;
        height: 14px;
        min-width: 14px;
        min-height: 14px;
        border: 1px solid #000;
        border-radius: 0 !important;
        background: #fff !important;
        background-image: none !important;
        padding: 0 !important;
        margin: 0 2px 0 0 !important;
        box-shadow: none !important;
        position: relative;
        transform: translateY(1px);
      }
      ${prefix}.owner-editable-control[type="radio"]::after,
      ${prefix}.owner-editable-control[type="checkbox"]::after {
        content: "";
      }
      ${prefix}.owner-editable-control[type="radio"]:checked::after,
      ${prefix}.owner-editable-control[type="checkbox"]:checked::after {
        content: "X";
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: none;
        font-size: 10px;
        line-height: 1;
        font-weight: 700;
        color: #000;
      }
      ${w9Host} ${prefix}.owner-editable-control {
        background-image: none !important;
        box-shadow: none !important;
      }
      ${w9Host} ${prefix}input[type="text"].owner-editable-control,
      ${w9Host} ${prefix}.fields input[type="text"].owner-editable-control,
      ${w9Host} ${prefix}.fields .line.owner-editable-field,
      ${w9Host} ${prefix}.fields .underline.owner-editable-field,
      ${w9Host} ${prefix}.sig-line.owner-editable-field,
      ${w9Host} ${prefix}.date-line.owner-editable-field,
      ${w9Host} ${prefix}.llc-line.owner-editable-field,
      ${w9Host} ${prefix}.inline-entry .line.owner-editable-field {
        background-color: rgba(37, 99, 235, 0.14) !important;
        background-image: none !important;
      }
      ${w9Host} ${prefix}input.digit.owner-editable-control {
        background: #fff !important;
        border: 1px solid #000 !important;
        border-radius: 3px !important;
        padding: 0 !important;
      }
      ${prefix}span.checkbox {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 12px;
        height: 12px;
        border: 1px solid #000;
        border-radius: 0;
        background: #fff;
        vertical-align: middle;
        margin-right: 4px;
      }
      ${prefix}span.checkbox[data-checked="true"]::after {
        content: "X";
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: none;
        font-size: 10px;
        line-height: 1;
        font-weight: 700;
        color: #000;
        pointer-events: none;
      }
    `;
  }

  ensureViewModeStyles(doc: Document, options?: OwnerFormViewModeStyleOptions): void {
    doc.getElementById(this.editableFieldStyleId)?.remove();
    if (doc.getElementById(this.viewModeStyleId)) {
      return;
    }
    const style = doc.createElement('style');
    style.id = this.viewModeStyleId;
    style.textContent = this.getViewModeStylesCss(options);
    doc.head.appendChild(style);
  }

  ensureEditModeStyles(doc: Document, options?: OwnerFormEditModeStyleOptions): void {
    if (doc.getElementById(this.editableFieldStyleId)) {
      return;
    }
    const style = doc.createElement('style');
    style.id = this.editableFieldStyleId;
    style.textContent = this.getEditModeStylesCss(options);
    doc.head?.appendChild(style);
  }

  removeGlobalEditModeStyles(): void {
    document.getElementById(this.editableFieldStyleId)?.remove();
  }

  applyViewModeToDocument(doc: Document | null | undefined, options?: OwnerFormViewModeStyleOptions): void {
    const previewHost = doc?.body;
    if (!doc || !previewHost) {
      return;
    }
    this.ensureViewModeStyles(doc, options);
    this.applyReadOnlyForView(previewHost);
  }

  isRuntimeStyleId(styleId: string): boolean {
    return styleId === this.editableFieldStyleId
      || styleId === this.viewModeStyleId
      || styleId === 'owner-agreement-view-mode-style';
  }

  isBrokerageFormContext(
    formName: string,
    templatePath?: string | null,
    templateHtml?: string | null
  ): boolean {
    const normalizedName = String(formName || '').trim().toLowerCase();
    const normalizedPath = String(templatePath || '').trim().toLowerCase();
    const normalizedHtml = String(templateHtml || '').trim().toLowerCase();
    return normalizedName.includes('brokerage')
      || normalizedPath.includes('brokerage')
      || normalizedHtml.includes('brokerage disclosure to landlord');
  }

  shouldTreatAsStaticFormRegion(
    region: HTMLElement,
    doc: Document,
    options?: { isBrokerage?: boolean }
  ): boolean {
    if (region.classList.contains('checkbox') || region.matches('input[type="checkbox"], input[type="radio"]')) {
      return true;
    }
    if (region.closest(
      '.approval-note, .relationship-box, .form-header, .static-text, .intro-box, .top-info-lines, .top-info-line, #container .border'
    )) {
      return true;
    }
    const tag = region.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      return true;
    }
    const text = String(region.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 80) {
      return true;
    }
    if (!options?.isBrokerage) {
      return false;
    }
    if (region.offsetTop < 260) {
      return true;
    }
    const computed = doc.defaultView?.getComputedStyle(region);
    if (!computed) {
      return false;
    }
    const borderTopWidth = Number.parseFloat(computed.borderTopWidth || '0');
    const borderLeftWidth = Number.parseFloat(computed.borderLeftWidth || '0');
    const borderRightWidth = Number.parseFloat(computed.borderRightWidth || '0');
    const hasBoxBorder = computed.borderTopStyle !== 'none'
      && borderTopWidth > 0
      && (
        (computed.borderLeftStyle !== 'none' && borderLeftWidth > 0)
        || (computed.borderRightStyle !== 'none' && borderRightWidth > 0)
      );
    return hasBoxBorder && region.offsetTop < 420;
  }
}
