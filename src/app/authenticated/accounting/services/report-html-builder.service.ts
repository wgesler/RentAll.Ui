import { Injectable } from '@angular/core';
import { PrintableReportColumn, PrintableReportDocument, PrintableReportRow } from '../models/printable-report.model';

export interface PrintableReportPreviewContent {
  previewIframeHtml: string;
  previewIframeStyles: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportHtmlBuilderService {
  readonly previewIframeStyles = `
    .report {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      color: #000;
      line-height: 1.25;
    }
    .report__title {
      margin: 0 0 0.35rem;
      font-size: 14pt;
      font-weight: 600;
      text-align: center;
    }
    .report__subtitle {
      margin: 0 0 0.15rem;
      font-size: 9pt;
      font-weight: 600;
      text-align: center;
    }
    .report__table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.75rem;
    }
    .report__th,
    .report__td {
      padding: 0.3rem 0.45rem;
      border-bottom: 1px solid rgba(15, 23, 42, 0.12);
      vertical-align: top;
    }
    .report__th {
      font-weight: 600;
      background: rgba(241, 245, 249, 0.98);
      text-align: left;
    }
    .report__th--right,
    .report__td--right {
      text-align: right;
      white-space: nowrap;
    }
    .report__th--center,
    .report__td--center {
      text-align: center;
    }
    .report__row--section td,
    .report__row--subsection td {
      font-weight: 600;
    }
    .report__row--total td,
    .report__row--summary td {
      font-weight: 600;
    }
    .report__row--summary td {
      background: rgba(239, 246, 255, 0.65);
    }
  `;

  buildPreviewContent(document: PrintableReportDocument): PrintableReportPreviewContent {
    return {
      previewIframeHtml: this.buildBodyHtml(document),
      previewIframeStyles: this.previewIframeStyles
    };
  }

  buildBodyHtml(document: PrintableReportDocument): string {
    const subtitleHtml = (document.subtitleLines || [])
      .filter(line => !!line?.trim())
      .map(line => `<p class="report__subtitle">${this.escapeHtml(line)}</p>`)
      .join('');

    const columnCount = Math.max(document.columns.length, 1);
    const headerHtml = document.columns.length > 0
      ? `<thead><tr>${document.columns.map(column => this.buildHeaderCell(column)).join('')}</tr></thead>`
      : '';

    const bodyHtml = (document.rows || [])
      .map(row => this.buildRowHtml(row, columnCount))
      .join('');

    return `
      <div class="report">
        <h1 class="report__title">${this.escapeHtml(document.title)}</h1>
        ${subtitleHtml}
        <table class="report__table">
          ${headerHtml}
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    `.trim();
  }

buildHeaderCell(column: PrintableReportColumn): string {
    const alignClass = column.align === 'right'
      ? ' report__th--right'
      : column.align === 'center'
        ? ' report__th--center'
        : '';
    return `<th class="report__th${alignClass}">${this.escapeHtml(column.label)}</th>`;
  }

buildRowHtml(row: PrintableReportRow, columnCount: number): string {
    const rowClass = `report__row report__row--${row.kind}`;
    if (row.kind === 'section' || row.kind === 'subsection') {
      const label = row.cells[0] || '';
      const indent = row.indent ? ` style="padding-left:${row.indent * 12}px"` : '';
      return `<tr class="${rowClass}"><td colspan="${columnCount}"${indent}>${this.escapeHtml(label)}</td></tr>`;
    }

    const cells = this.normalizeCells(row.cells, columnCount);
    const cellHtml = cells.map((cell, index) => {
      const align = this.resolveCellAlign(index, columnCount, row);
      const alignClass = align === 'right'
        ? ' report__td--right'
        : align === 'center'
          ? ' report__td--center'
          : '';
      const indent = index === 0 && row.indent ? ` style="padding-left:${row.indent * 12}px"` : '';
      return `<td class="report__td${alignClass}"${indent}>${this.escapeHtml(cell)}</td>`;
    }).join('');

    return `<tr class="${rowClass}">${cellHtml}</tr>`;
  }

resolveCellAlign(cellIndex: number, columnCount: number, row: PrintableReportRow): 'left' | 'right' | 'center' {
    if (row.kind === 'line' && columnCount >= 7 && cellIndex >= 5) {
      return 'right';
    }
    if (columnCount === 2 && cellIndex === 1) {
      return 'right';
    }
    if (columnCount >= 3 && cellIndex === columnCount - 1) {
      return 'right';
    }
    if (row.kind === 'line' && columnCount >= 7 && cellIndex === 4) {
      return 'center';
    }
    return 'left';
  }

normalizeCells(cells: string[], columnCount: number): string[] {
    const normalized = [...(cells || [])];
    while (normalized.length < columnCount) {
      normalized.push('');
    }
    return normalized.slice(0, columnCount);
  }

escapeHtml(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
