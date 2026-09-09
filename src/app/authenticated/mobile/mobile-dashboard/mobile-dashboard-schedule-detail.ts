import { ColumnData, ColumnSet } from '../../shared/data-table/models/column-data';
import { MaintenanceListDisplay } from '../../shared/models/mixed-models';
import { MobileScheduleDateCell } from './mobile-dashboard-calendar.model';

export type MobileScheduleDetailField = {
  label: string;
  value: string;
  emphasis: MobileScheduleDateCell['emphasis'];
};

export function getScheduleDateCellDisplay(value: unknown): string {
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text: string }).text || '').trim();
  }
  return String(value ?? '').trim();
}

export function getScheduleRowKey(row: MaintenanceListDisplay): string {
  const extended = row as MaintenanceListDisplay & {
    scheduleSortDate?: string;
    scheduleServiceKind?: string;
  };
  return [
    row.propertyId,
    row.reservationId || '',
    row.eventType ?? '',
    extended.scheduleServiceKind || '',
    extended.scheduleSortDate || '',
    row.cleanerUserId || ''
  ].join('|');
}

function isScheduleDateCell(value: unknown): value is MobileScheduleDateCell {
  return !!value && typeof value === 'object' && 'text' in value;
}

function columnLabel(column: ColumnData): string {
  const line1 = String(column.displayAs || '').trim();
  const line2 = String(column.headerLine2 || '').trim();
  if (line1 && line2) {
    return `${line1} ${line2}`;
  }
  return line1 || line2;
}

function formatScheduleFieldValue(row: MaintenanceListDisplay, columnKey: string): MobileScheduleDetailField {
  const value = (row as unknown as Record<string, unknown>)[columnKey];

  if (columnKey === 'hasPets') {
    return { label: 'Pets', value: value === true ? 'Yes' : 'No', emphasis: 'none' };
  }

  if (isScheduleDateCell(value)) {
    return {
      label: '',
      value: String(value.text || '').trim(),
      emphasis: value.emphasis ?? 'none'
    };
  }

  if (value && typeof value === 'object' && 'value' in value) {
    return {
      label: '',
      value: String((value as { value: string }).value || '').trim(),
      emphasis: 'none'
    };
  }

  return {
    label: '',
    value: String(value ?? '').trim(),
    emphasis: 'none'
  };
}

export function buildScheduleDetailFields(
  row: MaintenanceListDisplay,
  columns: ColumnSet
): MobileScheduleDetailField[] {
  return Object.entries(columns).map(([columnKey, column]) => {
    const formatted = formatScheduleFieldValue(row, columnKey);
    return {
      label: columnLabel(column),
      value: formatted.value || '—',
      emphasis: formatted.emphasis
    };
  });
}
