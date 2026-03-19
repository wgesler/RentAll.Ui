import { Injectable } from '@angular/core';
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion, type PDFDocumentProxy } from 'pdfjs-dist';

/** Renders the first page of a PDF (data URL or base64) as an image data URL for use as a thumbnail. */
@Injectable({ providedIn: 'root' })
export class PdfThumbnailService {
  private workerInitialized = false;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (this.workerInitialized) return;
    try {
      const v = typeof pdfjsVersion === 'string' ? pdfjsVersion : '4.4.168';
      GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.mjs`;
      this.workerInitialized = true;
    } catch {
      this.workerInitialized = true;
    }
  }

  /**
   * Renders the first page of the PDF as a JPEG data URL.
   * @param pdfDataUrl - Full data URL (e.g. data:application/pdf;base64,...) or raw base64 string
   * @param maxSize - Max width/height in pixels for the thumbnail (default 400)
   * @returns Promise of a data URL (image/jpeg) or null on error
   */
  async getFirstPageDataUrl(pdfDataUrl: string | null, maxSize = 400): Promise<string | null> {
    if (!pdfDataUrl) return null;
    let data: Uint8Array;
    try {
      if (pdfDataUrl.startsWith('data:')) {
        const base64 = pdfDataUrl.split(',')[1];
        if (!base64) return null;
        const binary = atob(base64.replace(/\s/g, ''));
        data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      } else {
        const binary = atob(pdfDataUrl.replace(/\s/g, ''));
        data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
      }
    } catch {
      return null;
    }

    try {
      const loadingTask = getDocument({ data });
      const pdf: PDFDocumentProxy = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height, 2);
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      await page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
        canvas,
      }).promise;

      await pdf.destroy();
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  }
}
