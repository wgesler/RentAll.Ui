import { Injectable } from '@angular/core';
import { utils, write } from 'xlsx';

export interface ExcelExportTableColumn {
  label: string;
}

export interface ExcelExportTableRow {
  cells: string[];
  indent?: number;
}

export interface ExcelExportTableDocument {
  title?: string;
  columns: ExcelExportTableColumn[];
  rows: ExcelExportTableRow[];
}

@Injectable({
  providedIn: 'root'
})
export class DocumentExportService {

  /**
   * Triggers a browser download for a binary blob (e.g. a generated PDF).
   * @param blob The file content to download
   * @param fileName The name to save the file as
   */
  downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  downloadExcelTable(fileName: string, headers: string[], rows: string[][]): void {
    this.exportExcelTable(fileName, headers, rows);
  }

  exportExcelTable(fileName: string, headers: string[], rows: string[][]): void {
    const blob = this.buildExcelBlob(headers, rows);
    const resolvedFileName = this.resolveExcelFileName(fileName);
    this.downloadBlob(blob, resolvedFileName);
  }

  exportExcelTableDocument(document: ExcelExportTableDocument, fileName?: string): void {
    const headers = (document?.columns || []).map(column => column.label || '');
    const rows = (document?.rows || []).map(row => {
      const cells = [...(row.cells || [])];
      while (cells.length < headers.length) {
        cells.push('');
      }
      if ((row.indent || 0) > 0 && cells.length > 0) {
        cells[0] = `${'  '.repeat(row.indent || 0)}${cells[0] || ''}`;
      }
      return cells.slice(0, Math.max(headers.length, cells.length));
    });
    const resolvedName = (fileName || document?.title || 'report').trim() || 'report';
    this.exportExcelTable(resolvedName, headers, rows);
  }

buildExcelBlob(headers: string[], rows: string[][]): Blob {
    const worksheet = utils.aoa_to_sheet([headers, ...rows]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    const workbookBytes = write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob(
      [workbookBytes],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
  }

resolveExcelFileName(fileName: string): string {
    let trimmed = (fileName || 'export').trim();
    trimmed = trimmed.replace(/\.(pdf|docx?)$/i, '');
    if (/\.xlsx$/i.test(trimmed)) {
      return trimmed;
    }
    if (/\.xls$/i.test(trimmed)) {
      return trimmed.replace(/\.xls$/i, '.xlsx');
    }
    return `${trimmed || 'export'}.xlsx`;
  }

  /**
   * Prints HTML content
   * @param htmlContent The HTML content to print
   * @returns void
   */
  printHTML(htmlContent: string): void {
    const isFullDocument = /<!DOCTYPE\s+html/i.test(htmlContent) || /<html[\s>]/i.test(htmlContent);

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(isFullDocument
        ? htmlContent
        : `<!DOCTYPE html>
        <html>
          <head>
            <title>Document</title>
            <style>
              @media print {
                body { 
                  margin: 0; 
                  padding: 0;
                  font-family: Arial, Helvetica, sans-serif;
                }
              }
              @media screen {
                body {
                  margin: 0;
                  padding: 20px;
                }
              }
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>`);
      iframeDoc.close();

      let hasPrinted = false;
      const printAndCleanup = () => {
        if (hasPrinted) return;
        hasPrinted = true;
        
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            // Remove iframe after printing
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 100);
          }
        }, 250);
      };

      // Wait for content to load, then print
      iframe.onload = printAndCleanup;

      // Fallback if onload doesn't fire
      setTimeout(printAndCleanup, 500);
    }
  }

}

