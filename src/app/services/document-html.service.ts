import { Injectable } from '@angular/core';

export interface PrintStyleOptions {
  fontSize?: string; // e.g., '10pt' or '11pt'
  marginBottom?: string; // e.g., '1in' or '0.75in'
  includeLeaseStyles?: boolean; // For lease-specific print styles
}

@Injectable({
  providedIn: 'root'
})
export class DocumentHtmlService {


  extractBodyContent(previewIframeHtml: string): string {
    let bodyContent = previewIframeHtml;
    
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
    const marginBottom = options?.marginBottom || '1in';
    const includeLeaseStyles = options?.includeLeaseStyles || false;

    let styles = `
      @page {
        size: letter;
        margin: 0.75in;
        margin-top: 0.5in;
        margin-bottom: ${marginBottom};
      }
      
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

    // Find the iframe element
    const iframe = document.querySelector('iframe.preview-iframe') as HTMLIFrameElement;
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
          let newAttributes = attributes.replace(/\s+(width|height)=["'][^"']*["']/gi, '');
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
