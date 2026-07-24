import { JournalEntryLineSearchResponse } from './journal-entry.model';
import { ReceiptResponse } from '../../maintenance/models/receipt.model';
import {
  AR_AGING_DATE_PRESET_OPTIONS,
  AR_AGING_INTERVAL_OPTIONS,
  AR_AGING_THROUGH_ALL_VALUE,
  AR_AGING_THROUGH_OPTIONS,
  ArAgingBucketDefinition,
  ArAgingBucketId,
  ArAgingDatePreset,
  buildArAgingBucketDefinitions,
  createEmptyArAgingBucketAmounts,
  normalizeArAgingThroughDays,
  resolveArAgingAsOfDate,
  resolveArAgingBucketId
} from './ar-aging-report.model';

export type ApAgingBucketId = ArAgingBucketId;
export type ApAgingDatePreset = ArAgingDatePreset;
export type ApAgingSortBy = 'default' | 'name' | 'balance' | 'total' | 'vendor' | 'class';
export type ApAgingVisibleRowKind = 'vendor' | 'property' | 'vendorTotal';

export const AP_AGING_THROUGH_ALL_VALUE = AR_AGING_THROUGH_ALL_VALUE;
export const AP_AGING_DATE_PRESET_OPTIONS = AR_AGING_DATE_PRESET_OPTIONS;
export const AP_AGING_INTERVAL_OPTIONS = AR_AGING_INTERVAL_OPTIONS;
export const AP_AGING_THROUGH_OPTIONS = AR_AGING_THROUGH_OPTIONS;

export const AP_AGING_SORT_BY_OPTIONS: { value: ApAgingSortBy; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'name', label: 'Name' },
  { value: 'balance', label: 'Balance' },
  { value: 'total', label: 'Total' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'class', label: 'Class' }
];

export interface ApAgingReportFilters {
  datePreset: ApAgingDatePreset;
  asOfDate: string | null;
  intervalDays: number;
  throughDays: number | null;
  sortBy: ApAgingSortBy;
}

export interface ApAgingReportBuildRequest {
  lines: JournalEntryLineSearchResponse[];
  propertyCodeByPropertyId: ReadonlyMap<string, string>;
  contactNameByContactId?: ReadonlyMap<string, string>;
  paymentTermsByContactId?: ReadonlyMap<string, number | null>;
  asOfDate: string | null;
  intervalDays?: number;
  throughDays?: number | null;
  sortBy?: ApAgingSortBy;
  companyName?: string;
  officeName?: string;
  reportTitle?: string;
}

export interface OwnerApAgingReportBuildRequest {
  lines: JournalEntryLineSearchResponse[];
  propertyCodeByPropertyId: ReadonlyMap<string, string>;
  ownerIdByPropertyId?: ReadonlyMap<string, string>;
  paymentTermsByContactId?: ReadonlyMap<string, number | null>;
  contactNameByContactId?: ReadonlyMap<string, string>;
  asOfDate: string | null;
  intervalDays?: number;
  throughDays?: number | null;
  sortBy?: ApAgingSortBy;
  companyName?: string;
  officeName?: string;
  reportTitle?: string;
}

export interface ApAgingBillDetail {
  receiptId: string;
  receiptCode: string;
  vendorKey: string;
  vendorLabel: string;
  vendorSortKey: string;
  vendorId: string | null;
  propertyKey: string;
  propertyId: string | null;
  propertyLabel: string;
  propertyCode: string | null;
  receiptDate: string;
  dueDate: string;
  daysPastDue: number;
  balanceDue: number;
  bucketId: ApAgingBucketId;
  billNumber: string | null;
  termsLabel?: string | null;
  officeId: number;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  reservationId?: string | null;
  journalEntryId?: string | null;
  journalEntryLineId?: string | null;
}

export interface ApAgingPropertyRow {
  propertyKey: string;
  propertyId: string | null;
  propertyLabel: string;
  propertyCode: string | null;
  bucketAmounts: Record<ApAgingBucketId, number>;
  total: number;
  bills: ApAgingBillDetail[];
}

export interface ApAgingVendorRow {
  vendorKey: string;
  vendorLabel: string;
  vendorSortKey: string;
  vendorId: string | null;
  bucketAmounts: Record<ApAgingBucketId, number>;
  total: number;
  propertyRows: ApAgingPropertyRow[];
  bills: ApAgingBillDetail[];
}

export interface ApAgingReportResult {
  reportTitle: string;
  periodLabel: string;
  entityLineLabel: string | null;
  bucketColumns: { id: ApAgingBucketId; label: string }[];
  vendorRows: ApAgingVendorRow[];
  totals: Record<ApAgingBucketId, number>;
  grandTotal: number;
  billDetails: ApAgingBillDetail[];
}

export interface ApAgingDrillDownView {
  title: string;
  subtitle: string;
  vendorKey: string | null;
  propertyKey: string | null;
  bucketId: ApAgingBucketId | null;
  bills: ApAgingBillDetail[];
}

export type ApAgingDetailRowKind = 'bucketHeader' | 'transaction' | 'bucketTotal' | 'reportTotal';

