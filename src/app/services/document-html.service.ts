import { Injectable } from '@angular/core';

export interface PrintStyleOptions {
  fontSize?: string; // e.g., '10pt' or '11pt'
  marginBottom?: string; // e.g., '0.5in'
  includeLeaseStyles?: boolean; // For lease-specific print styles
  preserveTemplateTypography?: boolean; // Keep template font size/line-height/margins
  preserveTemplatePageSetup?: boolean; // Keep template @page size/margins
  landscape?: boolean;
}

interface PasteBlock {
  kind?: 'paragraph' | 'list-item';
  html: string;
  text: string;
}

/** Characters Word uses for list markers (including Wingdings PUA glyphs). */
const BULLET_CHAR_PATTERN = /[\u2022\u00b7\u25aa\u2043\u00a7\u2023\u2219\u25e6\uf0b7\uf0a7\uf076\uf0d8oO.\-*–—]/;
const BULLET_CHAR_CLASS = '[\\u2022\\u00b7\\u25aa\\u2043\\u00a7\\u2023\\u2219\\u25e6\\uf0b7\\uf0a7\\uf076\\uf0d8oO.\\-*–—]';

@Injectable({
  providedIn: 'root'
})
export class DocumentHtmlService {


  extractBodyContent(previewIframeHtml: string): string {
    const bodyContent = previewIframeHtml;
    
    // Find the opening <body> tag
    const bodyStartMatch = bodyContent.match(/<body[^>]*>/i);
    if (bodyStartMatch) {
      const bodyStartIndex = bodyStartMatch.index! + bodyStartMatch[0].length;
      // Extract everything from after <body> to the end (or before </html> if it exists)
      let content = bodyContent.substring(bodyStartIndex);
      
      // Remove all closing </body> tags (for concatenated documents)
      content = content.replace(/<\/body>/gi, '');
      
      // Remove all closing </html> tags if they exist
      content = content.replace(/<\/html>/gi, '');
      
      return content.trim();
    }
    
    // Fallback: remove HTML structure tags
    return bodyContent.replace(/<html[^>]*>|<\/html>/gi, '').replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '').replace(/<body[^>]*>|<\/body>/gi, '');
  }

  getPrintStyles(wrapInMediaQuery: boolean, options?: PrintStyleOptions): string {
    const fontSize = options?.fontSize || '11pt';
    const marginBottom = options?.marginBottom || '0.5in';
    const includeLeaseStyles = options?.includeLeaseStyles || false;
    const preserveTemplateTypography = options?.preserveTemplateTypography || false;
    const preserveTemplatePageSetup = options?.preserveTemplatePageSetup || false;

    let styles = `
      /* Ensure page breaks work for all sections */
      P.breakhere,
      p.breakhere {
        page-break-before: always !important;
        break-before: page !important;
        display: block !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    `;

    if (!preserveTemplatePageSetup) {
      const pageSize = options?.landscape ? 'letter landscape' : 'letter';
      styles = `
      @page {
        size: ${pageSize};
        margin: 0.5in;
        margin-bottom: ${marginBottom};
      }
      ${styles}
      `;
    }

    if (!preserveTemplateTypography) {
      styles += `
      
      body {
        font-size: ${fontSize} !important;
        line-height: 1.4 !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      
      .header {
        position: relative !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
        margin-bottom: 1rem !important;
      }
      
      .logo {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        max-height: 100px !important;
        max-width: 200px !important;
        display: block !important;
        margin-bottom: 1rem !important;
      }
      
      .content {
        margin-top: 0 !important;
      }
      
      h1 {
        font-size: 18pt !important;
      }
      
      h2 {
        font-size: 14pt !important;
      }
      
      h3 {
        font-size: 12pt !important;
      }
      
      p {
        margin: 0.3em 0 !important;
        ${fontSize === '10pt' ? 'font-size: 10pt !important;' : ''}
      }
      
      p, li {
        orphans: 2;
        widows: 2;
      }
      `;
    }

    // Add lease-specific styles if requested
    if (includeLeaseStyles) {
      styles += `
      
      /* Ensure all sections are visible in print */
      section,
      .corporate-letter,
      .notice-intent {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        display: block !important;
      }
      
      /* Allow container tables to break across pages */
      #container,
      table#container {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      
      /* Allow container table rows to break if needed */
      #container tr,
      table#container tr {
        page-break-inside: auto !important;
        break-inside: auto !important;
      }
      
      /* Keep equal height boxes in print - use min-height instead of height trick */
      #container tbody tr:first-child td {
        height: 1px !important;
      }
      
      #container tbody tr:first-child td .border {
        height: 100% !important;
      }
      
      /* Prevent header from breaking but allow content to flow */
      #header,
      table#header {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      `;
    }
    
    return wrapInMediaQuery ? `@media print {${styles}}` : styles;
  }

  buildHtmlDocument(bodyContent: string, additionalStyles: string, previewIframeStyles: string): string {
    return `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
      ${previewIframeStyles}
      ${additionalStyles}
        </style>
      </head>
      <body>
      ${bodyContent}
      </body>
      </html>`;
  }

  getPreviewHtmlWithStyles(previewIframeHtml: string, previewIframeStyles: string, options?: PrintStyleOptions): string {
    const bodyContent = this.extractBodyContent(previewIframeHtml);
    const printStyles = this.getPrintStyles(true, options);
    return this.buildHtmlDocument(bodyContent, printStyles, previewIframeStyles);
  }

  getPdfHtmlWithStyles(previewIframeHtml: string, previewIframeStyles: string, options?: PrintStyleOptions): string {
    const bodyContent = this.extractBodyContent(previewIframeHtml);
    const pdfStyles = this.getPrintStyles(false, options);
    return this.buildHtmlDocument(bodyContent, pdfStyles, previewIframeStyles);
  }

  injectStylesIntoIframe(previewIframeStyles: string): void {
    if (!previewIframeStyles) {
      return;
    }

    // Find the iframe element (support legacy and shared document-preview class names)
    const iframe = document.querySelector('iframe.document-preview-iframe, iframe.preview-iframe') as HTMLIFrameElement;
    if (!iframe || !iframe.contentDocument || !iframe.contentWindow) {
      // Retry after a short delay if iframe isn't ready yet
      setTimeout(() => this.injectStylesIntoIframe(previewIframeStyles), 50);
      return;
    }

    try {
      const iframeDoc = iframe.contentDocument;
      const iframeHead = iframeDoc.head || iframeDoc.getElementsByTagName('head')[0];
      
      if (!iframeHead) {
        return;
      }

      // Check if styles are already injected (to avoid duplicates)
      const existingStyle = iframeHead.querySelector('style[data-dynamic-styles]');
      if (existingStyle) {
        existingStyle.textContent = previewIframeStyles;
      } else {
        // Create a new style element and inject the styles
        // Place it at the end of head to ensure it has highest priority
        const styleElement = iframeDoc.createElement('style');
        styleElement.setAttribute('data-dynamic-styles', 'true');
        styleElement.setAttribute('type', 'text/css');
        styleElement.textContent = previewIframeStyles;
        iframeHead.appendChild(styleElement);
      }
      
      // Force a reflow to ensure styles are applied
      if (iframeDoc.body) {
        iframeDoc.body.offsetHeight;
      }
    } catch (error) {
      // Cross-origin or other security error - this is expected in some cases
      // Silently fail as this is not critical for functionality
    }
  }

  /**
   * Removes pasted font-size / font-family so embedded HTML inherits the host letter font.
   * Keeps bold/italic/underline/lists and other non-typography styles.
   */
  stripEmbeddedTypography(html: string): string {
    if (!html) {
      return '';
    }

    let result = html;

    // Pasted Word/HTML fragments often carry <style> blocks with font rules.
    result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    // Drop legacy <font> wrappers (size/face) but keep inner text.
    result = result.replace(/<\/?font\b[^>]*>/gi, '');

    result = result.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_match, quote: string, styleBody: string) => {
      const cleaned = styleBody
        .split(';')
        .map(part => part.trim())
        .filter(part => {
          if (!part) {
            return false;
          }
          return !/^(font-size|font-family)\s*:/i.test(part);
        })
        .join('; ');

      if (!cleaned) {
        return '';
      }
      return ` style=${quote}${cleaned}${quote}`;
    });

    return result;
  }

  /**
   * Cleans HTML pasted from Word/other rich editors for property description fields.
   * Strips typography, Office markup, extra spacing, and normalizes Word list paragraphs.
   */
  normalizePastedEditorHtml(html: string): string {
    if (!html) {
      return '';
    }

    let result = this.stripEmbeddedTypography(html);
    result = result.replace(/<!--[\s\S]*?-->/g, '');
    result = result.replace(/<\/?o:p\b[^>]*>/gi, '');
    result = result.replace(/<\/?(?:w|m|v|st\d):[^>]+>/gi, '');
    result = result.replace(/<span[^>]*font:\s*7\.0pt[^>]*>[\s\S]*?<\/span>/gi, '');
    result = result.replace(/<span[^>]*font-family\s*:\s*(?:Symbol|Wingdings)[^>]*>([\s\S]*?)<\/span>/gi, (_match, inner: string) => {
      const text = (inner || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
      return text.charAt(0) || '';
    });
    // Word often leaves both a literal bullet and a Symbol glyph — strip after spans are unwrapped instead.
    result = result.replace(/<span\b[^>]*>\s*<\/span>/gi, '');
    result = result.replace(/<p\b[^>]*>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');
    result = result.replace(/<div\b[^>]*>\s*(?:<br\s*\/?>)?\s*<\/div>/gi, '');

    if (typeof DOMParser === 'undefined') {
      return result.trim();
    }

    const doc = new DOMParser().parseFromString(`<div data-paste-root="true">${result}</div>`, 'text/html');
    const root = doc.querySelector('[data-paste-root]');
    if (!root) {
      return result.trim();
    }

    root.querySelectorAll('style, meta, link').forEach(node => node.remove());
    this.markWordListParagraphs(root);
    this.convertInlineStylesToSemanticTags(root);
    this.unwrapSpanElements(root);
    root.querySelectorAll('*').forEach(element => {
      element.removeAttribute('style');
      element.removeAttribute('class');
      element.removeAttribute('width');
    });
    this.normalizeWordListNodes(root);

    const blocks = this.extractPasteBlocks(root);
    return this.buildEditorHtmlFromBlocks(this.coalesceParagraphBlocks(blocks));
  }

  /**
   * Word uses two list formats in one paste: MsoListParagraph <p> (often li > p with Symbol ·)
   * and native <ul>/<li>. Normalize both to the same shape before block extraction.
   */
  normalizeWordListNodes(root: Element): void {
    root.querySelectorAll('li').forEach(li => {
      while (li.childElementCount === 1 && li.firstElementChild?.tagName.toLowerCase() === 'p') {
        const paragraph = li.firstElementChild;
        while (paragraph.firstChild) {
          li.insertBefore(paragraph.firstChild, paragraph);
        }
        li.removeChild(paragraph);
      }
      li.querySelectorAll('ul, ol').forEach(nested => nested.remove());
      this.stripLeadingBulletsFromElement(li);
    });

    root.querySelectorAll('p').forEach(paragraph => {
      const isListItem = paragraph.getAttribute('data-paste-list-item') === 'true'
        || this.elementLooksLikeListItem(paragraph);
      if (!isListItem) {
        return;
      }
      paragraph.setAttribute('data-paste-list-item', 'true');
      this.stripLeadingBulletsFromElement(paragraph);
    });
  }

  /** Post-pass after paste into contenteditable: groups any leftover bullet paragraphs into lists. */
  finalizeEditorLists(html: string): string {
    return this.sanitizeEditorListHtml(html);
  }

  /** One list pass: flatten Word/browser lists, strip marker glyphs, rebuild single ul per run. */
  sanitizeEditorListHtml(html: string): string {
    if (!html || typeof DOMParser === 'undefined') {
      return html;
    }

    const grouped = this.groupBulletParagraphsInHtml(html);
    const doc = new DOMParser().parseFromString(`<div data-sanitize-root="true">${grouped}</div>`, 'text/html');
    const root = doc.querySelector('[data-sanitize-root]');
    if (!root) {
      return grouped;
    }

    root.querySelectorAll('ul ul, ul ol, ol ul, ol ol').forEach(nested => nested.remove());
    root.querySelectorAll('p').forEach(paragraph => {
      if (this.elementLooksLikeListItem(paragraph)) {
        this.stripLeadingBulletsFromElement(paragraph);
      }
    });
    root.querySelectorAll('li').forEach(li => {
      li.querySelectorAll('ul, ol').forEach(nested => nested.remove());
      while (li.childElementCount === 1 && li.firstElementChild?.tagName.toLowerCase() === 'p') {
        const paragraph = li.firstElementChild;
        while (paragraph.firstChild) {
          li.insertBefore(paragraph.firstChild, paragraph);
        }
        li.removeChild(paragraph);
      }
      this.stripLeadingBulletsFromElement(li);
    });

    return root.innerHTML;
  }

  plainTextToEditorHtml(text: string): string {
    if (!text) {
      return '';
    }

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const blocks: PasteBlock[] = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (line) {
        blocks.push({
          html: this.escapeHtmlText(line),
          text: line
        });
      }
    }

    return this.buildEditorHtmlFromBlocks(this.coalesceParagraphBlocks(blocks));
  }

  coalesceParagraphBlocks(blocks: PasteBlock[]): PasteBlock[] {
    const merged: PasteBlock[] = [];

    for (const block of blocks) {
      const previous = merged[merged.length - 1];
      if (previous && this.shouldMergeParagraphBlocks(previous, block)) {
        previous.html = `${previous.html} ${block.html}`.trim();
        previous.text = `${previous.text} ${block.text}`.trim();
        continue;
      }

      merged.push({ ...block });
    }

    return merged;
  }

  shouldMergeParagraphBlocks(previous: PasteBlock, current: PasteBlock): boolean {
    if (previous.kind === 'list-item' || current.kind === 'list-item') {
      return false;
    }

    if (this.startsWithBullet(previous.text) || this.startsWithBullet(current.text)) {
      return false;
    }

    if (this.looksLikeSectionHeading(previous.text) || this.looksLikeSectionHeading(current.text)) {
      return false;
    }

    const previousText = previous.text.trim();
    const currentText = current.text.trim();
    if (/[.!?]["']?\s*$/.test(previousText) && /^[A-Z]/.test(currentText)) {
      return false;
    }

    return true;
  }

  looksLikeSectionHeading(text: string): boolean {
    const normalized = text.trim();
    if (!normalized || normalized.length > 80 || /[.!?]$/.test(normalized)) {
      return false;
    }

    return /^[A-Z0-9][A-Za-z0-9\s&/-]+$/.test(normalized);
  }

  extractPasteBlocks(root: Element): PasteBlock[] {
    const blocks: PasteBlock[] = [];

    const collect = (node: Element): void => {
      for (const child of Array.from(node.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'html' || tag === 'head' || tag === 'body' || tag === 'table' || tag === 'tbody' || tag === 'thead' || tag === 'tr' || tag === 'td' || tag === 'th') {
          collect(child);
          continue;
        }

        if (tag === 'ul' || tag === 'ol') {
          child.querySelectorAll(':scope > li').forEach(li => {
            while (li.childElementCount === 1 && li.firstElementChild?.tagName.toLowerCase() === 'p') {
              const paragraph = li.firstElementChild;
              while (paragraph.firstChild) {
                li.insertBefore(paragraph.firstChild, paragraph);
              }
              li.removeChild(paragraph);
            }
            this.stripLeadingBulletsFromElement(li);
            const block = this.serializePasteBlock(li);
            if (block.text) {
              blocks.push({
                ...block,
                kind: 'list-item',
                html: block.html,
                text: block.text
              });
            }
          });
          continue;
        }

        if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
          const block = this.serializePasteBlock(child);
          if (block.text) {
            const isListItem = child.getAttribute('data-paste-list-item') === 'true';
            blocks.push({
              ...block,
              kind: isListItem ? 'list-item' : 'paragraph',
              html: block.html,
              text: block.text
            });
          }
          continue;
        }

        if (tag === 'div') {
          if (child.querySelector('p, div, ul, ol')) {
            collect(child);
          } else {
            const block = this.serializePasteBlock(child);
            if (block.text) {
              const isListItem = this.elementLooksLikeListItem(child);
              blocks.push({
                ...block,
                kind: isListItem ? 'list-item' : 'paragraph',
                html: isListItem ? this.stripLeadingBulletFromHtml(block.html) : block.html,
                text: isListItem ? this.stripLeadingBullet(block.text) : block.text
              });
            }
          }
        }
      }
    };

    collect(root);

    if (blocks.length === 0) {
      const block = this.serializePasteBlock(root);
      if (block.text) {
        blocks.push(block);
      }
    }

    return blocks;
  }

  buildEditorHtmlFromBlocks(blocks: PasteBlock[]): string {
    const parts: string[] = [];
    const listItems: string[] = [];

    const flushList = (): void => {
      if (listItems.length === 0) {
        return;
      }
      parts.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`);
      listItems.length = 0;
    };

    const pushListItem = (html: string, text: string): void => {
      const cleaned = this.prepareListItemHtml(html, text);
      if (cleaned) {
        listItems.push(cleaned);
      }
    };

    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];

      if (block.kind === 'list-item') {
        pushListItem(block.html, block.text);
        continue;
      }

      const bulletMatch = this.startsWithBullet(block.text)
        ? block.text.match(/^[\u2022\u00b7\u25aa\u2043\u00a7\u2023\u2219oO\u2013\u2014\-–—*.\uf0b7\uf0a7\uf076\s]+(.*)$/s)
        : null;
      if (bulletMatch) {
        let itemHtml = block.html;
        let itemText = (bulletMatch[1] || '').trim();
        while (index + 1 < blocks.length) {
          const nextBlock = blocks[index + 1];
          if (nextBlock.kind === 'list-item' || this.startsWithBullet(nextBlock.text) || this.looksLikeParagraphBlock(nextBlock.text)) {
            break;
          }
          index++;
          itemHtml = itemHtml ? `${itemHtml} ${nextBlock.html}` : nextBlock.html;
          itemText = itemText ? `${itemText} ${nextBlock.text}` : nextBlock.text;
        }
        if (itemText) {
          pushListItem(itemHtml, itemText);
        }
        continue;
      }

      if (listItems.length > 0 && !this.looksLikeParagraphBlock(block.text)) {
        const lastIndex = listItems.length - 1;
        const mergedText = `${this.stripHtmlToText(listItems[lastIndex])} ${block.text}`.trim();
        listItems[lastIndex] = this.prepareListItemHtml(`${listItems[lastIndex]} ${block.html}`.trim(), mergedText);
        continue;
      }

      flushList();
      parts.push(`<p>${block.html}</p>`);
    }

    flushList();
    return parts.join('');
  }

  serializePasteBlock(element: Element): PasteBlock {
    const clone = element.cloneNode(true) as Element;
    this.sanitizeInlineElementTree(clone);
    const html = clone.innerHTML.trim();
    const text = this.normalizeBlockText(clone.textContent || '');
    return {
      kind: 'paragraph',
      html: html || this.escapeHtmlText(text),
      text
    };
  }

  markWordListParagraphs(root: Element): void {
    root.querySelectorAll('p').forEach(paragraph => {
      const className = paragraph.getAttribute('class') || '';
      const style = paragraph.getAttribute('style') || '';
      if (/MsoListParagraph/i.test(className) || /mso-list/i.test(style)) {
        paragraph.setAttribute('data-paste-list-item', 'true');
      }
    });
  }

  isBulletChar(char: string): boolean {
    return BULLET_CHAR_PATTERN.test(char);
  }

  startsWithBullet(text: string): boolean {
    return new RegExp(`^${BULLET_CHAR_CLASS}[\\s${BULLET_CHAR_CLASS}]*`).test(text.trim());
  }

  stripLeadingBullet(text: string): string {
    let result = text.trim();
    for (let pass = 0; pass < 8; pass++) {
      const next = result.replace(new RegExp(`^${BULLET_CHAR_CLASS}[\\s${BULLET_CHAR_CLASS}]*`, 'i'), '').trim();
      if (next === result) {
        break;
      }
      result = next;
    }
    return result;
  }

  elementLooksLikeListItem(element: Element): boolean {
    const text = this.normalizeBlockText(element.textContent || '');
    if (text && this.startsWithBullet(text)) {
      return true;
    }

    const doc = element.ownerDocument;
    if (!doc) {
      return false;
    }

    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      for (const char of node.textContent || '') {
        if (char === ' ' || char === '\u00a0' || char === '\t' || char === '\n' || char === '\r') {
          continue;
        }
        return this.isBulletChar(char);
      }
      node = walker.nextNode();
    }

    return false;
  }

  /** Walks DOM nodes and removes all leading bullet glyphs (handles nested p/span from Word). */
  stripLeadingBulletsFromElement(element: Element): void {
    for (;;) {
      const child = element.firstChild;
      if (!child) {
        return;
      }

      if (child.nodeType === Node.TEXT_NODE) {
        const raw = child.textContent || '';
        let index = 0;
        while (index < raw.length) {
          const char = raw[index];
          if (char === ' ' || char === '\u00a0' || char === '\t' || char === '\n' || char === '\r') {
            index++;
            continue;
          }
          if (this.isBulletChar(char)) {
            index++;
            continue;
          }
          break;
        }
        if (index === 0) {
          return;
        }
        if (index >= raw.length) {
          element.removeChild(child);
          continue;
        }
        child.textContent = raw.slice(index);
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        element.removeChild(el);
        continue;
      }

      if (tag === 'p' && element.childElementCount === 1) {
        while (el.firstChild) {
          element.insertBefore(el.firstChild, el);
        }
        element.removeChild(el);
        continue;
      }

      if (['span', 'strong', 'em', 'b', 'i', 'u', 'a'].includes(tag)) {
        const trimmed = (el.textContent || '').trim();
        if (!trimmed || [...trimmed].every(char => this.isBulletChar(char) || char === ' ' || char === '\u00a0')) {
          element.removeChild(el);
          continue;
        }
        this.stripLeadingBulletsFromElement(el);
        return;
      }

      if (tag === 'p') {
        this.stripLeadingBulletsFromElement(el);
        return;
      }

      return;
    }
  }

  prepareListItemHtml(html: string, text: string): string {
    const cleanedText = this.stripLeadingBullet(text);
    if (typeof DOMParser === 'undefined') {
      const cleanedHtml = this.stripLeadingBulletFromHtml(html);
      return cleanedHtml || this.escapeHtmlText(cleanedText);
    }

    const doc = new DOMParser().parseFromString(`<div data-li-root="true">${html}</div>`, 'text/html');
    const wrapper = doc.querySelector('[data-li-root]');
    if (!wrapper) {
      return this.escapeHtmlText(cleanedText);
    }

    while (wrapper.childElementCount === 1 && wrapper.firstElementChild?.tagName.toLowerCase() === 'p') {
      const paragraph = wrapper.firstElementChild;
      while (paragraph.firstChild) {
        wrapper.insertBefore(paragraph.firstChild, paragraph);
      }
      wrapper.removeChild(paragraph);
    }

    this.stripLeadingBulletsFromElement(wrapper);

    const cleanedHtml = wrapper.innerHTML.trim();
    return cleanedHtml || this.escapeHtmlText(cleanedText);
  }

  stripLeadingBulletFromHtml(html: string): string {
    let result = html.trim();
    for (let pass = 0; pass < 8; pass++) {
      const next = result
        .replace(/^(\s|&nbsp;|<br\s*\/?>)*/i, '')
        .replace(/^<(?:strong|em|b|i|u|span)(?:\s[^>]*)?>\s*<\/(?:strong|em|b|i|u|span)>/i, '')
        .replace(/^&#(?:8226|183|9679|8211|8212|9675);(\s|&nbsp;|<br\s*\/?>)*/i, '')
        .replace(/^<(?:strong|em|b|i|u|span)(?:\s[^>]*)?>[\u2022\u00b7\u25aa\u2043oO\u00a7\u2013\u2014\-–—*.\uf0b7\uf0a7\uf076]<\/(?:strong|em|b|i|u|span)>(\s|&nbsp;|<br\s*\/?>)*/i, '')
        .replace(/^[\u2022\u00b7\u25aa\u2043oO\u00a7\u2013\u2014\-–—*.\uf0b7\uf0a7\uf076](\s|&nbsp;|<br\s*\/?>)*/i, '');
      if (next === result) {
        break;
      }
      result = next;
    }
    return result.trim();
  }

  /** Converts leftover bullet paragraphs (e.g. after browser paste flattening) into real lists. */
  groupBulletParagraphsInHtml(html: string): string {
    if (!html || typeof DOMParser === 'undefined') {
      return html;
    }

    const doc = new DOMParser().parseFromString(`<div data-group-root="true">${html}</div>`, 'text/html');
    const root = doc.querySelector('[data-group-root]');
    if (!root) {
      return html;
    }

    const parts: string[] = [];
    const listItems: string[] = [];

    const flushList = (): void => {
      if (listItems.length === 0) {
        return;
      }
      parts.push(`<ul>${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`);
      listItems.length = 0;
    };

    const pushListItemFromElement = (element: Element): void => {
      const clone = element.cloneNode(true) as Element;
      clone.querySelectorAll('ul, ol').forEach(nested => nested.remove());
      this.stripLeadingBulletsFromElement(clone);
      while (clone.childElementCount === 1 && clone.firstElementChild?.tagName.toLowerCase() === 'p') {
        const paragraph = clone.firstElementChild;
        while (paragraph.firstChild) {
          clone.insertBefore(paragraph.firstChild, paragraph);
        }
        clone.removeChild(paragraph);
      }
      this.stripLeadingBulletsFromElement(clone);
      const text = this.normalizeBlockText(clone.textContent || '');
      const cleaned = clone.innerHTML.trim() || this.escapeHtmlText(this.stripLeadingBullet(text));
      if (cleaned) {
        listItems.push(cleaned);
      }
    };

    for (const child of this.flattenEditorBlocks(root)) {
      const tag = child.tagName.toLowerCase();

      if (tag === 'ul' || tag === 'ol') {
        child.querySelectorAll(':scope > li').forEach(li => pushListItemFromElement(li));
        continue;
      }

      if (tag === 'p' || tag === 'div') {
        if (this.elementLooksLikeListItem(child)) {
          pushListItemFromElement(child);
          continue;
        }
      }

      flushList();
      parts.push(child.outerHTML);
    }

    flushList();
    return parts.join('');
  }

  flattenEditorBlocks(root: Element): Element[] {
    const blocks: Element[] = [];

    const walk = (node: Element): void => {
      for (const child of Array.from(node.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'div' || tag === 'section' || tag === 'article'
          || tag === 'table' || tag === 'tbody' || tag === 'thead' || tag === 'tr' || tag === 'td' || tag === 'th') {
          walk(child);
          continue;
        }
        blocks.push(child);
      }
    };

    walk(root);
    return blocks;
  }

  stripHtmlToText(html: string): string {
    if (typeof DOMParser === 'undefined') {
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    return this.normalizeBlockText(doc.body.textContent || '');
  }

  convertInlineStylesToSemanticTags(root: Element): void {
    root.querySelectorAll('b').forEach(node => this.replaceElementTag(node, 'strong'));
    root.querySelectorAll('i').forEach(node => this.replaceElementTag(node, 'em'));

    Array.from(root.querySelectorAll('span[style]')).forEach(span => {
      const style = span.getAttribute('style') || '';
      const isBold = /\bfont-weight\s*:\s*(bold|[6-9]00)\b/i.test(style)
        || /\bmso-bidi-font-weight\s*:\s*bold\b/i.test(style);
      const isItalic = /\bfont-style\s*:\s*italic\b/i.test(style);
      const isUnderline = /\btext-decoration(?:-line)?\s*:\s*[^;]*underline/i.test(style)
        || /\bmso-text-underline\s*:\s*single/i.test(style);

      if (!isBold && !isItalic && !isUnderline) {
        return;
      }

      const doc = span.ownerDocument;
      const inner = doc.createElement('span');
      while (span.firstChild) {
        inner.appendChild(span.firstChild);
      }

      let wrapped: HTMLElement = inner;
      if (isUnderline) {
        wrapped = this.wrapInlineNode(wrapped, 'u');
      }
      if (isItalic) {
        wrapped = this.wrapInlineNode(wrapped, 'em');
      }
      if (isBold) {
        wrapped = this.wrapInlineNode(wrapped, 'strong');
      }

      span.replaceWith(wrapped);
    });
  }

  wrapInlineNode(node: HTMLElement, tagName: string): HTMLElement {
    const wrapper = node.ownerDocument.createElement(tagName);
    wrapper.appendChild(node);
    return wrapper;
  }

  replaceElementTag(node: Element, tagName: string): void {
    const replacement = node.ownerDocument?.createElement(tagName);
    if (!replacement) {
      return;
    }
    while (node.firstChild) {
      replacement.appendChild(node.firstChild);
    }
    node.replaceWith(replacement);
  }

  sanitizeInlineElementTree(element: Element): void {
    const allowedTags = new Set(['strong', 'em', 'u', 'br']);

    const walk = (node: Element): void => {
      Array.from(node.children).forEach(child => {
        const tag = child.tagName.toLowerCase();
        if (allowedTags.has(tag)) {
          child.removeAttribute('style');
          child.removeAttribute('class');
          walk(child);
          return;
        }

        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        node.removeChild(child);
      });
    };

    walk(element);
  }

  looksLikeParagraphBlock(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) {
      return false;
    }
    if (/^(additional features|residence highlights)\b/i.test(normalized)) {
      return true;
    }
    if (normalized.length > 120) {
      return true;
    }
    if (normalized.includes('. ') && normalized.length > 60) {
      return true;
    }
    return false;
  }

  normalizeBlockText(text: string): string {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  unwrapSpanElements(root: Element): void {
    root.querySelectorAll('span').forEach(span => {
      const parent = span.parentNode;
      if (!parent) {
        return;
      }
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
  }

  private extractPlainTextFromHtmlFragment(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private escapeHtmlText(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Strips HTML document structure (DOCTYPE, html, head, body tags) and adds a page break
   * Used when combining multiple HTML documents
   */
  stripAndReplace(html: string): string {
    if (!html) return '';
    
    let result = html;
    
    // Remove DOCTYPE declaration (case insensitive, with any attributes)
    result = result.replace(/<!DOCTYPE\s+[^>]*>/gi, '');
    
    // Remove <html> opening tag (with any attributes)
    result = result.replace(/<html[^>]*>/gi, '');
    
    // Remove </html> closing tag
    result = result.replace(/<\/html>/gi, '');
    
    // Remove <head> section including all content inside (non-greedy match)
    result = result.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
    
    // Remove opening <body> tag (with any attributes)
    result = result.replace(/<body[^>]*>/gi, '');
    
    // Remove closing </body> tag
    result = result.replace(/<\/body>/gi, '');
    
    // Trim whitespace and add page break at the beginning
    result = result.trim();
    
    // Add page break if there's content
    if (result) {
      result = '<p class="breakhere"></p>\n' + result;
    }
    
    return result;
  }

  /**
   * Rewrites template CSS so html/body/:root/* rules target an embedded surface only.
   * Used when form HTML is injected via innerHTML (e.g. dynamic form editor); otherwise
   * those selectors apply to the Angular app shell and break layout.
   */
  scopeEmbeddedDocumentStyles(css: string, scopeSelector: string): string {
    if (!String(css || '').trim() || !String(scopeSelector || '').trim()) {
      return css || '';
    }

    let scoped = css;
    scoped = scoped.replace(/:root\b/g, scopeSelector);
    scoped = scoped.replace(/(^|[,{]\s*)html\b/g, `$1${scopeSelector}`);
    scoped = scoped.replace(/(^|[,{]\s*)body\b/g, `$1${scopeSelector}`);
    scoped = scoped.replace(/(^|[,{]\s*)\*(?=\s*(?:,|::|{))/gm, `$1${scopeSelector} *`);
    return scoped;
  }

  /**
   * Processes HTML by extracting styles, removing style tags, and optionally fixing logo images
   * Returns processed HTML and extracted styles
   */
  processHtml(html: string, fixLogo: boolean = false): { processedHtml: string; extractedStyles: string } {
    // Extract all <style> tags from the HTML
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const extractedStyles: string[] = [];
    let match;
    
    styleRegex.lastIndex = 0;
    while ((match = styleRegex.exec(html)) !== null) {
      if (match[1]) {
        extractedStyles.push(match[1].trim());
      }
    }

    // Store extracted styles separately
    const styles = extractedStyles.join('\n\n');

    // Remove <style> tags from HTML
    let processedHtml = html.replace(styleRegex, '');

    // Remove <title> tag if it exists
    processedHtml = processedHtml.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');

    // Fix the logo by adding width attribute directly (if requested)
    if (fixLogo) {
      processedHtml = processedHtml.replace(
        /<img([^>]*class=["'][^"']*logo[^"']*["'][^>]*)>/gi,
        (match, attributes) => {
          // Remove existing width and height attributes if they exist
          const newAttributes = attributes.replace(/\s+(width|height)=["'][^"']*["']/gi, '');
          // Add width="180" and height="auto"
          return `<img${newAttributes} width="180" height="auto">`;
        }
      );
    }
    
    return {
      processedHtml,
      extractedStyles: styles
    };
  }
}
