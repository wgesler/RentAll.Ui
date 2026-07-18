import { InvoiceResponse } from './invoice.model';
import { CostCodesResponse } from './cost-codes.model';
import { ContactResponse } from '../../contacts/models/contact.model';
import { TermType, getTermType } from '../../contacts/models/contact-enum';
import { ReservationType } from '../../reservations/models/reservation-enum';
import { ReservationCodeResponse, ReservationResponse } from '../../reservations/models/reservation-model';

//#region Types
export type ArAgingBucketId = string;

export type ArAgingDatePreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'thisWeekToDate'
  | 'thisMonth'
  | 'thisMonthToDate'
  | 'thisQuarter'
  | 'thisQuarterToDate'
  | 'thisYear'
  | 'thisYearToDate'
  | 'lastWeek'
  | 'lastMonth'
  | 'lastQuarter'
  | 'lastYear'
  | 'all'
  | 'custom';

export type ArAgingSortBy = 'default' | 'name' | 'balance' | 'total' | 'customer' | 'class';

export type ArAgingVisibleRowKind = 'customer' | 'reservation' | 'customerTotal';
//#endregion

//#region Title Bar Options
export const AR_AGING_THROUGH_ALL_VALUE = -1;

export const AR_AGING_DATE_PRESET_OPTIONS: { value: ArAgingDatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'thisWeekToDate', label: 'This Week-to-date' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'thisMonthToDate', label: 'This Month-to-date' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'thisQuarterToDate', label: 'This Quarter-to-date' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'thisYearToDate', label: 'This Year-to-date' },
  { value: 'lastWeek', label: 'Last Week' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'lastQuarter', label: 'Last Quarter' },
  { value: 'lastYear', label: 'Last Year' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' }
];

export const AR_AGING_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1' },
  { value: 7, label: '7' },
  { value: 14, label: '14' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 90, label: '90' }
];

export const AR_AGING_THROUGH_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 90, label: '90' },
  { value: 120, label: '120' },
  { value: AR_AGING_THROUGH_ALL_VALUE, label: 'All' }
];

export const AR_AGING_SORT_BY_OPTIONS: { value: ArAgingSortBy; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'name', label: 'Name' },
  { value: 'balance', label: 'Balance' },
  { value: 'total', label: 'Total' },
  { value: 'customer', label: 'Customer' },
  { value: 'class', label: 'Class' }
];
//#endregion

//#region Interfaces
export interface ArAgingBucketDefinition {
  id: ArAgingBucketId;
  label: string;
  minDaysPastDue: number;
  maxDaysPastDue: number | null;
}

export interface ArAgingReportFilters {
  datePreset: ArAgingDatePreset;
  asOfDate: string | null;
  intervalDays: number;
  throughDays: number | null;
  sortBy: ArAgingSortBy;
}

export interface ArAgingReportBuildRequest {
  invoices: InvoiceResponse[];
  costCodes: CostCodesResponse[];
  contactNameByContactId?: ReadonlyMap<string, string>;
  contactsByContactId?: ReadonlyMap<string, ContactResponse>;
  reservationsByReservationId?: ReadonlyMap<string, ReservationCodeResponse>;
  asOfDate: string | null;
  intervalDays?: number;
  throughDays?: number | null;
  sortBy?: ArAgingSortBy;
  companyName?: string;
  officeName?: string;
}

export interface ArAgingInvoiceDetail {
  invoiceId: string;
  invoiceCode: string;
  customerKey: string;
  customerLabel: string;
  companySortKey: string;
  contactSortKey: string;
  contactId: string | null;
  reservationKey: string;
  reservationId?: string | null;
  reservationLabel: string;
  invoiceDate: string;
  dueDate: string;
  daysPastDue: number;
  balanceDue: number;
  bucketId: ArAgingBucketId;
  reservationCode?: string | null;
  propertyCode?: string | null;
  officeId: number;
}

export interface ArAgingReservationRow {
  reservationKey: string;
  reservationId: string | null;
  reservationLabel: string;
  bucketAmounts: Record<ArAgingBucketId, number>;
  total: number;
  invoices: ArAgingInvoiceDetail[];
}

