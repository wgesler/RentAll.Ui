export type PrintableReportRowKind = 'section' | 'subsection' | 'line' | 'total' | 'summary';

export interface PrintableReportColumn {
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface PrintableReportRow {
  kind: PrintableReportRowKind;
  cells: string[];
  indent?: number;
}

export interface PrintableReportDocument {
  title: string;
  subtitleLines?: string[];
  columns: PrintableReportColumn[];
  rows: PrintableReportRow[];
}
