import { ColumnData, ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListDisplay } from '../../shared/models/mixed-models';
import { MobileScheduleDateCell } from './mobile-dashboard-calendar.model';

function isScheduleDateCell(value: unknown): value is MobileScheduleDateCell {
  return !!value && typeof value === 'object' && 'text' in value;
}

export function getScheduleExportColumns(columns: ColumnSet, hideProviderColumn: boolean): ColumnSet {
  if (!hideProviderColumn) {
    return columns;
  }
  const { cleanerName: _cleanerName, ...columnsWithoutProvider } = columns;
  return columnsWithoutProvider;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getScheduleExportAlignClass(alignment?: string): string {
  return alignment === 'center' ? ' schedule-export__header--center' : '';
}

function getScheduleExportCellClass(column: ColumnData): string {
  const alignClass = column.alignment === 'center' ? ' schedule-export__cell--center' : '';
  return `schedule-export__cell${alignClass}`;
}

function buildScheduleExportHeaderHtml(column: ColumnData): string {
  const alignClass = getScheduleExportAlignClass(column.headerAlignment || column.alignment);
  if (column.headerLine2) {
    return `<th class="schedule-export__header${alignClass}"><span class="schedule-export-header-two-line"><span class="schedule-export-header-two-line__top">${escapeHtml(column.displayAs || '')}</span><span class="schedule-export-header-two-line__bottom">${escapeHtml(column.headerLine2)}</span></span></th>`;
  }
  return `<th class="schedule-export__header${alignClass}">${escapeHtml(column.displayAs || '')}</th>`;
}

function formatScheduleExportCellHtml(row: MaintenanceListDisplay, columnKey: string): string {
  const value = (row as unknown as Record<string, unknown>)[columnKey];
  if (columnKey === 'hasPets') {
    return value === true ? 'Yes' : '';
  }
  if (isScheduleDateCell(value)) {
    const text = (value.text || '').trim();
    if (!text) {
      return '';
    }
    const emphasisClass = value.emphasis === 'primary'
      ? 'schedule-date-cell schedule-date-cell--primary'
      : value.emphasis === 'muted'
        ? 'schedule-date-cell schedule-date-cell--muted'
        : 'schedule-date-cell';
    return `<span class="${emphasisClass}">${escapeHtml(text)}</span>`;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return escapeHtml(String((value as { value: string }).value || '').trim());
  }
  return escapeHtml(String(value ?? '').trim());
}

export function buildScheduleExportHtml(
  rows: MaintenanceListDisplay[],
  columns: ColumnSet,
  titleText: string,
  dateLabel: string
): string {
  const columnEntries = Object.entries(columns);
  const headerHtml = columnEntries.map(([, column]) => buildScheduleExportHeaderHtml(column)).join('');
  const bodyHtml = rows.map(row => {
    const cellHtml = columnEntries.map(([columnKey, column]) =>
      `<td class="${getScheduleExportCellClass(column)}">${formatScheduleExportCellHtml(row, columnKey)}</td>`
    ).join('');
    return `<tr>${cellHtml}</tr>`;
  }).join('');

  const escapedTitle = escapeHtml(titleText);
  const escapedDate = escapeHtml(dateLabel);
  const titleHtml = dateLabel
    ? `<div class="schedule-export__title"><span class="schedule-export__title-text">${escapedTitle}</span><span class="schedule-export__title-date">${escapedDate}</span></div>`
    : `<span class="schedule-export__title-text schedule-export__title-text--solo">${escapedTitle}</span>`;

  return `<div class="schedule-export">
    ${titleHtml}
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  </div>`;
}

export function buildScheduleExportStyles(): string {
  return `
    .schedule-export { font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
    .schedule-export__title { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin: 0 0 16px; }
    .schedule-export__title-text,
    .schedule-export__title-date { font-size: 16pt !important; font-weight: 700; line-height: 1.2; font-family: Arial, Helvetica, sans-serif; }
    .schedule-export__title-text { margin: 0; flex: 1 1 auto; }
    .schedule-export__title-text--solo { display: block; margin: 0 0 16px; }
    .schedule-export__title-date { text-align: right; white-space: nowrap; flex: 0 0 auto; }
    .schedule-export table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: auto; }
    .schedule-export__header,
    .schedule-export__cell { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; word-wrap: break-word; }
    .schedule-export__header { background: #e2e8f0; font-weight: 700; }
    .schedule-export__header--center,
    .schedule-export__cell--center { text-align: center; }
    .schedule-export-header-two-line { display: block; line-height: 1.2; }
    .schedule-export-header-two-line__top,
    .schedule-export-header-two-line__bottom { display: block; font-weight: 700; }
    .schedule-export tr:nth-child(even) td { background: #f8fafc; }
    .schedule-date-cell--primary { font-weight: 700; }
    .schedule-date-cell--muted { color: #9e9e9e; font-weight: 400; }
  `;
}

export function buildScheduleTitleText(baseSubject: string, providerLabel: string): string {
  const subject = (baseSubject || '').trim() || 'Cleaning Schedule';
  if (providerLabel === 'All Service Providers') {
    return subject;
  }
  return `${subject}: ${providerLabel}`;
}

export function buildScheduleEmailSubject(titleText: string, dateLabel: string): string {
  if (!dateLabel) {
    return titleText;
  }
  return `${titleText} - ${dateLabel}`;
}

export function buildScheduleEmailBody(
  template: string,
  fromName: string,
  fromEmail: string,
  fromPhone: string,
  recipientName: string
): string {
  return template
    .replace(/\{\{fromName\}\}/g, fromName)
    .replace(/\{\{fromEmail\}\}/g, fromEmail)
    .replace(/\{\{fromPhone\}\}/g, fromPhone)
    .replace(/\{\{toName\}\}/g, recipientName)
    .replace(/\{\{salutationName\}\}/g, recipientName.trim().split(/\s+/)[0] || recipientName);
}

export function buildScheduleExportFileName(providerLabel: string, dateStamp: string): string {
  const providerPart = providerLabel
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'All-Providers';
  const stamp = dateStamp || 'export';
  return `Schedule-${providerPart}-${stamp}.pdf`;
}