export interface ApAgingDetailBuildRequest {
  billDetails: ApAgingBillDetail[];
  receiptsById: Map<string, ReceiptResponse>;
  asOfDate: string;
  bucketColumns: { id: ApAgingBucketId; label: string }[];
  bucketFilter: ApAgingBucketId | null;
  scopeLabel: string;
  companyName?: string;
  officeName?: string;
}

export interface ApAgingDetailRow {
  rowId: string;
  kind: ApAgingDetailRowKind;
  label: string | null;
  bucketId: ApAgingBucketId | null;
  transactionType: string | null;
  transactionDate: string | null;
  num: string | null;
  referenceNo: string | null;
  name: string | null;
  terms: string | null;
  dueDate: string | null;
  classLabel: string | null;
  aging: number | null;
  openBalance: number | null;
  receiptId: string | null;
  invoiceId?: string | null;
  officeId?: number | null;
  sourceTypeId?: number | null;
  sourceId?: string | null;
  reservationId?: string | null;
  journalEntryId?: string | null;
  journalEntryLineId?: string | null;
}

export interface ApAgingDetailReportResult {
  reportTitle: string;
  periodLabel: string;
  entityLineLabel: string | null;
  scopeLabel: string;
  rows: ApAgingDetailRow[];
  reportTotal: number;
}

export interface ApAgingVisibleRow {
  rowId: string;
  label: string;
  kind: ApAgingVisibleRowKind;
  vendorKey: string;
  propertyKey: string | null;
  bucketAmounts: Record<ApAgingBucketId, number>;
  total: number;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}

export {
  buildArAgingBucketDefinitions as buildApAgingBucketDefinitions,
  createEmptyArAgingBucketAmounts as createEmptyApAgingBucketAmounts,
  normalizeArAgingThroughDays as normalizeApAgingThroughDays,
  resolveArAgingAsOfDate as resolveApAgingAsOfDate,
  resolveArAgingBucketId as resolveApAgingBucketId
};

export type { ArAgingBucketDefinition as ApAgingBucketDefinition };

export function buildApAgingVendorSortKey(
  receipt: Pick<ReceiptResponse, 'vendorName' | 'vendorId'>
): string {
  const vendorName = (receipt.vendorName || '').trim();
  if (vendorName) {
    return vendorName;
  }
  return (receipt.vendorId || '').trim();
}

export function isApAgingJournalEntryReferenceNo(referenceNo: string | null | undefined): boolean {
  return /^JE-/i.test((referenceNo || '').trim());
}

export function compareApAgingVendorSortKeys(
  left: Pick<ApAgingVendorRow, 'vendorSortKey' | 'vendorId' | 'vendorLabel'>,
  right: Pick<ApAgingVendorRow, 'vendorSortKey' | 'vendorId' | 'vendorLabel'>
): number {
  const vendorCompare = left.vendorSortKey.localeCompare(right.vendorSortKey, undefined, { sensitivity: 'base' });
  if (vendorCompare !== 0) {
    return vendorCompare;
  }

  const leftVendorId = (left.vendorId || '').trim();
  const rightVendorId = (right.vendorId || '').trim();
  const vendorIdCompare = leftVendorId.localeCompare(rightVendorId, undefined, { sensitivity: 'base' });
  if (vendorIdCompare !== 0) {
    return vendorIdCompare;
  }

  return left.vendorLabel.localeCompare(right.vendorLabel, undefined, { sensitivity: 'base' });
}

export function compareApAgingBillSortKeys(
  left: Pick<ApAgingBillDetail, 'vendorSortKey' | 'vendorId' | 'vendorLabel' | 'receiptCode'>,
  right: Pick<ApAgingBillDetail, 'vendorSortKey' | 'vendorId' | 'vendorLabel' | 'receiptCode'>
): number {
  const vendorCompare = compareApAgingVendorSortKeys(
    {
      vendorSortKey: left.vendorSortKey,
      vendorId: left.vendorId,
      vendorLabel: left.vendorLabel
    },
    {
      vendorSortKey: right.vendorSortKey,
      vendorId: right.vendorId,
      vendorLabel: right.vendorLabel
    }
  );
  if (vendorCompare !== 0) {
    return vendorCompare;
  }

  return left.receiptCode.localeCompare(right.receiptCode, undefined, { numeric: true, sensitivity: 'base' });
}

export function getApAgingVendorClassSortKey(row: ApAgingVendorRow): string {
  const propertyCode = row.propertyRows
    .flatMap(propertyRow => propertyRow.bills)
    .map(bill => bill.propertyCode?.trim())
    .find(code => !!code);
  return propertyCode || '';
}

export function sortApAgingVendorRows(vendorRows: ApAgingVendorRow[], sortBy: ApAgingSortBy): ApAgingVendorRow[] {
  const rows = [...vendorRows];
  switch (sortBy) {
    case 'balance':
    case 'total':
      rows.sort((a, b) => b.total - a.total || compareApAgingVendorSortKeys(a, b));
      break;
    case 'class':
      rows.sort((a, b) => getApAgingVendorClassSortKey(a).localeCompare(getApAgingVendorClassSortKey(b), undefined, { sensitivity: 'base' })
        || compareApAgingVendorSortKeys(a, b));
      break;
    case 'name':
    case 'vendor':
    case 'default':
    default:
      rows.sort((a, b) => compareApAgingVendorSortKeys(a, b));
      break;
  }
  return rows;
}
