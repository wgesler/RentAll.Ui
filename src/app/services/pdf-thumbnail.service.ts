import { Injectable } from '@angular/core';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';

/** Renders the first page of a PDF (data URL or base64) as an image data URL for use as a thumbnail. */
@Injectable({ providedIn: 'root' })
export class PdfThumbnailService {
  private workerInitialized = false;

  ensureWorkerReady(): void {
    if (this.workerInitialized) {
      return;
    }

    try {
      GlobalWorkerOptions.workerSrc = new URL('assets/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
    } catch {
      const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
      const normalizedBase = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
      GlobalWorkerOptions.workerSrc = `${window.location.origin}${normalizedBase}assets/pdfjs/pdf.worker.min.mjs`;
    }

    this.workerInitialized = true;
  }

  normalizePdfDataUrl(pdfDataUrl: string | null | undefined): string | null {
    const normalized = (pdfDataUrl || '').trim();
    if (!normalized) {
      return null;
    }

    if (/^data:application\/pdf(?:;|$)/i.test(normalized)) {
      return normalized;
    }

    if (normalized.startsWith('data:')) {
      return normalized.replace(/^data:[^;]+/i, 'data:application/pdf');
    }

    return `data:application/pdf;base64,${normalized}`;
  }

  decodePdfBytes(pdfDataUrl: string | null | undefined): Uint8Array | null {
    const normalized = (pdfDataUrl || '').trim();
    if (!normalized) {
      return null;
    }

    try {
      const base64Payload = normalized.startsWith('data:')
        ? normalized.slice(normalized.indexOf(',') + 1)
        : normalized;
      const sanitizedBase64 = base64Payload.replace(/\s/g, '');
      if (!sanitizedBase64) {
        return null;
      }

      const binary = atob(sanitizedBase64);
      if (binary.length < 4 || !binary.startsWith('%PDF')) {
        return null;
      }

      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    } catch {
      return null;
    }
  }

  /**
   * Renders the first page of the PDF as a JPEG data URL.
   * @param pdfDataUrl - Full data URL (e.g. data:application/pdf;base64,...) or raw base64 string
   * @param maxSize - Max width/height in pixels for the thumbnail (default 400)
   * @param maxScale - Cap on pdf.js scale (default 2; raise for print-preview overlays)
   * @returns Promise of a data URL (image/jpeg) or null on error
   */
  async getFirstPageDataUrl(pdfDataUrl: string | null, maxSize = 400, maxScale = 2): Promise<string | null> {
    if (!pdfDataUrl) {
      return null;
    }

    this.ensureWorkerReady();
    const data = this.decodePdfBytes(pdfDataUrl);
    if (!data) {
      return null;
    }

    let pdf: PDFDocumentProxy | null = null;
    try {
      const loadingTask = getDocument({ data, useSystemFonts: true });
      pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height, maxScale);
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(scaledViewport.width));
      canvas.height = Math.max(1, Math.ceil(scaledViewport.height));

      await page.render({
        canvas,
        viewport: scaledViewport,
      }).promise;

      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    } finally {
      if (pdf) {
        await pdf.destroy().catch(() => undefined);
      }
    }
  }
}