export interface ArAgingCustomerRow {
  customerKey: string;
  customerLabel: string;
  companySortKey: string;
  contactSortKey: string;
  contactId: string | null;
  bucketAmounts: Record<ArAgingBucketId, number>;
  total: number;
  reservationRows: ArAgingReservationRow[];
  invoices: ArAgingInvoiceDetail[];
}

export interface ArAgingReportResult {
  reportTitle: string;
  periodLabel: string;
  entityLineLabel: string | null;
  bucketColumns: { id: ArAgingBucketId; label: string }[];
  customerRows: ArAgingCustomerRow[];
  totals: Record<ArAgingBucketId, number>;
  grandTotal: number;
  invoiceDetails: ArAgingInvoiceDetail[];
}

export interface ArAgingDrillDownView {
  title: string;
  subtitle: string;
  customerKey: string | null;
  reservationKey: string | null;
  bucketId: ArAgingBucketId | null;
  invoices: ArAgingInvoiceDetail[];
}

export type ArAgingDetailRowKind = 'bucketHeader' | 'transaction' | 'bucketTotal' | 'reportTotal';

export interface ArAgingReservationContext {
  reservationId: string;
  referenceNo: string | null;
  termsLabel: string;
}

export interface ArAgingDetailBuildRequest {
  invoiceDetails: ArAgingInvoiceDetail[];
  invoicesById: Map<string, InvoiceResponse>;
  reservationContextByReservationId: Map<string, ArAgingReservationContext>;
  costCodes: CostCodesResponse[];
  asOfDate: string;
  bucketColumns: { id: ArAgingBucketId; label: string }[];
  bucketFilter: ArAgingBucketId | null;
  scopeLabel: string;
  companyName?: string;
  officeName?: string;
}

export interface ArAgingDetailRow {
  rowId: string;
  kind: ArAgingDetailRowKind;
  label: string | null;
  bucketId: ArAgingBucketId | null;
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
  invoiceId: string | null;
}

export interface ArAgingDetailReportResult {
  reportTitle: string;
  periodLabel: string;
  entityLineLabel: string | null;
  scopeLabel: string;
  rows: ArAgingDetailRow[];
  reportTotal: number;
}

export interface ArAgingVisibleRow {
  rowId: string;
  label: string;
  kind: ArAgingVisibleRowKind;
  customerKey: string;
  reservationKey: string | null;
  bucketAmounts: Record<ArAgingBucketId, number>;
  total: number;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}
//#endregion

//#region Reservation Helpers
export function normalizeArAgingReferenceNo(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.replace(/^PO\s*#?\s*/i, '').trim();
  return withoutPrefix || null;
}

export function resolveArAgingTermsLabel(
  reservation: Pick<ReservationResponse, 'companyId' | 'reservationTypeId'>,
  contactsById: ReadonlyMap<string, ContactResponse>
): string {
  const dueOnReceipt = getTermType(TermType.DueOnReceipt) || 'Due on receipt';
  const reservationTypeId = Number(reservation.reservationTypeId);
  const usesCompanyTerms =
    reservationTypeId === ReservationType.Corporate
    || reservationTypeId === ReservationType.Platform;

  if (!usesCompanyTerms) {
    return dueOnReceipt;
  }

  const companyId = reservation.companyId?.trim();
  if (!companyId) {
    return dueOnReceipt;
  }

  return getTermType(contactsById.get(companyId)?.paymentTermsId) || dueOnReceipt;
}

export function buildArAgingReservationContext(
  reservation: Pick<ReservationResponse, 'reservationId' | 'referenceNo' | 'companyId' | 'reservationTypeId'>,
  contactsById: ReadonlyMap<string, ContactResponse>
): ArAgingReservationContext {
  return {
    reservationId: reservation.reservationId,
    referenceNo: normalizeArAgingReferenceNo(reservation.referenceNo),
    termsLabel: resolveArAgingTermsLabel(reservation, contactsById)
  };
}
//#endregion

//#region Bucket Helpers
export function formatArAgingBucketLabel(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

export function buildArAgingBucketDefinitions(intervalDays: number, throughDays: number | null): ArAgingBucketDefinition[] {
  const interval = intervalDays > 0 ? intervalDays : 30;
  const buckets: ArAgingBucketDefinition[] = [
    { id: 'current', label: 'Current', minDaysPastDue: Number.NEGATIVE_INFINITY, maxDaysPastDue: 0 }
  ];

  let start = 1;
  const cappedThrough = throughDays == null ? null : Math.max(interval, throughDays);

  while (true) {
    if (cappedThrough != null && start > cappedThrough) {
      break;
    }

    if (cappedThrough == null && start > 90) {
      buckets.push({ id: 'days-91-plus', label: '91+', minDaysPastDue: 91, maxDaysPastDue: null });
      break;
    }

    let end = start + interval - 1;
    if (cappedThrough != null) {
      end = Math.min(end, cappedThrough);
    } else {
      end = Math.min(end, 90);
    }

    buckets.push({
      id: `days-${start}-${end}`,
      label: formatArAgingBucketLabel(start, end),
      minDaysPastDue: start,
      maxDaysPastDue: end
    });

    if (cappedThrough != null && end >= cappedThrough) {
      break;
    }

    if (cappedThrough == null && end >= 90) {
      buckets.push({ id: 'days-91-plus', label: '91+', minDaysPastDue: 91, maxDaysPastDue: null });
      break;
    }

    start = end + 1;
  }

  return buckets;
}

export function resolveArAgingBucketId(daysPastDue: number, buckets: ArAgingBucketDefinition[]): ArAgingBucketId {
  if (daysPastDue <= 0) {
    return 'current';
  }

  for (let index = buckets.length - 1; index >= 0; index--) {
    const bucket = buckets[index];
    if (bucket.id === 'current') {
      continue;
    }
    if (daysPastDue >= bucket.minDaysPastDue) {
      return bucket.id;
    }
  }

  return buckets[buckets.length - 1]?.id ?? 'current';
}

export function createEmptyArAgingBucketAmounts(bucketIds: ArAgingBucketId[]): Record<ArAgingBucketId, number> {
  return bucketIds.reduce<Record<ArAgingBucketId, number>>((amounts, bucketId) => {
    amounts[bucketId] = 0;
    return amounts;
  }, {});
}

export function normalizeArAgingThroughDays(value: number | null | undefined): number | null {
  if (value == null || value === AR_AGING_THROUGH_ALL_VALUE) {
    return null;
  }
  return value;
}
//#endregion

//#region Date Helpers
export function formatDateOnlyFromDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function resolveArAgingAsOfDate(preset: ArAgingDatePreset, customAsOfDate: string | null, referenceDate = new Date()): string {
  const today = startOfDay(referenceDate);

  switch (preset) {
    case 'yesterday': {
      const date = new Date(today);
      date.setDate(date.getDate() - 1);
      return formatDateOnlyFromDate(date);
    }
    case 'thisWeek': {
      const date = new Date(today);
      const day = date.getDay();
      const daysUntilSaturday = day === 6 ? 0 : (6 - day);
      date.setDate(date.getDate() + daysUntilSaturday);
      return formatDateOnlyFromDate(date);
    }
    case 'thisMonth': {
      const date = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return formatDateOnlyFromDate(date);
    }
    case 'thisQuarter': {
      const quarterEndMonth = Math.floor(today.getMonth() / 3) * 3 + 2;
      const date = new Date(today.getFullYear(), quarterEndMonth + 1, 0);
      return formatDateOnlyFromDate(date);
    }
    case 'thisYear': {
      const date = new Date(today.getFullYear(), 11, 31);
      return formatDateOnlyFromDate(date);
    }
    case 'lastWeek': {
      const date = new Date(today);
      const day = date.getDay();
      date.setDate(date.getDate() - day - 1);
      return formatDateOnlyFromDate(date);
    }
    case 'lastMonth': {
      const date = new Date(today.getFullYear(), today.getMonth(), 0);
      return formatDateOnlyFromDate(date);
    }
    case 'lastQuarter': {
      const currentQuarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      const date = new Date(today.getFullYear(), currentQuarterStartMonth, 0);
      return formatDateOnlyFromDate(date);
    }
    case 'lastYear': {
      const date = new Date(today.getFullYear() - 1, 11, 31);
      return formatDateOnlyFromDate(date);
    }
    case 'custom':
      return customAsOfDate?.trim() || formatDateOnlyFromDate(today);
    case 'all':
    case 'today':
    case 'thisWeekToDate':
    case 'thisMonthToDate':
    case 'thisQuarterToDate':
    case 'thisYearToDate':
    default:
      return formatDateOnlyFromDate(today);
  }
}
//#endregion

//#region Sort Helpers
export function buildArAgingCompanySortKey(
  invoice: Pick<InvoiceResponse, 'companyName' | 'responsibleParty' | 'contactName'>,
  customerLabel?: string
): string {
  const companyName = (invoice.companyName || '').trim();
  if (companyName) {
    return companyName;
  }

  const contactName = (invoice.contactName || '').trim();
  const responsibleParty = (customerLabel || invoice.responsibleParty || '').trim();
  if (
    contactName
    && responsibleParty
    && contactName.localeCompare(responsibleParty, undefined, { sensitivity: 'base'}) !== 0
  ) {
    return responsibleParty;
  }

  return '';
}

export function buildArAgingContactSortKey(
  invoice: Pick<InvoiceResponse, 'contactName' | 'contactId'>
): string {
  const contactName = (invoice.contactName || '').trim();
  if (contactName) {
    return contactName;
  }

  return (invoice.contactId || '').trim();
}

export function compareArAgingCustomerSortKeys(
  left: Pick<ArAgingCustomerRow, 'companySortKey' | 'contactSortKey' | 'contactId' | 'customerLabel'>,
  right: Pick<ArAgingCustomerRow, 'companySortKey' | 'contactSortKey' | 'contactId' | 'customerLabel'>
): number {
  const companyCompare = left.companySortKey.localeCompare(right.companySortKey, undefined, { sensitivity: 'base' });
  if (companyCompare !== 0) {
    return companyCompare;
  }

  if (!left.companySortKey && !right.companySortKey) {
    const leftContactId = (left.contactId || '').trim();
    const rightContactId = (right.contactId || '').trim();
    if (leftContactId || rightContactId) {
      const contactIdCompare = leftContactId.localeCompare(rightContactId, undefined, { sensitivity: 'base' });
      if (contactIdCompare !== 0) {
        return contactIdCompare;
      }
    }
  }

  const contactCompare = left.contactSortKey.localeCompare(right.contactSortKey, undefined, { sensitivity: 'base' });
  if (contactCompare !== 0) {
    return contactCompare;
  }

  return (left.contactId || '').localeCompare(right.contactId || '', undefined, { sensitivity: 'base' })
    || left.customerLabel.localeCompare(right.customerLabel, undefined, { sensitivity: 'base' });
}

export function compareArAgingInvoiceSortKeys(
  left: Pick<ArAgingInvoiceDetail, 'companySortKey' | 'contactSortKey' | 'contactId' | 'customerLabel' | 'invoiceCode'>,
  right: Pick<ArAgingInvoiceDetail, 'companySortKey' | 'contactSortKey' | 'contactId' | 'customerLabel' | 'invoiceCode'>
): number {
  const customerCompare = compareArAgingCustomerSortKeys(left, right);
  if (customerCompare !== 0) {
    return customerCompare;
  }

  return left.invoiceCode.localeCompare(right.invoiceCode, undefined, { numeric: true, sensitivity: 'base' });
}

export function getArAgingCustomerClassSortKey(row: ArAgingCustomerRow): string {
  const propertyCode = row.reservationRows
    .flatMap(reservationRow => reservationRow.invoices)
    .map(invoice => invoice.propertyCode?.trim())
    .find(code => !!code);
  return propertyCode || '';
}

export function sortArAgingCustomerRows(customerRows: ArAgingCustomerRow[], sortBy: ArAgingSortBy): ArAgingCustomerRow[] {
  const rows = [...customerRows];
  switch (sortBy) {
    case 'balance':
    case 'total':
      rows.sort((a, b) => b.total - a.total
        || compareArAgingCustomerSortKeys(a, b));
      break;
    case 'class':
      rows.sort((a, b) => getArAgingCustomerClassSortKey(a).localeCompare(getArAgingCustomerClassSortKey(b), undefined, { sensitivity: 'base' })
        || compareArAgingCustomerSortKeys(a, b));
      break;
    case 'name':
    case 'customer':
    case 'default':
    default:
      rows.sort((a, b) => compareArAgingCustomerSortKeys(a, b));
      break;
  }
  return rows;
}
//#endregion
